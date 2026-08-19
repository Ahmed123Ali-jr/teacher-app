#!/usr/bin/env node
/* ==========================================================================
   check-fixed-surfaces.mjs — حبرٌ يتبع المظهر على سطحٍ لا يتبعه.

   العيبُ الذي يمسكه: قاعدةٌ تكتب خلفيّتها **لوناً فاتحاً مثبَّتاً**
   (‎#fff‎ أو الذهبيّ) ثم تكتب حبرَها من رمزٍ يتبدّل مع المظهر
   (`--ink-primary` أو `--text`). فيبقى السطحُ فاتحاً في الوضع الداكن
   ويصير الحبرُ فاتحاً معه — فيختفي.

   وقع هذا في تسعة مواضعَ (١٧ أغسطس ٢٠٢٦) حين طُلب أن يصير الحبرُ الكحليُّ
   الفاتحُ أبيضَ في الداكن: الذهبيُّ ستٌّ، و`.flogo .box` البيضاء واحدة.
   ولم يمسكها `contrast.html` لأن أكثرها لا يُرى إلا بحدث — حصةٌ جاريةٌ
   الآن، وبطاقةٌ مختارة، وعمودُ اليوم.

   يُشغَّل من جذر المستودع:
       node teacher_app/tools/check-fixed-surfaces.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';

const CSS  = 'teacher_app/css/views.css';
const DARK = 'teacher_app/css/theme-dark.css';

/* رموزُ حبرٍ تتبدّل بين المظهرين */
const THEMED_INK = ['--ink-primary', '--text'];

/* أسطحٌ فاتحةٌ مكتوبةٌ بالاسم لا بالرمز — لا تتبدّل من نفسها */
const FIXED_LIGHT = /#fff\b|#ffffff\b|#C9A961|#D6B96F|#ECEAE3|#E8D9A8/i;

/* استثناءاتٌ مقصودةٌ مع سببها */
const ALLOW = {
    '.pf-id-photo': 'مسرحُ الطباعة يقرأ لوحة print.css، والبطاقةُ ورقيّةٌ دائماً',
};

const css  = readFileSync(CSS, 'utf8');
const dark = readFileSync(DARK, 'utf8');

/* قواعدُ CSS بشكلها الخام: مُحدِّدٌ ثم جسم */
const rules = [];
const re = /([^{}@/]+)\{([^{}]*)\}/g;
let m;
while ((m = re.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@') || sel.startsWith('*')) continue;
    rules.push({ sel, body: m[2], at: css.slice(0, m.index).split('\n').length });
}

/* أرضيّةُ المُحدِّد **ومالكُها**: من قاعدته أو من أقرب سلفٍ يكتب خلفيّة.
   والمالكُ مهمٌّ لا الأرضيةُ وحدها: السؤالُ «هل يُقلب مالكُ السطح؟» لا
   «هل يُقلب أيُّ سلف؟» — فـ‏`.flogo` مقلوبةٌ في الداكن لكنّ ابنَتها
   `.flogo .box` تكتب `#fff` لنفسها، فلا يبلغها قلبُ أمّها. */
function surfaceOf(sel) {
    const own = rules.filter((r) => r.sel === sel && /background(-color)?\s*:/.test(r.body));
    if (own.length) return { body: own[own.length - 1].body, owner: sel };
    const parts = sel.split(' ');
    for (let k = parts.length - 1; k > 0; k--) {
        const parent = parts.slice(0, k).join(' ');
        const hit = rules.filter((r) => r.sel === parent && /background(-color)?\s*:/.test(r.body));
        if (hit.length) return { body: hit[hit.length - 1].body, owner: parent };
    }
    return { body: '', owner: '' };
}

/* هل يقلب `theme-dark` هذا المُحدِّد (أو سلفَه) خلفيّةً؟ */
function flippedInDark(sel) {
    const parts = sel.split(' ');
    /* مرشَّحاتٌ تُجرَّب: المُحدِّد كاملاً، ثم أسلافُه، ثم **أصلُ كل جزءٍ
       مركّب** — فـ‏`.class-card.card-light` يقلبها
       `body.theme-dark .class-card` لأنّ الأخيرَ أثقلُ ومعه `!important`. */
    /* **مالكُ السطح وحدَه** — لا أسلافُه: قلبُ الأمِّ لا يبلغ ابنةً تكتب
       خلفيّتها لنفسها (`.flogo` مقلوبةٌ و`.flogo .box` تكتب `#fff`). */
    const probes = [parts.join(' ')];
    /* والجزءُ الأخيرُ وحدَه: `theme-dark` يكتب مُحدِّداتٍ عامّةً مجرّدةً
       (`body.theme-dark .box`) تقلب أيَّ عنصرٍ بذلك الصنف أينما كان. */
    if (parts.length > 1) probes.push(parts[parts.length - 1]);
    for (const p of probes.slice()) {
        const bits = p.split(' ');
        const last = bits[bits.length - 1];
        const cls = last.split('.').filter(Boolean);
        if (cls.length > 1) {
            bits[bits.length - 1] = '.' + cls[0];
            probes.push(bits.join(' '));
        }
    }
    for (const probe of probes) {
        const esc = probe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        /* كلُّ مواضع ظهوره في الملفّ الداكن — ومعها ما يليها مباشرةً.
           فقد يُقلب المُحدِّدُ في موضعٍ ويُستثنى في آخر. */
        /* والحدُّ `\\s*[,{]` لازم: بدونه يلتقط `body.theme-dark .sch-card.wait .g`
           على أنّه قلبٌ لـ`.sch-card` — وهو قاعدةُ حبرٍ لحفيدٍ لا قلبُ سطح.
           فلا يُحسب القلبُ إلا حين ينتهي المُحدِّدُ عند هذا العنصر نفسِه. */
        const hits = dark.matchAll(new RegExp(
            'body\\.theme-dark ' + esc + '(:not\\(([^)]*)\\))?\\s*[,{]', 'g'));
        for (const h of hits) {
            /* حارسُ `:not(X)`: إن كان المُحدِّدُ الأصليُّ يحمل `X` فهذه
               القاعدةُ تستثنيه لا تقلبه — فلا تُحسب. وقعت هذه في
               `.sch-card.on::after`: الداكنُ يقلب `.sch-card:not(.on)`
               فظنّت الأداةُ أنّ البطاقةَ المختارةَ تُقلب، وهي مستثناة. */
            if (h[2] && sel.includes(h[2].trim())) continue;
            return probe;
        }
    }
    return null;
}

/* ══ حرزٌ ثانٍ: الثابتان لا يُعاد تعريفُهما في الداكن ══
   `--ink-fixed` و`--on-gold` حبرٌ على أسطحٍ فاتحةٍ لا تتبع المظهر. فلو
   عرَّفهما `theme-dark.css` لصارا فاتحَين على فاتح — وهو العطبُ الذي
   وُلدا لمنعه. ولا يمسكه الفحصُ الأول لأنّهما ليسا من رموز الحبر
   المتبدّلة، فيُسأل عنهما صراحةً. */
const FIXED_TOKENS = ['--ink-fixed', '--on-gold'];
const redefined = FIXED_TOKENS.filter((t) =>
    new RegExp('^\\s*' + t + '\\s*:', 'm').test(dark));

/* ══ الاتّجاه المعاكس: حبرٌ مثبَّتٌ على سطحٍ يتبع المظهر ══
   `--ink-fixed` و`--on-gold` لا يجوزان إلا حيث السطحُ **لا يتبدّل**. فإن
   وُضعا على سطحٍ يقلبه `theme-dark` صارا داكنَين على داكن — وهو العطبُ
   نفسُه مقلوباً. وقع هذا في ثلاثة مواضعَ يوم اعتُمد البترولي (١٨ أغسطس):
   صنّفتُها بيدي فأخطأت، فصار السؤالُ للأداة لا للذاكرة. */
const misfixed = [];
for (const r of rules) {
    if (!/color\s*:\s*[^;]*var\(\s*--(ink-fixed|on-gold)/.test(r.body)) continue;
    const { body: surf, owner } = surfaceOf(r.sel);
    if (!surf) continue;
    const flip = flippedInDark(owner);
    if (flip) misfixed.push({ ...r, owner, flip });
}

const found = [];
for (const r of rules) {
    const ink = THEMED_INK.find((t) => new RegExp('color\\s*:\\s*[^;]*var\\(\\s*' + t).test(r.body));
    if (!ink) continue;
    const { body: surf, owner } = surfaceOf(r.sel);
    if (!surf || !FIXED_LIGHT.test(surf)) continue;
    /* السطحُ فيه لونٌ فاتحٌ مثبَّت — هل يقلب الداكنُ **مالكَه**؟ */
    if (flippedInDark(owner)) continue;
    const why = Object.keys(ALLOW).find((k) => r.sel.includes(k));
    if (why) continue;
    found.push({ ...r, ink, owner, surf: surf.trim().replace(/\s+/g, ' ').slice(0, 70) });
}

if (redefined.length) {
    console.log('‼️  رمزٌ ثابتٌ أُعيد تعريفُه في `theme-dark.css`: '
        + redefined.join('، '));
    console.log('   هذان حبرٌ على سطحٍ لا يتبع المظهر — تعريفُهما هناك');
    console.log('   يجعلهما فاتحَين على فاتح. يُحذف التعريفُ من الملفّ الداكن.\n');
}

if (misfixed.length) {
    console.log('‼️  ' + misfixed.length + ' موضعاً: حبرٌ **مثبَّت** على سطحٍ **يتبع** المظهر\n');
    for (const f of misfixed) {
        console.log('   ' + CSS + ':' + f.at);
        console.log('      ' + f.sel);
        console.log('      سطحُه ' + f.owner + ' يقلبه الداكن عبر: ' + f.flip);
        console.log('      العلاج: يُبدَّل الحبرُ إلى var(--ink-primary) ليتبع السطح.');
        console.log('');
    }
}

if (!found.length && !redefined.length && !misfixed.length) {
    console.log('✅ لا حبرَ يتبع المظهر على سطحٍ فاتحٍ مثبَّت.');
} else if (!found.length && !misfixed.length) {
    console.log('✅ لا حبرَ على سطحٍ مثبَّت — لكنّ الرموزَ الثابتة أعلاه تُصلَح.');
} else {
    console.log('‼️  ' + found.length + ' موضعاً: الحبرُ يتبدّل والسطحُ لا يتبدّل\n');
    for (const f of found) {
        console.log('   ' + CSS + ':' + f.at);
        console.log('      ' + f.sel);
        console.log('      الحبر: var(' + f.ink + ')');
        console.log('      السطح: ' + f.owner + ' → ' + f.surf);
        console.log('');
    }
    console.log('العلاج: يُكتب لونُ الحبر صريحاً (‎#0F2C5C‎) — فالسطحُ لا يتبدّل،');
    console.log('        أو يُقلب السطحُ في `theme-dark.css` مع بقيّة الأسطح.');
}

if (Object.keys(ALLOW).length) {
    console.log('\nاستثناءاتٌ مقصودة:');
    for (const [k, v] of Object.entries(ALLOW)) console.log('   ' + k + ' — ' + v);
}

process.exit((found.length || redefined.length || misfixed.length) ? 1 : 0);
