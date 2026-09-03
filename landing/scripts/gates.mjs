/* بوّاباتُ ما قبل الشحن — تكسر البناءَ بدل أن تُكتشف بعده.
   والتعليقاتُ تُنزع قبل الفحص: قاعدةٌ تشتكي من تعليقٍ يشرحها بلاغٌ كاذب،
   والبلاغُ الكاذب يعلّم القارئَ أن يتجاهل البوّابة. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
});

const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))   // تعليقاتُ الكتل
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

const files = ['app', 'components'].flatMap(walk)
    .map((f) => ({ f, lines: strip(readFileSync(f, 'utf8')).split('\n') }));

let fail = 0;
const check = (name, re, why) => {
    const hits = files.flatMap(({ f, lines }) =>
        lines.map((l, i) => ({ f, n: i + 1, l: l.trim() })).filter((x) => re.test(x.l)));
    if (hits.length) {
        fail++;
        console.error(`✗ ${name} — ${why}`);
        hits.slice(0, 8).forEach((h) => console.error(`    ${h.f}:${h.n}  ${h.l.slice(0, 90)}`));
    } else console.log(`✓ ${name}`);
};

// ‎font-bold‎ في تايلويند = ‎٧٠٠‎ وهو مسموح؛ الممنوعُ ما فوقه.
check('لا وزنَ فوق ٧٠٠', /(font-weight|fontWeight)\s*:\s*['"]?(800|900|bolder)|\bfont-(black|extrabold)\b/,
    'العائلةُ تنتهي عند ٧٠٠ — وما فوقه يزوّره المتصفّح تغليظاً صناعيّاً (main.css:102)');

check('لا أصنافَ اتّجاهٍ فيزيائيّة', /\b(pl-|pr-|ml-|mr-|left-|right-|text-left|text-right)\d/,
    'تُكسر في RTL — استعمل ps-/pe-/ms-/me-/start-/end-/text-start/text-end');

// الصفرُ هو القاعدة؛ الممنوعُ كلُّ قيمةٍ غيرِه.
// كِلا الصيغتين: ‎letter-spacing‎ في CSS و‎letterSpacing‎ في نمط JSX السطريّ
check('لا تتبّعَ حروفٍ غيرِ الصفر', /(letter-spacing|letterSpacing)\s*:\s*['"]?(?!0\s*['"]?\s*[;},])(-?[.\d])/,
    'الخاصّيّةُ تُقحَم بين المحارف بعد التشكيل: الموجبُ يفكّ الوصل والسالبُ يشبك النقاط');

check('لا ضبطَ للنصّ', /(text-align|textAlign)\s*:\s*['"]?justify|\btext-justify\b/,
    'العربيّةُ بلا كشيدةٍ تتمدّد بفجوات');

check('لا mix-blend-mode', /(mix-blend-mode|mixBlendMode)\s*:/,
    'يُجبر المتصفّحَ على قراءة الخلفيّة ومزجِها في كلّ إطار');

// ‎blur(0)‎ هو حالةُ النهاية (رفعُ التمويه) — والممنوعُ نصفُ قطرٍ كبير.
check('لا تمويهَ واسع', /(backdrop-filter|backdropFilter)\s*:|(filter|WebkitFilter)\s*:\s*['"]?blur\(\s*(?:[2-9]\d|\d{3,})px/,
    'التوهّجُ مرسومٌ لا مُرشَّح — التمويهُ الواسعُ يُعيد الترشيحَ في كلّ إطار');

/* ماركداون في نصٍّ يُعرَض يظهر نجمتين على الشاشة. والتعليقاتُ منزوعةٌ
   سلفاً، فما بقي منها فهو نصُّ واجهةٍ حقيقيّ. */
check('لا ماركداون في النصّ المعروض', /(['"`])[^'"`]*\*\*[^'"`]*\1/,
    'النجمتان تُطبعان حرفيّاً — استعمل <strong> لتشديدٍ حقيقيّ');

check('لا translateX في الظهور', /@keyframes[\s\S]{0,200}?translateX/,
    'التحويلاتُ لا تنقلب في RTL — كلُّ حركةِ دخولٍ رأسيّة');

process.exit(fail ? 1 : 0);
