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

    function isImageItem(it) {
        const f = it.file; if (!f) return false;
        return (f.type || '').startsWith('image/') ||
               /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(it.filename || '');
    }
    function isPdfItem(it) {
        const f = it.file; if (!f) return false;
        return f.type === 'application/pdf' || /\.pdf$/i.test(it.filename || '');
    }

    async function attachmentsBlock(items) {
        const parts = [];
        // A4 content area is ~261×180mm with the existing @page margins;
        // cap the image height so a single PDF page lands on a single
        // printed page instead of bleeding onto the next one.
        const imgStyle = 'max-width:100%; max-height:255mm; width:auto; height:auto; '
                       + 'object-fit:contain; display:block; margin:0 auto;';

        for (const it of items) {
            if (!it.file) continue;
            try {
                if (isImageItem(it)) {
                    const url = await blobToDataUrl(it.file);
                    parts.push(`
                        <div class="portfolio-attachment avoid-break"
                             style="page-break-inside:avoid; break-inside:avoid;">
                            <h4 style="margin:0 0 3mm; page-break-after:avoid;">${escapeHtml(it.name)}</h4>
                            <img src="${url}" alt="" style="${imgStyle} max-height:245mm;">
                        </div>
                        <div class="page-break"></div>
                    `);
                } else if (isPdfItem(it)) {
                    const urls = await pdfToImages(it.file);
                    if (urls.length) {
                        urls.forEach((u, idx) => {
                            const showTitle = (idx === 0);
                            parts.push(`
                                <div class="portfolio-attachment avoid-break"
                                     style="page-break-inside:avoid; break-inside:avoid; text-align:center;">
                                    ${showTitle
                                        ? `<h4 style="margin:0 0 3mm; page-break-after:avoid;">${escapeHtml(it.name)}</h4>`
                                        : ''}
                                    <img src="${u}" alt="" style="${imgStyle}${showTitle ? ' max-height:245mm;' : ''}">
                                </div>
                            `);
                            if (idx < urls.length - 1) parts.push('<div class="page-break"></div>');
                        });
                        parts.push('<div class="page-break"></div>');
                    }
                }
            } catch (e) {
                console.warn('[PrintPortfolio] embed failed:', it.name, e.message);
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
        parts.push(`
            <div class="portfolio-cover">
                ${global.PrintPrefs?.logoDataUrl
                    ? `<img class="cover-logo" src="${global.PrintPrefs.logoDataUrl}" alt="">`
                    : '<div class="cover-ornament">🎓</div>'}
                <h1 class="cover-title">ملف الإنجاز المهني</h1>
                <div class="cover-sub">${escapeHtml(teacher.name)}</div>
                <div class="cover-meta">
                    <div>${escapeHtml(teacher.school_name)}</div>
                    <div>${escapeHtml(subjects)}</div>
                    <div>العام الدراسي: ${escapeHtml(global.PrintPrefs?.academicYear || new Date().getFullYear())}</div>
                    <div>التاريخ: ${todayStr}</div>
                    ${global.PrintPrefs?.principal ? `<div>مدير المدرسة: ${escapeHtml(global.PrintPrefs.principal)}</div>` : ''}
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
        parts.push(personalBlock(teacher, portfolio.personal || {}));
        parts.push('<div class="page-break"></div>');

        // 2. Certificates
        parts.push(sectionHeading(2, 'الشهادات والرخصة المهنية'));
        parts.push(fileListBlock(portfolio.certificates || []));
        parts.push(await attachmentsBlock(portfolio.certificates || []));
        parts.push('<div class="page-break"></div>');

        // 3. Mission & vision
        parts.push(sectionHeading(3, 'الرسالة والرؤية'));
        parts.push(missionBlock(portfolio));
        parts.push('<div class="page-break"></div>');

        // 4. Schedules (classes summary + uploaded files)
        parts.push(sectionHeading(4, 'الجداول وتوزيع المنهج'));
        parts.push(classesSummaryBlock(ctx.classes || []));
        if ((portfolio.schedules || []).length > 0) {
            parts.push('<h3 style="margin-top:8mm">ملفات مرفقة</h3>');
            parts.push(fileListBlock(portfolio.schedules));
            parts.push(await attachmentsBlock(portfolio.schedules));
        }
        parts.push('<div class="page-break"></div>');

        // 5-7. Auto sections
        parts.push(sectionHeading(5, 'الاختبارات'));
        parts.push(autoListBlock(exams, 'exam'));
        parts.push('<div class="page-break"></div>');

        parts.push(sectionHeading(6, 'أوراق العمل'));
        parts.push(autoListBlock(worksheets, 'worksheet'));
        parts.push('<div class="page-break"></div>');

        parts.push(sectionHeading(7, 'الواجبات'));
        parts.push(autoListBlock(homework, 'homework'));
        parts.push('<div class="page-break"></div>');

        // 8. Strategies (with reports)
        parts.push(sectionHeading(8, 'استراتيجيات التدريس'));
        if (strategies.length === 0) parts.push('<p class="text-muted">لا توجد استراتيجيات.</p>');
        else strategies.forEach((s, i) => {
            parts.push(strategyBlock(s));
            if (i < strategies.length - 1) parts.push('<div class="page-break"></div>');
        });
        parts.push('<div class="page-break"></div>');

        // 9. Initiatives (with reports)
        parts.push(sectionHeading(9, 'المبادرات'));
        if (initiatives.length === 0) parts.push('<p class="text-muted">لا توجد مبادرات.</p>');
        else initiatives.forEach((s, i) => {
            parts.push(initiativeBlock(s));
            if (i < initiatives.length - 1) parts.push('<div class="page-break"></div>');
        });
        parts.push('<div class="page-break"></div>');

        // 10. Extras
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

    function personalBlock(teacher, p) {
        const rows = [
            ['الاسم الكامل',   p.full_name || teacher.name],
            ['التخصص',         p.specialization],
            ['المؤهل العلمي',  p.qualification],
            ['سنوات الخبرة',   p.experience_years],
            ['المدرسة الحالية', p.school || teacher.school_name],
            ['رقم السجل المدني', p.civil_id],
            ['رقم الجوال',     p.phone || teacher.phone],
            ['البريد الإلكتروني', p.email || teacher.email]
        ].filter(([, v]) => v);

        return `
            <table class="info-table">
                <tbody>
                    ${rows.map(([k, v]) => `<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`).join('')}
                </tbody>
            </table>
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
