#!/usr/bin/env node
/**
 * تنظيفُ ملفاتِ الحسابات المحذوفة
 * =====================================================================
 * كلُّ ملفٍّ في المشروع يسكن مجلّداً باسم معرّف صاحبه:
 *     books/<uid>/…   ·   evidence/<uid>/…   ·   portfolio/<uid>/…
 *
 * وحين يُحذف حسابٌ دون أن تُمسح ملفاتُه (شبكةٌ انقطعت قبل أن تُبنى دالّةُ
 * الحافّة، أو حسابٌ حُذف من لوحة التحكّم مباشرةً) تبقى ملفاتُه **إلى
 * الأبد**: سياساتُ المخازن تُطابق المجلّد بـ`auth.uid()`، والمعرّفُ صاحبُ
 * المجلّد لم يعد له وجود — فلا صاحبُها يصل إليها، ولا غيرُه، ولا أنت من
 * داخل التطبيق. ولا تُحذف بـSQL كذلك: سوبابيس تمنع الحذفَ المباشر من
 * جداول التخزين.
 *
 * فهذا السكربت يفعلها من الخارج بمفتاح الخدمة: يقرأ مجلّدات كل مخزن،
 * ويسأل قائمةَ المستخدمين الفعليّة، ويحذف ما لا صاحبَ له.
 *
 * ── الاستعمال ──
 *   export SUPABASE_SERVICE_KEY='<مفتاحُ الخدمة السرّي>'
 *   node tools/purge-orphan-files.mjs              # يعرض ولا يحذف
 *   node tools/purge-orphan-files.mjs --apply      # يحذف فعلاً
 *
 * **المفتاحُ يُقرأ من متغيّر البيئة لا من سطر الأوامر** — فما يُكتب في
 * السطر يبقى في `~/.zsh_history` ويظهر في `ps` لكل من على الجهاز.
 *
 * ── ما يحميك من خطأٍ فادح ──
 * • لا يحذف شيئاً بلا `--apply`، ويعرض ما سيحذفه أوّلاً.
 * • ومع `--apply` ينتظر خمسَ ثوانٍ قبل أن يبدأ (Ctrl+C يوقفه).
 * • ويتوقّف فوراً إن تعذّر جلبُ قائمة المستخدمين — فقائمةٌ ناقصةٌ تعني
 *   حذفَ ملفات حساباتٍ **حيّة**. لا يعمل على شكٍّ أبداً.
 * • ولا يمسّ ما ليس في مجلّدٍ باسم معرّف (يعرضه ويتركه).
 * =====================================================================
 */

const URL_BASE = process.env.SUPABASE_URL || 'https://rbsfpsmolxldmwcclhlc.supabase.co';
const KEY      = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY    = process.argv.includes('--apply');
const BUCKETS  = ['books', 'evidence', 'portfolio'];
const PAGE     = 1000;

if (!KEY) {
    console.error('✋ لا مفتاح. صدّره أولاً:\n   export SUPABASE_SERVICE_KEY=\'<مفتاح الخدمة>\'');
    process.exit(1);
}
if (!/^(sb_secret_|eyJ)/.test(KEY)) {
    console.error('✋ هذا لا يشبه مفتاحَ خدمة. المفتاحُ السرّيُّ يبدأ بـ sb_secret_ (أو eyJ للقديم).');
    process.exit(1);
}

const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'content-type': 'application/json' };
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

async function api(path, init) {
    const res = await fetch(URL_BASE + path, { ...init, headers: { ...H, ...(init?.headers || {}) } });
    if (!res.ok) throw new Error(path + ' ← ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return res.json();
}

/** كلُّ المستخدمين الأحياء. يرمي عند أيّ فشل — والتوقّفُ أسلمُ من قائمةٍ ناقصة. */
async function liveUsers() {
    const ids = new Set();
    for (let page = 1; page <= 200; page++) {
        const body = await api(`/auth/v1/admin/users?page=${page}&per_page=${PAGE}`);
        const users = Array.isArray(body) ? body : (body.users || []);
        if (!users.length) break;
        for (const u of users) ids.add(u.id);
        if (users.length < PAGE) break;
    }
    if (!ids.size) throw new Error('قائمةُ المستخدمين فارغة — لا يُحذف شيءٌ على هذا.');
    return ids;
}

/** محتوياتُ مسارٍ في مخزن. المجلّداتُ تأتي بـ id = null. */
async function list(bucket, prefix) {
    const out = [];
    for (let offset = 0; offset < 100000; offset += PAGE) {
        const rows = await api(`/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
        });
        if (!rows.length) break;
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

async function removeAll(bucket, paths) {
    for (let i = 0; i < paths.length; i += 500) {
        const chunk = paths.slice(i, i + 500);
        await api(`/storage/v1/object/${bucket}`, {
            method: 'DELETE',
            body: JSON.stringify({ prefixes: chunk })
        });
        process.stdout.write(`      حُذف ${Math.min(i + chunk.length, paths.length)}/${paths.length}\r`);
    }
    process.stdout.write('\n');
}

const main = async () => {
    console.log(`\n🔎 المشروع: ${URL_BASE}`);
    console.log(APPLY ? '⚠️  الوضع: حذفٌ فعليّ (--apply)\n' : 'ℹ️  الوضع: عرضٌ فقط — لا يُحذف شيء\n');

    const users = await liveUsers();
    console.log(`👤 حساباتٌ حيّة: ${users.size}\n`);

    let grandFiles = 0, grandBytes = 0;
    const plan = [];

    for (const bucket of BUCKETS) {
        const entries = await list(bucket, '');
        const folders = entries.filter((e) => e.id === null).map((e) => e.name);
        const loose   = entries.filter((e) => e.id !== null).map((e) => e.name);
        const orphans = folders.filter((f) => !users.has(f));

        let files = 0, bytes = 0;
        const paths = [];
        for (const f of orphans) {
            for (const o of await list(bucket, f)) {
                if (o.id === null) continue;                   // مجلّدٌ متداخل — نادر
                paths.push(`${f}/${o.name}`);
                files++;
                bytes += Number(o.metadata?.size || 0);
            }
        }

        console.log(`📦 ${bucket}`);
        console.log(`   مجلّدات: ${folders.length}  ·  بلا صاحب: ${orphans.length}`);
        console.log(`   ملفاتٌ يتيمة: ${files}  ·  الحجم: ${mb(bytes)}`);
        if (loose.length) console.log(`   ⚠️  ${loose.length} ملفاً خارج مجلّدات المعرّفات — لن يُمسّ`);
        for (const f of orphans.slice(0, 5)) console.log(`      • ${f.slice(0, 8)}…`);
        if (orphans.length > 5) console.log(`      • …و${orphans.length - 5} غيرها`);
        console.log('');

        grandFiles += files; grandBytes += bytes;
        if (paths.length) plan.push({ bucket, paths });
    }

    console.log('─'.repeat(52));
    console.log(`الإجمالي: ${grandFiles} ملفاً · ${mb(grandBytes)}`);

    if (!grandFiles) { console.log('\n✅ لا يتامى. لا شيء ليُعمل.\n'); return; }
    if (!APPLY) {
        console.log('\nللحذف فعلاً:  node tools/purge-orphan-files.mjs --apply\n');
        return;
    }

    console.log('\n⏳ يبدأ الحذفُ بعد ٥ ثوانٍ — Ctrl+C للإيقاف…');
    await new Promise((r) => setTimeout(r, 5000));
    for (const { bucket, paths } of plan) {
        console.log(`   🗑️  ${bucket}: ${paths.length} ملفاً`);
        await removeAll(bucket, paths);
    }
    console.log(`\n✅ حُذف ${grandFiles} ملفاً (${mb(grandBytes)}).\n`);
};

main().catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
