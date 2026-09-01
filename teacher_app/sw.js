/**
 * Service Worker — Network-first with offline fallback.
 *
 * Strategy:
 *   • Every navigation/asset request hits the network first.
 *   • A successful response is cached so the app still loads offline.
 *   • If the network is unreachable, the cached response is served.
 *
 * Auto-update:
 *   This file's content changes on every deploy (BUILD_ID replaced by the
 *   GitHub Actions workflow). Browsers detect the byte-level change and
 *   install the new worker, which triggers the "update available" banner
 *   in index.html.
 */

const BUILD_ID = '__BUILD_ID__';   // replaced at deploy time

/* ── مخزنان لا واحد ──
   كان مخزنٌ واحدٌ باسم النشر يحمل القشرةَ والأصولَ معاً، و`activate` يمسحه
   كلَّه عند كل نشر. فيفتح المعلّم التطبيق بعد نشرٍ جديد: القشرةُ تأتي من
   المخزن فوراً، وكلُّ ملفّ شيفرةٍ فيها يجب أن يُجلب من الشبكة من جديد —
   فإن كانت ضعيفةً أو منقطعةً ظهرت الشاشةُ بيضاء. (بلاغُ المعلّم، ١٧ أغسطس
   ٢٠٢٦.)

   والأصولُ لا تحتاج مسحاً أصلاً: عنوانُها يحمل رقمَه (`?v=`) فهو ثابتُ
   المحتوى إلى الأبد — نسخةٌ قديمةٌ في المخزن لا تُقرأ لأن القشرةَ الجديدة
   تطلب رقماً جديداً. فصار لها مخزنُها الذي يعبر النشرات، والقشرةُ وحدها
   هي التي تُجدَّد. */
const SHELL_CACHE = 'teacher-app-' + BUILD_ID;
const ASSET_CACHE = 'teacher-app-assets-1';

/* مكتبات vendor مثبّتة الإصدار، فمحتواها لا يتغيّر أبداً. لها مخزنها
   المستقل الذي لا يُمسح مع كل نشر — وإلا أعاد المعلم تنزيل ١.٩ ميجا
   بعد كل تحديث. يُرفع رقمه يدوياً عند ترقية أي مكتبة فقط. */
const VENDOR_CACHE = 'teacher-app-vendor-2';
const VENDOR_FILES = [
    './vendor/html2canvas.min.js',
    './vendor/jspdf.umd.min.js',
    './vendor/pdf.min.js',
    './vendor/pdf.worker.min.js',
    './vendor/supabase.js',
    './vendor/fonts/plex-400-arabic.woff2',
    './vendor/fonts/plex-400-latin.woff2',
    './vendor/fonts/plex-500-arabic.woff2',
    './vendor/fonts/plex-500-latin.woff2',
    './vendor/fonts/plex-600-arabic.woff2',
    './vendor/fonts/plex-600-latin.woff2',
    './vendor/fonts/plex-700-arabic.woff2',
    './vendor/fonts/plex-700-latin.woff2',
];

/* الأصلُ يُحفظ وتُحذف نسخُه القديمة: المخزنُ لا يُمسح مع النشر، فلولا
   التقليم لتراكمت فيه كلُّ نسخةٍ من كل ملفٍّ منذ أوّل يوم. ويُطابَق
   بالمسار: `views.css?v=D190` تذهب حين تصل `views.css?v=D191`. */
async function putVersioned(cache, req, res) {
    await cache.put(req, res);
    const path = new URL(req.url).pathname;
    const search = new URL(req.url).search;
    for (const k of await cache.keys()) {
        const u = new URL(k.url);
        if (u.pathname === path && u.search !== search) await cache.delete(k);
    }
}

/* Install: cache the shell so first-paint works offline. */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
            await cache.addAll(['./', './index.html']);
        } catch (e) {
            // Pre-cache failures shouldn't block install — runtime caching will fill in.
        }
        await self.skipWaiting();

        /* بعد skipWaiting عمداً: تنزيل ١.٩ ميجا يجب ألّا يؤخّر ظهور
           التحديث. وفشله لا يكسر شيئاً — يبقى التصدير يحتاج إنترنت. */
        try {
            const vendor = await caches.open(VENDOR_CACHE);
            const missing = [];
            for (const f of VENDOR_FILES) {
                if (!(await vendor.match(f))) missing.push(f);
            }
            if (missing.length) await vendor.addAll(missing);

            /* خطٌّ قديمٌ بُدّل يبقى في المخزن إلى الأبد: اسمُ المخزن لا
               يُرفع عند تبديله — رفعُه يمسح المكتبات معه فيُعاد تنزيل
               ١.٩ ميجا على جوال المعلّم. فتُحذف ملفّات الخطوط المهجورة
               وحدها، وما عداها لا يُمسّ. */
            for (const req of await vendor.keys()) {
                if (!req.url.includes('/vendor/fonts/')) continue;
                const keep = VENDOR_FILES.some((f) => req.url.endsWith(f.replace('./', '/')));
                if (!keep) await vendor.delete(req);
            }
        } catch (e) {
            // بلا إنترنت أو ملف ناقص — التخزين وقت التشغيل يكمل لاحقاً.
        }

        /* ══ الشاشاتُ المؤجّلة تُخزَّن مع التحديث، لا عند أوّل فتحةٍ لها ══
           شاشاتُ التطبيق تُحمَّل عند طلبها (`text/lazy-view`)، فلا تدخل
           المخزنَ إلا بعد أن يفتحها المعلّمُ **وهو متّصل**. فمن نزّل
           التطبيقَ ثمّ ذهب إلى مدرسةٍ بلا تغطية: الرئيسيّةُ تفتح، وأوّلُ
           ضغطةٍ على فصلٍ لا تعطيه شيئاً.

           قِيس يوم ٣٠ أغسطس ٢٠٢٦ على النسخة المنشورة: **٥٥ ملفاً من ٥٥
           غيرِ مؤجّلٍ مخزَّنة، و١٤ من ١٤ مؤجّلةً مفقودة** — الفصل وملفّ
           الإنجاز والطالب والتقارير والكتب والاختبارات والواجبات وأوراق
           العمل وتوزيع المنهج والاستراتيجيات والمبادرات والمساعدة.
           ومجموعُها ‎٣٤٢‎ كيلوبايت — لا شيءَ بجانب ‎١٫٩‎ ميجا من المكتبات
           التي تُخزَّن أصلاً.

           **وتُقرأ من `index.html` نفسِها لا من قائمةٍ مكتوبة هنا:**
           عناوينُها تحمل أرقامَ إصداراتها وتتغيّر مع كلّ نشر، فقائمةٌ
           يدويّةٌ تُنسى بعد نشرين. */
        try {
            const res = await fetch('./index.html', { cache: 'no-store' });
            const html = await res.text();
            const views = [...html.matchAll(/data-src="([^"]+)"/g)].map((m) => m[1]);
            if (views.length) {
                const assets = await caches.open(ASSET_CACHE);
                /* واحدةً واحدةً لا `addAll`: هذه تسقط كلَّها إن سقط ملفٌّ
                   واحد، وشاشةٌ ناقصةٌ خيرٌ من ثلاثَ عشرةَ ناقصة. */
                await Promise.all(views.map(async (u) => {
                    try {
                        if (await assets.match(u)) return;
                        const r = await fetch(u);
                        if (r && r.ok) await putVersioned(assets, new Request(u), r);
                    } catch (e) { /* هذه وحدها تُترك للتشغيل */ }
                }));
            }
        } catch (e) {
            // الشبكةُ ناقصة — التخزين وقت التشغيل يكمل.
        }
    })());
});

/* Activate: drop old caches, take control of every open tab. */
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE && k !== VENDOR_CACHE)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

/* Fetch:
 *   • Versioned assets (?v=...) are immutable → CACHE-FIRST (instant paint;
 *     a new deploy changes the ?v= → new cache key → fetched fresh).
 *   • Everything else (index.html, sw.js) stays NETWORK-FIRST so updates
 *     and the update-banner flow keep working exactly as before. */
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Don't intercept Supabase / Anthropic / CDN traffic — pass straight through.
    if (url.origin !== self.location.origin) return;

    // Navigations (the HTML shell): serve the cached shell INSTANTLY and
    // refresh it in the background. Without this, every app open waited a
    // full network round-trip before the first pixel (the white screen).
    // Updates still arrive: a new deploy changes sw.js (BUILD_ID) → the new
    // worker's install step pre-caches the fresh index.html → the update
    // banner asks the user to reload onto it.
    /* قصر اختطاف التنقّل على قشرة التطبيق وحدها. بدونه كان أي تنقّل —
       بما فيه privacy.html وصفحات المعاينة — يُردّ عليه بـindex.html
       المخزَّنة، فيرى الزائر التطبيق بدل الصفحة التي طلبها. وسياسة
       الخصوصية شرط في مراجعة آبل، فكسرها ليس تفصيلاً. */
    const isShell = /(^|\/)(index\.html)?$/.test(url.pathname);

    if (req.mode === 'navigate' && isShell) {
        const networkPromise = (async () => {
            try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) {
                    const cache = await caches.open(SHELL_CACHE);
                    await cache.put('./index.html', fresh.clone());
                }
                return fresh;
            } catch (e) { return null; }
        })();
        event.waitUntil(networkPromise);
        event.respondWith((async () => {
            const cache  = await caches.open(SHELL_CACHE);
            const cached = await cache.match('./index.html');
            if (cached) return cached;
            const fresh = await networkPromise;
            if (fresh) return fresh;
            throw new Error('offline and no cached shell');
        })());
        return;
    }

    /* vendor: مخزن أولاً دائماً — إصداراتها مثبّتة فلا معنى لسؤال الشبكة،
       وهذا ما يجعل التصدير يعمل بلا إنترنت. */
    if (url.pathname.includes('/vendor/')) {
        event.respondWith((async () => {
            const cache  = await caches.open(VENDOR_CACHE);
            const cached = await cache.match(req, { ignoreSearch: true });
            if (cached) return cached;
            const fresh = await fetch(req);
            if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
            return fresh;
        })());
        return;
    }

    // Cache-first for immutable versioned assets — the mobile white-screen fix.
    if (url.searchParams.has('v')) {
        event.respondWith((async () => {
            const cache  = await caches.open(ASSET_CACHE);
            const cached = await cache.match(req);
            if (cached) return cached;
            const fresh = await fetch(req);
            if (fresh && fresh.ok) putVersioned(cache, req, fresh.clone()).catch(() => {});
            return fresh;
        })());
        return;
    }

    event.respondWith((async () => {
        try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) {
                const cache = await caches.open(SHELL_CACHE);
                cache.put(req, fresh.clone()).catch(() => {});
            }
            return fresh;
        } catch (e) {
            const cache  = await caches.open(SHELL_CACHE);
            const cached = await cache.match(req);
            if (cached) return cached;
            // الملاذ الأخير: قشرة التطبيق للتنقّل إلى جذره وحده — لا لأي
            // صفحة HTML أخرى، وإلا ظهر التطبيق مكان الصفحة المطلوبة.
            if (req.mode === 'navigate' && isShell) {
                const shell = await cache.match('./index.html');
                if (shell) return shell;
            }
            throw e;
        }
    })());
});

/* Allow the page to ask the worker to skipWaiting when the user clicks "تحديث". */
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
