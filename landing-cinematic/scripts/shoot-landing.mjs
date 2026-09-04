/* لقطاتٌ للصفحة نفسها — لسانُ المعاينة مخفيٌّ عندي فتُجمَّد فيه الحركة،
   وهذا متصفّحٌ رأسُه مقطوعٌ لكنّه *يرسم*: فالانتقالاتُ تجري فيه فعلاً. */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL_ = process.env.URL || 'http://localhost:3300';
const OUT  = process.env.OUT || 'assets/preview';
const W = Number(process.env.W||1440), H = Number(process.env.H||900), DSF = Number(process.env.DSF||2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });
const port = 9455;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`,
  '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2200);

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0; const waits = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (waits.has(m.id)) waits.get(m.id)(m.result), waits.delete(m.id); };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await cmd('Page.enable'); await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: W < 500 });
await cmd('Page.navigate', { url: URL_ });
await sleep(5000);

const ev = expr => cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });

const shots = [
  ['01-hero',        `window.scrollTo(0,0)`],
  ['02-schedule',    `(()=>{const e=document.getElementById('ch-schedule');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-142);return 1})()`],
  ['03-register',    `(()=>{const e=document.getElementById('ch-register');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-142);return 1})()`],
  ['04-exams',       `(()=>{const e=document.getElementById('ch-exams');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-142);return 1})()`],
  ['05-portfolio',   `(()=>{const e=document.getElementById('ch-portfolio');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-142);return 1})()`],
  ['06-papers',      `(()=>{const e=document.getElementById('papers');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-60);return 1})()`],
];
for (const [name, js] of shots) {
  await ev(js); await sleep(3400);              /* الذوبانُ ٠٫٩٥ث × لقطتين + مهلة */
  const { data } = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(data, 'base64'));
  console.log('✓', name);
}
ws.close(); chrome.kill();
