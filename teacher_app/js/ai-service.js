/* ==========================================================================
   ai-service.js — Claude API wrapper with mock fallback.
   The teacher stores a personal Anthropic API key in settings; if missing or
   if the request fails, a deterministic mock generator is used so the
   prototype always produces content to review.
   ========================================================================== */

(function (global) {
    'use strict';

    const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
    const API_URL       = 'https://api.anthropic.com/v1/messages';
    const API_VERSION   = '2023-06-01';

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

    /** Low-level call. Prefers the user's personal key when set; otherwise
     *  routes through the Supabase Edge Function proxy with the user's
     *  auth token so the shared Anthropic key stays on the server. */
    async function callClaude({ system, user, maxTokens = 4000, temperature = 0.7, kind = 'other' }) {
        const personalKey = await getApiKey();
        const model       = await getModel();
        const body = JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            system,
            messages: [{ role: 'user', content: user }]
        });

        let res;
        if (personalKey) {
            res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'content-type':                              'application/json',
                    'x-api-key':                                 personalKey,
                    'anthropic-version':                         API_VERSION,
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body
            });
        } else {
            const { data } = await global.SB.auth.getSession();
            const token = data?.session?.access_token;
            if (!token) throw new Error('NO_API_KEY');
            res = await fetch(PROXY_URL, {
                method: 'POST',
                headers: {
                    'content-type':  'application/json',
                    'authorization': 'Bearer ' + token
                },
                body
            });
        }

        if (!res.ok) {
            let msg = `فشل الاتصال (${res.status})`;
            try {
                const err = await res.json();
                if (err?.error?.message) msg += ': ' + err.error.message;
            } catch {}
            throw new Error(msg);
        }

        const data = await res.json();
        const text = (data.content || []).map((b) => b.text || '').join('').trim();

        // Track token usage (if the API returned it)
        if (data.usage) {
            recordUsage({
                model,
                kind,
                input_tokens:  Number(data.usage.input_tokens)  || 0,
                output_tokens: Number(data.usage.output_tokens) || 0
            }).catch(() => {});
        }

        return text;
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

    /** Ask Claude for JSON and parse it (robust: strips code fences and surrounding prose). */
    async function callClaudeJSON(opts) {
        const raw = await callClaude({ ...opts, temperature: opts.temperature ?? 0.6 });
        return extractJSON(raw);
    }

    function extractJSON(text) {
        let s = String(text || '').trim();
        // Strip markdown code fences
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        // Find first { or [
        const first = Math.min(
            ...[s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0)
        );
        if (first > 0) s = s.slice(first);
        // Find matching last bracket
        const last = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
        if (last > 0) s = s.slice(0, last + 1);
        try { return JSON.parse(s); }
        catch (e) { throw new Error('تعذّر قراءة استجابة الذكاء الاصطناعي.'); }
    }

    /* ==========================================================================
       Public generators — all return { questions: [...] } or similar shapes.
       If the API key is missing, a mock is returned so the UI still works.
       ========================================================================== */

    async function extractScheduleFromImage({ pages, imageBase64, mediaType, classes, periodCount }) {
        if (!Array.isArray(pages)) {
            pages = [{ base64: imageBase64, mediaType }];
        }
        const list = (classes || []).map((c) =>
            `- id: ${c.id} | الصف: ${c.grade} | الشعبة: ${c.section} | المادة: ${c.subject}`
        ).join('\n') || '(لا توجد فصول مسجّلة)';

        const system = `أنت مساعد لقراءة الجداول الدراسية المدرسية للمعلمين العرب.
الأيام: الأحد=0 الاثنين=1 الثلاثاء=2 الأربعاء=3 الخميس=4
أرقام الحصص من 1 إلى ${periodCount || 7}

فصول المعلم المتاحة:
${list}

لكل خانة في الجدول، حدّد:
- day (0-4)
- period (1-N)
- class_id  (يجب أن يكون من القائمة أعلاه؛ التقط أفضل تطابق)
- topic     (الموضوع/الدرس إن وُجد، نص قصير)

إذا الخانة لفصل غير موجود في القائمة، اجعل "unmatched": true وضع وصف نصي في class_text.

أخرج JSON فقط دون أي شرح:
{"cells":[
  {"day":0,"period":1,"class_id":"<uuid>","topic":""},
  {"day":1,"period":2,"unmatched":true,"class_text":"الأول/أ — رياضيات","topic":""}
]}`;

        const user = [
            ...pages.map((p) => ({
                type: 'image',
                source: { type: 'base64', media_type: p.mediaType, data: p.base64 }
            })),
            { type: 'text', text: `هذه ${pages.length === 1 ? 'صورة' : pages.length + ' صفحة'} للجدول الأسبوعي. استخرج كل الحصص وأعد JSON فقط حسب الشكل المطلوب.` }
        ];

        const text = await callClaude({
            system, user,
            maxTokens: 4000,
            temperature: 0.2,
            kind: 'schedule_import'
        });

        let json;
        try {
            const cleaned = String(text || '')
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();
            json = JSON.parse(cleaned);
        } catch (e) {
            throw new Error('لم أتمكن من قراءة استجابة الذكاء الاصطناعي.');
        }
        return Array.isArray(json.cells) ? json.cells : [];
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

        const system = `أنت مساعد لاستخراج أسماء الطلاب من صور كشوف الفصول العربية.

مهمتك: اقرأ كل الصور المرفقة (قد تكون عدة صفحات لقائمة طلاب واحدة) واستخرج فقط أسماء الطلاب من جميع الصفحات.
- تجاهل الترقيم، أرقام الهوية، الجنسية، تاريخ الميلاد، وأي بيانات أخرى.
- تجاهل العناوين والترويسة وأي نص ليس اسم طالب.
- نظّف الاسم من المسافات الزائدة لكن احتفظ به كما هو (لا تترجمه ولا تختصره).
- اجمع الأسماء من كل الصفحات في قائمة واحدة بالترتيب.

أخرج JSON فقط:
{"names":["أحمد بن محمد","سارة بنت عبدالله", ...]}`;

        const user = [
            ...pages.map((p) => ({
                type: 'image',
                source: { type: 'base64', media_type: p.mediaType, data: p.base64 }
            })),
            { type: 'text', text: `هذه ${pages.length === 1 ? 'صورة' : pages.length + ' صفحة'} لكشف الفصل. استخرج أسماء الطلاب من الكل وأعد JSON فقط.` }
        ];

        const text = await callClaude({
            system, user,
            maxTokens: 4000,
            temperature: 0.1,
            kind: 'roster_import'
        });

        let json;
        try {
            const cleaned = String(text || '')
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();
            json = JSON.parse(cleaned);
        } catch (e) {
            throw new Error('لم أتمكن من قراءة استجابة الذكاء الاصطناعي.');
        }
        const names = Array.isArray(json.names) ? json.names : [];
        return names
            .map((n) => String(n || '').trim())
            .filter((n) => n.length > 0 && n.length < 200);
    }

    global.AI = {
        getApiKey, setApiKey, hasApiKey,
        getModel, setModel,
        callClaude, callClaudeJSON,
        extractScheduleFromImage,
        extractStudentNamesFromImage,
        getUsage, clearUsage, estimateCost, PRICES,
        DEFAULT_MODEL
    };
})(window);
