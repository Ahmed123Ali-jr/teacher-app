/* ==========================================================================
   components/dept-picker.js — منتقي إدارة التعليم.

   ضغطة واحدة بلا كتابة حرف: الإدارات العامة ستّ عشرة، فقائمة واحدة أوضح من
   خطوتين. مشترك بين شاشة التهيئة وبيانات المدرسة.
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

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        body.innerHTML = `
            <p class="dp-hint">اختر إدارتك — تُملأ المنطقة تلقائياً.</p>
            <div class="dp-list">
                ${E.all().map((d) => `
                    <button type="button" class="dp-item ${bare === d.name ? 'on' : ''}"
                            data-dept="${esc(d.name)}">
                        <span class="n">${esc(E.fullName(d.name))}</span>
                        <span class="rg">${d.region === d.name ? '' : esc(d.region)}</span>
                        <span class="mk">${bare === d.name ? '✓' : ''}</span>
                    </button>
                `).join('')}
            </div>
        `;

        body.addEventListener('click', (e) => {
            const d = e.target.closest('[data-dept]');
            if (!d) return;
            global.Modal.close();
            if (onPick) onPick(E.fullName(d.dataset.dept));
        });

        /* يُفتح المنتقي على اختياره السابق لا على أوّل القائمة. */
        global.Modal.open({ title: '🏛️ إدارة التعليم', body });
        const on = body.querySelector('.dp-item.on');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'center' });
    }

    global.DeptPicker = { open };
})(window);
