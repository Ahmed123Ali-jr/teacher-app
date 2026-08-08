/* ==========================================================================
   views/reminders.js — Manual reminders for the teacher.
   List by date, filter (upcoming/all/done), add/edit/delete, mark as done.
   ========================================================================== */

(function (global) {
    'use strict';

    const TYPE_META = {
        exam:     { label: 'اختبار',     icon: '📝', color: '#EF4444' },
        homework: { label: 'واجب',       icon: '📚', color: '#F59E0B' },
        meeting:  { label: 'اجتماع',     icon: '👥', color: '#8B5CF6' },
        activity: { label: 'نشاط',       icon: '🎯', color: '#0EA5E9' },
        other:    { label: 'أخرى',       icon: '🔔', color: '#64748B' }
    };

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso + 'T00:00:00');
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(d);
        } catch { return iso; }
    }

    function daysUntil(iso) {
        const today = new Date(todayISO() + 'T00:00:00');
        const target = new Date(iso + 'T00:00:00');
        return Math.round((target - today) / (1000 * 60 * 60 * 24));
    }

    function relativeLabel(iso) {
        const n = daysUntil(iso);
        if (n === 0)  return 'اليوم';
        if (n === 1)  return 'غداً';
        if (n === -1) return 'أمس';
        if (n > 1  && n <= 7)  return `بعد ${n} أيام`;
        if (n < -1 && n >= -7) return `قبل ${Math.abs(n)} أيام`;
        return formatDate(iso);
    }

    async function loadAll(teacher) {
        const rows = await global.TeacherDB.getAllByIndex('reminders', 'teacher_id', teacher.id);
        return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }

    /** Today's active reminder count (exposed for dashboard badge). */
    async function todayCount(teacher) {
        const all = await global.TeacherDB.getAllByIndex('reminders', 'teacher_id', teacher.id);
        const t = todayISO();
        return all.filter((r) => r.date === t && !r.done).length;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        let filter = 'upcoming'; // 'upcoming' | 'all' | 'done'

        async function paint() {
            const all = await loadAll(teacher);
            const today = todayISO();

            let items = all;
            if (filter === 'upcoming') items = all.filter((r) => !r.done && (r.date >= today));
            if (filter === 'done')     items = all.filter((r) => r.done);

            const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
            const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

            container.innerHTML = `
                <div class="container">
                    <div class="section-header" style="margin-top: var(--space-6);">
                        <div>
                            <a href="#/dashboard" class="btn-back-box" aria-label="الرجوع إلى الرئيسية"></a>
                            <h2 class="section-title" style="display:inline-block; margin-right: var(--space-3);">
                                🔔 تذكيراتي
                            </h2>
                        </div>
                        <button class="btn btn-primary" id="btn-add-reminder">+ إضافة تذكير</button>
                    </div>

                    <div class="filter-bar">
                        <button class="chip ${filter === 'upcoming' ? 'active' : ''}" data-filter="upcoming">
                            القادمة (${all.filter((r) => !r.done && r.date >= today).length})
                        </button>
                        <button class="chip ${filter === 'all' ? 'active' : ''}" data-filter="all">
                            الكل (${all.length})
                        </button>
                        <button class="chip ${filter === 'done' ? 'active' : ''}" data-filter="done">
                            المنجزة (${all.filter((r) => r.done).length})
                        </button>
                    </div>

                    <div class="reminders-list">
                        ${items.length === 0 ? emptyHtml() : items.map((r) => itemHtml(r, classById)).join('')}
                    </div>
                </div>
            `;

            bind(all, classById);
        }

        function emptyHtml() {
            const msgMap = {
                upcoming: 'لا توجد تذكيرات قادمة. اضغط "+ إضافة تذكير" لتسجّل اختباراً أو واجباً أو أي شيء لا تريد نسيانه.',
                all:      'لم تُضف أي تذكيرات بعد.',
                done:     'لم تُنجز أي تذكيرات حتى الآن.'
            };
            return `
                <div class="empty-state">
                    <div class="icon">🔔</div>
                    <h3>لا يوجد شيء هنا</h3>
                    <p>${msgMap[filter]}</p>
                </div>
            `;
        }

        function itemHtml(r, classById) {
            const meta = TYPE_META[r.type] || TYPE_META.other;
            const cls  = r.class_id ? classById[r.class_id] : null;
            const classLabel = cls ? `${cls.grade} / ${cls.section}` : '';
            const overdue = !r.done && r.date < todayISO();

            return `
                <article class="reminder-item ${r.done ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}"
                         data-id="${r.id}" style="--type-color: ${meta.color};">
                    <label class="reminder-check">
                        <input type="checkbox" data-action="toggle" ${r.done ? 'checked' : ''}>
                    </label>
                    <div class="reminder-icon">${meta.icon}</div>
                    <div class="reminder-body">
                        <div class="reminder-title">${escapeHtml(r.title)}</div>
                        <div class="reminder-meta">
                            <span class="badge badge-muted">${meta.label}</span>
                            <span>📅 ${relativeLabel(r.date)}</span>
                            ${classLabel ? `<span>📚 ${escapeHtml(classLabel)}</span>` : ''}
                            ${overdue ? `<span class="badge badge-danger">متأخر</span>` : ''}
                        </div>
                        ${r.notes ? `<div class="reminder-notes">${escapeHtml(r.notes)}</div>` : ''}
                    </div>
                    <div class="reminder-actions">
                        <button class="btn btn-ghost btn-sm" data-action="edit">✏️</button>
                        <button class="btn btn-ghost btn-sm" data-action="delete">🗑️</button>
                    </div>
                </article>
            `;
        }

        function bind(all, classById) {
            container.querySelector('#btn-add-reminder')
                ?.addEventListener('click', () => openSheet(teacher, null, paint));

            container.querySelectorAll('[data-filter]').forEach((el) => {
                el.addEventListener('click', () => { filter = el.dataset.filter; paint(); });
            });

            container.querySelectorAll('.reminder-item').forEach((el) => {
                const id = el.dataset.id;
                const row = all.find((r) => r.id === id);

                el.querySelector('[data-action="toggle"]')
                  ?.addEventListener('change', async (e) => {
                      row.done = e.target.checked;
                      await global.TeacherDB.put('reminders', row);
                      paint();
                  });

                el.querySelector('[data-action="edit"]')
                  ?.addEventListener('click', () => openSheet(teacher, row, paint));

                el.querySelector('[data-action="delete"]')
                  ?.addEventListener('click', async () => {
                      if (!global.confirm('حذف هذا التذكير؟')) return;
                      await global.TeacherDB.remove('reminders', id);
                      global.TeacherApp.toast('تم حذف التذكير.', 'info');
                      paint();
                  });
            });
        }

        function escapeHtml(s) {
            return String(s || '').replace(/[&<>"']/g, (m) => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[m]));
        }
        function escapeAttr(s) { return escapeHtml(s); }

        paint();
    }

    /* ==========================================================================
       لوحة التذكير باللمس — نفس أسلوب لوحة إضافة الفصل: أزرار لا قوائم
       منسدلة. العنوان وحده حقل كتابة لأنه لا يمكن اختياره من قائمة.
       تُستدعى من الرئيسية ومن شاشة «تذكيراتي» معاً فلا يبقى نموذجان.
       ========================================================================== */

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function isoPlus(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    async function openSheet(teacher, existing, onSaved) {
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const QUICK = [
            { d: isoPlus(0), label: 'اليوم' },
            { d: isoPlus(1), label: 'غداً' },
            { d: isoPlus(2), label: 'بعد غد' }
        ];

        const pick = {
            title:    existing ? existing.title : '',
            date:     existing ? existing.date : isoPlus(0),
            type:     existing ? existing.type : 'other',
            class_id: existing ? (existing.class_id || '') : ''
        };
        /* تاريخ خارج الأزرار السريعة يفتح منتقي التاريخ مباشرةً. */
        let customDate = !QUICK.some((q) => q.d === pick.date);
        let saving = false;

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        paint();

        function paint() {
            body.innerHTML = `
                <div class="sch-lbl">التذكير</div>
                <input type="text" class="input" id="rm-title" maxlength="120"
                       placeholder="اختبار الوحدة الأولى" value="${esc(pick.title)}">

                <div class="sch-lbl" style="margin-top:15px">متى؟</div>
                <div class="sch-chips">
                    ${QUICK.map((q) => `
                        <button type="button" class="sch-chip ${!customDate && pick.date === q.d ? 'on' : ''}"
                                data-quick="${q.d}">${q.label}</button>
                    `).join('')}
                    <button type="button" class="sch-chip ${customDate ? 'on' : ''}" data-date-other>✎ تاريخ آخر</button>
                </div>
                ${customDate ? `
                    <input type="date" class="input" id="rm-date" value="${esc(pick.date)}"
                           style="margin-bottom:13px">` : ''}

                <div class="sch-lbl">النوع</div>
                <div class="sch-chips">
                    ${Object.entries(TYPE_META).map(([k, v]) => `
                        <button type="button" class="sch-chip ${pick.type === k ? 'on' : ''}"
                                data-type="${k}">${v.icon} ${v.label}</button>
                    `).join('')}
                </div>

                <div class="sch-lbl">الفصل</div>
                <div class="sch-chips">
                    <button type="button" class="sch-chip ${!pick.class_id ? 'on' : ''}" data-cls="">عام</button>
                    ${classes.map((c) => `
                        <button type="button" class="sch-chip ${pick.class_id === c.id ? 'on' : ''}"
                                data-cls="${esc(c.id)}">${esc(shortGrade(c.grade))}/${esc(c.section)}</button>
                    `).join('')}
                </div>

                <button type="button" class="fsave" id="rm-save">
                    ${existing ? '💾 حفظ التعديل' : '💾 حفظ التذكير'}
                </button>
            `;
            body.querySelector('#rm-title').addEventListener('input', (e) => { pick.title = e.target.value; });
            body.querySelector('#rm-date')?.addEventListener('input', (e) => {
                if (e.target.value) pick.date = e.target.value;
            });
            if (customDate) body.querySelector('#rm-date')?.focus();
        }

        body.addEventListener('click', async (e) => {
            const q = e.target.closest('[data-quick]');
            if (q) { pick.date = q.dataset.quick; customDate = false; return paint(); }

            if (e.target.closest('[data-date-other]')) { customDate = true; return paint(); }

            const ty = e.target.closest('[data-type]');
            if (ty) { pick.type = ty.dataset.type; return paint(); }

            const cl = e.target.closest('[data-cls]');
            if (cl) { pick.class_id = cl.dataset.cls; return paint(); }

            if (!e.target.closest('#rm-save') || saving) return;

            const title = String(pick.title || '').trim();
            if (!title) return global.TeacherApp.toast('اكتب التذكير أولاً.', 'warning', 3000);
            if (!pick.date) return global.TeacherApp.toast('اختر التاريخ.', 'warning', 3000);

            saving = true;
            const row = {
                teacher_id: teacher.id,
                title,
                date:       pick.date,
                type:       pick.type,
                class_id:   pick.class_id || null,
                notes:      existing ? (existing.notes || '') : '',
                done:       existing ? !!existing.done : false,
                created_at: existing ? existing.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (existing) row.id = existing.id;

            /* اللوحة تُغلق قبل الكتابة — الكتابة رحلة شبكة تقارب ربع ثانية. */
            global.Modal.close();
            global.TeacherApp.toast(existing ? 'تم حفظ التعديل ✅' : 'تمت إضافة التذكير ✅', 'success', 1200);
            try {
                await global.TeacherDB.put('reminders', row);
            } catch (err) {
                saving = false;
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }
            if (onSaved) await onSaved();
        });

        global.Modal.open({ title: existing ? '🔔 تعديل التذكير' : '🔔 تذكير جديد', body });
    }

    function shortGrade(grade) {
        return String(grade || '').replace(/^\s*الصف\s+/, '').split(/\s+/)[0];
    }

    global.RemindersView = { render, todayCount, openSheet };
})(window);
