import { goto, evaluate, reload, waitReady, done, shootRaw } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';
import { mkdirSync } from 'node:fs';

mkdirSync(process.env.SHOT_OUT || 'assets/screens', { recursive: true });

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();

/* التنقّلُ وحدَه لا يُكمل رسمَ بعض الشاشات في وضع «بلا اتصال»، والاستدعاءُ
   المباشرُ للعارض يُكمله. حيلةُ تصويرٍ لا تعديلٌ في التطبيق. */
async function shot(name, hash, force) {
    await evaluate(`location.hash=${JSON.stringify(hash)}`);
    await new Promise(r => setTimeout(r, 2400));
    if (force) {
        await evaluate(`(async()=>{ const el=document.getElementById('app-main'); await (${force}); })()`);
        await new Promise(r => setTimeout(r, 1400));
    }
    await shootRaw(name);
    const len = await evaluate(`document.getElementById('app-main').textContent.trim().length`);
    const head = await evaluate(`document.getElementById('app-main').textContent.trim().slice(0,44)`);
    console.log(`✓ ${name.padEnd(12)} ${String(len).padStart(6)}  ${head.replace(/\s+/g,' ')}`);
}

const C = JSON.stringify(CLASS_ID);
await shot('register',  `#/class/${CLASS_ID}/students`, `ClassView.render(el, ${C}, 'students')`);
await shot('portfolio', '#/portfolio',                  `PortfolioView.render(el)`);
await shot('exams',     `#/class/${CLASS_ID}/exams`,    `ClassView.render(el, ${C}, 'exams')`);
await done();
