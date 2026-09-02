/* ==========================================================================
   theme-color.js — لونُ التطبيق يختاره المعلّم، ويُطبَّق على الشاشات كلِّها
   ==========================================================================
   طلبُ المستخدم (٢ سبتمبر ٢٠٢٦): «اعتمد لوناً أساسيّاً للتطبيق، والمعلّم
   بعدين يقدر يعدّل اللونَ اللي يبيه على راحته» — من الإعدادات، ويُطبَّق كاملاً.

   ── لماذا هذا الملفُّ موجود ──
   لونُ الهُويّة ليس رمزاً واحداً. ستّةٌ منه مكتوبةٌ صريحاً في
   `portfolio-theme.css` لا تُشتقّ من أصلها (`--pf-royal-light` و`--primary-mid`
   و`--primary-lift` و`--primary-deep` و`--ink-fixed` و`--on-gold`)، والوضعُ
   الداكن يعيد تعريفَ سبعةٍ منها. فتبديلُ رمزٍ واحدٍ يترك التدرّجاتِ
   والحبّاتِ والحدودَ على اللون القديم — أي تطبيقاً بلونين. فهنا يُشتقّ
   السُّلَّمُ كلُّه من لونٍ واحدٍ ويُحقن معاً.

   ── وأين يُحقن: على `body` لا على `html` ──
   `theme-dark.css` و`theme-white.css` و`theme-calm.css` كلُّها تعرّف رموزَها
   على `body` (بصنفٍ)، والرمزُ المعرَّفُ على `body` يغلب الموروثَ من `html`
   لكلّ ما بداخله. فالكتابةُ على `documentElement` تعمل في الفاتح وتصمت في
   الداكن. والنمطُ السطريُّ على `body` يغلب قاعدةَ الصنف، فيصل المظهرين.

   ── و`--ink-primary` يُحقن صريحاً ──
   `main.css:53` يقول `--ink-primary: var(--primary)` على `:root`، والتعويضُ
   يقع عند عنصر التصريح لا عند الاستعمال. فحقنُ `--primary` على `body` لا
   يحرّكه البتّة. (وفي الوضع الداكن حبرٌ أبيضُ مكسورٌ لا يتبع اللون.)

   ── وحدُّ الاختيار: كلُّ لونٍ لا يقلّ قراءةً عن المنشور ──
   في التطبيق ‎٨٠‎ إعلانَ حبرٍ أبيضَ أو ذهبيٍّ مكتوباً صريحاً فوق أسطحٍ تقرأ
   `--primary`. فلو أُطلق الاختيارُ إلى الفاتح لاختفى الحبرُ في عشرات
   المواضع. والقيدُ هنا مقيسٌ لا مقدَّر: **أفتحُ درجةٍ يمرّ عليها حبرٌ أبيض
   (`--primary-light`) لا ينزل تباينُها عن ‎٧:١‎** — وهي درجةُ البترولي
   المنشور نفسُها (‎7.16‎). فما يختاره المعلّمُ لا يقلّ قراءةً عمّا يراه اليوم.

   ── والسُّلَّمُ نفسُه مقيسٌ من البترولي ──
   قِيست الدرجاتُ الخمسُ في HSL فخرجت إزاحاتٌ ثابتة: الفاتحُ ‎+٩‎ إضاءةً
   و‎−٧‎ إشباعاً، والوسطُ ‎+٥٫٥‎/‎−٥‎، والرفعةُ ‎+٤٫٥‎/‎−٦‎، والغَورُ ‎−٦٫٧‎/‎+٤‎.
   فالمولَّدُ من البترولي يعيد البتروليَّ نفسَه تقريباً — ومع ذلك **يُلغى
   الحقنُ كلُّه عند الافتراضيّ** فتحكم قيمُ CSS الأصليّةُ حرفاً بحرف.
   ========================================================================== */

(function (global) {
    'use strict';

    /** لونُ التطبيق المنشور — `--pf-royal` في `portfolio-theme.css:19`. */
    const DEFAULT = '#0A3F4A';

    /** مرآةُ اللون في الجهاز — تُقرأ قبل أوّل رسم. موسومةٌ بالمعلّم لأنّ
     *  جهازاً واحداً قد يمرّ عليه حسابان. (النمطُ نفسُه في `guest-notice.js`
     *  و`phone-prompt.js` و`save-account.js`.) */
    const MIRROR = 'teacher_app_color';

    /** مفتاحُ التفضيل في القاعدة. */
    const PREF = 'app_color';

    /* الرموزُ التي يكتبها الحقن. تُحفظ هنا ليُزيلها التصفيرُ كلَّها. */
    const VARS = ['--pf-royal', '--pf-royal-light', '--primary', '--primary-light',
                  '--primary-dark', '--primary-mid', '--primary-lift', '--primary-deep',
                  '--ink-primary', '--ink-fixed', '--on-gold'];

    /* ══════════════════════════════════════════════════════════════════
       حسابُ الألوان
       ══════════════════════════════════════════════════════════════════ */

    function clamp(n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); }

    function hslToHex(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = clamp(s, 0, 100) / 100;
        l = clamp(l, 0, 100) / 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return '#' + [f(0), f(8), f(4)]
            .map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255,
              g = parseInt(hex.slice(3, 5), 16) / 255,
              b = parseInt(hex.slice(5, 7), 16) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l * 100];
        const d = mx - mn;
        const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        const h = mx === r ? (g - b) / d + (g < b ? 6 : 0)
                : mx === g ? (b - r) / d + 2
                           : (r - g) / d + 4;
        return [h * 60, s * 100, l * 100];
    }

    /** سطوعٌ نسبيٌّ بمعادلة WCAG. */
    function lum(hex) {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    /** نسبةُ التباين بين لونين. */
    function ratio(a, b) {
        const la = lum(a), lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    /* إزاحاتُ السُّلَّم — مقيسةٌ من درجات البترولي المنشورة. */
    const STEPS = {
        light: [+9.2, -6.7],
        mid:   [+5.5, -4.8],
        lift:  [+4.5, -6.1],
        deep:  [-6.7, +3.8]
    };
    function step(h, s, l, name) {
        const d = STEPS[name];
        return hslToHex(h, clamp(s + d[1], 0, 100), clamp(l + d[0], 0, 100));
    }

    /**
     * الحدُّ الأعلى للإضاءة عند صبغةٍ وإشباع — قيدان لا قيدٌ واحد:
     * ١) الأبيضُ فوق الدرجة الفاتحة عند ‎٧:١‎ (درجةُ البترولي نفسُها).
     * ٢) **والذهبيُّ ‎#C9A961‎ فوق اللون نفسِه عند ‎٤٫٥:١‎** — الذهبيُّ حبرٌ
     *    على أسطح الهُويّة في سبعة مواضع ولا يتبع اللونَ المختار، فحراسةُ
     *    الأبيض وحدَه تُسقطه (قِيس: ينزل إلى ‎٤٫٣‎ وكان ‎٥٫١٢‎ بالبترولي).
     * والخطوةُ صحيحةٌ لا نصفيّة: المُخرَجُ يُستعمل حدّاً للمنزلق ولطرف
     * السُّلَّم، وتدويرُ نصفٍ كان يتجاوز الحدَّ المقيس.
     */
    function maxLightness(h, s) {
        let best = 4;
        for (let l = 4; l <= 60; l += 1) {
            const ok = ratio('#FFFFFF', step(h, s, l, 'light')) >= 7
                    && ratio('#C9A961', hslToHex(h, s, l)) >= 4.5;
            if (ok) best = l; else break;
        }
        return best;
    }

    /** الحدُّ الأدنى: لا ينزل اللونُ حتّى يذوب في أرضيّة الوضع الداكن
     *  (‎#0D1117‎). البتروليُّ المنشور عندها ‎1.64:1‎ — وهو المرجع. */
    const MIN_L = 10;

    /** يُغمَّق اللونُ حتى يبلغ التباينَ المطلوبَ على أرضيّةٍ ثابتة. */
    function darkenUntil(h, s, l, bed, need) {
        let x = l;
        let hex = hslToHex(h, s, x);
        while (x > 2 && ratio(hex, bed) < need) { x -= 1; hex = hslToHex(h, s, x); }
        return hex;
    }

    /**
     * السُّلَّمُ كلُّه من لونٍ واحد.
     * @param {string} hex  اللونُ الأساسيّ (‎#RRGGBB‎).
     * @returns {object}    خريطةُ رمزٍ ← قيمة.
     */
    function scale(hex, dark) {
        const p = hexToHsl(hex);
        const h = p[0], s = p[1], l = p[2];
        /* الوضعُ الداكن يرفع الدرجةَ الفاتحة أكثرَ بكثير: ‎#0A3F4A‎ ← ‎#1C8DA6‎
           أي ‎+٢١٫٥‎ إضاءةً لا ‎+٩٫٢‎ — لأنّها هناك حلقةُ تركيزٍ وحدٌّ على
           أرضيّةٍ سوداء لا سطحٌ يُملأ. وحقنُ درجة الفاتح فوقها كان يُسقط
           التباينَ من ‎4.88‎ إلى نحو ‎2.4‎ على ‎#0D1117‎ (قِيس). */
        const light = dark
            ? hslToHex(h, clamp(s - 5, 0, 100), clamp(l + 21.5, 0, 100))
            : step(h, s, l, 'light');
        return {
            '--pf-royal':       hex,
            '--pf-royal-light': light,
            '--primary':        hex,
            '--primary-light':  light,
            '--primary-dark':   hex,
            '--primary-mid':    step(h, s, l, 'mid'),
            '--primary-lift':   step(h, s, l, 'lift'),
            '--primary-deep':   step(h, s, l, 'deep'),
            /* حبرٌ على أبيض — يُغمَّق إن لزم (حارسٌ لا أثرَ له داخل المدى). */
            '--ink-primary':    darkenUntil(h, s, l, '#FFFFFF', 4.5),
            /* حبرٌ على البيج الثابت ‎#ECEAE3‎ — أفتحُ أرضيّتيه. */
            '--ink-fixed':      darkenUntil(h, s, l, '#ECEAE3', 4.5),
            /* حبرٌ على الذهبيّ ‎#C9A961‎ — والذهبيُّ ثابتٌ لا يتبع اللون. */
            '--on-gold':        darkenUntil(h, s, l, '#C9A961', 4.5)
        };
    }

    /* ══════════════════════════════════════════════════════════════════
       التطبيق
       ══════════════════════════════════════════════════════════════════ */

    /** ‎#RRGGBB‎ وإلّا فلا. القيمةُ المعطوبةُ تُنتج NaN تسري في الحساب كلِّه. */
    function isHex(v) { return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v); }

    function isDark() {
        const c = document.body ? document.body.classList : null;
        return !!c && (c.contains('theme-dark') || c.contains('dark-active'));
    }

    /**
     * يطلي التطبيقَ باللون. الافتراضيُّ يُزيل الحقنَ فتحكم قيمُ CSS الأصليّة.
     * @param {string} hex
     */
    function paint(hex) {
        const body = document.body;
        if (!body) return;
        const st = body.style;
        if (!isHex(hex) || hex.toUpperCase() === DEFAULT) {
            VARS.forEach((v) => st.removeProperty(v));
            setMeta(DEFAULT);
            return;
        }
        const dark = isDark();
        const vars = scale(hex, dark);
        Object.keys(vars).forEach((k) => st.setProperty(k, vars[k]));
        /* الحبرُ في الداكن أبيضُ مكسورٌ لا يتبع اللون (theme-dark.css:75). */
        if (dark) st.setProperty('--ink-primary', '#E8ECF3');
        setMeta(hex);
    }

    function setMeta(hex) {
        try {
            const m = document.querySelector('meta[name="theme-color"]');
            if (m) m.setAttribute('content', hex);
        } catch (e) { /* لا يوقف شيئاً */ }
    }

    /* ══════════════════════════════════════════════════════════════════
       المرآةُ في الجهاز — تُقرأ قبل أوّل رسم، وتُكتب مع كلّ اختيار
       ══════════════════════════════════════════════════════════════════ */

    /** معرّفُ المعلّم من الجلسة المخزَّنة — قراءةٌ متزامنةٌ بلا شبكة. */
    function storedUid() {
        try {
            const raw = global.localStorage.getItem('teacher-app-auth');
            if (!raw) return null;
            const o = JSON.parse(raw);
            const sess = o && (o.currentSession || o.session || o);
            return (sess && sess.user && sess.user.id) ? sess.user.id : null;
        } catch (e) { return null; }
    }

    function readMirror() {
        try {
            const o = JSON.parse(global.localStorage.getItem(MIRROR) || 'null');
            if (!o || !isHex(o.hex)) return null;
            const uid = storedUid();
            /* لونُ معلّمٍ آخر لا يُلبَس. وبلا جلسةٍ لا لون. */
            return (uid && o.uid === uid) ? o.hex : null;
        } catch (e) { return null; }
    }

    /* تُكتب معها القيمُ المحسوبة، لا اللونُ وحدَه: السكربتُ المبكّر في
       `index.html` يطليها قبل أوّل رسم، فلا يحتاج إلى حسابٍ ولا إلى هذا
       الملفّ — ولا يتكرّر السُّلَّمُ في موضعين فيفترقان. */
    function writeMirror(hex) {
        try {
            const uid = storedUid();
            if (!uid) return;
            const payload = { uid: uid, hex: hex };
            if (hex.toUpperCase() !== DEFAULT) payload.vars = scale(hex);
            global.localStorage.setItem(MIRROR, JSON.stringify(payload));
        } catch (e) { /* لا يوقف شيئاً */ }
    }

    /* ══════════════════════════════════════════════════════════════════
       الواجهة
       ══════════════════════════════════════════════════════════════════ */

    /** يطلي من المرآة — تُنادى عند الإقلاع وبعد تبديل المظهر. */
    function applyStored() { paint(readMirror() || DEFAULT); }

    /**
     * يختار المعلّمُ لوناً: يُطلى فوراً، ويُكتب في الجهاز، ويُدفع للقاعدة.
     * الدفعُ لا يُنتظر — بلا إنترنت يُصفّ في الصندوق الصادر.
     * @param {string} hex
     * @returns {Promise<void>}
     */
    async function choose(hex) {
        const v = (hex || DEFAULT).toUpperCase();
        paint(v);
        writeMirror(v);
        if (global.TeacherDB && global.TeacherDB.Settings) {
            await global.TeacherDB.Settings.set(PREF, v);
        }
    }

    /** يُقرأ المحفوظُ من القاعدة بعد الترطيب فيُصحَّح ما في الجهاز. */
    async function syncFromDb() {
        try {
            if (!global.TeacherDB || !global.TeacherDB.Settings) return;
            /* لا يُصحَّح ما لم يصل بعدُ إلى الخادم: كتابةٌ بلا إنترنت تنتظر
               في الصندوق، وقيمةُ الخادم حينها قديمةٌ فلا تُلبس فوق الطازج. */
            if (global.TeacherDB.Outbox) {
                const n = await global.TeacherDB.Outbox.pending();
                if (n) return;
            }
            const v = await global.TeacherDB.Settings.get(PREF);
            if (!isHex(v)) return;
            const up = v.toUpperCase();
            if (up === (readMirror() || DEFAULT)) return;
            paint(up);
            writeMirror(up);
        } catch (e) { /* اللونُ لا يوقف الإقلاع */ }
    }

    /** عند تسجيل الخروج: تعود شاشةُ الدخول إلى الافتراضيّ. والمرآةُ تبقى
     *  موسومةً بصاحبها — خروجُ الزائر طيٌّ لا خروج، وله أن يعود بلونه. */
    function reset() { paint(DEFAULT); }

    global.ThemeColor = {
        DEFAULT: DEFAULT,
        PREF: PREF,
        MIRROR: MIRROR,
        hslToHex: hslToHex,
        hexToHsl: hexToHsl,
        lum: lum,
        ratio: ratio,
        scale: scale,
        maxLightness: maxLightness,
        MIN_L: MIN_L,
        paint: paint,
        applyStored: applyStored,
        choose: choose,
        syncFromDb: syncFromDb,
        reset: reset,
        current: function () { return readMirror() || DEFAULT; }
    };
})(window);
