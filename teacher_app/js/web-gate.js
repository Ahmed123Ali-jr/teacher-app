/* ==========================================================================
   web-gate.js — بابُ رمزِ الدخول، **للموقع وحدَه**.

   طلبُه (٩ سبتمبر ٢٠٢٦): «أريد أيّ أحدٍ يدخل على الموقع يطلع له رمز إدخال،
   ولا يدخل إلّا اللي يدخل الرمز».

   ── مفتاحُ الإطفاء ──
   `GATE_ON = false` يُلغي البابَ كلَّه، ولا شيءَ آخر يُمسّ ولا القاعدةُ
   تُلمس. **ويُطفأ وجوباً قبل الرفع إلى آبل** ثمّ يُعاد بعد القبول — لأنّ
   المراجعَ قد يفتح `fusooli.com` فيجد جداراً فيظنّ الخدمةَ بالدعوة وحدَها.
   (البوّابة ‎١٠‎ في خطّة الرفع.)

   ── والتطبيقُ المغلَّف لا يمرّ به ──
   حارسان لا واحد:
     ١) `Capacitor.isNativePlatform()` أدناه — فلو دخل الملفُّ الحزمةَ لم يعمل.
     ٢) والحزمةُ أصلاً نسخةٌ مجمّدةٌ يومَ التغليف (`webDir` بلا `server.url`)،
        فتغييرُ الموقع لا يبلغ التطبيقَ إطلاقاً.

   ── ما يحرسه وما لا يحرسه ──
   يحرس: **ألّا يُقرأ الرمزُ ولا يُخمَّن** — لا `select` على الجدول، والتحقّقُ
   دالّةٌ تردّ `true/false`.
   ولا يحرس: **تخطّي البابِ نفسِه**. من يفتح أدوات المتصفّح يتجاوزه، وقد
   قَبِل ذلك صراحةً — البابُ يوقف الزائرَ العاديّ. ولا يمكن أن يكون
   خادميّاً ما دام التطبيقُ معفًى منه: الاثنان يكلّمان سوبابيس بالمفتاح
   العام نفسِه، والخادمُ لا يصدّق عميلاً يقول «أنا التطبيق».

   ── ولا يمسّ صفحتَي السياسة والشروط ──
   هما ملفّان مستقلّان لا يُحمَّل فيهما هذا السكربت. **وهذا مقصود:** آبل
   تفتح رابطَ سياسة الخصوصيّة وتتحقّق منه، وإقفالُه رفضٌ مباشر.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ⚠️ المفتاح. `false` = لا باب. */
    const GATE_ON = true;

    const KEY = 'fusool_web_gate_ok';

    /* التطبيقُ المغلَّف يمرّ بلا باب. */
    function isNative() {
        const c = global.Capacitor;
        return !!(c && c.isNativePlatform && c.isNativePlatform());
    }

    function passed() {
        try { return global.localStorage.getItem(KEY) === '1'; }
        catch (e) { return false; }   /* تخزينٌ مُقفل: يُسأل في كلّ مرّة */
    }

    function remember() {
        try { global.localStorage.setItem(KEY, '1'); } catch (e) { /* لا بأس */ }
    }

    /** يُبنى البابُ بالحروف لا بملفّ تنسيقٍ خارجيّ: هو يسبق كلَّ شيء. */
    function render() {
        const el = document.createElement('div');
        el.id = 'web-gate';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'wg-title');
        el.innerHTML = [
            '<div class="wg-card">',
            '  <img class="wg-mark" src="assets/icons/icon-192.png" alt="" width="56" height="56">',
            '  <h1 id="wg-title">فصول</h1>',
            '  <p class="wg-sub">هذه النسخةُ مغلقةٌ مؤقّتاً. أدخل رمزَ الدخول للمتابعة.</p>',
            '  <form class="wg-form" autocomplete="off">',
            '    <input class="wg-input" id="wg-code" type="text" inputmode="text"',
            '           autocapitalize="off" autocorrect="off" spellcheck="false"',
            '           placeholder="رمز الدخول" aria-label="رمز الدخول">',
            '    <button class="wg-btn" type="submit">دخول</button>',
            '  </form>',
            '  <p class="wg-msg" id="wg-msg" role="status" aria-live="polite"></p>',
            '</div>'
        ].join('');

        const css = document.createElement('style');
        css.textContent = [
            '#web-gate{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;',
            'padding:24px;background:#F8F6F0;direction:rtl;',
            "font-family:'IBM Plex Sans Arabic',system-ui,-apple-system,sans-serif}",
            '@media (prefers-color-scheme:dark){#web-gate{background:#0D1117}}',
            '#web-gate .wg-card{width:100%;max-width:340px;text-align:center;',
            'display:flex;flex-direction:column;align-items:center;gap:0}',
            '#web-gate .wg-mark{border-radius:15px;margin-bottom:16px}',
            '#web-gate h1{margin:0;font-size:23px;font-weight:700;color:#0A3F4A;letter-spacing:-.3px}',
            '@media (prefers-color-scheme:dark){#web-gate h1{color:#E8ECF3}}',
            '#web-gate .wg-sub{margin:8px 0 22px;font-size:13.5px;line-height:1.8;color:#6B7278}',
            '@media (prefers-color-scheme:dark){#web-gate .wg-sub{color:#98A2B3}}',
            '#web-gate .wg-form{width:100%;display:flex;flex-direction:column;gap:10px}',
            /* ‎16px‎ فأعلى: دونها يُكبّر iOS الصفحةَ عند اللمس فينزاح الاتّجاه. */
            '#web-gate .wg-input{width:100%;min-height:52px;padding:0 15px;font:inherit;',
            'font-size:16px;text-align:center;border-radius:14px;border:1.5px solid #E4E6EA;',
            'background:#fff;color:#22282B}',
            '#web-gate .wg-input:focus{outline:2px solid #C9A961;outline-offset:2px;border-color:#0A3F4A}',
            '@media (prefers-color-scheme:dark){#web-gate .wg-input{background:#161C27;',
            'border-color:#2C3545;color:#E8ECF3}}',
            '#web-gate .wg-btn{width:100%;min-height:52px;font:inherit;font-size:15px;font-weight:600;',
            'border:0;border-radius:14px;background:#0A3F4A;color:#fff;cursor:pointer}',
            '#web-gate .wg-btn[disabled]{opacity:.55;cursor:default}',
            '#web-gate .wg-msg{margin:14px 0 0;font-size:12.5px;line-height:1.7;min-height:18px;color:#B42318}',
            '@media (prefers-color-scheme:dark){#web-gate .wg-msg{color:#F87171}}'
        ].join('');

        document.head.appendChild(css);
        document.body.appendChild(el);
        /* التمريرُ يُمنع خلف الباب. */
        document.documentElement.style.overflow = 'hidden';
        return el;
    }

    function open() {
        const el = render();
        const form = el.querySelector('.wg-form');
        const input = el.querySelector('#wg-code');
        const btn  = el.querySelector('.wg-btn');
        const msg  = el.querySelector('#wg-msg');
        let busy = false;

        /* بلا تركيزٍ تلقائيّ على الجوّال: لوحةُ المفاتيح تقفز فوق الشاشة
           قبل أن يقرأ السطرَ. وعلى الشاشات العريضة لا ضير. */
        if (global.innerWidth >= 768) { try { input.focus(); } catch (e) { /**/ } }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (busy) return;
            const code = (input.value || '').trim();
            if (!code) { msg.textContent = 'اكتب الرمز أولاً.'; return; }

            busy = true;
            btn.disabled = true;
            btn.textContent = 'يتحقّق…';
            msg.textContent = '';
            try {
                /* التحقّقُ في القاعدة لا هنا: الرمزُ لا ينزل إلى المتصفّح أبداً. */
                const { data, error } = await global.SB.rpc('web_code_ok', { p_code: code });
                if (error) throw error;
                if (data === true) {
                    remember();
                    document.documentElement.style.overflow = '';
                    el.remove();
                    return;
                }
                msg.textContent = 'الرمز غير صحيح.';
                input.select();
            } catch (err) {
                console.error('[web-gate]', err);
                msg.textContent = 'تعذّر التحقّق — تأكّد من اتصالك ثم أعد المحاولة.';
            } finally {
                busy = false;
                btn.disabled = false;
                btn.textContent = 'دخول';
            }
        });
    }

    /* ── التشغيل ──
       يُنادى بعد `supabase-client.js` (فالبابُ يحتاج `SB`) وقبل أن يرى
       الزائرُ شيئاً. و`DOMContentLoaded` لأنّ `document.body` قد لا يكون
       جاهزاً حين يُحمَّل السكربت. */
    function start() {
        if (!GATE_ON || isNative() || passed()) return;
        if (document.body) open();
        else document.addEventListener('DOMContentLoaded', open, { once: true });
    }

    start();

    /* للفحص وحدَه: تُنسى الموافقةُ فيعود البابُ. لا زرَّ لها في الواجهة. */
    global.WebGate = { forget: () => { try { global.localStorage.removeItem(KEY); } catch (e) { /**/ } } };
})(window);
