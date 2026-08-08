/* ==========================================================================
   components/dept-picker.js — منتقي إدارة التعليم: منطقة ← إدارة.

   ضغطتان بلا كتابة حرف واحد، فيبقى اسم الإدارة موحّداً في كل المطبوعات ولا
   يختلف إملاؤه بين معلّم وآخر. مشترك بين شاشة التهيئة وبيانات المدرسة.
   ========================================================================== */

(function (global) {
    'use strict';

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    /**
     * @param {string}   current  الاسم الكامل المحفوظ إن وُجد
     * @param {Function} onPick   تُستدعى بالاسم الكامل: «إدارة تعليم عسير»
     */
    function open(current, onPick) {
        const E = global.EduDepts;
        const bare = E.bareName(current);
        /* نفتح على منطقة اختياره السابق مباشرةً بدل أن يبحث عنها من جديد. */
        let region = E.regionOf(current) || null;

        const body = document.createElement('div');
        body.className = 'sch-sheet dept-sheet';
        paint();

        function paint() {
            body.innerHTML = `
                <div class="sch-lbl">المنطقة</div>
                <div class="dp-regions">
                    ${E.regions().map((r) => `
                        <button type="button" class="dp-region ${region === r ? 'on' : ''}"
                                data-region="${esc(r)}">${esc(r)}</button>
                    `).join('')}
                </div>

                ${region ? `
                    <div class="sch-lbl" style="margin-top:15px">إدارة التعليم</div>
                    <div class="dp-list">
                        ${E.of(region).map((d) => `
                            <button type="button" class="dp-item ${bare === d ? 'on' : ''}"
                                    data-dept="${esc(d)}">
                                <span class="n">${esc(E.fullName(d))}</span>
                                <span class="mk">${bare === d ? '✓' : ''}</span>
                            </button>
                        `).join('')}
                    </div>
                ` : `<p class="dp-hint">اختر منطقتك أولاً لتظهر إداراتها.</p>`}
            `;
        }

        body.addEventListener('click', (e) => {
            const r = e.target.closest('[data-region]');
            if (r) { region = r.dataset.region; return paint(); }

            const d = e.target.closest('[data-dept]');
            if (!d) return;
            global.Modal.close();
            if (onPick) onPick(E.fullName(d.dataset.dept));
        });

        global.Modal.open({ title: '🏛️ إدارة التعليم', body });
    }

    global.DeptPicker = { open };
})(window);
