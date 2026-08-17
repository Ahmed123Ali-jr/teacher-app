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

    function formatSize(bytes) {
        if (!bytes) return '';
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(0) + ' KB';
        return (kb / 1024).toFixed(1) + ' MB';
    }

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

    const state = { openSection: 'personal' };

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
        const periodTimes  = (await global.TeacherDB.Settings.get('period_times')) || null;

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

    function sectionHeader(section, counts, open) {
        const count = counts[section.key] ?? '';
        const badge = count !== '' ?
            `<span class="badge ${section.auto ? 'badge-info' : 'badge-muted'}">${count}</span>` : '';
        return `
            <div class="portfolio-section ${open ? 'is-open' : ''}">
                <button class="portfolio-section-header" data-section-toggle="${section.key}">
                    <span class="portfolio-icon">${section.icon}</span>
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
                    <span class="portfolio-icon">${escapeHtml(icon)}</span>
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
            state.openSection = 'personal';
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
                items.splice(i, 1);
                await savePortfolio(ctx.portfolio);
                global.TeacherApp.toast('تم الحذف.', 'info');
                renderCustomSection(body, ctx, sec);
            });
        });

        body.querySelectorAll('[data-file-download]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fileDownload);
                const it = items[i];
                if (!it.file) return;
                const url = URL.createObjectURL(it.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = it.filename || it.name;
                a.click();
                URL.revokeObjectURL(url);
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

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = form.querySelector('#cs-name').value.trim();
            const icon = form.querySelector('#cs-icon').value.trim();
            if (!name) return global.TeacherApp.toast('اسم القسم مطلوب.', 'warning');

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

            await savePortfolio(portfolio);
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
            submitBtn.textContent = '⏳ جارٍ الحفظ...';

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
                if (file) {
                    const isImg = (file.type || '').startsWith('image/');
                    const cap = isImg ? 15 : 30;  // MB
                    if (file.size > cap * 1024 * 1024) {
                        throw new Error('حجم الملف كبير (أقصى ' + cap + ' MB لـ '
                            + (isImg ? 'الصور' : 'المستندات') + ').');
                    }
                    item.file = file;
                    item.filename = file.name;
                }

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
                ctx.portfolio[field].splice(i, 1);
                await savePortfolio(ctx.portfolio);
                global.TeacherApp.toast('تم الحذف.', 'info');
                renderFileList(body, ctx, field, typeName, icon);
            });
        });

        body.querySelectorAll('[data-file-download]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fileDownload);
                const item = items[i];
                if (!item.file) return;
                const url = URL.createObjectURL(item.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = item.filename || item.name;
                a.click();
                URL.revokeObjectURL(url);
            });
        });
    }

    function fileCard(item, i, icon) {
        return `
            <div class="file-card">
                <div class="file-icon">${icon}</div>
                <div class="file-body">
                    <div class="file-name">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        ${item.type ? `<span class="badge badge-muted">${escapeHtml(item.type)}</span>` : ''}
                        ${item.date ? `<span>📅 ${formatDate(item.date)}</span>` : ''}
                        ${item.file ? `<span>${formatSize(item.file.size)}</span>` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    ${item.file ? `<button class="btn btn-ghost btn-sm" data-file-download="${i}">⬇️</button>` : ''}
                    <button class="btn btn-ghost btn-sm" data-file-edit="${i}">✏️</button>
                    <button class="btn btn-ghost btn-sm" data-file-del="${i}">🗑️</button>
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
            submitBtn.textContent = '⏳ جارٍ الحفظ...';

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

                if (file) {
                    const isImg = (file.type || '').startsWith('image/');
                    const cap = isImg ? 15 : 30;  // MB
                    if (file.size > cap * 1024 * 1024) {
                        throw new Error('حجم الملف كبير (أقصى ' + cap + ' MB لـ '
                            + (isImg ? 'الصور' : 'المستندات') + ').');
                    }
                    item.file = file;
                    item.filename = file.name;
                }

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
        const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
        const classes = ctx.classes || [];
        const totalStudents = classes.reduce((sum, c) => sum + (c.student_count || 0), 0);

        const classesTable = classes.length === 0 ? `
            <p class="text-muted">لم تُضف فصولاً بعد — أضف فصولك من الشاشة الرئيسية وستظهر هنا تلقائياً.</p>
        ` : `
            <div class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-3);">
                ${classes.length} فصل · ${totalStudents} طالب — تُحدَّث تلقائياً مع كل فصل تُضيفه.
            </div>
            <div class="table-wrapper" style="margin-bottom: var(--space-5);">
                <table class="students-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>المرحلة</th>
                            <th>الصف</th>
                            <th>الشعبة</th>
                            <th>المادة</th>
                            <th>عدد الطلاب</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${classes.map((c, i) => `
                            <tr>
                                <td class="num">${i + 1}</td>
                                <td>${STAGE_LABELS[c.stage] || ''}</td>
                                <td>${escapeHtml(c.grade)}</td>
                                <td>${escapeHtml(c.section)}</td>
                                <td>${escapeHtml(c.subject)}</td>
                                <td class="num">${c.student_count || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        body.innerHTML = `
            <h4 style="margin-top:0;">📚 فصولي (تلقائي)</h4>
            ${classesTable}

            <hr style="margin: var(--space-5) 0; border:0; border-top: 1px solid var(--border);">

            <h4>📎 ملفات توزيع المنهج والجدول الأسبوعي</h4>
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-3);">
                يمكنك رفع ملفات توزيع المنهج، خطط الدروس، أو صورة الجدول الأسبوعي.
            </p>
            <div id="files-slot"></div>
        `;

        renderFileList(body.querySelector('#files-slot'), ctx, 'schedules', 'ملف', '📅');
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

    global.PortfolioView = { render, savePortfolio, loadPortfolio };
})(window);
