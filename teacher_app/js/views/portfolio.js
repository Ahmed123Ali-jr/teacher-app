/* ==========================================================================
   views/portfolio.js — Teacher portfolio with 10 sections.
   Personal info, mission, certificates, schedules (manual).
   Exams/worksheets/homework (auto from DB).
   Strategies & initiatives — سجلّات وشواهد، لا تقارير مولّدة.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    /* الأرقامُ عربيّةٌ كسائر أرقام الشاشة، والوحدةُ بحروفها — «480 KB»
       كانت تُقرأ لاتينيّةً وسط سطرٍ عربيّ. */
    const arNum = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    function formatSize(bytes) {
        if (!bytes) return '';
        const kb = bytes / 1024;
        if (kb < 1024) return arNum(kb.toFixed(0)) + ' ك.ب';
        return arNum((kb / 1024).toFixed(1).replace('.', '٫')) + ' م.ب';
    }

    /* رموزُ الأفعال رسومٌ لا إيموجي: الإيموجي يختلف شكلُه بين الأجهزة،
       ويُقرأ في قارئ الشاشة كلمةً لا فعلاً. والشارةُ الملوّنةُ حول النوع
       سقطت معها — النقطةُ تفصل والسطرُ يقصر. */
    const ICO = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    const TRASH    = ICO('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3');
    const PENCIL   = ICO('M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z');
    const DOWNLOAD = ICO('M12 4v11m0 0 4-4m-4 4-4-4M5 20h14');

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'short', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }

    const SECTIONS = [
        { key: 'personal',    title: 'البيانات الشخصية',       icon: '👤', auto: false },
        { key: 'certificates',title: 'الشهادات والرخصة المهنية', icon: '🏆', auto: false },
        { key: 'mission',     title: 'الرسالة والرؤية',        icon: '🎯', auto: false },
        { key: 'schedules',   title: 'الجداول وتوزيع المنهج',   icon: '📅', auto: false },
        { key: 'exams',       title: 'الاختبارات',             icon: '📝', auto: true },
        { key: 'worksheets',  title: 'أوراق العمل',            icon: '📄', auto: true },
        { key: 'homework',    title: 'الواجبات',               icon: '📚', auto: true },
        { key: 'strategies',  title: 'استراتيجيات التدريس',     icon: '🎯', auto: true,  star: true },
        { key: 'initiatives', title: 'المبادرات',              icon: '🌟', auto: false, star: true },
        { key: 'extras',      title: 'صور ومرفقات إضافية',     icon: '📎', auto: false }
    ];

    /* الأقسامُ كلُّها مطويّةٌ عند الفتح: كان «البيانات الشخصية» يُفتح
       افتراضاً فيملأ الشاشةَ ببطاقةِ هُويّةٍ طويلةٍ قبل أن يرى المعلّمُ
       بقيّةَ الأقسام — ولعلّه جاء لغيره. (طلبُه، ٢٢ أغسطس ٢٠٢٦.)

       والحالةُ تبقى بين زيارةٍ وأخرى في الجلسة الواحدة: من فتح قسماً
       ثمّ خرج وعاد يجده مفتوحاً، وهو ما يتوقّعه. */
    const state = { openSection: null };

    async function loadPortfolio(teacherId) {
        const row = await global.TeacherDB.get('portfolio', teacherId);
        const p = row || {
            teacher_id: teacherId,
            personal: {},
            mission: '',
            vision: '',
            certificates: [],
            schedules: [],
            extras: []
        };
        if (!Array.isArray(p.custom_sections)) p.custom_sections = [];
        return p;
    }

    /* ══ إرفاقُ ملفٍ بعنصر — الموضعُ الوحيد ══
       كلُّ مرفقٍ في هذي الشاشة يمرّ من هنا: الشهاداتُ والجداولُ والإضافاتُ
       والأقسامُ المخصّصة. كان الفحصُ والإسنادُ مكرَّرَين في نافذتين، فصارا
       واحداً.

       **والصورةُ تُضغط قبل أن تُحفظ.** كانت تُحفظ كما جاءت من الجوّال ثمّ
       تُرمَّز نصّاً في صفّ ملفّ الإنجاز — فثلاثُ لقطاتٍ صارت ١٧ ميجابايت في
       صفٍّ واحد (قياسٌ على القاعدة، ٢٦ أغسطس ٢٠٢٦). والضغطُ يردّ الأصلَ
       نفسَه إن فشل أو لم يوفّر شيئاً، فلا يخسر المعلّم مرفقاً بحال.

       والحجمُ والنوعُ يُكتبان في العنصر: فالشاشةُ تعرض حجمَ المرفق بلا أن
       تحمله في يدها — وهو ما يحتاجه نقلُ الملفات إلى المخزن لاحقاً. */
    async function attachFile(item, file) {
        const isImg = (file.type || '').startsWith('image/');
        const cap = isImg ? 15 : 30;  // MB
        if (file.size > cap * 1024 * 1024) {
            throw new Error('حجم الملف كبير (أقصى ' + cap + ' MB لـ '
                + (isImg ? 'الصور' : 'المستندات') + ').');
        }
        const before = file.size;
        const out = (isImg && global.ImageCompress)
            ? await global.ImageCompress.compress(file)
            : file;

        /* المرفقُ القديم لم يعد مقصوداً: يُنسى مسارُه من الوثيقة **ويُعاد
           للمنادي ليحذفه من المخزن بعد نجاح الحفظ** — لا قبله، فحفظٌ يفشل
           بعد حذفٍ يترك المعلّم بلا مرفقٍ أصلاً. */
        const stale = item.storage_path || null;

        item.file      = out;
        item.filename  = out.name || file.name;
        item.file_type = out.type || file.type || '';
        item.size      = out.size;
        delete item.storage_path;
        delete item.file_data;

        if (out !== file) {
            console.info('[Portfolio] ضُغطت الصورة: '
                + Math.round(before / 1024) + 'KB ← ' + Math.round(out.size / 1024) + 'KB');
        }
        return stale;
    }

    /** يحذف مرفقاً من المخزن بلا أن يُفشل شاشةً على المعلّم. */
    async function dropFiles(paths) {
        for (const p of (paths || []).filter(Boolean)) {
            try { await global.TeacherDB.PortfolioFiles.remove(p); }
            catch (e) { console.warn('[Portfolio] بقي مرفقٌ في المخزن:', e.message); }
        }
    }

    async function savePortfolio(portfolio) {
        portfolio.updated_at = new Date().toISOString();
        await global.TeacherDB.put('portfolio', portfolio);
    }

    /* شواهد متفرّقة → صفّ واحد لكل استراتيجية:
       {key, name, family, times, dates[], classes[], notes[], evidence[]} */
    function groupStrategyLogs(logs, classes) {
        const clsName = (id) => {
            const c = classes.find((x) => String(x.id) === String(id));
            return c ? `${c.grade} / ${c.section}` : '';
        };
        const byKey = new Map();
        for (const l of (logs || []).slice().sort((a, b) => String(a.date).localeCompare(b.date))) {
            let g = byKey.get(l.strategy_key);
            if (!g) {
                const meta = global.Strategies ? global.Strategies.get(l.strategy_key) : null;
                g = {
                    key: l.strategy_key,
                    name: meta ? meta.name : l.strategy_key,
                    family: meta ? meta.family : '',
                    brief: meta ? meta.brief : '',
                    steps: meta ? meta.steps : [],
                    times: 0, dates: [], classes: [], notes: [], evidence: []
                };
                byKey.set(l.strategy_key, g);
            }
            g.times++;
            if (l.date) g.dates.push(l.date);
            const cn = clsName(l.class_id);
            if (cn && !g.classes.includes(cn)) g.classes.push(cn);
            if (l.note) g.notes.push({ date: l.date, class: cn, text: l.note });
            if (Array.isArray(l.evidence)) g.evidence.push(...l.evidence);
        }
        return Array.from(byKey.values()).sort((a, b) => b.times - a.times);
    }

    /* سجلّات متفرّقة → صفّ واحد لكل مبادرة:
       {key, name, brief, goal, steps, times, dates[], notes[], beneficiaries, evidence[]}
       المخصَّصة تُجمَّع باسمها لأن مفتاحها واحد لكلّها. */
    function groupInitiativeLogs(logs) {
        const CUSTOM = global.Initiatives ? global.Initiatives.CUSTOM_KEY : '__custom__';
        const byId = new Map();
        for (const l of (logs || []).slice().sort((a, b) => String(a.date).localeCompare(b.date))) {
            const isCustom = l.initiative_key === CUSTOM;
            const id = isCustom ? CUSTOM + ':' + (l.custom_name || '') : l.initiative_key;
            let g = byId.get(id);
            if (!g) {
                const meta = (!isCustom && global.Initiatives)
                    ? global.Initiatives.get(l.initiative_key) : null;
                g = {
                    key: l.initiative_key,
                    name: isCustom ? (l.custom_name || 'مبادرة خاصة')
                                   : (meta ? meta.name : l.initiative_key),
                    brief: meta ? meta.brief : '',
                    goal:  meta ? meta.goal  : '',
                    steps: meta ? meta.steps : [],
                    times: 0, dates: [], notes: [], beneficiaries: 0, evidence: []
                };
                byId.set(id, g);
            }
            g.times++;
            if (l.date) g.dates.push(l.date);
            if (l.note) g.notes.push({ date: l.date, text: l.note });
            if (typeof l.beneficiaries === 'number') g.beneficiaries += l.beneficiaries;
            if (Array.isArray(l.evidence)) g.evidence.push(...l.evidence);
        }
        return Array.from(byId.values()).sort((a, b) => b.times - a.times);
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const portfolio  = await loadPortfolio(teacher.id);

        /* المبادرات كالاستراتيجيات: تُبنى من سجلّ المعلّم وشواهده
           (initiative_logs) لا من نصّ مولَّد. */
        const initiatives = groupInitiativeLogs(
            await global.TeacherDB.getAllByIndex('initiative_logs', 'teacher_id', teacher.id)
        );

        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);

        /* الاستراتيجيات تُبنى من شواهد المعلّم المسجَّلة في صفحة الفصل
           (strategy_logs)، لا من نصّ مولَّد. نجمعها هنا حسب الاستراتيجية
           ليصير لكل واحدة سِجلّ واحد في الملف مهما تكرّر تطبيقها. */
        const strategies = groupStrategyLogs(
            await global.TeacherDB.getAllByIndex('strategy_logs', 'teacher_id', teacher.id),
            classes
        );
        const examsAll = [];
        const worksheetsAll = [];
        const homeworkAll = [];
        for (const c of classes) {
            examsAll.push(...(await global.TeacherDB.getAllByIndex('exams', 'class_id', c.id)));
            worksheetsAll.push(...(await global.TeacherDB.getAllByIndex('worksheets', 'class_id', c.id)));
            homeworkAll.push(...(await global.TeacherDB.getAllByIndex('assignments', 'class_id', c.id)));
        }

        // Pull weekly schedule rows + period times so the printable
        // version can render the grid automatically.
        const scheduleRows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        /* ومن المصدر الموحّد: الجدولُ المطبوع كان يخرج بلا أوقاتٍ لمن لم
           يفتح محرّرَ التوقيت — وهي الأوقاتُ التي يراها في شاشة جدوله. */
        const periodTimes  = await global.PeriodTimes.get();

        const counts = {
            certificates: portfolio.certificates.length,
            schedules:    portfolio.schedules.length,
            exams:        examsAll.length,
            worksheets:   worksheetsAll.length,
            homework:     homeworkAll.length,
            strategies:   strategies.length,
            initiatives:  initiatives.length,
            extras:       portfolio.extras.length
        };

        container.innerHTML = `
            <div class="container" style="max-width: 980px;">
                <!-- الإزاحةُ في موضعين لأن الصفَّ ينقلب عموداً على الجوال:
                     justify-content يحكم الأفقَ على الشاشة العريضة، و
                     align-self يحكمه في العمود — وقاعدةُ الجوال تثبّت الزرَّ
                     في البداية (يمينِها) فتُنقض هنا. والصفُّ مشتركٌ مع ستّ
                     شاشاتٍ أخرى، فلا يُلمس صنفُه. -->
                <div class="section-header" style="margin-top: var(--space-6); justify-content: flex-end;">
                    <button class="btn btn-primary" id="btn-print-portfolio"
                            style="align-self: flex-end;">🖨️ طباعة ملف الإنجاز</button>
                </div>

                <div class="portfolio-sections" id="portfolio-sections">
                    ${SECTIONS.map((s) => sectionHeader(s, counts, state.openSection === s.key)).join('')}
                    ${(portfolio.custom_sections || []).map((cs) =>
                        customSectionHeader(cs, state.openSection === 'custom_' + cs.id)
                    ).join('')}
                </div>

                <div style="margin-top: var(--space-4); display:flex; justify-content:flex-end;">
                    <button class="btn btn-secondary" id="btn-add-custom-section">
                        + إضافة قسم جديد
                    </button>
                </div>
            </div>
        `;

        // Attach accordion handlers
        container.querySelectorAll('[data-section-toggle]').forEach((header) => {
            header.addEventListener('click', async () => {
                const key = header.dataset.sectionToggle;
                state.openSection = state.openSection === key ? null : key;
                await render(container);
            });
        });

        // Render the open section body
        if (state.openSection) {
            const body = container.querySelector(`[data-section-body="${state.openSection}"]`);
            if (body) {
                await renderSectionBody(
                    state.openSection, body, {
                        teacher, portfolio, classes,
                        exams: examsAll, worksheets: worksheetsAll, homework: homeworkAll,
                        strategies, initiatives,
                        refresh: () => render(container)
                    }
                );
            }
        }

        container.querySelector('#btn-add-custom-section')?.addEventListener('click',
            () => openCustomSectionForm(portfolio, () => render(container)));

        container.querySelector('#btn-print-portfolio')?.addEventListener('click', () => {
            openPdfModal({
                teacher, portfolio,
                exams: examsAll, worksheets: worksheetsAll, homework: homeworkAll,
                strategies, initiatives, classes,
                scheduleRows, periodTimes
            });
        });
    }

    /* ======================================================================
       نافذة حفظ الملف — بمكوّنات نافذة طباعة السجل نفسها (.popt / .pseg).

       الضغطة الأولى تبني والثانية تشارك: سفاري يشترط أن يأتي نداء
       المشاركة من إيماءة حيّة، وإيماءة الضغطة الأولى تنتهي أثناء بناء
       عشرات الصفحات — فتُرفض ورقة المشاركة ولا يظهر للمعلّم شيء.
       ====================================================================== */
    function openPdfModal(ctx) {
        const filledCount = countFilled(ctx);
        const TYPES = [
            { k: 'all',    ic: '📘', t: 'الملف كامل',
              d: 'كل الأقسام العشرة حتى الفارغ منها' },
            { k: 'filled', ic: '✨', t: 'الأقسام المعبّأة فقط',
              d: `يتخطّى الفارغة — ${filledCount.filled} من ${filledCount.total} أقسام فيها محتوى` }
        ];

        const form = document.createElement('form');
        form.innerHTML = `
            <div class="popt-lbl" style="margin-top:0;">ماذا نُدرج في الملف؟</div>
            ${TYPES.map((t, i) => `
                <div class="popt ${i === 1 ? 'on' : ''}" data-k="${t.k}">
                    <div class="popt-hd">
                        <div class="popt-ic">${t.ic}</div>
                        <div class="popt-tx">
                            <div class="popt-tt">${t.t}</div>
                            <div class="popt-dd">${t.d}</div>
                        </div>
                        <div class="popt-rd"></div>
                    </div>
                </div>
            `).join('')}

            <div class="pf-prog" id="pf-prog" hidden>
                <div class="pf-prog-txt" id="pf-prog-txt">جارٍ التحضير…</div>
                <div class="pf-prog-track"><div class="pf-prog-fill" id="pf-prog-fill"></div></div>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary" id="pf-go">📄 جهّز الملف</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.querySelectorAll('.popt .popt-hd').forEach((hd) => {
            hd.addEventListener('click', () => {
                form.querySelectorAll('.popt').forEach((o) => o.classList.remove('on'));
                hd.closest('.popt').classList.add('on');
            });
        });

        const go   = form.querySelector('#pf-go');
        const prog = form.querySelector('#pf-prog');
        const txt  = form.querySelector('#pf-prog-txt');
        const fill = form.querySelector('#pf-prog-fill');
        let built = null;          // {blob, fileName} بعد البناء

        const setBar = (pct, label) => {
            fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
            txt.textContent = label;
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            /* الضغطة الثانية: نشارك فوراً على الإيماءة الحيّة. */
            if (built) {
                const how = await global.PdfCore.deliverPdf(built.blob, built.fileName);
                if (how === 'shared')     global.TeacherApp.toast('تمت المشاركة ✅', 'success');
                if (how === 'downloaded') global.TeacherApp.toast('نُزِّل الملف ✅', 'success');
                if (how !== 'cancelled')  global.Modal.close();
                return;
            }

            const onlyFilled = form.querySelector('.popt.on')?.dataset.k === 'filled';
            go.disabled = true;
            prog.hidden = false;
            setBar(4, 'جارٍ تجهيز المحتوى…');

            try {
                const out = await global.PrintPortfolio.savePdf(ctx, {
                    onlyFilled,
                    onStatus: (s) => setBar(s === 'settle' ? 12 : 6,
                        s === 'settle' ? 'جارٍ تحميل الصور…' : 'جارٍ تجهيز المحتوى…'),
                    onProgress: (done, total) =>
                        setBar(12 + (done / total) * 88, `الصفحة ${done} من ${total}`)
                });
                built = out;
                setBar(100, `جاهز — ${out.pages} صفحة`);
                go.disabled = false;
                go.textContent = '📤 مشاركة أو حفظ';
            } catch (err) {
                console.error('[portfolio pdf]', err);
                prog.hidden = true;
                go.disabled = false;
                global.TeacherApp.toast(
                    'تعذّر إنشاء الملف: ' + (err && err.message ? err.message : 'خطأ غير معروف'),
                    'error', 6000);
            }
        });

        /* يبدأ تحميل المحرّك مع فتح النافذة لا مع الضغط. */
        global.PdfCore?.preloadPdfEngine().catch(() => {});
        global.Modal.open({ title: '📄 حفظ ملف الإنجاز', body: form, autofocus: false });
    }

    function countFilled(ctx) {
        const p = ctx.portfolio || {};
        const has = [
            true,
            (p.certificates || []).length > 0,
            true,
            (ctx.classes || []).length > 0 || (p.schedules || []).length > 0 || (ctx.scheduleRows || []).length > 0,
            ctx.exams.length > 0,
            ctx.worksheets.length > 0,
            ctx.homework.length > 0,
            ctx.strategies.length > 0,
            ctx.initiatives.length > 0,
            (p.extras || []).length > 0
        ];
        return { filled: has.filter(Boolean).length, total: has.length };
    }

    /* ---------- أيقونات الأقسام ----------
       مرسومةٌ لا رموزاً تعبيريّة: الرمزُ يأخذ لونَه من خطّ النظام الملوّن
       فلا يتبع لونَ الهُويّة، ويختلف شكلُه بين آيفون وأندرويد. والمرسومةُ
       تتبع `currentColor` فتنقلب مع المظهر. (الشكلُ «ب» باعتماد المعلّم،
       ٢٢ أغسطس ٢٠٢٦؛ والنظيرُ في question-editor.js وصفوف المحفوظ.)

       وكان «الهدف» أيقونةَ قسمين: الرسالة والاستراتيجيات. ففُرّقا —
       هدفٌ للرسالة ومصباحٌ للاستراتيجيات. */
    const SVG = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"'
        + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

    const SECTION_ICONS = {
        personal:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
        certificates: '<circle cx="12" cy="9" r="5"/><path d="M8.6 13.4 7 22l5-3 5 3-1.6-8.6"/>',
        mission:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2"/>',
        schedules:    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
        exams:        '<path d="M9 4h6v3H9z"/><path d="M15 5.5h3A1.5 1.5 0 0 1 19.5 7v12.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 6 5.5h3"/><path d="m9 14 2 2 4-4"/>',
        worksheets:   '<path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z"/><path d="M14 3v4.5h4.5M9 12.5h6M9 16h4"/>',
        homework:     '<path d="M12 6C10 4.5 7.5 4 5 4v14c2.5 0 5 .5 7 2 2-1.5 4.5-2 7-2V4c-2.5 0-5 .5-7 2z"/><path d="M12 6v14"/>',
        strategies:   '<path d="M9.5 18.5h5M10.5 21.5h3"/><path d="M12 2.5a6.2 6.2 0 0 0-3.6 11.2c.6.5 1 1.2 1.1 1.9h5c.1-.7.5-1.4 1.1-1.9A6.2 6.2 0 0 0 12 2.5z"/>',
        initiatives:  '<path d="m12 3 2.6 5.4 6 .8-4.3 4.1 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.4 9.2l6-.8z"/>',
        extras:       '<path d="M20 11.4 12.6 18.8a4.7 4.7 0 0 1-6.6-6.6l7.6-7.6a3.3 3.3 0 0 1 4.7 4.7l-7.6 7.6a1.9 1.9 0 0 1-2.7-2.7l6.7-6.7"/>'
    };
    /* قسمٌ لا رسمَ له — وهو المخصَّص — يلبس رمزَ المعلّم في المربّع نفسِه،
       فالشكلُ واحدٌ وإن اختلف ما بداخله. */
    const chipHtml = (key, fallback) => SECTION_ICONS[key]
        ? SVG(SECTION_ICONS[key])
        : escapeHtml(fallback || '📂');
    function sectionHeader(section, counts, open) {
        const count = counts[section.key] ?? '';
        const badge = count !== '' ?
            `<span class="badge ${section.auto ? 'badge-info' : 'badge-muted'}">${count}</span>` : '';
        return `
            <div class="portfolio-section ${open ? 'is-open' : ''}">
                <button class="portfolio-section-header" data-section-toggle="${section.key}">
                    <span class="pf-chip">${chipHtml(section.key, section.icon)}</span>
                    <span class="portfolio-title">${section.title}</span>
                    ${section.star ? '<span class="badge badge-warning">⭐ مميزة</span>' : ''}
                    ${section.auto ? '<span class="badge badge-info">تلقائي</span>' : ''}
                    ${badge}
                    <span class="portfolio-chev">${open ? '▼' : '◀'}</span>
                </button>
                <div class="portfolio-section-body" data-section-body="${section.key}" ${open ? '' : 'hidden'}></div>
            </div>
        `;
    }

    async function renderSectionBody(key, body, ctx) {
        if (key && key.startsWith('custom_')) {
            const id = key.slice('custom_'.length);
            const sec = (ctx.portfolio.custom_sections || []).find((s) => s.id === id);
            if (sec) return renderCustomSection(body, ctx, sec);
            return;
        }
        switch (key) {
            case 'personal':    return renderPersonal(body, ctx);
            case 'certificates':return renderFileList(body, ctx, 'certificates', 'شهادة', '🏆');
            case 'mission':     return renderMission(body, ctx);
            case 'schedules':   return renderSchedules(body, ctx);
            case 'exams':       return renderAutoList(body, ctx.exams, 'exam');
            case 'worksheets':  return renderAutoList(body, ctx.worksheets, 'worksheet');
            case 'homework':    return renderAutoList(body, ctx.homework, 'homework');
            case 'strategies':  return global.PortfolioStrategies.render(body, ctx);
            case 'initiatives': return global.PortfolioInitiatives.render(body, ctx);
            case 'extras':      return renderFileList(body, ctx, 'extras', 'ملف', '📎');
        }
    }

    /* ---------- Custom (user-defined) sections ---------- */

    function customSectionHeader(sec, open) {
        const count = (sec.items || []).length;
        const icon  = sec.icon || '📂';
        return `
            <div class="portfolio-section ${open ? 'is-open' : ''}">
                <button class="portfolio-section-header" data-section-toggle="custom_${sec.id}">
                    <span class="pf-chip">${chipHtml(null, icon)}</span>
                    <span class="portfolio-title">${escapeHtml(sec.name || 'قسم بدون اسم')}</span>
                    <span class="badge badge-muted">${count}</span>
                    <span class="portfolio-chev">${open ? '▼' : '◀'}</span>
                </button>
                <div class="portfolio-section-body" data-section-body="custom_${sec.id}" ${open ? '' : 'hidden'}></div>
            </div>
        `;
    }

    function renderCustomSection(body, ctx, sec) {
        if (!Array.isArray(sec.items)) sec.items = [];
        const items = sec.items;

        body.innerHTML = `
            <div class="flex gap-2" style="margin-bottom: var(--space-3); flex-wrap: wrap;">
                <button class="btn btn-primary" id="cs-add">+ إضافة ملف</button>
                <button class="btn btn-ghost btn-sm" id="cs-rename">✏️ إعادة تسمية القسم</button>
                <button class="btn btn-ghost btn-sm" id="cs-delete">🗑️ حذف القسم</button>
            </div>
            <div class="file-list">
                ${items.length === 0
                    ? `<p class="text-muted">لا توجد ملفات بعد.</p>`
                    : items.map((it, i) => fileCard(it, i, sec.icon || '📎')).join('')}
            </div>
        `;

        body.querySelector('#cs-add').addEventListener('click',
            () => openCustomItemForm(body, ctx, sec));

        body.querySelector('#cs-rename').addEventListener('click',
            () => openCustomSectionForm(ctx.portfolio, ctx.refresh, sec));

        body.querySelector('#cs-delete').addEventListener('click', async () => {
            if (!global.confirm(`حذف قسم "${sec.name}" وكل ملفاته؟`)) return;
            const idx = ctx.portfolio.custom_sections.findIndex((s) => s.id === sec.id);
            if (idx > -1) ctx.portfolio.custom_sections.splice(idx, 1);
            await savePortfolio(ctx.portfolio);
            await dropFiles((sec.items || []).map((it) => it.storage_path));
            /* ولا يُفتح غيرُه مكانَه: القسمُ حُذف، فالطيُّ أصدقُ من قفزةٍ
               إلى قسمٍ لم يطلبه. */
            state.openSection = null;
            global.TeacherApp.toast('تم حذف القسم.', 'info');
            ctx.refresh();
        });

        body.querySelectorAll('[data-file-edit]').forEach((btn) => {
            btn.addEventListener('click', () =>
                openCustomItemForm(body, ctx, sec, Number(btn.dataset.fileEdit)));
        });

        body.querySelectorAll('[data-file-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fileDel);
                if (!global.confirm('حذف هذا الملف؟')) return;
                const [gone] = items.splice(i, 1);
                await savePortfolio(ctx.portfolio);
                await dropFiles([gone && gone.storage_path]);
                global.TeacherApp.toast('تم الحذف.', 'info');
                renderCustomSection(body, ctx, sec);
            });
        });

        body.querySelectorAll('[data-file-download]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fileDownload);
                const it = items[i];
                const label = btn.textContent;
                btn.disabled = true;
                btn.textContent = '…';
                try {
                    const blob = await global.TeacherDB.PortfolioFiles.ensure(it);
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = it.filename || it.name;
                    a.click();
                    /* لا يُبطَل العنوانُ في الحال: بعضُ المتصفّحات تبدأ
                       التنزيلَ بعد لحظة، فإبطالُه فوراً يُفرغ الملفّ. */
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                } catch (e) {
                    global.TeacherApp.toast('تعذّر فتح المرفق: ' + e.message, 'error', 5000);
                } finally {
                    btn.disabled = false;
                    btn.textContent = label;
                }
            });
        });
    }

    function openCustomSectionForm(portfolio, refresh, existing) {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">اسم القسم *</label>
                <input class="input" id="cs-name" type="text" required
                       placeholder="مثلاً: أنشطة طلابية، إنجازات، تدريب..."
                       value="${existing ? escapeAttr(existing.name) : ''}">
            </div>
            <div class="field">
                <label class="label">رمز / إيموجي (اختياري)</label>
                <input class="input" id="cs-icon" type="text" maxlength="4"
                       placeholder="📂"
                       value="${existing ? escapeAttr(existing.icon || '') : ''}">
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ' : 'إضافة'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        /* حارسُ الضغط المزدوج — ضغطتان كانتا تُنشئان قسمين. (ق٫٩) */
        let saving = false;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (saving) return;
            const name = form.querySelector('#cs-name').value.trim();
            const icon = form.querySelector('#cs-icon').value.trim();
            if (!name) return global.TeacherApp.toast('اسم القسم مطلوب.', 'warning');
            saving = true;

            if (!Array.isArray(portfolio.custom_sections)) portfolio.custom_sections = [];

            if (existing) {
                existing.name = name;
                existing.icon = icon;
            } else {
                const sec = {
                    id: 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    name, icon, items: []
                };
                portfolio.custom_sections.push(sec);
                state.openSection = 'custom_' + sec.id;
            }

            try {
                await savePortfolio(portfolio);
            } catch (err) {
                /* يُحرَّر الحارس وإلّا بقيت النافذة مفتوحةً بزرٍّ ميّت. */
                saving = false;
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }
            global.Modal.close();
            global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تم إضافة القسم ✅', 'success');
            refresh();
        });

        global.Modal.open({ title: existing ? 'تعديل القسم' : 'قسم جديد', body: form });
    }

    function openCustomItemForm(body, ctx, sec, editIndex) {
        const existing = editIndex !== undefined ? sec.items[editIndex] : null;
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">الاسم *</label>
                <input class="input" id="f-name" type="text" required
                       placeholder="اكتب الاسم اللي تبيه..."
                       value="${existing ? escapeAttr(existing.name) : ''}">
            </div>
            <div class="grid grid-2">
                <div class="field">
                    <label class="label">التصنيف</label>
                    <input class="input" id="f-type" type="text"
                           value="${existing ? escapeAttr(existing.type || '') : ''}">
                </div>
                <div class="field">
                    <label class="label">التاريخ</label>
                    <input class="input" id="f-date" type="date"
                           value="${existing ? (existing.date || '') : ''}">
                </div>
            </div>
            <div class="field">
                <label class="label">الملف (PDF / صورة — اختياري)</label>
                <input class="input" id="f-file" type="file" accept=".pdf,image/*">
                <div class="field-hint">${existing && existing.file ? 'ملف محفوظ — اختر ملفاً جديداً للاستبدال.' : ''}</div>
            </div>
            <div class="field">
                <label class="label">ملاحظات</label>
                <textarea class="textarea" id="f-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ' : 'إضافة'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalLabel = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'جارٍ الحفظ…';

            try {
                const name = form.querySelector('#f-name').value.trim();
                if (!name) throw new Error('الاسم مطلوب.');

                const file = form.querySelector('#f-file').files[0];
                const item = {
                    id: existing?.id || ('f_' + Date.now()),
                    name,
                    type:  form.querySelector('#f-type').value.trim(),
                    date:  form.querySelector('#f-date').value,
                    notes: form.querySelector('#f-notes').value.trim(),
                    file:     existing?.file || null,
                    filename: existing?.filename || ''
                };
                const stale = file ? await attachFile(item, file) : null;

                // Snapshot the previous items so we can roll back on failure.
                const prev = sec.items.slice();
                if (existing) sec.items[editIndex] = item;
                else          sec.items.push(item);

                console.info('[Portfolio] saving', {
                    file_size_kb: file ? Math.round(file.size / 1024) : 0,
                    items_total:  sec.items.length
                });

                try {
                    await savePortfolio(ctx.portfolio);
                } catch (saveErr) {
                    sec.items = prev;  // roll back local mutation on failure
                    throw saveErr;
                }
                await dropFiles([stale]);   /* بعد النجاح وحده */

                global.Modal.close();
                global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تمت الإضافة ✅', 'success');
                renderCustomSection(body, ctx, sec);
            } catch (err) {
                console.error('[Portfolio] save failed:', err);
                global.TeacherApp.toast('تعذّر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error', 5000);
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
            }
        });

        global.Modal.open({ title: (existing ? 'تعديل ' : 'إضافة ') + 'ملف', body: form });
    }

    /* ---------- Personal info ---------- */

    /* Convert Western digits (0-9) to Arabic-Indic digits (٠-٩). */
    function toArabicDigits(s) {
        if (s === null || s === undefined || s === '') return '';
        const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        return String(s).replace(/[0-9]/g, (d) => map[+d]);
    }

    function renderPersonal(body, ctx) {
        const t = ctx.teacher;
        const p = ctx.portfolio.personal || {};

        // Source-of-truth = teacher record; legacy portfolio.personal as fallback.
        const fullName  = t.name           || p.full_name      || '';
        const civilId   = toArabicDigits(t.civil_id     || p.civil_id     || '');
        const specialty =                  t.specialization   || p.specialization   || '';
        const qual      =                  t.qualification    || p.qualification    || '';
        const years     = toArabicDigits(t.experience_years ?? p.experience_years ?? '');
        const school    =                  t.school_name      || p.school           || '';
        const region    =                  t.region           || p.region           || '';
        const subjects  = Array.isArray(t.subjects) ? t.subjects.join('، ')
                        : (t.subject || '');
        const phone     = toArabicDigits(t.phone        || p.phone        || '');
        const email     =                  t.email        || p.email        || '';

        const displayName = fullName ? 'الأستاذ ' + fullName : '';

        const rows = [
            ['الاسم رباعي',      displayName],
            ['رقم الهوية',       civilId],
            ['التخصص',           specialty],
            ['المؤهل',           qual],
            ['سنوات الخبرة',     years],
            ['المدرسة',          school],
            ['المنطقة',          region],
            ['مواد التدريس',     subjects]
        ];

        const cell = (val) => val
            ? `<td class="pf-id-value">${escapeHtml(val)}</td>`
            : `<td class="pf-id-value pf-id-value-empty">—</td>`;

        const photoBox = (t.photo instanceof Blob)
            ? `<img src="${URL.createObjectURL(t.photo)}" alt="">`
            : `<div class="pf-id-photo-empty"></div>`;

        body.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                💡 هذه البيانات تُدار من <a href="#/profile">الملف التعريفي</a>.
                أي تعديل هناك يظهر هنا تلقائياً.
            </p>

            <div class="pf-id-card">
                <div class="pf-id-inner">
                    <div class="pf-id-header">
                        <div class="pf-id-country">— المملكة العربية السعودية —</div>
                        <h3 class="pf-id-title">البطاقة الشخصية</h3>
                        <div class="pf-id-subtitle">للمعلم</div>
                    </div>

                    <div class="pf-id-body">
                        <div class="pf-id-photo-wrap">
                            <div class="pf-id-photo">${photoBox}</div>
                            <div class="pf-id-photo-label">الصورة الشخصية</div>
                        </div>

                        <table class="pf-id-table">
                            <tbody>
                                ${rows.map(([label, value]) => `
                                    <tr>
                                        <td class="pf-id-label">${label}</td>
                                        ${cell(value)}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="pf-id-footer">
                        <span>📞 ${phone ? escapeHtml(phone) : '—'}</span>
                        <span>✉️ ${email ? escapeHtml(email) : '—'}</span>
                    </div>
                </div>
            </div>

            <div style="text-align:center; margin-top: var(--space-5);">
                <a href="#/profile" class="btn btn-secondary">
                    ✏️ تعديل من الملف التعريفي
                </a>
            </div>
        `;
    }

    /* ---------- Mission & vision ---------- */

    /* ---------- الرسالة والرؤية: بطاقات تُقرأ لا صناديق تُملأ ----------
       الصناديق الفارغة كانت تطالب المعلم بالكتابة، والمكتبة — وهي الفكرة —
       مخفيةٌ خلف زر صغير. الآن كل حقل بطاقةٌ تعرض نصّه كاملاً، والضغط
       يفتح مكتبة ذلك الحقل ومعها الكتابة الحرة. */
    const MV_FIELDS = [
        { key: 'mission', label: 'الرسالة الشخصية',
          empty: 'اختر صياغة من المكتبة، أو اكتبها بنفسك.' },
        { key: 'vision',  label: 'الرؤية',
          empty: 'سطر واحد يصف ما تسعى إليه.' },
        { key: 'goals',   label: 'الأهداف المهنية',
          empty: 'اختر ما يناسبك من الأهداف — تُضاف كقائمة.' }
    ];

    function renderMission(body, ctx) {
        body.innerHTML = `
            <p class="mv-hint">صياغات رسمية مبنية على المعايير المهنية للمعلمين
               ورؤية وزارة التعليم — اخترها ثم عدّلها لتشبهك.</p>
            <div class="mvc">
                ${MV_FIELDS.map((f) => mvCardHtml(f, ctx.portfolio[f.key] || '')).join('')}
            </div>
        `;

        body.querySelectorAll('[data-mv]').forEach((el) => {
            el.addEventListener('click', () => openMvSheet(body, ctx, el.dataset.mv));
        });
    }

    /* الأهداف تُعرض قائمةً كاملة بلا اقتطاع — المعلم يريد أن يرى ما كتبه
       لا ملخّصاً عنه. */
    function mvCardHtml(f, value) {
        const has = !!String(value).trim();
        let inner;
        if (!has) {
            inner = `<span class="mvc-empty">${escapeHtml(f.empty)}</span>`;
        } else if (f.key === 'goals') {
            const lines = String(value).split('\n')
                .map((x) => x.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
            inner = `<ul class="mvc-goals">${lines.map((x) =>
                `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
        } else {
            inner = `<span class="mvc-tx">${escapeHtml(value)}</span>`;
        }
        return `
            <button type="button" class="mvc-card ${has ? '' : 'is-empty'}" data-mv="${f.key}">
                <span class="mvc-head">
                    <span class="mvc-lbl">${escapeHtml(f.label)}</span>
                    <span class="mvc-edit">${has ? 'تعديل' : 'اختر'}</span>
                </span>
                ${inner}
            </button>
        `;
    }

    /* لوحة الحقل الواحد: مكتبته وحدها لا الثلاثة، ومعها الكتابة الحرة.
       الأهداف اختيار متعدد يُضاف إلى ما هو مكتوب، والرسالة والرؤية
       اختيار مفرد يستبدل. */
    function openMvSheet(body, ctx, key) {
        const f = MV_FIELDS.find((x) => x.key === key);
        const C = global.MissionCatalog;
        const items = key === 'mission' ? C.missions()
                    : key === 'vision'  ? C.visions()
                    : C.goals();
        const multi = key === 'goals';
        const box = document.createElement('div');
        let tab = 'lib';
        const chosen = new Set();
        let draft = ctx.portfolio[key] || '';

        function paint() {
            box.innerHTML = `
                <div class="mvs-tabs">
                    <button type="button" class="mvs-tab ${tab === 'lib' ? 'on' : ''}"
                            data-t="lib">من المكتبة</button>
                    <button type="button" class="mvs-tab ${tab === 'own' ? 'on' : ''}"
                            data-t="own">أكتبها بنفسي</button>
                </div>
                ${tab === 'lib' ? `
                    <p class="mv-note">${multi
                        ? 'اختر ما شئت — يُضاف إلى ما كتبته.'
                        : 'اختر صياغةً واحدة — تحلّ محلّ الحالية، ويمكنك تعديلها بعدها.'}</p>
                    <div class="mv-list">
                        ${items.map((x, n) => `
                            <button type="button" class="mv-item ${chosen.has(n) ? 'on' : ''}"
                                    data-i="${n}">
                                <span class="ax">${escapeHtml(C.axisLabel(x.axis))}</span>
                                <span class="tx">${escapeHtml(x.text)}</span>
                            </button>`).join('')}
                    </div>
                    ${multi ? `<button type="button" class="fsave" id="mv-add">
                        إضافة المختار (<span id="mv-n">${chosen.size}</span>)</button>` : ''}
                ` : `
                    <textarea class="textarea mv-own" id="mv-text" rows="${multi ? 7 : 5}"
                              placeholder="${escapeAttr(f.empty)}">${escapeHtml(draft)}</textarea>
                    <button type="button" class="fsave" id="mv-save">💾 حفظ</button>
                `}
            `;

            box.querySelectorAll('[data-t]').forEach((b) => {
                b.addEventListener('click', () => {
                    if (tab === 'own') draft = box.querySelector('#mv-text').value;
                    tab = b.dataset.t; paint();
                });
            });

            box.querySelectorAll('[data-i]').forEach((b) => {
                b.addEventListener('click', () => {
                    const n = +b.dataset.i;
                    if (!multi) { commit(items[n].text); return; }
                    if (chosen.has(n)) chosen.delete(n); else chosen.add(n);
                    b.classList.toggle('on');
                    box.querySelector('#mv-n').textContent = chosen.size;
                });
            });

            box.querySelector('#mv-add')?.addEventListener('click', () => {
                if (!chosen.size) return;
                const picked = items.filter((_, n) => chosen.has(n)).map((g) => g.text);
                const prev = String(draft).split('\n')
                    .map((x) => x.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
                commit([...prev, ...picked].map((x) => '• ' + x).join('\n'));
            });

            box.querySelector('#mv-save')?.addEventListener('click', () => {
                commit(box.querySelector('#mv-text').value);
            });
        }

        async function commit(value) {
            ctx.portfolio[key] = String(value).trim();
            await savePortfolio(ctx.portfolio);
            global.Modal.close();
            global.TeacherApp.toast('تم الحفظ ✅', 'success', 3000);
            renderMission(body, ctx);
        }

        paint();
        global.Modal.open({ title: '📖 ' + f.label, body: box });
    }

    /* ---------- Generic file list (certificates / schedules / extras) ---------- */

    function renderFileList(body, ctx, field, typeName, icon) {
        const items = ctx.portfolio[field] || [];

        body.innerHTML = `
            <button class="btn btn-primary" id="add-file">+ إضافة ${typeName}</button>
            <div class="file-list" style="margin-top: var(--space-4);">
                ${items.length === 0
                    ? `<p class="text-muted">لا توجد ${typeName === 'شهادة' ? 'شهادات' : 'ملفات'} بعد.</p>`
                    : items.map((item, i) => fileCard(item, i, icon)).join('')}
            </div>
        `;

        body.querySelector('#add-file').addEventListener('click', () => openFileForm(body, ctx, field, typeName));

        body.querySelectorAll('[data-file-edit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fileEdit);
                openFileForm(body, ctx, field, typeName, i);
            });
        });

        body.querySelectorAll('[data-file-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fileDel);
                if (!global.confirm('حذف هذا الملف؟')) return;
                const [gone] = ctx.portfolio[field].splice(i, 1);
                await savePortfolio(ctx.portfolio);
                await dropFiles([gone && gone.storage_path]);
                global.TeacherApp.toast('تم الحذف.', 'info');
                renderFileList(body, ctx, field, typeName, icon);
            });
        });

        body.querySelectorAll('[data-file-download]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fileDownload);
                const item = items[i];
                const label = btn.textContent;
                btn.disabled = true;
                btn.textContent = '…';
                try {
                    const blob = await global.TeacherDB.PortfolioFiles.ensure(item);
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = item.filename || item.name;
                    a.click();
                    /* لا يُبطَل العنوانُ في الحال: بعضُ المتصفّحات تبدأ
                       التنزيلَ بعد لحظة، فإبطالُه فوراً يُفرغ الملفّ. */
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                } catch (e) {
                    global.TeacherApp.toast('تعذّر فتح المرفق: ' + e.message, 'error', 5000);
                } finally {
                    btn.disabled = false;
                    btn.textContent = label;
                }
            });
        });
    }

    function fileCard(item, i, icon) {
        /* المرفقُ لم يعد في يد الشاشة — هو في المخزن، والوثيقةُ تحمل حجمَه
           ومساره. فالسؤالُ «هل له مرفق؟» لا «هل الملفُّ محمَّل؟». */
        const hasFile = global.TeacherDB.PortfolioFiles.has(item);
        return `
            <div class="file-card">
                ${icon ? `<div class="file-icon">${icon}</div>` : ''}
                <div class="file-body">
                    <div class="file-name">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        ${[item.type ? escapeHtml(item.type) : '',
                           item.date ? formatDate(item.date) : '',
                           hasFile ? formatSize(item.size || (item.file && item.file.size) || 0) : '']
                          .filter(Boolean).join(' · ')}
                    </div>
                </div>
                <div class="file-actions">
                    ${hasFile ? `<button class="btn btn-ghost btn-sm" data-file-download="${i}"
                            aria-label="تنزيل">${DOWNLOAD}</button>` : ''}
                    <button class="btn btn-ghost btn-sm" data-file-edit="${i}"
                            aria-label="تعديل">${PENCIL}</button>
                    <button class="btn btn-ghost btn-sm" data-file-del="${i}"
                            aria-label="حذف">${TRASH}</button>
                </div>
            </div>
        `;
    }

    function openFileForm(body, ctx, field, typeName, editIndex) {
        const existing = editIndex !== undefined ? ctx.portfolio[field][editIndex] : null;
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">الاسم *</label>
                <input class="input" id="f-name" type="text" required
                       placeholder="مثلاً: رخصة المعلم — مستوى ممارس"
                       value="${existing ? escapeAttr(existing.name) : ''}">
            </div>
            <div class="grid grid-2">
                <div class="field">
                    <label class="label">النوع / التصنيف</label>
                    <input class="input" id="f-type" type="text"
                           placeholder="شهادة، رخصة، دورة..."
                           value="${existing ? escapeAttr(existing.type || '') : ''}">
                </div>
                <div class="field">
                    <label class="label">التاريخ</label>
                    <input class="input" id="f-date" type="date"
                           value="${existing ? (existing.date || '') : ''}">
                </div>
            </div>
            ${field === 'certificates' ? `
                <div class="field">
                    <label class="label">الجهة المانحة</label>
                    <input class="input" id="f-issuer" type="text"
                           placeholder="مثلاً: هيئة تقويم التعليم، وزارة التعليم..."
                           value="${existing ? escapeAttr(existing.issuer || '') : ''}">
                </div>
            ` : ''}
            <div class="field">
                <label class="label">الملف (PDF / صورة — اختياري)</label>
                <input class="input" id="f-file" type="file" accept=".pdf,image/*">
                <div class="field-hint">${existing && existing.file ? 'ملف محفوظ — اختر ملفاً جديداً للاستبدال.' : ''}</div>
            </div>
            <div class="field">
                <label class="label">ملاحظات</label>
                <textarea class="textarea" id="f-notes" rows="2">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ' : 'إضافة'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalLabel = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'جارٍ الحفظ…';

            try {
                const name = form.querySelector('#f-name').value.trim();
                if (!name) throw new Error('الاسم مطلوب.');

                const file = form.querySelector('#f-file').files[0];
                const issuerEl = form.querySelector('#f-issuer');
                const item = {
                    id: existing?.id || ('f_' + Date.now()),
                    name,
                    type:  form.querySelector('#f-type').value.trim(),
                    date:  form.querySelector('#f-date').value,
                    issuer: issuerEl ? issuerEl.value.trim() : (existing?.issuer || ''),
                    notes: form.querySelector('#f-notes').value.trim(),
                    file:     existing?.file || null,
                    filename: existing?.filename || ''
                };

                const stale = file ? await attachFile(item, file) : null;

                if (!Array.isArray(ctx.portfolio[field])) ctx.portfolio[field] = [];
                const prev = ctx.portfolio[field].slice();
                if (existing) ctx.portfolio[field][editIndex] = item;
                else          ctx.portfolio[field].push(item);

                console.info('[Portfolio] saving', field, {
                    file_size_kb: file ? Math.round(file.size / 1024) : 0,
                    items_total: ctx.portfolio[field].length
                });

                try {
                    await savePortfolio(ctx.portfolio);
                } catch (saveErr) {
                    ctx.portfolio[field] = prev;
                    throw saveErr;
                }
                await dropFiles([stale]);   /* بعد النجاح وحده */

                global.Modal.close();
                global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تمت الإضافة ✅', 'success');
                renderFileList(body, ctx, field, typeName,
                    field === 'certificates' ? '🏆' : field === 'schedules' ? '📅' : '📎');
            } catch (err) {
                console.error('[Portfolio] save failed:', err);
                global.TeacherApp.toast('تعذّر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error', 5000);
                submitBtn.disabled = false;
                submitBtn.textContent = originalLabel;
            }
        });

        global.Modal.open({ title: (existing ? 'تعديل ' : 'إضافة ') + typeName, body: form });
    }

    /* ---------- Schedules: classes summary + optional file uploads ---------- */

    function renderSchedules(body, ctx) {
        const classes = ctx.classes || [];
        const total = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);
        const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
        const label = (c) => escapeHtml(global.ClassCreate
            ? global.ClassCreate.label(c.grade, c.section)
            : (c.grade || '') + ' / ' + (c.section || ''));

        /* ── ثلاثةُ أعمدةٍ لا ستّة ──
           كانت: # · المرحلة · الصف · الشعبة · المادة · عدد الطلاب — تفيض
           على الجوّال فتُمرَّر أفقيّاً. والترقيمُ لا يقول شيئاً، والمرحلةُ
           تكرّر ما في اسم الصفّ، والشعبةُ تُضمّ إليه.
           (اختاره المعلّم — الشكل «ج» من معاينة sch.html، ٣٠ أغسطس ٢٠٢٦.)

           وبلا إيموجي وبلا سطر شرح: «خلّ كلّ شيء مختصر» بنصّه. */
        const classesBlock = classes.length === 0
            ? '<p class="text-muted">لم تُضف فصولاً بعد.</p>'
            : `
            <table class="sc-tbl">
                <thead>
                    <tr><th>الفصل</th><th>المادة</th><th class="n">الطلاب</th></tr>
                </thead>
                <tbody>
                    ${classes.map((c) => `
                        <tr>
                            <td>${label(c)}</td>
                            <td class="s">${escapeHtml(c.subject || '')}</td>
                            <td class="n">${ar(c.student_count || 0)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;

        body.innerHTML = `
            <div class="sc-h">فصولي
                <span class="n">${ar(classes.length)} فصول · ${ar(total)} طالباً</span></div>
            ${classesBlock}
            <hr class="sc-sep">
            <div class="sc-h">ملفات توزيع المنهج والجدول</div>
            <div id="files-slot"></div>
        `;

        renderFileList(body.querySelector('#files-slot'), ctx, 'schedules', 'ملف', '');
    }

    /* ---------- Auto-populated lists (exams / worksheets / homework) ---------- */

    function renderAutoList(body, items, kind) {
        if (items.length === 0) {
            body.innerHTML = `<p class="text-muted">
                لا يوجد بعد — ستظهر هنا تلقائياً بمجرّد إنشائها من شاشة الفصل.
            </p>`;
            return;
        }

        const sorted = items.slice().sort((a, b) =>
            (b.created_at || '').localeCompare(a.created_at || ''));

        body.innerHTML = `
            <div class="auto-list">
                ${sorted.map((it) => `
                    <div class="auto-item">
                        <div>
                            <strong>${escapeHtml(it.title || 'بدون عنوان')}</strong>
                            <div class="text-muted" style="font-size:var(--fs-sm);">
                                ${kind === 'exam' ? `${it.questions?.length || 0} سؤال` :
                                  kind === 'worksheet' ? `${it.exercises?.length || 0} تمرين` :
                                  `تاريخ التسليم: ${formatDate(it.due_date)}`}
                                ${it.created_at ? ` · ${formatDate(it.created_at)}` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <p class="text-muted" style="font-size:var(--fs-sm); margin-top:var(--space-3);">
                هذا القسم يتعبّأ تلقائياً من شاشة الفصل. لا حاجة لإضافة يدوية.
            </p>
        `;
    }

    /* `renderSchedules` مُصدَّرةٌ ليُقاس القسمُ وحدَه بلا تجهيز الشاشة كلِّها. */
    global.PortfolioView = { render, savePortfolio, loadPortfolio, renderSchedules };
})(window);
