import { goto, evaluate, reload, waitReady, done } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();

const test = async (label, hash, forceExpr) => {
    await evaluate(`location.hash=${JSON.stringify(hash)}`);
    await new Promise(r => setTimeout(r, 2600));
    const before = await evaluate(`document.getElementById('app-main').textContent.trim().length`);
    let after = before, err = null;
    try {
        after = await evaluate(`(async()=>{ const el=document.getElementById('app-main');
            await (${forceExpr}); return el.textContent.trim().length; })()`);
    } catch (e) { err = String(e).slice(0, 160); }
    console.log(`${label.padEnd(18)} بعد التنقّل ${String(before).padStart(6)} → بالاستدعاء المباشر ${String(after).padStart(6)}${err ? '  ✗ ' + err : ''}`);
};

await test('سجل المتابعة', `#/class/${CLASS_ID}/students`,
    `ClassView.render(el, ${JSON.stringify(CLASS_ID)}, 'students')`);
await test('ملف الإنجاز', '#/portfolio', `PortfolioView.render(el)`);
await test('الاختبارات', `#/class/${CLASS_ID}/exams`,
    `ClassView.render(el, ${JSON.stringify(CLASS_ID)}, 'exams')`);
await done();
