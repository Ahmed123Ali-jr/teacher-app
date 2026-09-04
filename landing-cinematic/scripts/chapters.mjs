/* تصويرُ فصول العرض السبعة — مطابقةً لشريط التنقّل.
   لكلّ فصلٍ شاشةٌ حقيقيّةٌ من التطبيق، وعناصرُها تُكشف واحداً واحداً
   فتُقرأ الشاشةُ وهي «تُبنى» لا وهي ساكنة. */
import { goto, evaluate, reload, waitReady, done, shootRaw } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';
import { mkdirSync } from 'node:fs';

const FRAMES = Number(process.env.FRAMES || 120);   // ٥ ثوانٍ عند ٢٤/ث
const C = JSON.stringify(CLASS_ID);

const CHAPTERS = [
    { key: 'home',        hash: '#/dashboard',                    force: null,
      sel: '#app-main .container > *' },
    { key: 'classes',     hash: '#/classes',                      force: `ClassesView.render(el)`,
      sel: '.cls-row' },
    { key: 'schedule',    hash: '#/schedule',                     force: null,
      sel: '[data-day][data-period]', filled: true },
    { key: 'register',    hash: `#/class/${CLASS_ID}/students`,   force: `ClassView.render(el, ${C}, 'students')`,
      sel: '.st-card' },
    { key: 'exams',       hash: `#/class/${CLASS_ID}/exams`,      force: `ClassView.render(el, ${C}, 'exams')`,
      sel: '#app-main .container > *' },
    { key: 'initiatives', hash: '#/initiatives',                  force: `(async()=>{const t=await TeacherDB.get('teachers','00000000-0000-4000-8000-000000000001'); return PortfolioInitiatives.render(document.getElementById('view-initiatives')||el, {teacher:t});})()`,
      sel: '.init-card, .portfolio-section, [class*=card]', target: 'view-initiatives' },
    { key: 'portfolio',   hash: '#/portfolio',                    force: `PortfolioView.render(el)`,
      sel: '.portfolio-section' },
];

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();

for (const ch of CHAPTERS) {
    const out = `assets/raw/${ch.key}`;
    mkdirSync(out, { recursive: true });
    process.env.SHOT_OUT = out;

    /* ارتدادةٌ عبر الرئيسيّة: تبديلُ الـhash من شاشةٍ إلى أخرى لا يُعيد
       الرسمَ في وضع «بلا اتصال» — تبقى الشاشةُ السابقةُ معروضة. */
    await evaluate(`location.hash='#/dashboard'`);
    await new Promise(r => setTimeout(r, 900));
    await evaluate(`location.hash=${JSON.stringify(ch.hash)}`);
    await new Promise(r => setTimeout(r, 2400));
    if (ch.force) {
        await evaluate(`(async()=>{const el=document.getElementById('app-main'); await (${ch.force});})()`)
            .catch(e => console.warn(`  ⚠ ${ch.key}: ${String(e).slice(0, 90)}`));
        await new Promise(r => setTimeout(r, 1500));
    }

    const n = await evaluate(`(() => {
        const scope = ${JSON.stringify(ch.target || '')} ?
            (document.getElementById(${JSON.stringify(ch.target || '')}) || document) : document;
        let els = [...scope.querySelectorAll(${JSON.stringify(ch.sel)})];
        ${ch.filled ? `els = els.filter(e => e.textContent.trim().length > 1);` : ''}
        els = els.filter(e => e.offsetHeight > 24);
        window.__c = els;
        els.forEach(e => { e.style.visibility = 'hidden'; });
        return els.length;
    })()`);

    if (!n) { console.log(`✗ ${ch.key.padEnd(12)} لا عناصر — يُتخطّى`); continue; }

    for (let f = 0; f < FRAMES; f++) {
        const t = f / (FRAMES - 1);
        const r = Math.max(0, Math.min(1, (t - 0.10) / 0.74));
        const shown = Math.round(r * n);
        await evaluate(`window.__c.forEach((e,i)=>{e.style.visibility = i < ${shown} ? 'visible':'hidden';})`);
        await shootRaw(`f${String(f).padStart(3, '0')}`);
    }
    console.log(`✓ ${ch.key.padEnd(12)} ${String(n).padStart(3)} عنصراً · ${FRAMES} إطاراً`);
    await evaluate(`window.__c.forEach(e=>{e.style.visibility='visible';})`);
}
await done();
