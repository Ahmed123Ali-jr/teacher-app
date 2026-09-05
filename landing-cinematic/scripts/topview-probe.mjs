/* سبرُ واجهة TopView قبل صرف أيِّ رصيد.
   السؤالُ الوحيدُ المهمّ: هل تكشف **الإطار الأخير**؟ فيلمُنا قائمٌ على
   تطابق الحدود — آخرُ إطارٍ في مقطعٍ هو أوّلُ الذي يليه — وبدونه
   يظهر شبحٌ عند كلِّ انتقال. لا نولّد شيئاً قبل أن نعرف. */
import { readFileSync, existsSync } from 'node:fs';

const ENV = '.env.local';
if (!existsSync(ENV)) { console.error('✗ لا يوجد .env.local — ضع فيه TOPVIEW_API_KEY و TOPVIEW_UID'); process.exit(1); }
const env = Object.fromEntries(readFileSync(ENV,'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; }));

const KEY = env.TOPVIEW_API_KEY, UID = env.TOPVIEW_UID;
if (!KEY || !UID) { console.error('✗ ينقص TOPVIEW_API_KEY أو TOPVIEW_UID'); process.exit(1); }
/* المفتاحُ لا يُطبع أبداً — بصمتُه فقط، لنتأكّد أنّه قُرئ */
console.log(`المفتاح: ${KEY.length} حرفاً، يبدأ بـ${KEY.slice(0,3)}…   UID: ${UID.length} حرفاً\n`);

const BASE = 'https://api.topview.ai';
const H = { 'Authorization': `Bearer ${KEY}`, 'Topview-Uid': UID, 'Content-Type': 'application/json' };

async function probe(path, method='GET', body) {
  try {
    const r = await fetch(BASE + path, { method, headers: H, body: body && JSON.stringify(body) });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 1400) };
  } catch (e) { return { status: 'ERR', body: String(e.message) }; }
}

/* المسارات المرشَّحة — الوثائق العلنيّة تذكر خمسَ نقاطٍ خاصّةٍ بها فقط،
   والوصولُ الخامُّ للنماذج غيرُ موثَّقٍ علناً. نجرّب المعقول. */
const PATHS = [
  ['/v1/account/info',            'GET'],
  ['/v1/user/info',               'GET'],
  ['/v1/credit/balance',          'GET'],
  ['/v1/model/list',              'GET'],
  ['/v1/models',                  'GET'],
  ['/openapi/v1/model/list',      'GET'],
  ['/v1/video/model/list',        'GET'],
  ['/v1/task/list',               'GET'],
];
console.log('── جسُّ النقاط ──');
for (const [p, m] of PATHS) {
  const r = await probe(p, m);
  const ok = r.status === 200;
  console.log(`${ok ? '✓' : ' '} ${String(r.status).padEnd(4)} ${p}`);
  if (ok) console.log('     ' + r.body.replace(/\n/g,' ').slice(0,600));
}
console.log('\nلو ردَّت كلُّها ٤٠٤/٤٠١، فالوصولُ الخامُّ للنماذج ليس مفتوحاً على هذه الخطّة،');
console.log('وحينها: إمّا هايسفيلد المستقلّة، أو التوليدُ يدويّاً من تطبيق TopView.');
