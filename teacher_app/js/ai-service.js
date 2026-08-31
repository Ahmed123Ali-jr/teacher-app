/* ==========================================================================
   ai-service.js — Claude API wrapper with mock fallback.
   The teacher stores a personal Anthropic API key in settings; if missing or
   if the request fails, a deterministic mock generator is used so the
   prototype always produces content to review.
   ========================================================================== */

(function (global) {
    'use strict';

    /* احتياطٌ لا اختيار: النموذجُ يُثبَّت في البروكسي ويعود مع الاستجابة.
       وهذا يُستعمل حين لا يعود — فليكن المستعمَلَ فعلاً لا القديم. */
    const DEFAULT_MODEL = 'claude-opus-5';

    /* Edge Function proxy: keeps the shared key on the server. The browser
       calls this URL with the user's Supabase JWT — no Anthropic key ever
       reaches the client. */
    const PROXY_URL = 'https://rbsfpsmolxldmwcclhlc.supabase.co/functions/v1/anthropic-proxy';

    /* ══ لا مفتاحَ في جهاز المعلّم ولا نموذجَ يختاره ══
       كان كلُّ معلّمٍ يلصق مفتاحَ أنثروبيك الخاصّ به في الإعدادات، ويُخزَّن
       في `app_settings`، ويُنادى أنثروبيك من المتصفّح مباشرةً. ثمّ صار
       النداءُ يمرّ بالبروكسي بمفتاحٍ واحدٍ على الخادم، فحُذفت الشاشةُ
       وحُذف النداءُ المباشر — **وبقيت دوالُّ القراءة والكتابة بلا منادٍ**،
       ومعها مفتاحٌ حقيقيٌّ نائمٌ في قاعدة البيانات منذ ٥ مايو ٢٠٢٦ (وُجد
       في تدقيق ٢٦ أغسطس، وأُبطل ومُسح).

       فحُذفت كلُّها: لا يبقى في التطبيق مسارٌ يكتب مفتاحاً في القاعدة.
       والنموذجُ يُثبَّت في البروكسي فلا يُطلب من العميل. */

    /** هل الذكاءُ متاح؟ — والجوابُ جلسةٌ قائمة، فالمفتاحُ في الخادم. */
    async function isAvailable() {
        try {
            const { data } = await global.SB.auth.getSession();
            return !!(data && data.session);
        } catch { return false; }
    }

    /** ينادي البروكسي بنيّةٍ لا بطلب: `kind` وصورٌ لا غير.
     *
     *  التعليماتُ والنموذجُ والقالبُ كلُّها في الخادم الآن. وكانت هنا —
     *  أي في المكان الوحيد الذي لا يمرّ به مهاجم، فما كانت تقيّد أحداً.
     *  والخادم يفرض شكل المخرَج بأداةٍ إجبارية ويفحصه قبل أن يعيده، فما
     *  يصل هنا لا يكون إلا أسماءً أو حصصاً. */
    async function callProxy(payload, kind) {
        const { data } = await global.SB.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error('NO_API_KEY');

        const res = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
            body: JSON.stringify(payload)
        });

        let body = null;
        try { body = await res.json(); } catch (e) { /* يُعالَج أدناه */ }

        if (!res.ok) {
            throw new Error((body && body.error) || `فشل الاتصال (${res.status})`);
        }
        if (!body) throw new Error('تعذّر قراءة استجابة الخدمة.');

        if (body.usage) {
            recordUsage({
                /* اسمُ النموذج من الخادم لا من هنا: النموذجُ يُثبَّت في
                   البروكسي، وكان العميلُ يسجّل اسمَ سونيت بعد أن صار أوبس —
                   فيُحسب الثمنُ بخُمسه ولا يدري أحد. (٣٠ أغسطس ٢٠٢٦.) */
                model: body.model || DEFAULT_MODEL,
                kind,
                input_tokens:  Number(body.usage.input_tokens)  || 0,
                output_tokens: Number(body.usage.output_tokens) || 0
            }).catch(() => {});
        }
        return body;
    }

    /* ==========================================================================
       Usage tracking
       Prices below are $ per 1M tokens — update if Anthropic changes pricing.
       ========================================================================== */

    /* دولاراتٌ لكلّ مليون توكن — تُراجَع إن غيّرت أنثروبيك أسعارها.
       وأُثبتت من مرجع الأسعار في ٣٠ أغسطس ٢٠٢٦.

       وفائدةٌ تُقيَّد: **أوبس كلُّه بسعرٍ واحد** — الخامس والرابعُ بفروعه.
       فالنزولُ إلى أوبس أقدم لا يوفّر شيئاً، ويخسر دقّةً بلا مقابل.
       والأرخصُ حقّاً سونيت ٥ ثمّ هايكو، وهما نزولٌ في الدقّة لا في الجيل. */
    const PRICES = {
        'claude-opus-5':              { input:  5.00, output: 25.00 },
        'claude-opus-4-8':            { input:  5.00, output: 25.00 },
        'claude-opus-4-7':            { input:  5.00, output: 25.00 },
        'claude-opus-4-6':            { input:  5.00, output: 25.00 },
        'claude-sonnet-5':            { input:  2.00, output: 10.00 },
        'claude-sonnet-4-6':          { input:  3.00, output: 15.00 },
        /* المستعمَلُ قبل ٣٠ أغسطس — يبقى ليُحسب ما سُجّل به. */
        'claude-sonnet-4-5-20250929': { input:  3.00, output: 15.00 },
        'claude-haiku-4-5':           { input:  1.00, output:  5.00 },
        'claude-haiku-4-5-20251001':  { input:  1.00, output:  5.00 }
    };
    const DEFAULT_PRICE = PRICES[DEFAULT_MODEL];

    async function getUsage() {
        const stored = await global.TeacherDB.Settings.get('ai_usage');
        return stored || {
            calls: 0,
            totalInput: 0,
            totalOutput: 0,
            byKind:  {},
            byModel: {},
            recent:  []
        };
    }

    async function recordUsage({ model, kind, input_tokens, output_tokens }) {
        const u = await getUsage();
        u.calls++;
        u.totalInput  += input_tokens;
        u.totalOutput += output_tokens;

        u.byKind[kind] = u.byKind[kind] || { calls: 0, in: 0, out: 0 };
        u.byKind[kind].calls++;
        u.byKind[kind].in  += input_tokens;
        u.byKind[kind].out += output_tokens;

        u.byModel[model] = u.byModel[model] || { calls: 0, in: 0, out: 0 };
        u.byModel[model].calls++;
        u.byModel[model].in  += input_tokens;
        u.byModel[model].out += output_tokens;

        u.recent.unshift({
            at: new Date().toISOString(),
            model, kind,
            in:  input_tokens,
            out: output_tokens
        });
        if (u.recent.length > 30) u.recent.length = 30;

        await global.TeacherDB.Settings.set('ai_usage', u);
    }

    async function clearUsage() {
        await global.TeacherDB.Settings.unset('ai_usage');
    }

    /** Compute estimated cost (USD + SAR) from usage totals. */
    function estimateCost(usage) {
        let usd = 0;
        for (const [model, stats] of Object.entries(usage.byModel || {})) {
            const price = PRICES[model] || DEFAULT_PRICE;
            usd += (stats.in  / 1e6) * price.input;
            usd += (stats.out / 1e6) * price.output;
        }
        return { usd, sar: usd * 3.75 };
    }

    /* ==========================================================================
       Public generators — all return { questions: [...] } or similar shapes.
       If the API key is missing, a mock is returned so the UI still works.
       ========================================================================== */

    /** @returns {{cells:Array, teachers:string[]}} — والأسماء لأن الملف
     *  الواحد قد يحمل جداول المدرسة كلّها، صفحةً لكل معلّم. */
    async function extractScheduleFromImage({ pages, imageBase64, mediaType, classes, periodCount, teacherName }) {
        if (!Array.isArray(pages)) {
            pages = [{ base64: imageBase64, mediaType }];
        }
        const body = await callProxy({
            kind:  'schedule',
            pages: pages.map((p) => ({ media_type: p.mediaType, data: p.base64 })),
            classes: (classes || []).map((c) => ({
                id: c.id, grade: c.grade, section: c.section, subject: c.subject
            })),
            periodCount: periodCount || 7,
            teacherName: teacherName || ''
        }, 'schedule_import');
        const cells = Array.isArray(body.cells) ? body.cells : [];
        cells.teachers = Array.isArray(body.teachers_found) ? body.teachers_found : [];
        return cells;
    }

    /** Extract a clean list of Arabic student names from a roster.
     *  `pages` is an array of { base64, mediaType } — one entry per image
     *  or per PDF page. All pages are sent in a single message so multi-
     *  page rosters are read fully. Returns string[] of names. */
    async function extractStudentNamesFromImage({ pages, imageBase64, mediaType }) {
        // Backwards compat: accept the older single-image shape.
        if (!Array.isArray(pages)) {
            pages = [{ base64: imageBase64, mediaType }];
        }
        const body = await callProxy({
            kind:  'names',
            pages: pages.map((p) => ({ media_type: p.mediaType, data: p.base64 }))
        }, 'roster_import');
        return Array.isArray(body.names) ? body.names : [];
    }

    global.AI = {
        isAvailable,
        extractScheduleFromImage,
        extractStudentNamesFromImage,
        getUsage, clearUsage, estimateCost, PRICES,
        DEFAULT_MODEL
    };
})(window);
