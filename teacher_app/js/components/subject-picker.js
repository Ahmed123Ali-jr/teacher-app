/**
 * components/subject-picker.js — اختيارُ المواد: قائمةٌ منسدلة وصفُّ مختار.
 *
 * ── لماذا وُجد ──
 * كانت المواد عشرين مربّعاً مبعثرةً في شاشة التهيئة، وحقلَ نصٍّ بفواصل في
 * الملف التعريفي — أسلوبان لبيانٍ واحد، وكلاهما يُتعب. فصارت قائمةً
 * منسدلة تختار منها فتُضاف تحتها، و«أخرى» فيها تفتح حقل كتابة.
 *
 * ── لماذا تُضاف ولا تُستبدل ──
 * المعلّم قد يدرّس مادتين، والمواد المختارة تُرتَّب أوّلَ القائمة حين
 * يضيف فصلاً — فهي ليست زينة. فالقائمةُ تختار، والصفُّ تحتها يجمع.
 *
 * ── الاستعمال ──
 *   const picker = SubjectPicker.mount(el, {
 *       chosen: ['العلوم'],          // المختار الآن
 *       all: Subjects.ALL,           // ما يُعرض في المنسدلة
 *       onChange: (arr) => { … }     // يُنادى بعد كل إضافةٍ أو حذف
 *   });
 *   picker.value();                  // المختار الآن
 *
 * ويُعاد النداء على `mount` بعد أي إعادة رسمٍ للشاشة الحاضنة — يبني نفسه
 * من جديد ولا يترك مستمعاً معلّقاً، فعناصره كلُّها داخل العنصر الحاضن.
 */
(function (global) {
    'use strict';

    const OTHER = '__other__';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function mount(el, opts) {
        if (!el) return null;
        const state = {
            chosen: (opts.chosen || []).filter(Boolean).slice(),
            all:    (opts.all || []).slice(),
            other:  false
        };
        const onChange = opts.onChange || function () {};

        function paint() {
            /* المختارُ لا يُعرض في المنسدلة: عرضُ ما اخترتَه يوهم أنك تقدر
               أن تختاره مرّتين. */
            const rest = state.all.filter((s) => state.chosen.indexOf(s) < 0);

            el.innerHTML = `
                <div class="subp">
                    <select class="subp-select" data-subp-select
                            aria-label="اختر مادة">
                        <option value=""></option>
                        ${rest.map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('')}
                        <option value="${OTHER}">✎ أخرى — اكتبها بنفسك</option>
                    </select>

                    ${state.other ? `
                        <div class="subp-other">
                            <input type="text" class="subp-other-fld" maxlength="40"
                                   data-subp-other placeholder="اكتب اسم المادة">
                            <button type="button" class="subp-other-go" data-subp-add>أضف</button>
                        </div>` : ''}

                    ${state.chosen.length ? `
                        <div class="subp-chosen">
                            ${state.chosen.map((s) => `
                                <span class="subp-chip">
                                    ${escapeHtml(s)}
                                    <button type="button" class="subp-x" data-subp-del="${escapeAttr(s)}"
                                            aria-label="حذف ${escapeAttr(s)}">×</button>
                                </span>`).join('')}
                        </div>` : ''}
                </div>`;

            const sel = el.querySelector('[data-subp-select]');
            sel.addEventListener('change', () => {
                const v = sel.value;
                if (!v) return;
                if (v === OTHER) { state.other = true; paint(); focusOther(); return; }
                add(v);
            });

            el.querySelector('[data-subp-add]')?.addEventListener('click', addTyped);
            el.querySelector('[data-subp-other]')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTyped(); }
            });
            el.querySelectorAll('[data-subp-del]').forEach((b) => {
                b.addEventListener('click', () => remove(b.dataset.subpDel));
            });
        }

        function focusOther() {
            const f = el.querySelector('[data-subp-other]');
            if (f) f.focus();
        }

        function add(v) {
            v = String(v || '').trim();
            if (!v) return;
            if (state.chosen.indexOf(v) < 0) state.chosen.push(v);
            state.other = false;
            paint();
            onChange(value());
        }

        function addTyped() {
            const f = el.querySelector('[data-subp-other]');
            const v = (f ? f.value : '').trim();
            if (!v) {
                if (global.TeacherApp) global.TeacherApp.toast('اكتب اسم المادة.', 'warning', 2500);
                return;
            }
            /* ما يكتبه بيده يدخل القائمة أيضاً، فلا يُطالَب بكتابته مرّتين. */
            if (state.all.indexOf(v) < 0) state.all.push(v);
            add(v);
        }

        function remove(v) {
            const i = state.chosen.indexOf(v);
            if (i < 0) return;
            state.chosen.splice(i, 1);
            paint();
            onChange(value());
        }

        function value() { return state.chosen.slice(); }

        paint();
        return { value: value, add: add, remove: remove };
    }

    global.SubjectPicker = { mount };
})(window);
