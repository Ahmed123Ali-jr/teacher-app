/* ==========================================================================
   print-portfolio.js — Build the full portfolio document for printing.
   Cover + TOC + all 10 sections + per-page footer.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }

    async function print(ctx) {
        const { teacher, portfolio, exams, worksheets, homework, strategies, initiatives, classes } = ctx;

        // Preload image URLs for strategy/initiative photo grids
        const imageUrls = new Map();
        const collect = (list) => {
            for (const row of list) {
                if (Array.isArray(row.images)) {
                    row.imageUrls = row.images.map((b) => {
                        const url = URL.createObjectURL(b);
                        imageUrls.set(url, true);
                        return url;
                    });
                }
            }
        };
        collect(strategies);
        collect(initiatives);

        const root = ensurePrintRoot();
        root.innerHTML = '<p style="padding:20mm; text-align:center;">⏳ جارٍ تحضير ملف الطباعة (تحويل الملفات والصور)...</p>';
        document.body.classList.add('is-printing');

        try {
            const html = await buildHtml({ teacher, portfolio, exams, worksheets, homework, strategies, initiatives, classes });
            root.innerHTML = html;
        } catch (e) {
            console.error('[PrintPortfolio]', e);
            root.innerHTML = '<p style="padding:20mm; color:red;">تعذّر تحضير الطباعة: ' + escapeHtml(e.message) + '</p>';
        }

        const cleanup = () => {
            document.body.classList.remove('is-printing');
            imageUrls.forEach((_, url) => URL.revokeObjectURL(url));
            global.removeEventListener('afterprint', cleanup);
        };
        global.addEventListener('afterprint', cleanup);

        setTimeout(() => global.print(), 200);
    }

    /* ---------- file embedding helpers ---------- */

    function blobToDataUrl(blob) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload  = () => res(fr.result);
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    let _pdfJsPromise = null;
    function ensurePdfJs() {
        if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
        if (_pdfJsPromise) return _pdfJsPromise;
        const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
        _pdfJsPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = base + 'pdf.min.js';
            s.onload = () => {
                global.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
                resolve(global.pdfjsLib);
            };
            s.onerror = () => reject(new Error('تعذّر تحميل مكتبة عرض PDF.'));
            document.head.appendChild(s);
        });
        return _pdfJsPromise;
    }

    async function pdfToImages(blob, maxPages) {
        const pdfjs = await ensurePdfJs();
        const buf = await blob.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const n = Math.min(doc.numPages, maxPages || 30);
        const urls = [];
        for (let i = 1; i <= n; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            urls.push(canvas.toDataURL('image/jpeg', 0.85));
            page.cleanup();
        }
        return urls;
    }

    function hasUsableBlob(it) {
        return it && it.file instanceof Blob && it.file.size > 0;
    }
    function isImageItem(it) {
        if (!hasUsableBlob(it)) return false;
        return (it.file.type || '').startsWith('image/') ||
               /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(it.filename || '');
    }
    function isPdfItem(it) {
        if (!hasUsableBlob(it)) return false;
        return it.file.type === 'application/pdf' || /\.pdf$/i.test(it.filename || '');
    }

    function brokenAttachmentBlock(it, wrap, reason) {
        return `
            <div class="portfolio-attachment" style="${wrap}">
                <h4 style="margin:0 0 3mm;">${escapeHtml(it.name || it.filename || 'ملف')}</h4>
                <p style="color:#B45309; font-size:11pt; margin-top:8mm;">
                    ⚠️ تعذّر عرض محتوى الملف: ${escapeHtml(reason)}
                </p>
                <p style="font-size:10pt; color:#555;">
                    ${escapeHtml(it.filename || 'بدون اسم')}
                </p>
                <p style="font-size:9pt; color:#888; margin-top:6mm;">
                    إذا كان هذا الملف مرفوعاً قبل آخر تحديث، يُرجى إعادة رفعه.
                </p>
            </div>
        `;
    }

    async function attachmentsBlock(items) {
        const parts = [];
        // Each attachment starts on its own page. The wrapper has NO
        // fixed height so it can never exceed the page; the image gets
        // a hard mm cap that fits inside A4 (content area ≈ 261mm tall
        // with 18mm vertical @page margins) with margin to spare.
        const wrap = 'page-break-before:always; page-break-after:always; '
                   + 'page-break-inside:avoid; break-inside:avoid; '
                   + 'text-align:center;';
        const imgStyleNoTitle = 'display:block; margin:0 auto; '
                              + 'max-width:175mm; max-height:230mm; '
                              + 'width:auto; height:auto; object-fit:contain;';
        const imgStyleWithTitle = 'display:block; margin:0 auto; '
                                + 'max-width:175mm; max-height:220mm; '
                                + 'width:auto; height:auto; object-fit:contain;';

        for (const it of items) {
            if (!it) continue;
            // A `filename` is set only when a file was actually attached
            // at some point. If the binary content is missing now (legacy
            // uploads from before the base64 fix have file:{} or null),
            // surface a placeholder so the teacher knows to re-upload —
            // instead of a silent empty page or no output at all.
            if (it.filename && !hasUsableBlob(it)) {
                parts.push(brokenAttachmentBlock(it, wrap,
                    'محتوى الملف فقد أو لم يُرفع.'));
                continue;
            }
            if (!hasUsableBlob(it)) continue;

            try {
                if (isImageItem(it)) {
                    const url = await blobToDataUrl(it.file);
                    parts.push(`
                        <div class="portfolio-attachment" style="${wrap}">
                            <h4 style="margin:0 0 3mm; page-break-after:avoid;">${escapeHtml(it.name)}</h4>
                            <img src="${url}" alt="" style="${imgStyleWithTitle}">
                        </div>
                    `);
                } else if (isPdfItem(it)) {
                    const urls = await pdfToImages(it.file);
                    if (!urls.length) {
                        parts.push(brokenAttachmentBlock(it, wrap, 'تعذّر قراءة صفحات الـ PDF.'));
                        continue;
                    }
                    urls.forEach((u, idx) => {
                        const showTitle = (idx === 0);
                        parts.push(`
                            <div class="portfolio-attachment" style="${wrap}">
                                ${showTitle
                                    ? `<h4 style="margin:0 0 3mm; page-break-after:avoid;">${escapeHtml(it.name)}</h4>`
                                    : ''}
                                <img src="${u}" alt="" style="${showTitle ? imgStyleWithTitle : imgStyleNoTitle}">
                            </div>
                        `);
                    });
                }
            } catch (e) {
                console.error('[PrintPortfolio] embed failed:', it.name, e);
                parts.push(brokenAttachmentBlock(it, wrap, e.message || 'خطأ غير معروف'));
            }
        }
        return parts.join('\n');
    }

    function ensurePrintRoot() {
        let el = document.getElementById('print-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'print-root';
            document.body.appendChild(el);
        }
        return el;
    }

    async function buildHtml(ctx) {
        const { teacher, portfolio, exams, worksheets, homework, strategies, initiatives } = ctx;
        const subjects = (teacher.subjects || [teacher.subject]).filter(Boolean).join('، ');
        const todayStr = formatDate(new Date().toISOString());
        const customSections = portfolio.custom_sections || [];

        const parts = [];

        // Cover
        const coverYear   = toArabicDigits(global.PrintPrefs?.academicYear || '');
        const region      = teacher.region || global.PrintPrefs?.region || '';
        const teacherName = teacher.name ? 'الأستاذ ' + teacher.name : '';
        const fileNumber  = toArabicDigits(global.PrintPrefs?.fileNumber || '001');

        parts.push(`
            <div class="cover-page">
                <div class="cover-inner">

                    <div class="cover-header">
                        <div class="cover-country">— المملكة العربية السعودية —</div>
                        <div class="cover-ministry">وزارة التعليم</div>
                        ${region ? `<div class="cover-region">إدارة التعليم بمنطقة ${escapeHtml(region)}</div>` : ''}
                    </div>

                    <div class="cover-body">
                        ${global.PrintPrefs?.logoDataUrl
                            ? `<img class="cover-logo" src="${global.PrintPrefs.logoDataUrl}" alt="">`
                            : '<div class="cover-logo">🎓</div>'}

                        <div class="cover-title-frame-outer">
                            <div class="cover-title-frame-inner">
                                <h1 class="cover-title">ملف الإنجاز المهني</h1>
                            </div>
                        </div>

                        <div class="cover-divider">
                            <span class="cover-divider-line"></span>
                            <span class="cover-divider-text">للمعلم</span>
                            <span class="cover-divider-line"></span>
                        </div>

                        <div class="cover-teacher-name">${escapeHtml(teacherName)}</div>

                        <div class="cover-school-info">
                            <div class="cover-school">${escapeHtml(teacher.school_name || '')}</div>
                            ${coverYear ? `<div class="cover-year">العام الدراسي ${escapeHtml(coverYear)} هـ</div>` : ''}
                        </div>
                    </div>

                    <div class="cover-footer">
                        <span>رقم الملف: ${escapeHtml(fileNumber)}</span>
                    </div>

                </div>
            </div>
            <div class="page-break"></div>
        `);

        // TOC
        parts.push(`
            <div class="print-header">
                <h1>الفهرس</h1>
            </div>
            <ol class="toc">
                <li>البيانات الشخصية</li>
                <li>الشهادات والرخصة المهنية (${portfolio.certificates?.length || 0})</li>
                <li>الرسالة والرؤية</li>
                <li>الجداول وتوزيع المنهج (${portfolio.schedules?.length || 0})</li>
                <li>الاختبارات (${exams.length})</li>
                <li>أوراق العمل (${worksheets.length})</li>
                <li>الواجبات (${homework.length})</li>
                <li>استراتيجيات التدريس (${strategies.length})</li>
                <li>المبادرات (${initiatives.length})</li>
                <li>صور ومرفقات إضافية (${portfolio.extras?.length || 0})</li>
                ${customSections.map((cs) =>
                    `<li>${escapeHtml(cs.name)} (${(cs.items || []).length})</li>`
                ).join('')}
            </ol>
            <div class="page-break"></div>
        `);

        // 1. Personal
        parts.push(sectionHeading(1, 'البيانات الشخصية'));
        parts.push(await personalBlock(teacher, portfolio.personal || {}));
        parts.push('<div class="page-break"></div>');

        // 2. Certificates
        parts.push(sectionDivider('الشهادات والرخص المهنية', 2));
        parts.push(sectionHeading(2, 'الشهادات والرخصة المهنية'));
        parts.push(fileListBlock(portfolio.certificates || []));
        parts.push(await attachmentsBlock(portfolio.certificates || []));
        parts.push('<div class="page-break"></div>');

        // 3. Mission & vision
        parts.push(sectionDivider('الرسالة والرؤية', 3));
        parts.push(sectionHeading(3, 'الرسالة والرؤية'));
        parts.push(missionBlock(portfolio));
        parts.push('<div class="page-break"></div>');

        // 4. Schedules (classes summary + uploaded files)
        parts.push(sectionDivider('الجداول وتوزيع المنهج', 4));
        parts.push(sectionHeading(4, 'الجداول وتوزيع المنهج'));
        parts.push(classesSummaryBlock(ctx.classes || []));
        if ((portfolio.schedules || []).length > 0) {
            parts.push('<h3 style="margin-top:8mm">ملفات مرفقة</h3>');
            parts.push(fileListBlock(portfolio.schedules));
            parts.push(await attachmentsBlock(portfolio.schedules));
        }
        parts.push('<div class="page-break"></div>');

        // 5-7. Auto sections
        parts.push(sectionDivider('الاختبارات', 5));
        parts.push(sectionHeading(5, 'الاختبارات'));
        parts.push(autoListBlock(exams, 'exam'));
        parts.push('<div class="page-break"></div>');

        parts.push(sectionDivider('أوراق العمل', 6));
        parts.push(sectionHeading(6, 'أوراق العمل'));
        parts.push(autoListBlock(worksheets, 'worksheet'));
        parts.push('<div class="page-break"></div>');

        parts.push(sectionDivider('الواجبات', 7));
        parts.push(sectionHeading(7, 'الواجبات'));
        parts.push(autoListBlock(homework, 'homework'));
        parts.push('<div class="page-break"></div>');

        // 8. Strategies (with reports)
        parts.push(sectionDivider('استراتيجيات التدريس', 8));
        parts.push(sectionHeading(8, 'استراتيجيات التدريس'));
        if (strategies.length === 0) parts.push('<p class="text-muted">لا توجد استراتيجيات.</p>');
        else strategies.forEach((s, i) => {
            parts.push(strategyBlock(s));
            if (i < strategies.length - 1) parts.push('<div class="page-break"></div>');
        });
        parts.push('<div class="page-break"></div>');

        // 9. Initiatives (with reports)
        parts.push(sectionDivider('المبادرات', 9));
        parts.push(sectionHeading(9, 'المبادرات'));
        if (initiatives.length === 0) parts.push('<p class="text-muted">لا توجد مبادرات.</p>');
        else initiatives.forEach((s, i) => {
            parts.push(initiativeBlock(s));
            if (i < initiatives.length - 1) parts.push('<div class="page-break"></div>');
        });
        parts.push('<div class="page-break"></div>');

        // 10. Extras
        parts.push(sectionDivider('مرفقات إضافية', 10));
        parts.push(sectionHeading(10, 'صور ومرفقات إضافية'));
        parts.push(fileListBlock(portfolio.extras || []));
        parts.push(await attachmentsBlock(portfolio.extras || []));

        // Custom user-defined sections
        for (let i = 0; i < customSections.length; i++) {
            const cs = customSections[i];
            parts.push('<div class="page-break"></div>');
            parts.push(sectionHeading(11 + i, (cs.icon ? cs.icon + ' ' : '') + cs.name));
            parts.push(fileListBlock(cs.items || []));
            parts.push(await attachmentsBlock(cs.items || []));
        }

        return `<div class="print-doc portfolio-doc">${parts.join('\n')}</div>`;
    }

    function sectionHeading(n, title) {
        return `
            <div class="portfolio-section-heading">
                <div class="section-number">${n}</div>
                <h2>${title}</h2>
            </div>
        `;
    }

    const SECTION_ORDER_AR = [
        '', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
        'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'
    ];

    /** Build a full-page divider that introduces a section. */
    function sectionDivider(sectionTitle, sectionNumber) {
        const order = SECTION_ORDER_AR[sectionNumber] || '';
        const num   = toArabicDigits(sectionNumber);
        return `
            <div class="section-divider">
                <div class="section-divider-inner">
                    <div class="section-divider-header">— ملف الإنجاز المهني —</div>
                    <div class="section-divider-body">
                        <div class="section-divider-tag">
                            <span class="section-divider-line"></span>
                            <span class="section-divider-tag-text">القسم ${order}</span>
                            <span class="section-divider-line"></span>
                        </div>
                        <h1 class="section-divider-title">${escapeHtml(sectionTitle)}</h1>
                        <div class="section-divider-bottom-line"></div>
                        <div class="section-divider-page-num">${num} / ١٠</div>
                    </div>
                </div>
            </div>
        `;
    }

    function toArabicDigits(s) {
        if (s === null || s === undefined || s === '') return '';
        const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        return String(s).replace(/[0-9]/g, (d) => map[+d]);
    }

    async function personalBlock(teacher, p) {
        const fullName  = teacher.name        || p.full_name      || '';
        const civilId   = toArabicDigits(teacher.civil_id    || p.civil_id    || '');
        const specialty =                 teacher.specialization || p.specialization || '';
        const qual      =                 teacher.qualification  || p.qualification  || '';
        const years     = toArabicDigits(teacher.experience_years ?? p.experience_years ?? '');
        const school    =                 teacher.school_name    || p.school         || '';
        const region    =                 teacher.region         || p.region         || '';
        const subjects  = Array.isArray(teacher.subjects) ? teacher.subjects.join('، ')
                        : (teacher.subject || '');
        const phone     = toArabicDigits(teacher.phone       || p.phone       || '');
        const email     =                 teacher.email       || p.email       || '';

        const displayName = fullName ? 'الأستاذ ' + fullName : '';

        const rows = [
            ['الاسم رباعي',  displayName],
            ['رقم الهوية',   civilId],
            ['التخصص',       specialty],
            ['المؤهل',       qual],
            ['سنوات الخبرة', years],
            ['المدرسة',      school],
            ['المنطقة',      region],
            ['مواد التدريس', subjects]
        ];

        const cell = (val) => val
            ? `<td class="print-id-value">${escapeHtml(val)}</td>`
            : `<td class="print-id-value print-id-value-empty">—</td>`;

        let photoBox = `<div class="print-id-photo-empty"></div>`;
        if (teacher.photo instanceof Blob) {
            try {
                const url = await blobToDataUrl(teacher.photo);
                photoBox = `<img src="${url}" alt="">`;
            } catch (e) { /* keep empty */ }
        }

        return `
            <div class="print-id-card">
                <div class="print-id-inner">
                    <div class="print-id-header">
                        <div class="print-id-country">— المملكة العربية السعودية —</div>
                        <h2 class="print-id-title">البطاقة الشخصية</h2>
                        <div class="print-id-subtitle">للمعلم</div>
                    </div>

                    <div class="print-id-body">
                        <div class="print-id-photo-wrap">
                            <div class="print-id-photo">${photoBox}</div>
                            <div class="print-id-photo-label">الصورة الشخصية</div>
                        </div>

                        <table class="print-id-table">
                            <tbody>
                                ${rows.map(([label, value]) => `
                                    <tr>
                                        <td class="print-id-label">${label}</td>
                                        ${cell(value)}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="print-id-footer">
                        <span>📞 ${phone ? escapeHtml(phone) : '—'}</span>
                        <span>✉️ ${email ? escapeHtml(email) : '—'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function missionBlock(portfolio) {
        const items = [
            ['الرسالة', portfolio.mission],
            ['الرؤية', portfolio.vision],
            ['الأهداف المهنية', portfolio.goals]
        ].filter(([, v]) => v && v.trim());

        if (items.length === 0) return '<p class="text-muted">لم يتم تعبئة الرسالة والرؤية بعد.</p>';

        return items.map(([title, text]) => `
            <h3>${title}</h3>
            <p>${escapeHtml(text).split('\n').join('<br>')}</p>
        `).join('');
    }

    function classesSummaryBlock(classes) {
        const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
        if (classes.length === 0) return '<p class="text-muted">لا توجد فصول.</p>';
        const total = classes.reduce((s, c) => s + (c.student_count || 0), 0);
        return `
            <h3 style="margin-top:0;">الفصول التي أدرّسها</h3>
            <p style="font-size: 10pt; color: #555; margin-bottom: 4mm;">
                ${classes.length} فصل · ${total} طالب
            </p>
            <table class="info-table">
                <thead>
                    <tr>
                        <th>#</th><th>المرحلة</th><th>الصف</th><th>الشعبة</th>
                        <th>المادة</th><th>عدد الطلاب</th>
                    </tr>
                </thead>
                <tbody>
                    ${classes.map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${STAGE_LABELS[c.stage] || ''}</td>
                            <td>${escapeHtml(c.grade)}</td>
                            <td>${escapeHtml(c.section)}</td>
                            <td>${escapeHtml(c.subject)}</td>
                            <td>${c.student_count || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function fileListBlock(items) {
        if (items.length === 0) return '<p class="text-muted">لا توجد ملفات.</p>';
        return `
            <table class="info-table">
                <thead><tr><th>الاسم</th><th>النوع</th><th>التاريخ</th></tr></thead>
                <tbody>
                    ${items.map((it) => `
                        <tr>
                            <td>${escapeHtml(it.name)}</td>
                            <td>${escapeHtml(it.type || '—')}</td>
                            <td>${formatDate(it.date)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function autoListBlock(items, kind) {
        if (items.length === 0) return '<p class="text-muted">لا يوجد.</p>';
        return `
            <table class="info-table">
                <thead><tr><th>العنوان</th><th>التفاصيل</th><th>التاريخ</th></tr></thead>
                <tbody>
                    ${items.map((it) => {
                        const detail =
                            kind === 'exam' ? `${it.questions?.length || 0} سؤال` :
                            kind === 'worksheet' ? `${it.exercises?.length || 0} تمرين` :
                            (it.due_date ? 'تاريخ التسليم: ' + formatDate(it.due_date) : '');
                        return `<tr>
                            <td>${escapeHtml(it.title || '')}</td>
                            <td>${detail}</td>
                            <td>${formatDate(it.created_at || it.due_date)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function strategyBlock(s) {
        const r = s.report || {};
        return `
            <article class="report-article avoid-break">
                <h3>${escapeHtml(s.name)}</h3>
                <div class="meta-line">
                    📅 ${formatDate(s.date)}
                    ${s.class_label ? ' · 📚 ' + escapeHtml(s.class_label) : ''}
                    ${s.lesson ? ' · 📖 ' + escapeHtml(s.lesson) : ''}
                </div>

                ${r.introduction    ? `<h4>المقدمة</h4><p>${escapeHtml(r.introduction).split('\n').join('<br>')}</p>` : ''}
                ${r.description     ? `<h4>الوصف</h4><p>${escapeHtml(r.description).split('\n').join('<br>')}</p>` : ''}
                ${Array.isArray(r.steps) && r.steps.length
                    ? `<h4>خطوات التنفيذ</h4><ol>${r.steps.map((st) => `<li>${escapeHtml(st)}</li>`).join('')}</ol>`
                    : ''}
                ${r.impact          ? `<h4>الأثر التعليمي</h4><p>${escapeHtml(r.impact).split('\n').join('<br>')}</p>` : ''}
                ${r.recommendations ? `<h4>التوصيات</h4><p>${escapeHtml(r.recommendations).split('\n').join('<br>')}</p>` : ''}

                ${(s.imageUrls || []).length ? `
                    <h4>صور التنفيذ</h4>
                    <div class="print-image-grid">
                        ${s.imageUrls.map((u) => `<img src="${u}" alt="">`).join('')}
                    </div>
                ` : ''}
            </article>
        `;
    }

    function initiativeBlock(s) {
        const r = s.report || {};
        return `
            <article class="report-article avoid-break">
                <h3>${escapeHtml(s.name)}</h3>
                <div class="meta-line">
                    📅 ${formatDate(s.date)}
                    ${s.audience ? ' · 🎯 ' + escapeHtml(s.audience) : ''}
                    ${s.beneficiaries ? ' · 👥 ' + escapeHtml(String(s.beneficiaries)) + ' مستفيد' : ''}
                </div>

                ${r.introduction ? `<h4>المقدمة</h4><p>${escapeHtml(r.introduction).split('\n').join('<br>')}</p>` : ''}
                ${Array.isArray(r.goals) && r.goals.length
                    ? `<h4>الأهداف</h4><ul>${r.goals.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
                    : ''}
                ${r.execution ? `<h4>التنفيذ</h4><p>${escapeHtml(r.execution).split('\n').join('<br>')}</p>` : ''}
                ${r.results   ? `<h4>النتائج</h4><p>${escapeHtml(r.results).split('\n').join('<br>')}</p>` : ''}
                ${r.impact    ? `<h4>الأثر</h4><p>${escapeHtml(r.impact).split('\n').join('<br>')}</p>` : ''}

                ${(s.imageUrls || []).length ? `
                    <h4>الصور</h4>
                    <div class="print-image-grid">
                        ${s.imageUrls.map((u) => `<img src="${u}" alt="">`).join('')}
                    </div>
                ` : ''}
            </article>
        `;
    }

    global.PrintPortfolio = { print };
})(window);
