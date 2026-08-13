// supabase/functions/anthropic-proxy/index.ts
//
// ── لماذا لا يمرّر هذا البروكسي شيئاً ──
//
// كان يستقبل جسم الطلب ويمرّره حرفياً إلى Anthropic. وكان القيد الوحيد أن
// المنادي مسجَّلُ دخول — والدخول المجهول يُعطى بطلبٍ واحدٍ بجسمٍ فارغ. فأيّ
// أحدٍ على الإنترنت كان يستطيع إرسال أيّ نموذجٍ بأيّ تعليماتٍ بأيّ سؤال،
// والفاتورة على صاحب المشروع. والتعليمات التي تحصر النتيجة في «أسماء أو
// جدول» كانت في المتصفّح — أي في المكان الوحيد الذي لا يمرّ به المهاجم.
//
// فالآن لا يستقبل طلباً بل **نيّة**: `kind` وصورٌ لا غير. والتعليماتُ
// والنموذجُ يُبنيان هنا، والمخرَجُ **مفروضُ الشكل** بأداةٍ إجبارية
// (`tool_choice`) لا نصّاً حرّاً يُرجى أن يكون JSON. ثم يُفحص الشكل قبل
// أن يُعاد. فما يخرج من هنا لا يكون إلا مصفوفة أسماءٍ أو شبكة حصص —
// لا لأننا طلبنا ذلك من النموذج، بل لأن هذا الملف لا يعرف كيف يعيد غيره.
//
// وهذا وحده ما يجعل «الدخول كزائر» غير مؤذٍ: الجواز يفتح باباً لا يوصل
// إلا إلى قراءة كشفٍ أو جدول.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ANTHROPIC_URL     = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/* النموذج يُثبَّت هنا: لا يُقبل من العميل، فلا يُطلب نموذجٌ أغلى. */
const MODEL = 'claude-sonnet-4-5-20250929';

/* المخرَج يتّسع للصفحات: كشفٌ من عشرين صفحة لا تسعه أربعة آلاف توكن،
   فيُقصّ الردّ في منتصفه وتضيع أسماء بلا أن يدري أحد. */
const maxTokensFor = (pages: number) => Math.min(16000, 1500 + pages * 700);

/* سقوفٌ تمنع الاستنزاف بالحجم لا بالمحتوى.
   وMAX_PAGES ليس اختياراً منّا: مئة صورةٍ هو أقصى ما يقبله النموذج في
   الطلب الواحد. فالجدول الطويل والكشف الطويل يُقرآن كاملَين. */
const MAX_PAGES        = 100;
const MAX_IMAGE_CHARS  = 5_500_000;   // ~4MB بعد فكّ base64 — حدّ Anthropic 5MB
const MAX_TOTAL_CHARS  = 20_000_000;
const MAX_CLASSES      = 200;
const MAX_FIELD        = 120;
const MAX_NAMES        = 2000;   // كشفٌ من مئة صفحة يحتمل أكثر من ٤٠٠ اسم
const MAX_CELLS        = 600;

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ==========================================================================
   القوالب — المخرَج لا يخرج عنها
   ========================================================================== */

const NAMES_TOOL = {
    name: 'submit_names',
    description: 'سلّم أسماء الطلاب المستخرجة من الكشف.',
    input_schema: {
        type: 'object',
        properties: {
            names: { type: 'array', items: { type: 'string' }, description: 'أسماء الطلاب بالترتيب' },
        },
        required: ['names'],
    },
};

const SCHEDULE_TOOL = {
    name: 'submit_schedule',
    description: 'سلّم حصص الجدول الأسبوعي المستخرجة من الصورة.',
    input_schema: {
        type: 'object',
        properties: {
            cells: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        day:        { type: 'integer', description: '0=الأحد … 4=الخميس' },
                        period:     { type: 'integer' },
                        class_id:   { type: 'string' },
                        topic:      { type: 'string' },
                        unmatched:  { type: 'boolean' },
                        /* الفصل غير المعروف: حقولٌ منفصلة لا نصّاً واحداً.
                           فالنصّ «الأول/أ — علوم» كان يُقرأ عند العميل
                           بتخمينٍ هشّ، والنموذج يعرف تقسيمه أصلاً. */
                        new_grade:   { type: 'string', description: 'الصف كما هو مكتوب، مثل: الأول الثانوي' },
                        new_section: { type: 'string', description: 'الشعبة كما هي مكتوبة، مثل: أ' },
                        new_subject: { type: 'string', description: 'المادة إن كُتبت، وإلا اتركها فارغة' },
                    },
                    required: ['day', 'period'],
                },
            },
        },
        required: ['cells'],
    },
};

const NAMES_SYSTEM = `أنت مساعد لاستخراج أسماء الطلاب من صور كشوف الفصول العربية.

مهمتك: اقرأ كل الصور المرفقة (قد تكون عدة صفحات لقائمة طلاب واحدة) واستخرج فقط أسماء الطلاب من جميع الصفحات.
- تجاهل الترقيم، أرقام الهوية، الجنسية، تاريخ الميلاد، وأي بيانات أخرى.
- تجاهل العناوين والترويسة وأي نص ليس اسم طالب.
- نظّف الاسم من المسافات الزائدة لكن احتفظ به كما هو (لا تترجمه ولا تختصره).
- اجمع الأسماء من كل الصفحات في قائمة واحدة بالترتيب.

سلّم النتيجة عبر الأداة submit_names ولا تكتب شيئاً آخر.
وإن لم تكن الصور كشف أسماء، سلّم قائمة فارغة.`;

function scheduleSystem(list: string, periodCount: number): string {
    return `أنت مساعد لقراءة الجداول الدراسية المدرسية للمعلمين العرب.
الأيام: الأحد=0 الاثنين=1 الثلاثاء=2 الأربعاء=3 الخميس=4
أرقام الحصص من 1 إلى ${periodCount}

فصول المعلم المتاحة:
${list}

لكل خانة في الجدول، حدّد:
- day (0-4)
- period (1-N)
- class_id  (يجب أن يكون من القائمة أعلاه؛ التقط أفضل تطابق)
- topic     (الموضوع/الدرس إن وُجد، نص قصير)

إذا الخانة لفصل غير موجود في القائمة، اجعل unmatched=true واملأ:
- new_grade   (الصف كما هو مكتوب في الجدول)
- new_section (الشعبة)
- new_subject (المادة إن كانت مكتوبة، وإلا اتركها فارغة — لا تخمّنها)

سلّم النتيجة عبر الأداة submit_schedule ولا تكتب شيئاً آخر.
وإن لم تكن الصور جدولاً دراسياً، سلّم قائمة فارغة.`;
}

/* ==========================================================================
   المدخل
   ========================================================================== */

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    // 1) المنادي مسجَّلُ دخول
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Missing auth token' }, 401);

    const supabaseUrl     = Deno.env.get('SUPABASE_URL')      ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
    if (!anthropicApiKey) return json({ error: 'Server missing ANTHROPIC_API_KEY' }, 500);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid auth token' }, 401);

    // 2) نيّةٌ لا طلب
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Body must be JSON' }, 400);
    }

    const kind = String(body.kind ?? '');
    if (kind !== 'names' && kind !== 'schedule') {
        return json({ error: 'kind must be "names" or "schedule"' }, 400);
    }

    const pages = validatePages(body.pages);
    if (typeof pages === 'string') return json({ error: pages }, 400);

    // 3) الطلب يُبنى هنا — العميل لا يملك منه شيئاً
    let system: string;
    let tool: Record<string, unknown>;
    let ask: string;

    if (kind === 'names') {
        system = NAMES_SYSTEM;
        tool   = NAMES_TOOL;
        ask    = `هذه ${pages.length === 1 ? 'صورة' : pages.length + ' صفحة'} لكشف الفصل. استخرج أسماء الطلاب من الكل.`;
    } else {
        const periodCount = clampInt(body.periodCount, 1, 12, 7);
        system = scheduleSystem(classList(body.classes), periodCount);
        tool   = SCHEDULE_TOOL;
        ask    = `هذه ${pages.length === 1 ? 'صورة' : pages.length + ' صفحة'} للجدول الأسبوعي. استخرج كل الحصص.`;
    }

    const content = [
        ...pages.map((p) => ({
            type: 'image',
            source: { type: 'base64', media_type: p.media_type, data: p.data },
        })),
        { type: 'text', text: ask },
    ];

    const anthropicRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'content-type':      'application/json',
            'x-api-key':         anthropicApiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
            model:       MODEL,
            max_tokens:  maxTokensFor(pages.length),
            temperature: kind === 'names' ? 0.1 : 0.2,
            system,
            tools:       [tool],
            /* الإجبار: لا مخرَج إلا نداءُ هذه الأداة. */
            tool_choice: { type: 'tool', name: tool.name },
            messages:    [{ role: 'user', content }],
        }),
    });

    if (!anthropicRes.ok) {
        const detail = await anthropicRes.text();
        console.error('[proxy] anthropic ' + anthropicRes.status + ': ' + detail.slice(0, 400));
        /* لا يُعاد جسمُ الخطأ للعميل: قد يحمل تفاصيل الحساب. */
        return json({ error: 'تعذّر الاتصال بخدمة القراءة.' }, 502);
    }

    // 4) الشكل يُفحص قبل أن يُعاد — الأداة تُلزم، والفحص يتأكّد
    const data = await anthropicRes.json();
    const block = (data.content || []).find((b: Record<string, unknown>) => b.type === 'tool_use');
    if (!block) return json({ error: 'استجابة غير متوقّعة.' }, 502);

    const input = (block.input ?? {}) as Record<string, unknown>;
    const usage = data.usage ?? null;

    if (kind === 'names') {
        return json({ names: cleanNames(input.names), usage });
    }
    return json({ cells: cleanCells(input.cells), usage });
});

/* ==========================================================================
   الفحص
   ========================================================================== */

function validatePages(raw: unknown): { media_type: string; data: string }[] | string {
    if (!Array.isArray(raw) || raw.length === 0) return 'اختر ملفاً أولاً.';
    if (raw.length > MAX_PAGES) return `الملف أكثر من ${MAX_PAGES} صفحة — أقصى ما يُقرأ دفعةً واحدة.`;

    const out: { media_type: string; data: string }[] = [];
    let total = 0;
    for (const p of raw) {
        const mt = String((p as Record<string, unknown>)?.media_type ?? '');
        const d  = (p as Record<string, unknown>)?.data;
        if (!MEDIA_TYPES.includes(mt)) return 'صيغة الملف غير مدعومة.';
        if (typeof d !== 'string' || d.length === 0) return 'page data must be base64 text';
        if (d.length > MAX_IMAGE_CHARS) return 'إحدى الصفحات كبيرة جداً.';
        total += d.length;
        if (total > MAX_TOTAL_CHARS) return 'الملف كبير جداً — جرّب تقسيمه إلى ملفَّين.';
        out.push({ media_type: mt, data: d });
    }
    return out;
}

/* قائمة الفصول تُقصّ حقلاً حقلاً: العميل يملك نصّها، فلا تُترك تنتفخ.
   ولو حشا فيها ما حشا، فالمخرَج ما زال شبكةَ حصصٍ لا غير. */
function classList(raw: unknown): string {
    if (!Array.isArray(raw) || raw.length === 0) return '(لا توجد فصول مسجّلة)';
    return raw.slice(0, MAX_CLASSES).map((c) => {
        const o = (c ?? {}) as Record<string, unknown>;
        const f = (k: string) => String(o[k] ?? '').slice(0, MAX_FIELD).replace(/[\r\n]+/g, ' ');
        return `- id: ${f('id')} | الصف: ${f('grade')} | الشعبة: ${f('section')} | المادة: ${f('subject')}`;
    }).join('\n');
}

function cleanNames(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, MAX_NAMES)
        .map((n) => String(n ?? '').trim())
        .filter((n) => n.length > 0 && n.length < 200);
}

function cleanCells(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return [];
    const out: Record<string, unknown>[] = [];
    for (const c of raw.slice(0, MAX_CELLS)) {
        const o = (c ?? {}) as Record<string, unknown>;
        const day    = Number(o.day);
        const period = Number(o.period);
        if (!Number.isInteger(day) || day < 0 || day > 4) continue;
        if (!Number.isInteger(period) || period < 1 || period > 12) continue;
        const cell: Record<string, unknown> = { day, period };
        if (typeof o.class_id === 'string' && o.class_id) cell.class_id = o.class_id.slice(0, MAX_FIELD);
        if (o.unmatched === true) {
            cell.unmatched = true;
            const f = (k: string) => String(o[k] ?? '').slice(0, MAX_FIELD).trim();
            cell.new_grade   = f('new_grade');
            cell.new_section = f('new_section');
            cell.new_subject = f('new_subject');
        }
        cell.topic = typeof o.topic === 'string' ? o.topic.slice(0, MAX_FIELD) : '';
        out.push(cell);
    }
    return out;
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, Math.round(n)));
}

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
}
