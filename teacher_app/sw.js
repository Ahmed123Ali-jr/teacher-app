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

const BUILD_ID   = '__BUILD_ID__';   // replaced at deploy time
const CACHE_NAME = 'teacher-app-' + BUILD_ID;

/* Install: cache the shell so first-paint works offline. */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            await cache.addAll(['./', './index.html']);
        } catch (e) {
            // Pre-cache failures shouldn't block install — runtime caching will fill in.
        }
        await self.skipWaiting();
    })());
});

/* Activate: drop old caches, take control of every open tab. */
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

/* Fetch: network-first for same-origin GETs; offline-fallback to cache. */
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Don't intercept Supabase / Anthropic / CDN traffic — pass straight through.
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, fresh.clone()).catch(() => {});
            }
            return fresh;
        } catch (e) {
            const cache  = await caches.open(CACHE_NAME);
            const cached = await cache.match(req);
            if (cached) return cached;
            // Last resort: navigation request → return cached index.html so the SPA still boots.
            if (req.mode === 'navigate') {
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
