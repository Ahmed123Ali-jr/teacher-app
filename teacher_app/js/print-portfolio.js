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
        const { teacher, portfolio, exams, worksheets, homework, strategies, initiatives,
                classes, scheduleRows, periodTimes } = ctx;

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
            const html = await buildHtml({ teacher, portfolio, exams, worksheets, homework, strategies, initiatives, classes, scheduleRows, periodTimes });
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

    const SCHEDULE_DAYS = [
        { index: 0, label: 'الأحد' },
        { index: 1, label: 'الاثنين' },
        { index: 2, label: 'الثلاثاء' },
        { index: 3, label: 'الأربعاء' },
        { index: 4, label: 'الخميس' }
    ];
    const DEFAULT_PERIODS = [
        { n: 1, start: '07:00', end: '07:45' },
        { n: 2, start: '07:45', end: '08:30' },
        { n: 3, start: '08:30', end: '09:15' },
        { n: 4, start: '09:45', end: '10:30' },
        { n: 5, start: '10:30', end: '11:15' },
        { n: 6, start: '11:15', end: '12:00' },
        { n: 7, start: '12:00', end: '12:45' }
    ];

    /** Render the teacher's weekly schedule as a printable grid.
     *  Pulls the schedule rows and period times from the saved data — no
     *  manual upload required. */
    function weeklyScheduleBlock(scheduleRows, periodTimes, classes) {
        const periods = (Array.isArray(periodTimes) && periodTimes.length)
            ? periodTimes : DEFAULT_PERIODS;
        const rows = Array.isArray(scheduleRows) ? scheduleRows : [];
        if (!rows.length) return '';

        const grid = {};
        for (let d = 0; d < SCHEDULE_DAYS.length; d++) grid[d] = {};
        for (const r of rows) {
            if (grid[r.day]) grid[r.day][r.period] = r;
        }
        const classById = Object.fromEntries((classes || []).map((c) => [c.id, c]));

        return `
            <h3 class="weekly-schedule-title">📅 الجدول الأسبوعي</h3>
            <table class="weekly-schedule">
                <thead>
                    <tr>
                        <th class="weekly-period-col">الحصة</th>
                        ${SCHEDULE_DAYS.map((d) => `<th>${escapeHtml(d.label)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${periods.map((p) => `
                        <tr>
                            <td class="weekly-period-col">
                                <div class="weekly-period-n">الحصة ${escapeHtml(toArabicDigits(p.n))}</div>
                                <div class="weekly-period-time">${escapeHtml(toArabicDigits(p.start))} — ${escapeHtml(toArabicDigits(p.end))}</div>
                            </td>
                            ${SCHEDULE_DAYS.map((d) => {
                                const cell = grid[d.index]?.[p.n];
                                if (!cell) {
                                    return `<td class="weekly-cell weekly-cell-empty"></td>`;
                                }
                                const cls = classById[cell.class_id];
                                if (!cls) {
                                    return `<td class="weekly-cell weekly-cell-waiting">
                                        <div class="weekly-cell-grade">⏳ انتظار</div>
                                        ${cell.topic ? `<div class="weekly-cell-topic">${escapeHtml(cell.topic)}</div>` : ''}
                                    </td>`;
                                }
                                return `<td class="weekly-cell">
                                    <div class="weekly-cell-grade">${escapeHtml(cls.grade || '')} / ${escapeHtml(cls.section || '')}</div>
                                    <div class="weekly-cell-subject">${escapeHtml(cls.subject || '')}</div>
                                    ${cell.topic ? `<div class="weekly-cell-topic">${escapeHtml(cell.topic)}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function buildHtml(ctx) {
        const { teacher, portfolio, exams, worksheets, homework, strategies, initiatives,
                scheduleRows, periodTimes } = ctx;
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
        const tocEntries = calculateTocEntries({
            portfolio, exams, worksheets, homework, strategies, initiatives, customSections
        });
        parts.push(`
            <div class="toc-page">
                <div class="toc-page-inner">
                    <div class="toc-header">
                        <div class="toc-doc-title">— ملف الإنجاز المهني —</div>
                        <h1 class="toc-main-title">الفهرس</h1>
                    </div>
                    <div class="toc-list">
                        ${tocEntries.map((e) => `
                            <div class="toc-row">
                                <div class="toc-num-tag">${escapeHtml(toArabicDigits(e.n))}</div>
                                <div class="toc-title">${escapeHtml(e.title)}</div>
                                <div class="toc-page-num">${escapeHtml(toArabicDigits(e.page))}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `);

        // 1. Personal
        parts.push(sectionHeading(1, 'البيانات الشخصية'));
        parts.push(await personalBlock(teacher, portfolio.personal || {}));
        parts.push('<div class="page-break"></div>');

        // 2. Certificates — one elegant full-page card per cert
        parts.push(sectionDivider('الشهادات والرخص المهنية', 2));
        parts.push(await fileHeroBlock(portfolio.certificates || [], {
            counterLabel: 'شهادة',
            emptyMsg:     'لا توجد شهادات.'
        }));

        // 3. Mission & vision
        parts.push(sectionDivider('الرسالة والرؤية', 3));
        parts.push(sectionHeading(3, 'الرسالة والرؤية'));
        parts.push(missionBlock(portfolio));
        parts.push('<div class="page-break"></div>');

        // 4. Schedules — classes overview + auto weekly grid + per-file cards
        parts.push(sectionDivider('الجداول وتوزيع المنهج', 4));
        parts.push(sectionHeading(4, 'الجداول وتوزيع المنهج'));
        parts.push(classesSummaryBlock(ctx.classes || []));

        const weekly = weeklyScheduleBlock(scheduleRows, periodTimes, ctx.classes || []);
        if (weekly) {
            parts.push('<div class="page-break"></div>');
            parts.push(weekly);
        }

        parts.push(await fileHeroBlock(portfolio.schedules || [], {
            counterLabel: 'ملف',
            emptyMsg:     ''
        }));

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

    /** Build one full-page card per file (cert / schedule / etc.) with its
     *  image embedded. Used by sections that want each upload to occupy a
     *  whole printed page in the cert-card style. */
    async function fileHeroBlock(items, opts) {
        opts = opts || {};
        const counterLabel = opts.counterLabel || 'شهادة';
        const emptyMsg     = opts.emptyMsg     || 'لا توجد ملفات.';
        if (!items.length) {
            if (!emptyMsg) return '';
            return `<p class="text-muted" style="padding:10mm; text-align:center;">${escapeHtml(emptyMsg)}</p>`;
        }
        const total = items.length;
        const parts = [];
        for (let i = 0; i < items.length; i++) {
            const c = items[i];
            const idx = i + 1;
            // Resolve the hero image: image → dataURL, PDF → first page rendered.
            let heroSrc = '';
            if (hasUsableBlob(c)) {
                try {
                    if (isImageItem(c)) {
                        heroSrc = await blobToDataUrl(c.file);
                    } else if (isPdfItem(c)) {
                        const urls = await pdfToImages(c.file, 1);
                        heroSrc = urls[0] || '';
                    }
                } catch (e) {
                    console.warn('[PrintPortfolio] cert image failed:', c.name, e.message);
                }
            }

            const heroHtml = heroSrc
                ? `<img src="${heroSrc}" alt="" class="cert-hero-img">`
                : `<div class="cert-hero-empty">لا توجد صورة مرفقة</div>`;

            const rows = [];
            if (c.type)   rows.push(['النوع', c.type]);
            if (c.issuer) rows.push(['الجهة المانحة', c.issuer]);
            if (c.date)   rows.push(['التاريخ', formatDate(c.date)]);
            if (c.notes)  rows.push(['ملاحظات', c.notes]);

            parts.push(`
                <div class="cert-card">
                    <div class="cert-card-inner">
                        <div class="cert-card-header">
                            <div class="cert-card-counter">${escapeHtml(counterLabel)} رقم ${toArabicDigits(idx)} من ${toArabicDigits(total)}</div>
                            <h2 class="cert-card-title">${escapeHtml(c.name || 'بدون اسم')}</h2>
                        </div>
                        <div class="cert-hero">${heroHtml}</div>
                        ${rows.length ? `
                            <table class="cert-card-meta">
                                ${rows.map(([k, v]) => `
                                    <tr>
                                        <td class="cert-card-meta-key">${escapeHtml(k)}</td>
                                        <td class="cert-card-meta-val">${escapeHtml(v)}</td>
                                    </tr>
                                `).join('')}
                            </table>
                        ` : ''}
                    </div>
                </div>
            `);
        }
        return parts.join('\n');
    }

    function sectionHeading(n, title) {
        return `
            <div class="portfolio-section-heading">
                <div class="section-number">${n}</div>
                <h2>${title}</h2>
            </div>
        `;
    }

    /** Predict the start page of each portfolio section.
     *  Layout: cover=1, TOC=2, section 1 (no divider)=3, then for each
     *  later section: divider page (1) + content (1) + attachments (1 each).
     *  Strategies / initiatives use one content page per item (min 1). */
    function calculateTocEntries(ctx) {
        const { portfolio, strategies, initiatives, customSections } = ctx;
        const certs  = (portfolio.certificates || []).filter((c) => c.file).length;
        const sched  = (portfolio.schedules    || []).filter((s) => s.file).length;
        const extras = (portfolio.extras       || []).filter((e) => e.file).length;
        const stratPages = Math.max(strategies.length, 1);
        const initPages  = Math.max(initiatives.length, 1);

        const entries = [];
        let cur = 3;  // section 1 starts on page 3 (after cover & TOC)

        const add = (n, title, contentPages, attach) => {
            entries.push({ n, title, page: cur });
            const divider = (n === 1) ? 0 : 1;
            cur += divider + contentPages + attach;
        };

        add(1,  'البيانات الشخصية',         1, 0);
        add(2,  'الشهادات والرخص المهنية',  1, certs);
        add(3,  'الرسالة والرؤية',           1, 0);
        add(4,  'الجداول وتوزيع المنهج',     1, sched);
        add(5,  'الاختبارات',                1, 0);
        add(6,  'أوراق العمل',               1, 0);
        add(7,  'الواجبات',                  1, 0);
        add(8,  'استراتيجيات التدريس',        stratPages, 0);
        add(9,  'المبادرات',                 initPages, 0);
        add(10, 'مرفقات إضافية',             1, extras);

        for (const cs of (customSections || [])) {
            const csAttach = (cs.items || []).filter((it) => it.file).length;
            entries.push({ n: entries.length + 1, title: cs.name || 'قسم', page: cur });
            cur += 1 + 1 + csAttach;
        }
        return entries;
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
        const blocks = [
            { label: 'رسالتي',  text: portfolio.mission },
            { label: 'رؤيتي',   text: portfolio.vision  },
            { label: 'أهدافي',  text: portfolio.goals   }
        ].filter((b) => b.text && b.text.trim());

        if (blocks.length === 0) {
            return '<p class="text-muted">لم يتم تعبئة الرسالة والرؤية بعد.</p>';
        }

        return blocks.map((b) => `
            <div class="mission-quote">
                <div class="mission-quote-label">— ${escapeHtml(b.label)} —</div>
                <div class="mission-quote-mark">&#8220;</div>
                <p class="mission-quote-text">${escapeHtml(b.text).split('\n').join('<br>')}</p>
            </div>
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
