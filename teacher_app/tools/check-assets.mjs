#!/usr/bin/env node
/* ==========================================================================
   check-assets.mjs — البند ‎١٫١‎: كلُّ ما تطلبه الصفحةُ **موجودٌ فعلاً**.

   العيبُ الذي يمسكه: وسمٌ يُرفَع (`?v=`) لملفٍّ لم يُدفع، أو مسارٌ يُكتب
   خطأً، أو ملفٌّ يُحذف ويبقى نداؤه. والنتيجةُ **شاشةٌ بيضاء** — لأنّ
   `index.html` تُحمّل ‎٧٤‎ ملفّاً بالترتيب، وسقوطُ واحدٍ يقطع ما بعده.

   ── ولماذا يُفحص المستودعُ لا المنشور ──
   لأنّه يُشغَّل **قبل** النشر لا بعده: في خطوة `Guards` بالـworkflow،
   فيسقط الدفعُ قبل أن يصل المعلّمين. وفحصُ المنشور يأتي متأخّراً — العطبُ
   يكون قد وصل.
   وبـ`--live` يُفحص المنشورُ أيضاً حين يُطلب صراحةً.

   ── وما لا يفعله ──
   **لا يتحقّق أنّ رقمَ الوسم رُفع.** ملفٌّ عُدِّل ووسمُه ثابتٌ يمرّ من هنا —
   يمسكه المعلّمُ حين يرى القديم. وذاك حارسٌ آخر لم يُبنَ بعد.

   يُشغَّل من جذر المستودع:
       node teacher_app/tools/check-assets.mjs
       node teacher_app/tools/check-assets.mjs --live
   ========================================================================== */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = 'teacher_app';
const PAGES = ['index.html', 'privacy.html', 'terms.html'];
const LIVE  = process.argv.includes('--live');
const ORIGIN = 'https://fusooli.com';

/* المصادرُ الخارجيّةُ لا تُفحص محلّيّاً — ليست في المستودع. */
const isExternal = (u) => /^(https?:)?\/\//.test(u) || u.startsWith('data:') || u.startsWith('#');

/** كلُّ ما تطلبه صفحةٌ من أصولٍ محلّيّة. */
function refsOf(page) {
    const html = readFileSync(join(ROOT, page), 'utf8');
    const out = [];
    const push = (raw, kind) => {
        if (!raw || isExternal(raw)) return;
        out.push({ raw, kind, path: raw.split('?')[0], page });
    };
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g))          push(m[1], 'script');
    for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g))           push(m[1], 'link');
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g))             push(m[1], 'img');
    /* `manifest.json` يذكر أيقوناتِ التثبيت — وسقوطُها لا يُرى في الشاشة
       لكنّه يكسر التثبيت على أندرويد. */
    return out;
}

function manifestIcons() {
    const p = join(ROOT, 'manifest.json');
    if (!existsSync(p)) return [];
    try {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        return (j.icons || []).map((i) => ({
            raw: i.src, kind: 'manifest', path: String(i.src).split('?')[0], page: 'manifest.json'
        })).filter((r) => !isExternal(r.raw));
    } catch { return []; }
}

const refs = [...PAGES.filter((p) => existsSync(join(ROOT, p))).flatMap(refsOf), ...manifestIcons()];

/* ── الفحصُ المحلّيّ ── */
const missing = [];
const seen = new Set();
for (const r of refs) {
    const key = r.page + '|' + r.raw;
    if (seen.has(key)) continue;
    seen.add(key);
    const onDisk = join(ROOT, r.path.replace(/^\//, ''));
    if (!existsSync(onDisk)) missing.push(r);
}

/* ── ووسومٌ مكرّرةٌ لملفٍّ واحد: نداءان بوسمين مختلفين يُحمَّلان مرّتين ── */
const byPath = new Map();
for (const r of refs) {
    if (r.kind !== 'script' && r.kind !== 'link') continue;
    const tag = (r.raw.split('?v=')[1] || '—');
    if (!byPath.has(r.path)) byPath.set(r.path, new Set());
    byPath.get(r.path).add(tag);
}
const forked = [...byPath.entries()].filter(([, tags]) => tags.size > 1);

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
let bad = missing.length + forked.length;

console.log('فُحص ' + seen.size + ' أصلاً في ' + PAGES.length + ' صفحاتٍ ومانيفست.\n');

if (missing.length) {
    console.log('‼️  ' + missing.length + ' أصلاً مفقوداً من المستودع:\n');
    for (const m of missing) console.log('   ' + pad(m.kind, 9) + pad(m.page, 14) + m.raw);
    console.log('');
}
if (forked.length) {
    console.log('‼️  ملفٌّ بوسمين مختلفين — يُحمَّل مرّتين:\n');
    for (const [p, tags] of forked) console.log('   ' + pad(p, 34) + [...tags].join(' · '));
    console.log('');
}

/* ── الفحصُ على المنشور، حين يُطلب ── */
if (LIVE) {
    console.log('── وعلى ' + ORIGIN + ' ──\n');
    const results = await Promise.all([...seen].map(async (key) => {
        const raw = key.split('|')[1];
        const url = ORIGIN + '/' + raw.replace(/^\//, '');
        try {
            const res = await fetch(url, { method: 'GET', redirect: 'follow' });
            return { raw, code: res.status };
        } catch (e) { return { raw, code: 'ERR' }; }
    }));
    const dead = results.filter((r) => r.code !== 200);
    bad += dead.length;
    if (dead.length) {
        console.log('‼️  ' + dead.length + ' أصلاً لا يردّ ‎200‎:\n');
        for (const d of dead) console.log('   ' + pad(String(d.code), 6) + d.raw);
    } else {
        console.log('✅ الأصولُ كلُّها تردّ ‎200‎ (' + results.length + ').');
    }
    console.log('');
}

if (!bad) console.log('✅ لا عيب — كلُّ أصلٍ تطلبه الصفحةُ موجود.');
else console.log('العلاج: أضف الملفَّ الناقص أو أصلح مساره، ووحّد الوسمَ المتفرّق.');

process.exit(bad ? 1 : 0);
