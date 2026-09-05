/* عميلُ TopView — رفعٌ وتوليدٌ واستطلاع.
   المفتاحُ يُقرأ من .env.local ولا يُطبع أبداً.

   المسارات (من docs.topview.ai/llms.txt، ٥ سبتمبر ٢٠٢٦):
     GET  /v1/upload/credential?format=jpg&needAccelerateUrl
     PUT  <uploadUrl>                       ← رفعٌ مباشرٌ إلى S3
     GET  /v1/upload/check?fileId=…
     POST /v1/common_task/text2image/task/submit   → …/query?taskId=
     POST /v1/common_task/image_edit/task/submit   → …/query?taskId=
     POST /v2/common_task/image2video/task/submit  → …/query?taskId=

   الغلافُ دائماً {code,message,result} — و«code» نصٌّ لا رقم، و«5000»
   خطأٌ عامٌّ يُرجَع بحالة HTTP ٢٠٠. فلا يُعوَّل على حالة HTTP وحدَها. */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

const BASE = 'https://api.topview.ai';

function creds(){
  const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));
  if (!env.TOPVIEW_API_KEY || !env.TOPVIEW_UID) throw new Error('ينقص المفتاح أو الـUID في .env.local');
  return { 'Authorization': `Bearer ${env.TOPVIEW_API_KEY}`, 'Topview-Uid': env.TOPVIEW_UID };
}
const H = creds();
const J = { ...H, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, { method='GET', body } = {}){
  const r = await fetch(BASE + path, { method, headers: J, body: body && JSON.stringify(body) });
  const txt = await r.text();
  let d; try { d = JSON.parse(txt); } catch { throw new Error(`ردٌّ غيرُ JSON (${r.status}): ${txt.slice(0,200)}`); }
  if (String(d.code) !== '200') throw new Error(`${d.code}: ${d.message} — ${path}`);
  return d.result;
}

/* ── الرفع: ثلاثُ خطوات، والثانيةُ إلى S3 لا إلى الواجهة ── */
export async function upload(file){
  const fmt = extname(file).slice(1).toLowerCase().replace('jpeg','jpg');
  const c = await call(`/v1/upload/credential?format=${fmt}&needAccelerateUrl`);
  const bytes = readFileSync(file);
  const put = await fetch(c.uploadUrl, { method:'PUT', body: bytes });
  if (!put.ok) throw new Error(`فشل الرفع إلى S3: ${put.status}`);
  for (let i = 0; i < 12; i++){
    if (await call(`/v1/upload/check?fileId=${c.fileId}`) === true) {
      console.error(`  ↑ ${basename(file)} (${(statSync(file).size/1024).toFixed(0)}KB) → ${c.fileId}`);
      return c.fileId;
    }
    await sleep(1200);
  }
  throw new Error('رُفع الملفُّ لكنّ التحقّق لم ينجح');
}

/* ── الاستطلاع: كلَّ ٤ث، والمهلةُ افتراضاً ١٥د ── */
async function poll(qpath, taskId, { timeout = 900e3 } = {}){
  const t0 = Date.now(); let last = '';
  for (;;){
    const r = await call(`${qpath}?taskId=${taskId}`);
    if (r.status !== last){ last = r.status; console.error(`  · ${taskId.slice(0,8)} ${r.status}`); }
    if (r.status === 'success') return r;
    if (r.status === 'fail') throw new Error(`فشلت المهمّة: ${r.errorMsg || 'بلا سبب'}`);
    if (Date.now() - t0 > timeout) throw new Error(`تجاوزت المهلة (${timeout/1000}ث)`);
    await sleep(4000);
  }
}

export async function t2i(p){
  const { taskId } = await call('/v1/common_task/text2image/task/submit', { method:'POST', body:p });
  return poll('/v1/common_task/text2image/task/query', taskId);
}
export async function edit(p){
  const { taskId } = await call('/v1/common_task/image_edit/task/submit', { method:'POST', body:p });
  return poll('/v1/common_task/image_edit/task/query', taskId);
}
export async function i2v(p){
  const { taskId } = await call('/v2/common_task/image2video/task/submit', { method:'POST', body:p });
  return poll('/v2/common_task/image2video/task/query', taskId, { timeout: 1500e3 });
}

/* ── التنزيل: ثلاثُ محاولات، ويُتحقّق من الحجم — رمزُ الخروج قد يكذب ── */
export async function download(url, out){
  for (let i = 1; i <= 3; i++){
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (!b.length) throw new Error('ملفٌّ فارغ');
      writeFileSync(out, b);
      console.error(`  ↓ ${out} (${(b.length/1024).toFixed(0)}KB)`);
      return out;
    } catch (e){ if (i === 3) throw e; await sleep(2500); }
  }
}

/* يُخرج أوّلَ رابطِ نتيجةٍ من ردٍّ ناجح — الصورُ والفيديو يختلفان في الاسم */
export function firstUrl(res){
  const arr = res.images || res.videos || res.outputs || [];
  const o = arr[0] || {};
  return o.filePath || o.url || o.imagePath || null;
}
