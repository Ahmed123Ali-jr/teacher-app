/* ==========================================================================
   views/portfolio.js — Teacher portfolio with 10 sections.
   Personal info, mission, certificates, schedules (manual).
   Exams/worksheets/homework (auto from DB).
   Strategies & initiatives (with AI reports) — delegated to sub-modules.
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
        { key: 'strategies',  title: 'استراتيجيات التدريس',     icon: '🎯', auto: false, star: true },
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

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const portfolio  = await loadPortfolio(teacher.id);
        const strategies = await global.TeacherDB.getAllByIndex('strategies', 'teacher_id', teacher.id);
        const initiatives= await global.TeacherDB.getAllByIndex('initiatives', 'teacher_id', teacher.id);

        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const examsAll = [];
        const worksheetsAll = [];
        const homeworkAll = [];
        for (const c of classes) {
            examsAll.push(...(await global.TeacherDB.getAllByIndex('exams', 'class_id', c.id)));
            worksheetsAll.push(...(await global.TeacherDB.getAllByIndex('worksheets', 'class_id', c.id)));
            homeworkAll.push(...(await global.TeacherDB.getAllByIndex('assignments', 'class_id', c.id)));
        }

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
                <div class="section-header" style="margin-top: var(--space-6);">
                    <div>
                        <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
                        <h2 class="section-title" style="display:inline-block; margin-right: var(--space-3);">
                            📁 ملف الإنجاز
                        </h2>
                    </div>
                    <button class="btn btn-primary" id="btn-print-portfolio">🖨️ طباعة الملف كاملاً</button>
                </div>

                <div class="card portfolio-header">
                    <div class="portfolio-avatar">${
                        global.ProfileView
                            ? global.ProfileView.avatarInner(teacher, true)
                            : initials(teacher.name)
                    }</div>
                    <div>
                        <h3 style="margin:0 0 var(--space-1)">${escapeHtml(teacher.name)}</h3>
                        <div class="text-muted">
                            ${escapeHtml(teacher.school_name)}
                            · ${escapeHtml((teacher.subjects || [teacher.subject]).filter(Boolean).join('، '))}
                        </div>
                        <div class="portfolio-stats">
                            <span>📝 ${counts.exams} اختبار</span>
                            <span>📄 ${counts.worksheets} ورقة</span>
                            <span>📚 ${counts.homework} واجب</span>
                            <span>🎯 ${counts.strategies} استراتيجية</span>
                            <span>🌟 ${counts.initiatives} مبادرة</span>
                        </div>
                    </div>
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

        container.querySelector('#btn-print-portfolio')?.addEventListener('click', async () => {
            await global.PrintPortfolio.print({
                teacher, portfolio,
                exams: examsAll, worksheets: worksheetsAll, homework: homeworkAll,
                strategies, initiatives, classes
            });
        });
    }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return (parts[0] || '').charAt(0) + (parts[1] || '').charAt(0);
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

    function renderPersonal(body, ctx) {
        const t = ctx.teacher;
        const p = ctx.portfolio.personal || {};
        // Single source of truth = the teacher record. Legacy portfolio.personal
        // values are shown as fallback when the teacher record hasn't been updated yet.
        const rows = [
            ['الاسم الكامل',     t.name         || p.full_name],
            ['التخصص',           t.specialization   || p.specialization],
            ['المؤهل العلمي',    t.qualification    || p.qualification],
            ['سنوات الخبرة',     t.experience_years || p.experience_years],
            ['المدرسة الحالية',  t.school_name  || p.school],
            ['رقم السجل المدني', t.civil_id         || p.civil_id],
            ['رقم الجوال',       t.phone        || p.phone],
            ['البريد الإلكتروني',t.email        || p.email],
            ['المواد',           Array.isArray(t.subjects) ? t.subjects.join('، ') : (t.subject || '')]
        ];

        body.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-3);">
                💡 هذه البيانات تُدار من <a href="#/profile">الملف التعريفي</a>.
                أي تعديل هناك يظهر هنا تلقائياً.
            </p>

            <table class="info-table-compact">
                <tbody>
                    ${rows.map(([label, value]) => `
                        <tr>
                            <th>${label}</th>
                            <td>${value ? escapeHtml(String(value)) : '<span class="text-muted">—</span>'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <a href="#/profile" class="btn btn-secondary" style="margin-top: var(--space-4);">
                ✏️ تعديل من الملف التعريفي
            </a>
        `;
    }

    /* ---------- Mission & vision ---------- */

    function renderMission(body, ctx) {
        body.innerHTML = `
            <div class="flex gap-3" style="margin-bottom: var(--space-4); flex-wrap: wrap;">
                <button class="btn btn-secondary" id="btn-gen-mission">✨ توليد بالذكاء الاصطناعي</button>
                <span class="text-muted" style="font-size: var(--fs-sm); align-self: center;">
                    — أو اكتب يدوياً في الحقول أدناه.
                </span>
            </div>

            <div class="field">
                <label class="label">الرسالة الشخصية</label>
                <textarea class="textarea" id="mission" rows="4"
                          placeholder="رسالتي التربوية...">${escapeHtml(ctx.portfolio.mission || '')}</textarea>
            </div>
            <div class="field">
                <label class="label">الرؤية</label>
                <textarea class="textarea" id="vision" rows="4"
                          placeholder="رؤيتي المستقبلية...">${escapeHtml(ctx.portfolio.vision || '')}</textarea>
            </div>
            <div class="field">
                <label class="label">الأهداف المهنية</label>
                <textarea class="textarea" id="goals" rows="4"
                          placeholder="أهدافي للعام الدراسي...">${escapeHtml(ctx.portfolio.goals || '')}</textarea>
            </div>
            <button class="btn btn-primary" id="save-mission">💾 حفظ</button>
        `;

        body.querySelector('#save-mission').addEventListener('click', async () => {
            ctx.portfolio.mission = body.querySelector('#mission').value.trim();
            ctx.portfolio.vision  = body.querySelector('#vision').value.trim();
            ctx.portfolio.goals   = body.querySelector('#goals').value.trim();
            await savePortfolio(ctx.portfolio);
            global.TeacherApp.toast('تم الحفظ ✅', 'success');
        });

        body.querySelector('#btn-gen-mission').addEventListener('click', () => openMissionGenerator(body, ctx));
    }

    function openMissionGenerator(body, ctx) {
        const form = document.createElement('form');
        const p = ctx.portfolio.personal || {};
        const subjects = (ctx.teacher.subjects || [ctx.teacher.subject]).filter(Boolean).join('، ');
        form.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                أجب باختصار — سيُستخدم هذا لصياغة رسالة/رؤية شخصية تشبهك، وتقدر تعدّلها بعد التوليد.
            </p>
            <div class="field">
                <label class="label">قيم تؤمن بها كمعلم</label>
                <input class="input" id="g-values" type="text"
                       placeholder="مثال: الصدق، التعلم المستمر، احترام الطالب">
            </div>
            <div class="field">
                <label class="label">ما الذي تركّز عليه في تدريسك؟</label>
                <input class="input" id="g-focus" type="text"
                       placeholder="مثال: بناء شخصية الطالب، التفكير النقدي، ربط المادة بالواقع">
            </div>
            <div class="grid grid-2">
                <div class="field">
                    <label class="label">سنوات الخبرة</label>
                    <input class="input" id="g-years" type="text" value="${escapeAttr(p.experience_years || '')}">
                </div>
                <div class="field">
                    <label class="label">المراحل التي تدرّسها</label>
                    <input class="input" id="g-stage" type="text" placeholder="ابتدائي / متوسط / ثانوي">
                </div>
            </div>
            <div class="field">
                <label class="label">ملاحظات إضافية (اختياري)</label>
                <textarea class="textarea" id="g-notes" rows="2" placeholder="أي شيء تريد أن يظهر في رسالتك..."></textarea>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">✨ توليد</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true; btn.innerHTML = '⏳ جارٍ التوليد...';
            try {
                const out = await global.AI.generateMissionVision({
                    name:    ctx.teacher.name,
                    subject: subjects,
                    stage:   form.querySelector('#g-stage').value.trim(),
                    years:   form.querySelector('#g-years').value.trim(),
                    values:  form.querySelector('#g-values').value.trim(),
                    focus:   form.querySelector('#g-focus').value.trim(),
                    notes:   form.querySelector('#g-notes').value.trim()
                });
                // Populate fields in the outer form
                body.querySelector('#mission').value = out.mission || '';
                body.querySelector('#vision').value  = out.vision  || '';
                body.querySelector('#goals').value   = out.goals   || '';
                global.Modal.close();
                global.TeacherApp.toast('تم التوليد — راجع النتيجة ثم اضغط "حفظ".', 'success', 4000);
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
                btn.disabled = false; btn.innerHTML = '✨ توليد';
            }
        });

        global.Modal.open({ title: '✨ توليد الرسالة والرؤية', body: form });
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
