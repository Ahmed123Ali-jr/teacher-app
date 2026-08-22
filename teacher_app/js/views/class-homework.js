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

    /* ميلاديٌّ صريحٌ لا `ar-SA` المجرّدة: تلك تتبع تقويم الجهاز فتُخرج
       هجريّاً على متصفّحٍ وميلاديّاً على آخر. والميلاديُّ هو الصواب هنا
       بخلاف تاريخ الورقة المطبوعة: المعلّم اختار الموعدَ من
       `input[type=date]` وهو ميلاديّ، فيُعرض كما اختاره لا مترجَماً. */
    function formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
                weekday: 'long', day: 'numeric', month: 'long'
            }).format(new Date(iso + 'T00:00:00'));
        } catch (e) { return iso; }
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

        /* الحالةُ الفارغة بنمط الكتب — انظر النظير في class-exams.js. */
        panel.classList.toggle('is-empty-tab', rows.length === 0);

        /* زرُّ الإضافة أسفلَ القائمة لا فوقها (بطلب المعلّم)، وكان قبلها في الحالة الفارغة وحدَها: فمن أضاف واحداً لم
           يجد سبيلاً إلى ثانٍ، والمعالِجُ أدناه ينتظر زرّاً لم يُرسم قطّ.
           (العطبُ نفسُه في الاختبارات وأوراق العمل والواجبات والتوزيع.) */
        panel.innerHTML = `
            ${rows.length === 0 ? empty() : `
                ${list(rows, today)}
                <div class="ws-addbar">
                    <button class="btn btn-primary" id="btn-new-hw">+ واجب جديد</button>
                </div>`}
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

    /* ونصُّ الزرِّ هو نصُّ شريط الإضافة نفسُه: زرٌّ واحدٌ لفعلٍ واحدٍ لا
       يُسمّى باسمين. */
    function empty() {
        return `
            <div class="start-note">
                <b>لا واجبات بعد</b>
                <span>حدّد مواعيد التسليم لتتابعها هنا</span>
            </div>
            <div class="start-gap"></div>
            <button type="button" class="start-cta" data-empty-add>+ واجب جديد</button>
        `;
    }


    /* أيقونتان مرسومتان لا رمزين تعبيريّين — النظيرُ في class-exams.js. */
    const SVG = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    const ICON_TRASH = SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* الشكلُ «ب» كالاختبارات وأوراق العمل — شرحُه في class-exams.js.
       والفعلُ الرئيسُ هنا «تعديل»: الواجبُ لا يُطبع ولا يُتصفَّح.

       و«اليوم» و«متأخر» تبقيان: بيانٌ عن الواقع لا شرحٌ للواجهة، وهي
       القاعدةُ التي يمشي عليها التطبيق. أمّا وصفُ الواجب فسقط من الصفّ —
       الشكلُ سطران، والوصفُ يُقرأ عند فتحه. */
    function list(rows, today) {
        return rows.map((r, i) => {
            const overdue  = r.due_date && r.due_date < today;
            const dueToday = r.due_date === today;
            return `
            <div class="st-card doc-row">
                <div class="stc-av num">${arDigits(i + 1)}</div>
                <div class="doc-tx" data-hw-edit="${r.id}">
                    <span class="doc-tt">${escapeHtml(r.title)}</span>
                    <span class="doc-ss">${formatDate(r.due_date)}
                        ${dueToday ? '<b class="doc-tag warn">اليوم</b>' : ''}
                        ${overdue  ? '<b class="doc-tag late">متأخر</b>' : ''}</span>
                </div>
                <div class="doc-acts">
                    <button type="button" class="doc-ib p" data-hw-edit="${r.id}">تعديل</button>
                    <button type="button" class="doc-ib" data-hw-delete="${r.id}"
                            title="حذف" aria-label="حذف">${ICON_TRASH}</button>
                </div>
            </div>`;
        }).join('');
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
