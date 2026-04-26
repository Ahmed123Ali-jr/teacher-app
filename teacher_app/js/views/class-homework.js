/* ==========================================================================
   views/class-homework.js — Homework tab: simple CRUD + due dates.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'short'
            }).format(new Date(iso + 'T00:00:00'));
        } catch { return iso; }
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    async function render(panel, cls) {
        const rows = (await global.TeacherDB.getAllByIndex('assignments', 'class_id', cls.id))
            .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''));

        const today = todayISO();

        panel.innerHTML = `
            <div class="section-header">
                <h3 class="section-title">📚 واجبات الفصل</h3>
                <button class="btn btn-primary" id="btn-new-hw">+ واجب جديد</button>
            </div>

            ${rows.length === 0 ? empty() : list(rows, today)}
        `;

        panel.querySelector('#btn-new-hw')?.addEventListener('click', () => openForm(cls, panel));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openForm(cls, panel));

        panel.querySelectorAll('[data-hw-edit]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = await global.TeacherDB.get('assignments', btn.dataset.hwEdit);
                if (row) openForm(cls, panel, row);
            });
        });

        panel.querySelectorAll('[data-hw-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!global.confirm('حذف هذا الواجب؟')) return;
                await global.TeacherDB.remove('assignments', btn.dataset.hwDelete);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    function empty() {
        return `
            <div class="empty-state">
                <div class="icon">📚</div>
                <h3>لا توجد واجبات</h3>
                <p>أضف واجباً مع تاريخ التسليم لمتابعته بسهولة.</p>
                <button class="btn btn-primary" data-empty-add>+ واجب جديد</button>
            </div>
        `;
    }

    function list(rows, today) {
        return `
            <div class="reminders-list">
                ${rows.map((r) => {
                    const overdue = r.due_date && r.due_date < today;
                    const dueToday = r.due_date === today;
                    return `
                        <article class="reminder-item ${overdue ? 'is-overdue' : ''}" style="--type-color: ${dueToday ? '#F59E0B' : '#8B5CF6'};">
                            <div class="reminder-icon">📚</div>
                            <div class="reminder-body">
                                <div class="reminder-title">${escapeHtml(r.title)}</div>
                                <div class="reminder-meta">
                                    <span>📅 ${formatDate(r.due_date)}</span>
                                    ${dueToday ? '<span class="badge badge-warning">اليوم</span>' : ''}
                                    ${overdue ? '<span class="badge badge-danger">متأخر</span>' : ''}
                                </div>
                                ${r.description ? `<div class="reminder-notes">${escapeHtml(r.description)}</div>` : ''}
                            </div>
                            <div class="reminder-actions">
                                <button class="btn btn-ghost btn-sm" data-hw-edit="${r.id}">✏️</button>
                                <button class="btn btn-ghost btn-sm" data-hw-delete="${r.id}">🗑️</button>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    }

    function openForm(cls, panel, existing) {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">عنوان الواجب *</label>
                <input class="input" id="hw-title" type="text" required
                       placeholder="حل تمارين الدرس الخامس"
                       value="${existing ? escapeAttr(existing.title) : ''}">
            </div>
            <div class="field">
                <label class="label">تاريخ التسليم *</label>
                <input class="input" id="hw-date" type="date" required
                       value="${existing ? existing.due_date : todayISO()}">
            </div>
            <div class="field">
                <label class="label">الوصف (اختياري)</label>
                <textarea class="textarea" id="hw-desc" rows="3"
                          placeholder="تفاصيل الواجب، صفحات الكتاب، التعليمات...">${existing ? escapeHtml(existing.description || '') : ''}</textarea>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ' : 'إضافة'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const row = {
                    class_id: cls.id,
                    title: form.querySelector('#hw-title').value.trim(),
                    due_date: form.querySelector('#hw-date').value,
                    description: form.querySelector('#hw-desc').value.trim(),
                    created_at: existing?.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                if (existing) row.id = existing.id;
                await global.TeacherDB.put('assignments', row);
                global.Modal.close();
                global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تمت الإضافة ✅', 'success');
                await render(panel, cls);
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            }
        });

        global.Modal.open({ title: existing ? 'تعديل الواجب' : 'إضافة واجب', body: form });
    }

    global.ClassHomeworkTab = { render };
})(window);
