// supabase/functions/purge-user-files/index.ts
//
// ── تنظيفُ ملفاتِ حسابٍ زال — مهما كان الذي أزاله ──
//
// دالّةُ `delete-account` تُنظّف حين يحذف المعلّم حسابه **من التطبيق**.
// وحين يُحذف الحسابُ من لوحة التحكّم — أو بسكربتٍ، أو من أيّ بابٍ آخر —
// لا يعلم التطبيقُ شيئاً، فتبقى ملفاتُه إلى الأبد: سياساتُ المخازن تُطابق
// المجلّدَ بـ`auth.uid()`، والمعرّفُ لم يعد له وجود.
//
// فيُنقل التنظيفُ إلى حيث لا يمكن تجاوزُه: مُشغِّلٌ على `auth.users` نفسِه
// يُنادي هذه الدالّة عند كلّ حذف (الترحيل 20260826030000). فالحذفُ لا يتمّ
// إلّا بإزالة الصفّ، والمُشغِّلُ ملتصقٌ بالصفّ — فلا بابَ يفوته.
//
// ══ الحارس ══
//
// هذه الدالّة تُستدعى بمعرّفٍ في جسم الطلب — وهو بابٌ خطر: من عرفه حذف
// ملفاتِ أيّ معلّم. فشرطُها الذي لا تعمل بدونه:
//
//     **لا يُنظَّف مجلَّدٌ إلّا إذا ثبت أنّ صاحبَه غيرُ موجود.**
//
// فالمعرّفُ الحيُّ يُردّ بـ409 ولا يُمسّ له ملفّ. وحتى لو عرف العالمُ كلُّه
// هذا العنوان، فأقصى ما يفعلونه به تنظيفُ ملفاتٍ لا صاحبَ لها — وهو عملُها
// أصلاً. **أمانٌ من بناء الدالّة لا من كتمان سرّها.**
//
// وإن **تعذّر التأكّد** (خطأُ شبكةٍ أو خدمةٍ) فلا تنظيفَ إطلاقاً: الشكُّ
// يوقف، ولا يمضي.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* مخازنُ ملفات المعلّم. القائمةُ نفسُها في ثلاثة مواضع:
   `USER_BUCKETS` في js/auth.js · `BUCKETS` في delete-account · وهنا.
   مخزنٌ جديدٌ يُضاف في الثلاثة. */
const BUCKETS = ['books', 'evidence', 'portfolio'];

const PAGE  = 100;
const GUARD = 500;
const UUID  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
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
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const url        = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceKey) return json({ error: 'Server missing service role key' }, 500);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

    const uid = String(body.uid ?? '').trim();
    if (!UUID.test(uid)) return json({ error: 'uid must be a uuid' }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // ══ الحارس: أهذا المعرّفُ حيٌّ؟ ══
    const { data: found, error: lookupErr } = await admin.auth.admin.getUserById(uid);
    if (found && found.user) {
        console.warn(`[purge-user-files] رُفض: ${uid} حسابٌ حيّ`);
        return json({ error: 'user still exists — refusing to purge', uid }, 409);
    }
    if (lookupErr) {
        const missing = (lookupErr as { status?: number }).status === 404
                     || /not.?found/i.test(lookupErr.message || '');
        if (!missing) {
            /* لم نتأكّد — فلا نمسّ شيئاً. الشكُّ يوقف. */
            console.error(`[purge-user-files] تعذّر التحقّق من ${uid}: ${lookupErr.message}`);
            return json({ error: 'cannot verify user — refusing to purge' }, 503);
        }
    }

    const purged: Record<string, number> = {};
    const failed: string[] = [];
    for (const bucket of BUCKETS) {
        try {
            purged[bucket] = await purgeBucket(admin, bucket, uid);
        } catch (e) {
            console.error(`[purge-user-files] ${bucket} فشل: ${(e as Error).message}`);
            failed.push(bucket);
        }
    }

    const total = Object.values(purged).reduce((a, b) => a + b, 0);
    console.info(`[purge-user-files] ${uid} · حُذف ${total} · ${JSON.stringify(purged)} · فشل=${failed.join(',') || 'لا شيء'}`);
    return json({ ok: true, uid, purged, total, failed });
});
