// supabase/functions/delete-account/index.ts
//
// ── لماذا وُجدت هذه الدالّة ──
//
// حذفُ الحساب كان في خطوتين عند العميل: يمسح ملفاتِه من المخازن، ثمّ ينادي
// `delete_own_account` في القاعدة. والخطوةُ الأولى تجري على شبكة المعلّم،
// والثانيةُ تمضي بعدها ولو فشلت — وهو الصواب: لا يُحبس معلّمٌ في حسابٍ
// يريد حذفَه لأنّ شبكتَه تعثّرت.
//
// لكنّ ما يفوت المسحَ **يبقى إلى الأبد**: سياساتُ المخازن تُطابق المجلّد
// بـ`auth.uid()`، والمعرّفُ صاحبُ المجلّد لم يعد له وجود. فلا صاحبُها يصل
// إليها، ولا غيرُه، ولا صاحبُ المشروع من التطبيق.
//
// وجُرِّب حلٌّ في القاعدة — حذفُ السجلّات داخل `delete_own_account` نفسِها —
// **فكسر حذفَ الحساب**: سوبابيس تمنع الحذف المباشر من جداول التخزين
// («Direct deletion from storage tables is not allowed»)، فتُلغى المعاملةُ
// كلُّها ولا يُحذف الحساب. والمسحُ لا يكون إلّا عبر واجهة التخزين.
//
// فهذه الدالّة تحمل مفتاح الخدمة: تنادي **واجهةَ التخزين** فيزول الملفُّ
// وسجلُّه معاً، ثمّ تحذف الحساب. خطوةٌ واحدةٌ على الخادم لا تنقطع في
// منتصفها بانقطاع شبكة الجوّال.
//
// ── والضمانةُ الوحيدة التي يقوم عليها أمنُ هذا الملفّ ──
// **المعرّفُ يُؤخذ من رمز المنادي وحده، ولا يُقرأ من جسم الطلب إطلاقاً.**
// فلو قُرئ منه لصار أيُّ أحدٍ يحذف حسابَ أيِّ معلّمٍ برقمه — والمفتاحُ هنا
// يتجاوز كلَّ سياسات الأمان. لا تُضف وسيطاً بمعرّفٍ مهما بدا مفيداً.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* مخازنُ ملفات المعلّم — والقائمةُ نفسُها في `USER_BUCKETS` في auth.js.
   مخزنٌ جديدٌ يُضاف في الموضعين. */
const BUCKETS = ['evidence', 'portfolio'];   /* books أُقفل وحُذف ٢٦ أغسطس */

const PAGE  = 100;
const GUARD = 500;   // سقفُ الدورات: ٥٠ ألف ملفٍّ للمعلّم الواحد

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    });
}

/* ══ المسحُ يغوص في المجلّدات الفرعيّة ══
   `list` تُرجع مستوىً واحداً، والمجلّدُ الفرعيُّ يأتي فيها **مدخلاً
   بـ`id = null`** لا ملفاً. وكان يُمرَّر إلى `remove` كأنّه ملفّ، فلا
   يُحذف ولا ما فيه — فمن رفع في `uid/sub/x.jpg` بقيت ملفاتُه بعد زوال
   حسابه، بلا سبيلٍ لأحدٍ إليها. (كُشف بالاختبار، ٢٦ أغسطس ٢٠٢٦.)

   ومسارات التطبيق كلُّها مسطّحة (`uid/ملفّ`)، فالفجوةُ لمن يصنع مساره
   بيده — وهو بعينه من يُتوقّع منه ذلك. */
async function purgeFolder(
    admin: ReturnType<typeof createClient>, bucket: string, prefix: string, depth = 0
): Promise<number> {
    if (depth > 8) return 0;   /* عمقٌ لا يبلغه استعمالٌ سويّ */

    const entries: { name: string; id: string | null }[] = [];
    for (let i = 0; i < GUARD; i++) {
        const { data, error } = await admin.storage.from(bucket)
            .list(prefix, { limit: PAGE, offset: i * PAGE });
        if (error) throw error;
        if (!data || !data.length) break;
        entries.push(...data);
        if (data.length < PAGE) break;
    }

    const files   = entries.filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
    const folders = entries.filter((e) => e.id === null).map((e) => `${prefix}/${e.name}`);

    let removed = 0;
    for (let i = 0; i < files.length; i += PAGE) {
        const chunk = files.slice(i, i + PAGE);
        const { error } = await admin.storage.from(bucket).remove(chunk);
        if (error) throw error;
        removed += chunk.length;
    }
    for (const f of folders) removed += await purgeFolder(admin, bucket, f, depth + 1);
    return removed;
}

async function purgeBucket(admin: ReturnType<typeof createClient>, bucket: string, uid: string) {
    return purgeFolder(admin, bucket, uid);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    const url        = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceKey) return json({ error: 'Server missing service role key' }, 500);

    // ١) من أنت؟ — من رمزك أنت لا من جسم طلبك
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'Missing auth token' }, 401);

    const caller = createClient(url, anonKey);
    const { data: { user }, error: authErr } = await caller.auth.getUser(token);
    if (authErr || !user) return json({ error: 'Invalid auth token' }, 401);

    const uid = user.id;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // ٢) الملفاتُ أولاً — عبر واجهة التخزين، فيزول الملفُّ وسجلُّه معاً
    const purged: Record<string, number> = {};
    const failed: string[] = [];
    for (const bucket of BUCKETS) {
        try {
            purged[bucket] = await purgeBucket(admin, bucket, uid);
        } catch (e) {
            /* فشلُ مخزنٍ لا يُسقط أخاه، **ولا يمنع حذفَ الحساب**: شرطُ آبل
               أن يُحذف الحساب من داخل التطبيق، وحبسُ المعلّم فيه لأنّ مخزناً
               تعثّر أسوأُ من ملفٍّ بقي. ويُسجَّل ليُرى في سجلّ الدالّة. */
            console.error(`[delete-account] purge ${bucket} failed: ${(e as Error).message}`);
            failed.push(bucket);
        }
    }

    // ٣) ثمّ الحساب — ويتتالى معه كلُّ صفوف القاعدة (teachers → كلُّ الجداول)
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
        console.error('[delete-account] deleteUser failed: ' + delErr.message);
        return json({ error: 'تعذّر حذف الحساب. أعد المحاولة.' }, 500);
    }

    console.info(`[delete-account] ${uid} · purged=${JSON.stringify(purged)} · failed=${failed.join(',') || 'none'}`);
    return json({ ok: true, purged, failed });
});
