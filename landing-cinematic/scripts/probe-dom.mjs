import { goto, evaluate, reload, waitReady, done } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';
await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload(); await goto('#/dashboard'); await waitReady();

const look = async (label, hash, force) => {
  await evaluate(`location.hash=${JSON.stringify(hash)}`);
  await new Promise(r=>setTimeout(r,2600));
  if (force) { try { await evaluate(`(async()=>{const el=document.getElementById('app-main'); await (${force});})()`); } catch(e){ console.log(`  ⚠ ${String(e).slice(0,80)}`);} await new Promise(r=>setTimeout(r,1400)); }
  const info = await evaluate(`(() => {
    const root = document.getElementById('app-main');
    const counts = {};
    root.querySelectorAll('*').forEach(e => {
      if (e.offsetHeight < 30) return;
      (e.className && typeof e.className === 'string' ? e.className.split(/\\s+/) : []).forEach(c => {
        if (c) counts[c] = (counts[c]||0)+1;
      });
    });
    return Object.entries(counts).filter(([,n])=>n>=2&&n<=40)
      .sort((a,b)=>b[1]-a[1]).slice(0,10);
  })()`);
  console.log(`\n${label}  (${hash})`);
  info.forEach(([c,n])=>console.log(`   .${c.padEnd(26)} ×${n}`));
};

await look('الفصول','#/classes',`ClassesView.render(el)`);
await look('الجدول','#/schedule',null);
await look('ملف الإنجاز','#/portfolio',`PortfolioView.render(el)`);
await look('المبادرات','#/initiatives',null);
await done();
