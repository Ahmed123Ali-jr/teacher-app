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

    /* The built-in key has been removed for the public repo. Until the
       Edge Function proxy is deployed, teachers enter their own key in
       Settings → الذكاء الاصطناعي. */
    const BUILTIN_API_KEY = '';

    async function getApiKey() {
        const stored = await global.TeacherDB.Settings.get('anthropic_api_key');
        return stored || BUILTIN_API_KEY || '';
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

    async function hasApiKey() {
        return !!(await getApiKey());
    }

    /** Low-level call to Anthropic Messages API (direct browser).
     *  `kind` is a short label used for per-usage stats (exam/worksheet/…). */
    async function callClaude({ system, user, maxTokens = 4000, temperature = 0.7, kind = 'other' }) {
        const apiKey = await getApiKey();
        if (!apiKey) throw new Error('NO_API_KEY');

        const model = await getModel();

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': API_VERSION,
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature,
                system,
                messages: [{ role: 'user', content: user }]
            })
        });

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

    /**
     * Generate an exam.
     * @param {object} opts
     *   subject, grade, topic, source ('book'|'pages'|'general'), context,
     *   types: ['mcq','tf','fill','essay','match'],
     *   count: 5..25, difficulty: 'easy'|'medium'|'hard'|'mixed', notes
     */
    async function generateExam(opts) {
        if (!(await hasApiKey())) return mockExam(opts);

        const system = SYSTEM_PROMPTS.exam(opts);
        const user   = userPromptForExam(opts);

        try {
            const result = await callClaudeJSON({ system, user, maxTokens: 4096, kind: 'exam' });
            return normalizeExam(result, opts);
        } catch (err) {
            console.warn('[AI] Exam generation fell back to mock:', err.message);
            global.TeacherApp.toast('تعذّر توليد الاختبار من الـ AI. تم استخدام نموذج تجريبي.', 'warning', 4500);
            return mockExam(opts);
        }
    }

    /** Regenerate a single question in-place. */
    async function regenerateQuestion(opts, questionIndex, otherQuestions) {
        if (!(await hasApiKey())) return mockQuestion(opts, questionIndex);
        const system = SYSTEM_PROMPTS.exam(opts);
        const user = `
${userPromptForExam({ ...opts, count: 1 })}

الأسئلة المولّدة سابقاً (تجنّب التشابه):
${otherQuestions.map((q, i) => `${i + 1}) ${q.text}`).join('\n')}

أعطني **سؤالاً واحداً جديداً** بنفس الصيغة (JSON كما في التعليمات).
        `.trim();

        try {
            const out = await callClaudeJSON({ system, user, maxTokens: 1200, temperature: 0.85, kind: 'exam_regen' });
            const q = Array.isArray(out?.questions) ? out.questions[0] : out;
            return normalizeQuestion(q, opts, questionIndex);
        } catch (err) {
            console.warn('[AI] regen fell back:', err.message);
            return mockQuestion(opts, questionIndex);
        }
    }

    /** Generate a worksheet (exercises, no answer key by default). */
    async function generateWorksheet(opts) {
        if (!(await hasApiKey())) return mockWorksheet(opts);
        const system = `أنت مساعد تعليمي سعودي متخصص في صياغة أوراق عمل مطابقة لمنهج وزارة التعليم.
أعد ${opts.count || 8} تدريبات متدرجة حول الموضوع. أرجع JSON فقط بالشكل:
{"title": "...", "instructions": "...", "exercises": [{"text": "...", "hint": "..."}]}`;
        const user = `المادة: ${opts.subject}
الصف: ${opts.grade}
الموضوع: ${opts.topic}
${opts.context ? 'السياق من الكتاب:\n' + opts.context : ''}
${opts.notes ? 'ملاحظات: ' + opts.notes : ''}`;
        try {
            const out = await callClaudeJSON({ system, user, maxTokens: 3000, kind: 'worksheet' });
            return {
                title: out.title || ('ورقة عمل — ' + opts.topic),
                instructions: out.instructions || 'اقرأ كل تمرين ثم أجب في المكان المخصّص.',
                exercises: (out.exercises || []).map((e, i) => ({
                    id: 'ex_' + (i + 1),
                    text: String(e.text || '').trim(),
                    hint: e.hint || ''
                })).filter((e) => e.text)
            };
        } catch (err) {
            console.warn('[AI] worksheet fallback:', err.message);
            global.TeacherApp.toast('تعذّر التوليد من الـ AI. تم استخدام نموذج تجريبي.', 'warning');
            return mockWorksheet(opts);
        }
    }

    /* ==========================================================================
       Prompts
       ========================================================================== */

    const SYSTEM_PROMPTS = {
        exam(opts) {
            return `أنت معلم سعودي خبير في مادة ${opts.subject || ''} متخصص في صياغة الاختبارات المدرسية.
- التزم بالمنهج السعودي ومستوى ${opts.grade || 'الطالب'}.
- صياغة الأسئلة واضحة وبسيطة باللغة العربية الفصحى.
- تأكد من دقة الإجابات الصحيحة.
- نوّع الأسئلة وفق الأنواع المطلوبة.
- تجنّب الأسئلة المتكررة أو التافهة.
- تقيّد بالسياق المقدّم من المعلم إن وُجد.

أرجع **JSON فقط** (بدون شرح أو تعليق) بالشكل التالي:

{
  "questions": [
    {
      "type": "mcq" | "tf" | "fill" | "essay" | "match",
      "text": "نص السؤال",
      "options": ["أ","ب","ج","د"],   // لـ mcq فقط
      "answer": "ب",                   // النص أو الحرف الصحيح
      "points": 1
    }
  ]
}`.trim();
        }
    };

    function userPromptForExam(opts) {
        const typeLabels = {
            mcq: 'اختيار من متعدد (٤ خيارات)',
            tf:  'صح أو خطأ',
            fill: 'أكمل الفراغ',
            essay: 'مقالي قصير',
            match: 'مطابقة'
        };
        const difficultyLabel = {
            easy: 'سهل', medium: 'متوسط', hard: 'صعب', mixed: 'متنوع المستويات'
        }[opts.difficulty || 'medium'];

        return `
المادة: ${opts.subject || ''}
الصف: ${opts.grade || ''}
الموضوع / الدرس: ${opts.topic || 'عام في المادة'}
عدد الأسئلة المطلوب: ${opts.count || 10}
مستوى الصعوبة: ${difficultyLabel}
أنواع الأسئلة المطلوبة: ${(opts.types || ['mcq']).map((t) => typeLabels[t] || t).join('، ')}

${opts.source === 'book' && opts.context ? `السياق من كتاب الطالب:\n"""${opts.context.slice(0, 8000)}"""\n` : ''}
${opts.source === 'pages' && opts.pageRange ? `الصفحات المطلوبة: ${opts.pageRange}\n` : ''}
${opts.notes ? `ملاحظات خاصة من المعلم: ${opts.notes}` : ''}

صمّم الاختبار الآن وأرجع JSON فقط.`.trim();
    }

    /* ==========================================================================
       Normalizers
       ========================================================================== */

    function normalizeExam(result, opts) {
        const raw = Array.isArray(result?.questions) ? result.questions : [];
        const questions = raw.map((q, i) => normalizeQuestion(q, opts, i));
        return { questions };
    }

    function normalizeQuestion(q, opts, i) {
        const type = ['mcq','tf','fill','essay','match'].includes(q?.type) ? q.type : 'mcq';
        const base = {
            id: 'q_' + Date.now() + '_' + i,
            type,
            text: String(q?.text || '').trim() || '—',
            points: Number(q?.points) || 1,
            answer: q?.answer ?? ''
        };
        if (type === 'mcq') {
            const opts4 = Array.isArray(q.options) && q.options.length >= 2
                ? q.options.slice(0, 6).map(String)
                : ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث', 'الخيار الرابع'];
            base.options = opts4;
        }
        if (type === 'tf') {
            base.answer = /^(true|T|صح|نعم|صحيح)$/i.test(String(base.answer)) ? 'صح' : 'خطأ';
        }
        return base;
    }

    /* ==========================================================================
       Mocks — used when API key is missing or request fails
       ========================================================================== */

    function mockExam(opts) {
        const count = Math.min(Math.max(Number(opts.count) || 10, 1), 25);
        const types = (opts.types && opts.types.length) ? opts.types : ['mcq'];
        const questions = [];
        for (let i = 0; i < count; i++) {
            const type = types[i % types.length];
            questions.push(mockQuestion(opts, i, type));
        }
        return { questions };
    }

    function mockQuestion(opts, i, forceType) {
        const type = forceType || (opts.types || ['mcq'])[i % (opts.types || ['mcq']).length];
        const topic = opts.topic || opts.subject || 'المادة';
        const id = 'q_mock_' + Date.now() + '_' + i;

        if (type === 'mcq') {
            return {
                id, type: 'mcq', points: 1,
                text: `[نموذج] سؤال رقم ${i + 1} حول "${topic}" — استبدله بالنص الحقيقي.`,
                options: ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث', 'الخيار الرابع'],
                answer: 'الخيار الأول'
            };
        }
        if (type === 'tf') {
            return { id, type: 'tf', points: 1,
                text: `[نموذج] العبارة رقم ${i + 1} حول "${topic}" صحيحة.`,
                answer: i % 2 === 0 ? 'صح' : 'خطأ' };
        }
        if (type === 'fill') {
            return { id, type: 'fill', points: 1,
                text: `[نموذج] أكمل: .......... يرتبط مفهومه بـ "${topic}".`,
                answer: 'الكلمة الصحيحة' };
        }
        if (type === 'match') {
            return { id, type: 'match', points: 2,
                text: `[نموذج] طابق بين العمودين حول "${topic}".`,
                answer: '' };
        }
        return { id, type: 'essay', points: 2,
            text: `[نموذج] اشرح باختصار: ما علاقة "${topic}" بالواقع العملي؟`,
            answer: '' };
    }

    function mockWorksheet(opts) {
        return {
            title: 'ورقة عمل — ' + (opts.topic || opts.subject || 'درس'),
            instructions: 'اقرأ كل تدريب ثم أجب عنه في المكان المخصّص.',
            exercises: Array.from({ length: opts.count || 8 }, (_, i) => ({
                id: 'ex_' + (i + 1),
                text: `[نموذج] التمرين رقم ${i + 1} حول "${opts.topic || 'الدرس'}" — استبدله بالنص الحقيقي.`,
                hint: ''
            }))
        };
    }

    /* ==========================================================================
       Portfolio report generators
       ========================================================================== */

    async function generateStrategyReport(opts) {
        if (!(await hasApiKey())) return mockStrategyReport(opts);
        const system = `أنت خبير تربوي سعودي. اكتب تقريراً احترافياً عن استراتيجية تدريس طبّقها المعلم.
استخدم لغة عربية فصحى تربوية. أرجع JSON فقط بالشكل:
{
  "introduction": "مقدمة قصيرة عن الاستراتيجية (٣-٤ أسطر)",
  "description": "وصف علمي للاستراتيجية وأسسها النظرية",
  "steps": ["خطوة ١", "خطوة ٢", "خطوة ٣", "..."],
  "impact": "الأثر التعليمي الملاحظ على الطلاب",
  "recommendations": "توصيات لتطوير التطبيق مستقبلاً"
}`;
        const user = `
اسم الاستراتيجية: ${opts.name}
الصف: ${opts.class_label || ''}
المادة: ${opts.subject || ''}
الدرس المطبّقة فيه: ${opts.lesson || ''}
تاريخ التنفيذ: ${opts.date || ''}
عدد الصور المرفقة: ${opts.image_count || 0}
وصف المعلم: ${opts.description || 'لا يوجد'}
        `.trim();

        try {
            const out = await callClaudeJSON({ system, user, maxTokens: 2500, kind: 'strategy' });
            return normalizeStrategyReport(out, opts);
        } catch (err) {
            console.warn('[AI] strategy report fallback:', err.message);
            global.TeacherApp.toast('تعذّر التوليد. تم استخدام نموذج تجريبي.', 'warning');
            return mockStrategyReport(opts);
        }
    }

    async function generateMissionVision(opts) {
        if (!(await hasApiKey())) return mockMissionVision(opts);
        const system = `أنت مستشار تربوي سعودي متخصص في صياغة الرسائل والرؤى المهنية للمعلمين.
اكتب بلغة عربية فصحى احترافية، قصيرة ومؤثرة. تجنّب التكرار والحشو.
أرجع JSON فقط بالشكل:
{
  "mission": "الرسالة الشخصية للمعلم (٣-٤ أسطر)",
  "vision":  "الرؤية المستقبلية (٢-٣ أسطر)",
  "goals":   "الأهداف المهنية (قائمة نقطية في فقرة واحدة بفواصل أو أسطر)"
}`;
        const user = `
اسم المعلم: ${opts.name || ''}
التخصص / المادة: ${opts.subject || ''}
المراحل التي يدرّسها: ${opts.stage || ''}
سنوات الخبرة: ${opts.years || 'غير محدّد'}
قيم يؤمن بها: ${opts.values || ''}
التركيز المهني: ${opts.focus || ''}
ملاحظات إضافية: ${opts.notes || ''}
`.trim();

        try {
            const out = await callClaudeJSON({ system, user, maxTokens: 1200, kind: 'mission' });
            return {
                mission: String(out?.mission || '').trim(),
                vision:  String(out?.vision  || '').trim(),
                goals:   String(out?.goals   || '').trim()
            };
        } catch (err) {
            console.warn('[AI] mission fallback:', err.message);
            global.TeacherApp.toast('تعذّر التوليد. تم استخدام نموذج تجريبي.', 'warning');
            return mockMissionVision(opts);
        }
    }

    function mockMissionVision(opts) {
        const subj = opts.subject || 'مادتي';
        return {
            mission: `[نموذج] رسالتي كمعلم ${subj} هي أن أكون شريكاً حقيقياً لطلابي في رحلتهم التعليمية، أُنمّي فيهم حبّ المعرفة والفضول العلمي، وأُسهم في بناء جيل يجمع بين التميّز الأكاديمي والقيم الإسلامية الأصيلة.`,
            vision:  `[نموذج] أتطلّع لأن أكون معلماً مُلهِماً يصنع الفرق، ويُخرّج طلاباً قادرين على مواجهة تحدّيات المستقبل بثقة وإبداع، منسجماً مع رؤية المملكة ٢٠٣٠ في جودة التعليم.`,
            goals:   `[نموذج]\n• تطوير مهاراتي المهنية من خلال الدورات المستمرة.\n• توظيف التقنية الحديثة في التدريس.\n• تحقيق نتائج متقدمة في الاختبارات الوطنية.\n• بناء بيئة صفية إيجابية ومُحفِّزة.`
        };
    }

    async function generateInitiativeReport(opts) {
        if (!(await hasApiKey())) return mockInitiativeReport(opts);
        const system = `أنت خبير تربوي سعودي. اكتب تقريراً احترافياً عن مبادرة تربوية نفّذها المعلم.
أرجع JSON فقط بالشكل:
{
  "introduction": "مقدمة عن المبادرة",
  "goals": ["الهدف ١", "الهدف ٢", "..."],
  "execution": "وصف تفصيلي للتنفيذ",
  "results": "النتائج والمخرجات",
  "impact": "الأثر على الفئة المستهدفة"
}`;
        const user = `
اسم المبادرة: ${opts.name}
تاريخ التنفيذ: ${opts.date || ''}
الفئة المستهدفة: ${opts.audience || ''}
عدد المستفيدين: ${opts.beneficiaries || ''}
وصف المبادرة: ${opts.description || ''}
عدد الصور المرفقة: ${opts.image_count || 0}
        `.trim();

        try {
            const out = await callClaudeJSON({ system, user, maxTokens: 2500, kind: 'initiative' });
            return normalizeInitiativeReport(out, opts);
        } catch (err) {
            console.warn('[AI] initiative report fallback:', err.message);
            global.TeacherApp.toast('تعذّر التوليد. تم استخدام نموذج تجريبي.', 'warning');
            return mockInitiativeReport(opts);
        }
    }

    function normalizeStrategyReport(out, opts) {
        return {
            introduction:    String(out?.introduction    || '').trim(),
            description:     String(out?.description     || '').trim(),
            steps:           Array.isArray(out?.steps) ? out.steps.map(String) : [],
            impact:          String(out?.impact          || '').trim(),
            recommendations: String(out?.recommendations || '').trim()
        };
    }

    function normalizeInitiativeReport(out, opts) {
        return {
            introduction: String(out?.introduction || '').trim(),
            goals:        Array.isArray(out?.goals) ? out.goals.map(String) : [],
            execution:    String(out?.execution    || '').trim(),
            results:      String(out?.results      || '').trim(),
            impact:       String(out?.impact       || '').trim()
        };
    }

    function mockStrategyReport(opts) {
        return {
            introduction:    `[نموذج] تُعدّ استراتيجية "${opts.name}" من الاستراتيجيات التدريسية الفعّالة التي تسهم في إشراك الطالب ببناء معرفته. طُبّقت هذه الاستراتيجية في درس ${opts.lesson || 'محدد'} بتاريخ ${opts.date || '—'}.`,
            description:     `[نموذج] تقوم الاستراتيجية على مبدأ التعلم النشط وإشراك الطلاب في بناء المعرفة من خلال التفاعل والنقاش وحل المشكلات.`,
            steps: [
                'تهيئة البيئة الصفية وتقسيم الطلاب.',
                'تقديم المهمة التعليمية بوضوح.',
                'توجيه الطلاب أثناء التنفيذ مع تقديم التغذية الراجعة.',
                'مناقشة النتائج وتلخيص أبرز المفاهيم.'
            ],
            impact:          `[نموذج] لوحظ تحسّن في تفاعل الطلاب ومشاركتهم الصفية، وارتفاع في مستوى الفهم والاستيعاب.`,
            recommendations: `[نموذج] يُوصى بتنويع الأنشطة وتوسيع استخدام الاستراتيجية في دروس أخرى.`
        };
    }

    function mockInitiativeReport(opts) {
        return {
            introduction: `[نموذج] جاءت مبادرة "${opts.name}" انطلاقاً من إيمان المعلم بدوره التربوي.`,
            goals: [
                'تعزيز قيم الانتماء والمسؤولية.',
                'تنمية المهارات الحياتية لدى الطلاب.',
                'نشر ثقافة العطاء والتطوع.'
            ],
            execution: `[نموذج] نُفّذت المبادرة على مراحل: التخطيط، ثم الإعداد، ثم التنفيذ الميداني، وأخيراً التقييم.`,
            results:   `[نموذج] تحقّقت جميع أهداف المبادرة بنسبة عالية، وشارك ${opts.beneficiaries || 'عدد جيد من'} الطلاب.`,
            impact:    `[نموذج] أسهمت المبادرة في تعزيز الروح الإيجابية لدى الطلاب وتنمية مهارات جديدة لديهم.`
        };
    }

    /** Read a weekly-schedule image with Claude vision and return cells.
     *  classes: list of teacher's classes — used so the model can map
     *  visible class labels back to real class_id values. */
    async function extractScheduleFromImage({ imageBase64, mediaType, classes, periodCount }) {
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
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text',  text: 'استخرج جدول الحصص من الصورة المرفقة وأعد JSON فقط حسب الشكل في التعليمات.' }
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

    /** Extract a clean list of Arabic student names from a roster image/PDF.
     *  Returns string[] (names only). The model is told to drop headers,
     *  numbers, IDs, and other roster decoration. */
    async function extractStudentNamesFromImage({ imageBase64, mediaType }) {
        const system = `أنت مساعد لاستخراج أسماء الطلاب من صور كشوف الفصول العربية.

مهمتك: اقرأ الصورة المرفقة واستخرج فقط أسماء الطلاب، اسم في كل سطر.
- تجاهل الترقيم، أرقام الهوية، الجنسية، تاريخ الميلاد، وأي بيانات أخرى.
- تجاهل العناوين والترويسة وأي نص ليس اسم طالب.
- نظّف الاسم من المسافات الزائدة لكن احتفظ به كما هو (لا تترجمه ولا تختصره).

أخرج JSON فقط:
{"names":["أحمد بن محمد","سارة بنت عبدالله", ...]}`;

        const user = [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text',  text: 'استخرج أسماء الطلاب من الصورة وأعد JSON فقط حسب الشكل المطلوب.' }
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
        generateExam, regenerateQuestion, generateWorksheet,
        generateStrategyReport, generateInitiativeReport,
        generateMissionVision,
        extractScheduleFromImage,
        extractStudentNamesFromImage,
        getUsage, clearUsage, estimateCost, PRICES,
        DEFAULT_MODEL
    };
})(window);
