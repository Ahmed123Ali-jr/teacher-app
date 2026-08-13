/* ==========================================================================
   hints.js — تلميحٌ يُعرض مرّةً واحدة ثم لا يعود.

   المعلّم يفتح الشاشة أول مرة فلا يعرف أن «✎» تفتح التعديل، ولا أن بطاقة
   الفصل تُضغط. فيُبرَز الزرّ وحده بطبقةٍ معتمة وسهمٍ يشير إليه — الشكل
   الذي اختاره المستخدم بعد المعاينة.

   ── قاعدتان تحكمان التنفيذ ──
   • **القياس متزامن.** لا `requestAnimationFrame` ولا `IntersectionObserver`
     ولا `setTimeout` في مسار الظهور: عضّنا هذا ثلاث مرات في هذا المشروع —
     لا تُطلَق حين لا تُرسم الصفحة، فيبقى التلميح معلّقاً بلا موضع.
   • **الرؤية تُسجَّل قبل العرض لا بعده.** لو سُجّلت عند الإغلاق وأغلق
     المعلّم التطبيق قبله، عاد التلميح في كل فتحة.
   ========================================================================== */

(function (global) {
    'use strict';

    const KEY = (name) => 'hint_' + name;

    async function seen(name) {
        try { return !!(await global.TeacherDB.Settings.get(KEY(name))); }
        catch (e) { return true; }   /* قراءةٌ فاشلة تعني صمتاً لا إزعاجاً */
    }

    async function markSeen(name) {
        try { await global.TeacherDB.Settings.set(KEY(name), true); } catch (e) { /* لا شيء */ }
    }

    /** لنسيان تلميحٍ وإعادته — للتجربة، ومن الإعدادات لاحقاً إن أردنا. */
    async function forget(name) {
        try { await global.TeacherDB.Settings.unset(KEY(name)); } catch (e) { /* لا شيء */ }
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function place(target, hole, tip) {
        const t = target.getBoundingClientRect();
        const vw = global.innerWidth, vh = global.innerHeight;
        const pad = 6;

        hole.style.top    = (t.top - pad) + 'px';
        hole.style.left   = (t.left - pad) + 'px';
        hole.style.width  = (t.width + pad * 2) + 'px';
        hole.style.height = (t.height + pad * 2) + 'px';

        /* العرض أولاً ثم الموضع: الزرّ قد يكون في أقصى الحافّة، فإسنادُ
           الصندوق إليه وحده يسحقه إلى بضعة بكسلات. */
        const w = Math.min(272, vw - 28);
        tip.style.width = w + 'px';

        let right = vw - t.right - 14;
        right = clamp(right, 12, vw - w - 12);
        tip.style.right = right + 'px';

        /* أسفل الهدف، فإن ضاق ما تحته فُوقه — ويقلب السهم معه. */
        const h = tip.offsetHeight || 120;
        const below = t.bottom + 12;
        const up = below + h > vh - 12;
        tip.classList.toggle('up', up);
        tip.style.top = (up ? Math.max(12, t.top - h - 12) : below) + 'px';

        const boxRightX = vw - right;
        tip.style.setProperty('--hint-arrow',
            clamp(boxRightX - (t.right - t.width / 2) - 9, 14, w - 24) + 'px');
    }

    /**
     * يعرض التلميح مرّةً واحدة على عمرِ الحساب.
     * @param {string} name   مفتاحه في الإعدادات
     * @param {object} opts   { target|selector, title, text, cta }
     * @returns {Promise<boolean>} هل عُرض؟
     */
    async function showOnce(name, opts) {
        opts = opts || {};
        if (await seen(name)) return false;

        const target = opts.target
            || (opts.selector ? document.querySelector(opts.selector) : null);
        /* هدفٌ غائبٌ أو بلا مساحة: لا يُعرض ولا يُسجَّل — فيُعرض في زيارةٍ
           تاليةٍ يكون فيها الهدف موجوداً. */
        if (!target || !target.getBoundingClientRect().width) return false;

        /* تُسجَّل الآن: لو أغلق التطبيق قبل «فهمت» لا يعود التلميح. */
        await markSeen(name);

        const layer = document.createElement('div');
        layer.className = 'hint-layer';
        layer.innerHTML =
            '<div class="hint-hole"></div>' +
            '<div class="hint-tip">' +
                '<b></b><span></span>' +
                '<button type="button" class="hint-go"></button>' +
            '</div>';
        const hole = layer.querySelector('.hint-hole');
        const tip  = layer.querySelector('.hint-tip');
        tip.querySelector('b').textContent = opts.title || '';
        tip.querySelector('span').textContent = opts.text || '';
        tip.querySelector('.hint-go').textContent = opts.cta || 'فهمت';

        document.body.appendChild(layer);
        place(target, hole, tip);   /* متزامن: العنصر موجودٌ فور إلحاقه */

        function close() {
            global.removeEventListener('resize', onResize);
            global.removeEventListener('scroll', onResize, true);
            layer.remove();
        }
        function onResize() {
            if (!document.body.contains(target)) return close();
            place(target, hole, tip);
        }
        layer.addEventListener('click', close);
        global.addEventListener('resize', onResize);
        /* التمرير يزيح الهدف والطبقة ثابتة — فيُعاد الحساب أو يُغلق. */
        global.addEventListener('scroll', onResize, true);
        return true;
    }

    global.Hints = { showOnce, seen, forget };
})(window);
