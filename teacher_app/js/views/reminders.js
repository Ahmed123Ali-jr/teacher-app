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
                            <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
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
                ?.addEventListener('click', () => openForm());

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
                  ?.addEventListener('click', () => openForm(row));

                el.querySelector('[data-action="delete"]')
                  ?.addEventListener('click', async () => {
                      if (!global.confirm('حذف هذا التذكير؟')) return;
                      await global.TeacherDB.remove('reminders', id);
                      global.TeacherApp.toast('تم حذف التذكير.', 'info');
                      paint();
                  });
            });
        }

        async function openForm(existing) {
            const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);

            const form = document.createElement('form');
            form.innerHTML = `
                <div class="field">
                    <label class="label" for="r-title">العنوان *</label>
                    <input class="input" id="r-title" type="text" required maxlength="120"
                           placeholder="اختبار الوحدة الأولى" value="${existing ? escapeAttr(existing.title) : ''}">
                </div>

                <div class="grid grid-2">
                    <div class="field">
                        <label class="label" for="r-date">التاريخ *</label>
                        <input class="input" id="r-date" type="date" required
                               value="${existing ? existing.date : todayISO()}">
                    </div>
                    <div class="field">
                        <label class="label" for="r-type">النوع *</label>
                        <select class="select" id="r-type" required>
                            ${Object.entries(TYPE_META).map(([k, v]) => `
                                <option value="${k}" ${existing && existing.type === k ? 'selected' : ''}>
                                    ${v.icon} ${v.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <div class="field">
                    <label class="label" for="r-class">الفصل (اختياري)</label>
                    <select class="select" id="r-class">
                        <option value="">— بدون تحديد —</option>
                        ${classes.map((c) => `
                            <option value="${c.id}" ${existing && existing.class_id === c.id ? 'selected' : ''}>
                                ${c.grade} / ${c.section} — ${c.subject}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="field">
                    <label class="label" for="r-notes">ملاحظات (اختياري)</label>
                    <textarea class="textarea" id="r-notes" rows="3"
                              placeholder="أي تفاصيل إضافية...">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button type="submit" class="btn btn-primary">${existing ? 'حفظ التعديل' : 'إضافة'}</button>
                    <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = form.querySelector('button[type="submit"]');
                btn.disabled = true;
                try {
                    const classIdRaw = form.querySelector('#r-class').value;
                    const row = {
                        teacher_id: teacher.id,
                        title:      form.querySelector('#r-title').value.trim(),
                        date:       form.querySelector('#r-date').value,
                        type:       form.querySelector('#r-type').value,
                        class_id:   classIdRaw || null,
                        notes:      form.querySelector('#r-notes').value.trim(),
                        done:       existing ? !!existing.done : false,
                        created_at: existing ? existing.created_at : new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    if (existing) row.id = existing.id;

                    await global.TeacherDB.put('reminders', row);
                    global.Modal.close();
                    global.TeacherApp.toast(existing ? 'تم حفظ التعديل.' : 'تمت إضافة التذكير ✅', 'success');
                    paint();
                } catch (err) {
                    global.TeacherApp.toast('فشل الحفظ: ' + err.message, 'error');
                } finally {
                    btn.disabled = false;
                }
            });

            global.Modal.open({
                title: existing ? 'تعديل التذكير' : 'إضافة تذكير جديد',
                body: form
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

    global.RemindersView = { render, todayCount };
})(window);
