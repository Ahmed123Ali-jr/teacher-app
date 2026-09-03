/* بوّابةُ بناء: تقيس أزواجَ أسطر عنوان الهيرو على الخطّ الحقيقيّ،
   وتكسر البناءَ إن ضاق الشريطُ الخالي بين نازلةِ سطرٍ وصاعدةِ ما بعده.
   فأيُّ تغييرٍ في النصّ يُكشف قبل الشحن لا بعده. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FONT = 'public/fonts/plex-700-ar.woff2';
const LH = 1.20, ASC = 1.085, CONTENT = 1.5;
const MIN_BAND = 0.08;   // em — أدنى شريطٍ خالٍ مقبول

// النصُّ يُقرأ من المصدر لا يُكتب هنا — فلا يفترقان
const src = readFileSync('components/sections/Hero.tsx', 'utf8');
const block = src.match(/const LINES[^=]*=\s*\[([\s\S]*?)\];/)?.[1] ?? '';
const LINES = [...block.matchAll(/\[([^\]]*)\]/g)]
    .map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((w) => w[1]).join(' '))
    .filter(Boolean);
if (LINES.length < 2) { console.error('✗ تعذّر قراءةُ أسطر العنوان من Hero.tsx'); process.exit(1); }

const py = `
import json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
t=TTFont(${JSON.stringify(FONT)}); gs=t.getGlyphSet(); cm=t.getBestCmap(); upm=t['head'].unitsPerEm
def bounds(s):
    lo,hi=0.0,0.0
    for ch in s:
        n=ord(ch)
        if n not in cm: continue
        bp=BoundsPen(gs); gs[cm[n]].draw(bp)
        if bp.bounds:
            lo=min(lo,bp.bounds[1]/upm); hi=max(hi,bp.bounds[3]/upm)
    return [lo,hi]
print(json.dumps([bounds(l) for l in json.loads(sys.argv[1])]))
`;
/* القياسُ يحتاج fontTools — وهي موجودةٌ على جهاز التطوير لا على آلة البناء.
   فغيابُها **تخطٍّ لا سقوط**: البوّابةُ تحرس تغييرَ النصّ وقتَ التحرير، ولا
   يصحّ أن تُسقط نشرةً بسبب أداةٍ ناقصةٍ في بيئةٍ أخرى. أمّا خطأٌ حقيقيٌّ في
   القياس (نصٌّ متصادم) فيُسقط البناءَ كما يجب. */
let b;
try {
    b = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify(LINES)], { encoding: 'utf8' }));
} catch (e) {
    const why = String(e.stderr || e.message || '');
    if (/ModuleNotFoundError|No module named|not found|ENOENT/i.test(why)) {
        console.log('⚠ fontTools غير متاحة هنا — تُخطّى بوّابةُ قياس العنوان');
        console.log('  (تعمل على جهاز التطوير: python3 -m pip install fonttools brotli)');
        process.exit(0);
    }
    throw e;
}

const halfLead = (LH - CONTENT) / 2;
const baseline = halfLead + ASC;          // من أعلى الصندوق
let worst = Infinity, worstPair = '';
for (let i = 0; i < b.length - 1; i++) {
    const descTip = baseline - b[i][0];               // ذيلُ السطر i
    const nextInk = LH + baseline - b[i + 1][1];      // حبرُ السطر i+1
    const band = nextInk - descTip;
    console.log(`السطر ${i + 1}→${i + 2}: شريطٌ خالٍ ${band.toFixed(4)}em` +
        `  (${(band * 103.68).toFixed(1)}px عند ١٠٤px · ${(band * 40).toFixed(1)}px عند ٤٠px)`);
    if (band < worst) { worst = band; worstPair = `${i + 1}→${i + 2}`; }
}
console.log(`\nأضيقُ زوج: ${worstPair} عند ${worst.toFixed(4)}em`);
// الخطُّ الذهبيُّ تحت السطر الأوّل وحدَه — فوسطُه يُحسب من زوجه هو لا من أضيقِ زوج
const band1 = (LH + baseline - b[1][1]) - (baseline - b[0][0]);
const mid1 = (baseline - b[0][0]) + band1 / 2 - LH;
console.log(`وسطُ شريط السطر الأوّل = ${mid1.toFixed(4)}em تحت حافّة الصندوق` +
    `  ⇒  .gold-underline::after { bottom: ${mid1.toFixed(3)}em }`);
if (worst < MIN_BAND) {
    console.error(`✗ الشريطُ أضيقُ من الحدّ ${MIN_BAND}em — عدّل النصّ أو ارفع line-height`);
    process.exit(1);
}
console.log('✓ العنوانُ يمرّ');
