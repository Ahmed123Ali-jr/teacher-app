/* التقاطُ لقطاتِ التطبيق — بمتصفّحٍ بلا واجهة يُقاد عبر CDP.
   ولا يُكتب في قاعدة البيانات حرفٌ واحد: الجلسةُ **مزوّرةٌ محلياً** في
   localStorage (معرّفٌ وهميٌّ وانتهاءٌ بعيد) لتمرّ بوّابةُ الموجّه فقط،
   وبياناتُ العرض تُحقن في DOM بعد الرسم. كلُّه في ملفّ تعريفٍ مؤقّتٍ يُمحى.

   ولا يُلمس teacher_app: المصدرُ يُقرأ من خادم المعاينة كما هو. */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = process.env.APP_URL || 'http://localhost:8001';
const OUT = process.env.SHOT_OUT || 'assets/film/raw';
const PORT = 9222;
const W = 375, H = 812, DSF = 2;

const profile = mkdtempSync(join(tmpdir(), 'fusul-shot-'));
const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
    for (let i = 0; i < 60; i++) {
        try {
            const list = JSON.parse(execFileSync('curl', ['-s', `http://127.0.0.1:${PORT}/json/list`], { encoding: 'utf8' }));
            const page = list.find((t) => t.type === 'page');
            if (page) return page.webSocketDebuggerUrl;
        } catch { /* لم يقلع بعد */ }
        await sleep(250);
    }
    throw new Error('تعذّر الاتصالُ بالمتصفّح');
}

const ws = new WebSocket(await targetWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
};
const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
});
export const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'خطأ في الصفحة');
    return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: DSF, mobile: true,
});

/* جلسةٌ مزوّرةٌ محلياً — لا رمزَ حقيقيّ ولا اتّصالَ بالخادم. */
const EXP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

/* رمزٌ **سليمُ البنية** لا سليمُ التوقيع: مكتبةُ سوبابيس تفكّ الرمزَ محلّياً
   لتقرأ انتهاءَه ودورَه، فرمزٌ ليس ثلاثةَ أجزاءٍ يُسقطها بـ
   «JWT cryptographic operation failed» — وهو رفضٌ غيرُ ملتقَطٍ يكسر رسمَ
   الشاشة. والتوقيعُ هنا حشوٌ: لا خادمَ يتحقّق منه، ولا طلبَ ينجح به. */
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = [
    b64u({ alg: 'HS256', typ: 'JWT' }),
    b64u({
        sub: '00000000-0000-4000-8000-000000000001', aud: 'authenticated',
        role: 'authenticated', email: 'demo@fusooli.com',
        iat: Math.floor(Date.now() / 1000), exp: EXP,
    }),
    Buffer.from('demo-signature-not-verified').toString('base64url'),
].join('.');
const FAKE_SESSION = JSON.stringify({
    access_token: FAKE_JWT, refresh_token: 'demo-refresh', token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365, expires_at: EXP,
    user: {
        id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
        email: 'demo@fusooli.com', email_confirmed_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email' }, user_metadata: { full_name: 'أ. خالد الشمري' },
        is_anonymous: false,
    },
});

/* ══ الوضعُ المقصود: بلا اتّصال ══
   التطبيقُ مبنيٌّ ليعمل بلا شبكة من مخبأ الجهاز — وهو بالضبط ما نريده هنا:
   لا رحلةَ إلى الخادم، ولا تحقّقَ من توقيع الرمز (وهو ما كان يُسقط الرسمَ
   بـ«No suitable key»)، ولا كتابةَ في قاعدة البيانات بحال.
   فتُحجب نطاقاتُ سوبابيس، ويُعلَن `navigator.onLine = false` ليسلك
   `isNetErr` مسارَ «الشبكة غائبة» فيقرأ الجلسةَ من الجهاز. */
await send('Network.enable');
await send('Network.setBlockedURLs', { urls: ['*supabase.co*', '*supabase.in*'] });

/* ══ ساعةٌ مثبَّتة ══
   شاشاتُ التطبيق تتبع اليوم: الجمعةُ تُظهر «إجازة سعيدة» بدل حصص اليوم،
   وعمودُ اليوم في الجدول يتبدّل. فلقطةٌ تُلتقط ليلَ الخميس تختلف عمّا
   تُلتقط صباحَ الثلاثاء — وأصولُ التسويق يجب أن تُعاد بالنتيجة نفسِها.
   فتُثبَّت الساعةُ على ثلاثاءٍ في وقت الحصّة الثالثة. */
const FIXED = new Date('2026-09-08T09:12:00').getTime();
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        const RealDate = Date, FIXED = ${FIXED};
        function D(...a) {
            if (!(this instanceof D)) return new RealDate(FIXED).toString();
            return a.length ? new RealDate(...a) : new RealDate(FIXED);
        }
        D.prototype = RealDate.prototype;
        D.now = () => FIXED;
        D.parse = RealDate.parse;
        D.UTC = RealDate.UTC;
        try { window.Date = D; } catch (e) {}
    })();
    try{
        Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    }catch(e){}
    /* كتمُ النخب: «لا اتصال» رسالةٌ صادقةٌ في التطبيق، لكنّها هنا أثرُ
       أداةِ الالتقاط لا حالُ المعلّم — فلا تُصوَّر. */
    try{
        Object.defineProperty(window, 'TeacherApp', {
            configurable: true,
            set(v) { try { v.toast = () => {}; } catch(e){} this._ta = v; },
            get() { return this._ta; },
        });
    }catch(e){}
    try{
        localStorage.setItem('teacher-app-auth', ${JSON.stringify(FAKE_SESSION)});
        localStorage.removeItem('teacher_app_color');
    }catch(e){}`,
});

mkdirSync(OUT, { recursive: true });

export const reload = async () => { await send('Page.reload', { ignoreCache: false }); await sleep(3400); };

export const goto = async (hash) => { await send('Page.navigate', { url: `${APP}/${hash}` }); await sleep(900); };

/* الانتظارُ بشرطٍ لا بمدّة: شاشةُ الإقلاع تختفي متى جهزت أوّلُ شاشة،
   والمدّةُ الثابتة إمّا تقصر فتلتقط الشعارَ وإمّا تطول بلا داعٍ. */
export async function waitReady(tries = 60) {
    let last = -1, stable = 0;
    for (let i = 0; i < tries; i++) {
        const n = await evaluate(`(() => {
            const sp = document.getElementById('splash');
            const gone = !sp || sp.hidden || getComputedStyle(sp).display === 'none'
                         || +getComputedStyle(sp).opacity === 0;
            if (!gone) return -1;
            const main = document.getElementById('app-main');
            return main ? main.textContent.trim().length : -1;
        })()`);
        /* الاستقرارُ لا مجرّدُ الظهور: بعضُ الشاشات ترسم هيكلاً (‏~٩٠٠ محرف)
           ثمّ تُكمل بالبيانات (‏~١٠٠٠٠). فالقياسُ على «ظهر شيء» يلتقط
           الهيكلَ فارغاً — والقياسُ على «لم يتغيّر مرّتين» يلتقط التمام. */
        if (n > 400 && n === last) { if (++stable >= 2) { await sleep(400); return true; } }
        else stable = 0;
        last = n;
        await sleep(250);
    }
    return false;
}

/* تنقّلٌ داخل التطبيق لا إقلاعٌ جديد: تغييرُ الـhash يبدّل الشاشة بلا
   إعادة تحميل. والإقلاعُ المباشرُ على شاشةٍ داخليّة قد يعلق على شاشة
   البداية، فيُقلَع مرّةً على الرئيسيّة ثمّ يُتنقَّل. */
export const hop = async (hash) => {
    await evaluate(`location.hash = ${JSON.stringify(hash.replace(/^#/, '#'))}`);
    await sleep(1200);
};

/* لقطةٌ فوريّةٌ للحالة الراهنة — بلا تنقّلٍ ولا انتظارِ جهوزيّة. */
export async function shootRaw(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

export async function shoot(name, hash, prepare = '') {
    await hop(hash);
    const ready = await waitReady();
    if (!ready) console.warn(`  ⚠ ${name}: لم تجهز الشاشة في الوقت المتاح`);
    if (prepare) await evaluate(`(async()=>{${prepare}})()`);
    await sleep(500);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    const title = await evaluate(`document.querySelector('.hdr-title')?.textContent || document.title`);
    console.log(`✓ ${name.padEnd(12)} ${String(title).slice(0, 40)}`);
}

export async function done() {
    ws.close(); chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
}
