/* تجزئةُ الخطّ لمحارف الصفحة وحدَها — أكبرُ مكسبِ أداءٍ في المشروع.
   المصدر: teacher_app/vendor/fonts (نفسُ ملفّات التطبيق، رخصة SIL OFL 1.1).
   يقرأ النصوصَ من components/ و app/ فلا تُنسى محرفةٌ عند تغيير النصّ. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '../teacher_app/vendor/fonts';
const OUT = 'public/fonts';
mkdirSync(OUT, { recursive: true });

// كلُّ محرفٍ يظهر في مصدر الصفحة — لا قائمةٌ يدويّةٌ تُنسى
const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css|mdx?)$/.test(f) ? [p] : [];
});
const text = ['app', 'components'].flatMap(walk).map((f) => readFileSync(f, 'utf8')).join('');

const chars = new Set([...text]);
// محارفُ لازمةٌ دائماً: أرقامٌ هنديّةٌ ولاتينيّة، ومسافات، وعلاماتُ ترقيم
for (const c of '٠١٢٣٤٥٦٧٨٩0123456789 .,:/·—–«»()،؛؟!٪+') chars.add(c);
// تشكيلٌ يُستعمل في سطرٍ واحدٍ مسموحٍ به (الجملة التعريفيّة)
for (const c of 'ًٌٍَُِّْـ') chars.add(c);
// ZWNJ/ZWJ ومحارفُ الاتّجاه — لازمةٌ لتشكيلٍ عربيٍّ سليم
for (const c of '‌‍‎‏؜') chars.add(c);

const isArabic = (c) => {
    const n = c.codePointAt(0);
    return (n >= 0x0600 && n <= 0x06ff) || (n >= 0xfb50 && n <= 0xfdff) ||
           (n >= 0xfe70 && n <= 0xfefc) || (n >= 0x0750 && n <= 0x077f) ||
           (n >= 0x200c && n <= 0x200f) || n === 0x061c;
};
const arabic = [...chars].filter(isArabic);
const latin  = [...chars].filter((c) => { const n = c.codePointAt(0); return n >= 0x20 && n <= 0x24f; });

const run = (inFile, outFile, glyphs) => {
    execFileSync('python3', ['-m', 'fontTools.subset', join(SRC, inFile),
        `--text=${glyphs.join('')}`,
        '--layout-features=calt,ccmp,fina,init,kern,locl,mark,medi,mkmk,rlig,liga',
        '--flavor=woff2', '--no-hinting', '--desubroutinize',
        `--output-file=${join(OUT, outFile)}`], { stdio: 'pipe' });
    const before = statSync(join(SRC, inFile)).size, after = statSync(join(OUT, outFile)).size;
    console.log(`${outFile.padEnd(26)} ${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB` +
        `  (${Math.round((1 - after / before) * 100)}٪ أقلّ)`);
    return after;
};

let total = 0;
for (const w of [400, 500, 600, 700]) total += run(`plex-${w}-arabic.woff2`, `plex-${w}-ar.woff2`, arabic);
total += run('plex-400-latin.woff2', 'plex-400-lat.woff2', latin);

console.log(`\nعددُ المحارف: ${arabic.length} عربيّة · ${latin.length} لاتينيّة`);
console.log(`الإجماليُّ بعد التجزئة: ${(total / 1024).toFixed(1)}KB`);
