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

    /* مذكّرةٌ لهذه الجلسة: الكتابة في الإعدادات رحلةُ شبكة، ولو انتُظرت
       لظهر التلميح مرّتين لمن دخل الشاشة وخرج ورجع بسرعة. */
    const shownNow = new Set();


    async function seen(name) {
        try { return !!(await global.TeacherDB.Settings.get(KEY(name))); }
        catch (e) { return true; }   /* قراءةٌ فاشلة تعني صمتاً لا إزعاجاً */
    }

    async function markSeen(name) {
        try { await global.TeacherDB.Settings.set(KEY(name), true); } catch (e) { /* لا شيء */ }
    }

    /** لنسيان تلميحٍ وإعادته — للتجربة، ومن الإعدادات لاحقاً إن أردنا.
     *  ويُمحى من مذكّرة الجلسة أيضاً، وإلّا لم يعد إلا بعد إغلاق التطبيق. */
    async function forget(name) {
        shownNow.delete(name);
        try { await global.TeacherDB.Settings.unset(KEY(name)); } catch (e) { /* لا شيء */ }
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    /** موجودٌ في الصفحة، وظاهرٌ، وله مساحة. */
    function visible(el) {
        if (!el || !el.isConnected) return false;
        if (el.offsetParent === null) return false;      /* display:none أو شاشةٌ مطويّة */
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

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
        if (shownNow.has(name)) return false;

        /* المسار يُثبَّت قبل الانتظار لا بعده: القراءة رحلةُ شبكة، ومن
           غادر خلالها كان تلميحُ الشاشة السابقة يُرسم على شاشته الجديدة —
           والمستمع الذي يُغلقه لم يكن قد وُلد بعد. */
        const bornAt = global.location.hash;
        if (await seen(name)) return false;
        if (global.location.hash !== bornAt) return false;

        /* ── لا انتظارَ بعد هذا السطر ──
           كان بين فحص الهدف ورسم الطبقة انتظارُ كتابةٍ في الإعدادات. ومن
           انتقل بين الشاشتين بسرعة تغيّرت شاشته خلاله، فرُسمت الطبقة
           مسنودةً إلى زرٍّ غادَره. فصار الفحص والرسم متلاصقَين، والكتابة
           تمضي في الخلفية. */
        const target = opts.target
            || (opts.selector ? document.querySelector(opts.selector) : null);
        /* هدفٌ غائبٌ أو مخفيٌّ أو بلا مساحة: لا يُعرض ولا يُسجَّل — فيُعرض
           في زيارةٍ تاليةٍ يكون فيها الهدف موجوداً. */
        if (!visible(target)) return false;

        /* مذكّرةُ الجلسة تمنع التكرار بلا انتظار رحلة شبكة. */
        shownNow.add(name);
        /* والكتابة قبل «فهمت» لا بعدها: لو أُغلق التطبيق قبلها عاد التلميح
           في كل فتحة. */
        markSeen(name).catch(() => {});

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

        /* الطبقة معلّقةٌ بـ`body` لا بالشاشة، فلا تزول بتغيّر الشاشة وحده.
           فتُراقَب: إن غادر المعلّم أو اختفى الهدف أُغلقت. */
        let ro = null;

        function close() {
            global.removeEventListener('resize', reposition);
            global.removeEventListener('scroll', reposition, true);
            global.removeEventListener('hashchange', close);
            if (ro) { try { ro.disconnect(); } catch (e) { /* لا شيء */ } }
            layer.remove();
        }
        function reposition() {
            if (global.location.hash !== bornAt || !visible(target)) return close();
            place(target, hole, tip);
        }
        layer.addEventListener('click', close);
        global.addEventListener('hashchange', close);
        global.addEventListener('resize', reposition);
        /* التمرير يزيح الهدف والطبقة ثابتة — فيُعاد الحساب أو يُغلق. */
        global.addEventListener('scroll', reposition, true);
        /* وما يُركَّب بعد الرسم (بطاقةٌ تحمَّل، خطٌّ يصل) يزيح الهدف بلا
           تمريرٍ ولا تغيير حجم — فيُتابَع تخطيط الصفحة نفسه. */
        if (global.ResizeObserver) {
            ro = new global.ResizeObserver(reposition);
            try { ro.observe(document.body); } catch (e) { ro = null; }
        }
        return true;
    }

    global.Hints = { showOnce, seen, forget };
})(window);
