/* ==========================================================================
   check-active-states.mjs — حارسُ الحالات المضغوطة.

   شغّله بعد أي تعديلٍ على ملفّي المظهر:
       node teacher_app/tools/check-active-states.mjs

   ── العيبُ الذي يمنعه ──
   `theme-white.css` و`theme-dark.css` يقلبان أرضياتِ عشراتِ الأصناف بقائمةٍ
   واحدة تنتهي بـ‏`background: … !important`‎. والصنفُ الذي له حالةٌ مختارة
   (`.on`) تكون أرضيّتُه فيها كحليّةً وكتابتُه بيضاء — فإن دخل القائمةَ بلا
   حارسٍ مُحيت أرضيّتُه في تلك الحالة وبقيت الكتابةُ البيضاء على بيضاء:
   تباينٌ ‎1:1‎. الاختيارُ قائمٌ في الذاكرة، غيرُ مرئيٍّ في الشاشة.

   وقع ستَّ مرّات: «✓ تم» في الجدول، ثم `.sch-gcell` (الصف) و`.sch-sec`
   (الشعبة) و`.sch-card` و`.mvs-tab` و`.dp-item` — كلُّها وصلت جهاز المعلّم
   ولم يمسكها إلا هو. و`contrast.html` لا يمكنها أن تمسكها بمرورها الأول:
   تمشي على الشاشات في حالتها الأولى فلا ترى `.on` قطّ (ولهذا أُضيف إليها
   مرورُ الضغط، وهذا الملفّ حارسُه الساكن الذي لا يحتاج متصفّحاً).

   ── العلاج ──
   `:not(.on)` على المُحدِّد في قائمة المظهر — فيُقلب الزرُّ في حالته
   الهادئة وتبقى حالتُه المختارة كما صُمِّمت.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS   = join(dirname(fileURLToPath(import.meta.url)), '..', 'css');
const VIEWS = join(CSS, 'views.css');
const THEMES = [join(CSS, 'theme-white.css'), join(CSS, 'theme-dark.css')];

const STATES = ['on', 'active', 'is-active', 'selected'];

/* ── استثناءاتٌ مقصودة ──
   قلبُ المظهر ليس عيباً دائماً: هنا الحالةُ المختارة نفسُها تكتب لوناً
   فاتحاً صريحاً، فقلبُها **هو** العلاج، وحراستُها بـ‏`:not()`‎ تصنع العيب
   الذي نطارده. تُكتب مع سببها ليُراجَع لا ليُنسى. */
const ALLOWED = {
    'att-stat': 'حالتُها المختارة تخلط مع ‎#fff‎ صريحاً — فتصير شبه بيضاء ' +
                'على الداكن. قلبُ المظهر يحميها، وحدُّها الملوّن يبقى علامةَ ' +
                'الاختيار.'
};

/** كلُّ صنفٍ له قاعدةُ حالةٍ نشطة في `views.css`، ومعه ما تُعلنه. */
function activeClasses(src) {
    const found = new Map();
    const re = new RegExp(
        '\\.([a-z][\\w-]*)\\.(' + STATES.join('|') + ')\\b[^{]*\\{([^}]*)\\}', 'g');
    let m;
    while ((m = re.exec(src))) {
        const [, cls, state, body] = m;
        const rec = found.get(cls) || { states: new Set(), whiteInk: false };
        rec.states.add(state);
        /* كتابةٌ بيضاء في الحالة المختارة = العيبُ يصير خفاءً تامّاً لا خفوتاً. */
        if (/(^|[;\s])color\s*:\s*(#fff\b|#ffffff\b|white\b)/i.test(body)) rec.whiteInk = true;
        found.set(cls, rec);
    }
    return found;
}

/** الأصنافُ التي يقلب هذا المظهرُ أرضيّتها، ومعها حالةُ الحارس. */
function paintedClasses(src) {
    const out = new Map();
    const blocks = src.match(/[^{}]+\{[^}]*\}/g) || [];
    for (const b of blocks) {
        const i = b.lastIndexOf('{');
        const sel = b.slice(0, i);
        const body = b.slice(i);
        if (!/background/.test(body)) continue;
        for (const part of sel.split(',')) {
            const m = part.match(/\.([a-z][\w-]*)/g);
            if (!m) continue;
            /* آخرُ صنفٍ في الجزء هو المقصود؛ ما قبله سياقُ المظهر. */
            const cls = m[m.length - 1].slice(1);
            if (['theme-dark', 'theme-auto', 'dark-active', 'theme-light'].includes(cls)) continue;
            const guarded = new RegExp('\\.' + cls + '\\s*:not\\(\\s*\\.(' + STATES.join('|') + ')\\s*\\)')
                .test(part);
            const prev = out.get(cls);
            /* موضعٌ واحدٌ بلا حارسٍ يكفي للعيب. */
            if (!prev || prev.guarded) out.set(cls, { guarded, sel: part.trim().slice(0, 72) });
        }
    }
    return out;
}

const views  = readFileSync(VIEWS, 'utf8');
const active = activeClasses(views);

let bad = 0;
for (const file of THEMES) {
    const painted = paintedClasses(readFileSync(file, 'utf8'));
    const hits = [];
    for (const [cls, info] of painted) {
        const a = active.get(cls);
        if (!a || info.guarded || ALLOWED[cls]) continue;
        hits.push({ cls, states: [...a.states].join('/'), white: a.whiteInk, sel: info.sel });
    }
    const name = file.split('/').pop();
    if (!hits.length) { console.log('✅ ' + name + ' — كلُّ ذي حالةٍ محروس.'); continue; }
    console.log('\n❌ ' + name + ' — ' + hits.length + ' بلا حارس:');
    for (const h of hits.sort((x, y) => y.white - x.white)) {
        console.log('   ' + (h.white ? '‼️ خفاءٌ تامّ' : '⚠️ يخفت  ') +
                    '  .' + h.cls + '  (.' + h.states + ')');
        console.log('      ' + h.sel);
        console.log('      العلاج: .' + h.cls + ':not(.' + [...active.get(h.cls).states][0] + ')');
        bad++;
    }
}

const skipped = Object.keys(ALLOWED);
if (skipped.length) {
    console.log('\nاستثناءاتٌ مقصودة:');
    for (const c of skipped) console.log('   .' + c + ' — ' + ALLOWED[c]);
}

if (bad) {
    console.log('\nالمجموع: ' + bad + ' موضعاً يحتاج `:not()`.');
    process.exit(1);
}
console.log('\nلا عيب.');
