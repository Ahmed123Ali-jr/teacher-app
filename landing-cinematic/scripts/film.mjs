/* تصويرُ الفيلم — تسلسلُ إطاراتٍ لتفاعلٍ حقيقيٍّ في تطبيق «فصول».
   القصّة: شبكةُ جدولٍ فارغةٌ تمتلئ حصّةً حصّة، ثمّ يُضاء عمودُ اليوم.
   لقطةٌ واحدةٌ متّصلةٌ من شاشةٍ واحدة — فلا حدودَ تُطابَق ولا قطعَ يُخفى
   (memory/03). والمادّةُ حقيقيّةٌ لا مولَّدة. */
import { goto, evaluate, reload, waitReady, done, shootRaw } from './shoot.mjs';
import { SEED } from './seed.mjs';
import { mkdirSync } from 'node:fs';

const FRAMES = Number(process.env.FRAMES || 96);
mkdirSync('assets/film/raw', { recursive: true });

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();
await goto('#/schedule');
await waitReady();

/* الخلايا المملوءةُ تُخفى ثمّ تُكشف واحدةً واحدة.
   الإخفاءُ بـ`visibility` لا `display`: الشبكةُ تحتفظ بهندستها فلا ترتجّ. */
const cellCount = await evaluate(`(() => {
    const cells = [...document.querySelectorAll('[data-day][data-period]')]
        .filter(c => c.textContent.trim().length > 1);
    window.__cells = cells;
    cells.forEach(c => { c.style.visibility = 'hidden'; });
    return cells.length;
})()`);
console.log(`خلايا الجدول المملوءة: ${cellCount}`);
if (!cellCount) { console.error('✗ لم تُعثَر على خلايا — تحقّق من المحدِّد'); await done(); process.exit(1); }

for (let f = 0; f < FRAMES; f++) {
    const t = f / (FRAMES - 1);
    /* الكشفُ يبدأ بعد ‎٨٪‎ وينتهي عند ‎٨٦٪‎ — بدايةٌ ساكنةٌ ونهايةٌ تتنفّس */
    const reveal = Math.max(0, Math.min(1, (t - 0.08) / 0.78));
    const shown = Math.round(reveal * cellCount);
    await evaluate(`window.__cells.forEach((c,i)=>{c.style.visibility = i < ${shown} ? 'visible':'hidden';})`);
    await shootRaw(`f${String(f).padStart(3, '0')}`);
    if (f % 16 === 0) console.log(`  ${f}/${FRAMES}`);
}

console.log(`✓ ${FRAMES} إطاراً في assets/film/raw`);
await done();
