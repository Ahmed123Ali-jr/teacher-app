import { goto, evaluate, reload, waitReady, done, shootClip } from './shoot.mjs';
import { SEED } from './seed.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync(process.env.SHOT_OUT || 'assets/screens', { recursive: true });

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();
await evaluate(`location.hash='#/portfolio'`);
await new Promise(r => setTimeout(r, 2200));
await evaluate(`(async()=>{const el=document.getElementById('app-main'); await PortfolioView.render(el);})()`);
await new Promise(r => setTimeout(r, 1500));

const info = await evaluate(`(async () => {
  const orig = PdfCore.createStage;
  PdfCore.createStage = async function () {
    const s = await orig.apply(this, arguments);
    s.el.style.left='0px'; s.el.style.top='0px'; s.el.style.zIndex='99999';
    window.__stage = s.el; s.destroy = () => {};
    return s;
  };
  PdfCore.renderPdf  = async () => new Blob([''], {type:'application/pdf'});
  PdfCore.deliverPdf = async () => {};

  /* الضغطُ على الزرّ الحقيقيّ يبني ctx كما يبنيه التطبيق — لا إعادةَ تركيب */
  const btn = document.getElementById('btn-print-portfolio');
  if (!btn) return 'لا زرّ طباعة';
  btn.click();
  await new Promise(r => setTimeout(r, 900));

  const go = [...document.querySelectorAll('button')]
      .find(b => /جهّز|جهز/.test(b.textContent));
  if (!go) return 'لا زرّ تجهيز — ' + [...document.querySelectorAll('.modal button, dialog button')].map(b=>b.textContent.trim()).slice(0,6).join(' | ');
  go.click();
  await new Promise(r => setTimeout(r, 6000));

  const st = window.__stage;
  if (!st) return 'لا مسرح';
  return [...st.children].filter(e => e.tagName!=='STYLE' && e.offsetHeight>200).length;
})()`);
console.log('صفحاتُ ملفّ الإنجاز:', info);

const boxes = await evaluate(`(() => { const st=window.__stage; if(!st) return [];
  return [...st.children].filter(e=>e.tagName!=='STYLE'&&e.offsetHeight>200).map(e=>{
    const r=e.getBoundingClientRect();
    return {x:Math.round(r.x+scrollX), y:Math.round(r.y+scrollY), width:Math.round(r.width), height:Math.round(r.height)};});})()`);
for (let i = 0; i < Math.min(boxes.length, 3); i++) await shootClip(`portfolio-page-${i+1}`, boxes[i], 2);
console.log('التُقط:', Math.min(boxes.length, 3));
await done();
