#!/usr/bin/env node
/**
 * تنظيفُ حسابات الاختبار اليتيمة
 * =====================================================================
 * الفحصُ الأمنيُّ يُنشئ حساباتٍ حقيقيّةً ليقيس بها — وأكثرُها يُحذف في
 * حينه، لكنّ بعضَها ينجو: رمزٌ بطل قبل الحذف، أو سكربتٌ توقّف في منتصفه،
 * أو حسابُ زائرٍ طُوي ثمّ استُبدل. فتبقى صفوفٌ لا صاحبَ لها.
 *
 * ── ما يحميك من حذفٍ فادح ──
 * • **لا يحذف شيئاً بلا `--apply`.** يعرض ما سيحذفه أولاً، بالتفصيل.
 * • **ولا يمسّ إلّا ما يطابق نمطَ الاختبار** — والباقي يُعرض ويُترك:
 *     - حسابٌ مجهول (`is_anonymous`)
 *     - أو بريدٌ على `@mailinator.com` / `@example.com`
 *   وأيُّ بريدٍ حقيقيٍّ آخر **لا يُلمس أبداً**، ولو كان قديماً.
 * • ويتوقّف فوراً إن تعذّر جلبُ القائمة — الشكُّ يوقف ولا يمضي.
 *
 * ── الاستعمال (بلا أثرٍ في سجلّ الطرفيّة) ──
 *   انسخ مفتاحَ الخدمة إلى الحافظة، ثمّ:
 *     SUPABASE_SERVICE_KEY="$(pbpaste)" node tools/purge-orphan-accounts.mjs
 *     SUPABASE_SERVICE_KEY="$(pbpaste)" node tools/purge-orphan-accounts.mjs --apply
 *
 * **المفتاحُ من الحافظة لا من سطر الأوامر** — فما يُكتب في السطر يبقى في
 * `~/.zsh_history` ويظهر في `ps` لكلّ من على الجهاز.
 *
 * ── ولماذا لا يكفي حذفُ الصفّ ──
 * حذفُ المستخدم يُطلق مُشغِّلَ `on_auth_user_deleted` الذي ينادي دالّةَ
 * `purge-user-files` فتُنظَّف ملفاتُه في المخازن. فالحذفُ من هنا يمرّ
 * بنفس المسار الذي يمرّ به حذفُ المعلّم من التطبيق — لا يترك يتامى جدد.
 * =====================================================================
 */

const URL_BASE = process.env.SUPABASE_URL || 'https://rbsfpsmolxldmwcclhlc.supabase.co';
const KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY    = process.argv.includes('--apply');
const PAGE     = 200;

const TEST_MAIL = /@(mailinator\.com|example\.com|test\.local)$/i;

if (!KEY) {
    console.error('✋ لا مفتاح. انسخه إلى الحافظة ثمّ:\n'
        + '   SUPABASE_SERVICE_KEY="$(pbpaste)" node tools/purge-orphan-accounts.mjs');
    process.exit(1);
}
if (!/^(sb_secret_|eyJ)/.test(KEY)) {
    console.error('✋ هذا لا يشبه مفتاحَ خدمة. السرّيُّ يبدأ بـ sb_secret_ (أو eyJ للقديم).');
    console.error('   تأكّد أنك نسختَ `service_role` لا `publishable`.');
    process.exit(1);
}

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };

async function api(path, init) {
    const res = await fetch(URL_BASE + path, { ...init, headers: { ...H, ...(init?.headers || {}) } });
    if (!res.ok) throw new Error(path + ' ← ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return res.status === 204 ? null : res.json();
}

/** كلُّ المستخدمين. يرمي عند أيّ فشل — قائمةٌ ناقصةٌ لا يُبنى عليها حذف. */
async function allUsers() {
    const out = [];
    for (let page = 1; page <= 100; page++) {
        const body = await api(`/auth/v1/admin/users?page=${page}&per_page=${PAGE}`);
        const users = Array.isArray(body) ? body : (body.users || []);
        if (!users.length) break;
        out.push(...users);
        if (users.length < PAGE) break;
    }
    return out;
}

const main = async () => {
    console.log(`\n🔎 المشروع: ${URL_BASE}`);
    console.log(APPLY ? '⚠️  الوضع: حذفٌ فعليّ (--apply)\n' : 'ℹ️  الوضع: عرضٌ فقط — لا يُحذف شيء\n');

    const users = await allUsers();
    if (!users.length) { console.log('لا حسابات إطلاقاً. لا شيء ليُعمل.\n'); return; }

    const doomed = [], kept = [];
    for (const u of users) {
        const anon = !!u.is_anonymous;
        const test = u.email && TEST_MAIL.test(u.email);
        (anon || test ? doomed : kept).push({ ...u, why: anon ? 'زائرٌ مجهول' : 'بريدُ اختبار' });
    }

    console.log(`👤 المجموع: ${users.length} حساباً\n`);

    if (kept.length) {
        console.log(`🛡️  يبقى بلا مساس (${kept.length}):`);
        kept.forEach((u) => console.log(`     ${u.email || '(بلا بريد)'}  ·  أُنشئ ${(u.created_at||'').slice(0,10)}`));
        console.log('');
    }

    if (!doomed.length) { console.log('✅ لا يتامى. لا شيء ليُحذف.\n'); return; }

    console.log(`🗑️  مرشَّحٌ للحذف (${doomed.length}):`);
    doomed.forEach((u) => console.log(
        `     ${(u.email || '(زائر)').padEnd(34)} ${u.why.padEnd(12)} أُنشئ ${(u.created_at||'').slice(0,10)}  ${u.id.slice(0,8)}…`));

    if (!APPLY) {
        console.log('\nللحذف فعلاً أضف --apply\n');
        return;
    }

    console.log('\n⏳ يبدأ الحذفُ بعد ٥ ثوانٍ — Ctrl+C للإيقاف…');
    await new Promise((r) => setTimeout(r, 5000));

    let ok = 0, fail = 0;
    for (const u of doomed) {
        try { await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' }); ok++; }
        catch (e) { fail++; console.error(`   ❌ ${u.id.slice(0,8)}… ${e.message}`); }
        process.stdout.write(`   حُذف ${ok}/${doomed.length}\r`);
    }
    console.log(`\n\n✅ حُذف ${ok} حساباً${fail ? ` · فشل ${fail}` : ''}.`);
    console.log('   (ومُشغِّلُ on_auth_user_deleted نظّف ملفاتِهم في المخازن.)\n');
};

main().catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
