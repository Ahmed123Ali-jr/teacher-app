/* ==========================================================================
   ai-service.js — Claude API wrapper with mock fallback.
   The teacher stores a personal Anthropic API key in settings; if missing or
   if the request fails, a deterministic mock generator is used so the
   prototype always produces content to review.
   ========================================================================== */

(function (global) {
    'use strict';

    const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

    /* Edge Function proxy: keeps the shared key on the server. The browser
       calls this URL with the user's Supabase JWT — no Anthropic key ever
       reaches the client. */
    const PROXY_URL = 'https://rbsfpsmolxldmwcclhlc.supabase.co/functions/v1/anthropic-proxy';

    async function getApiKey() {
        return (await global.TeacherDB.Settings.get('anthropic_api_key')) || '';
    }

    async function setApiKey(key) {
        if (key && key.trim()) await global.TeacherDB.Settings.set('anthropic_api_key', key.trim());
        else await global.TeacherDB.Settings.unset('anthropic_api_key');
    }

    async function getModel() {
        return (await global.TeacherDB.Settings.get('anthropic_model')) || DEFAULT_MODEL;
    }

    async function setModel(model) {
        if (model) await global.TeacherDB.Settings.set('anthropic_model', model);
    }

    /** AI is reachable when either the user has set a personal key or the
     *  Edge Function proxy is configured (i.e. there's an active session). */
    async function hasApiKey() {
        if (await getApiKey()) return true;
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
                model: DEFAULT_MODEL,
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

    const PRICES = {
        'claude-sonnet-4-5-20250929': { input: 3.00,  output: 15.00 },
        'claude-opus-4-5-20250929':   { input: 15.00, output: 75.00 },
        'claude-haiku-4-5-20251001':  { input: 1.00,  output: 5.00  }
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
        getApiKey, setApiKey, hasApiKey,
        getModel, setModel,
        extractScheduleFromImage,
        extractStudentNamesFromImage,
        getUsage, clearUsage, estimateCost, PRICES,
        DEFAULT_MODEL
    };
})(window);
