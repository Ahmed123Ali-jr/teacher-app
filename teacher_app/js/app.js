/* ==========================================================================
   app.js — Application bootstrap.
   Opens the DB, wires global UI (logout, toasts), starts the router.
   ========================================================================== */

(function (global) {
    'use strict';

    const App = {
        version: '0.2.0-phase2',

        async init() {
            console.info('[TeacherApp] init', this.version);

            try {
                await global.TeacherDB.open();
            } catch (err) {
                console.error('[TeacherApp] DB init failed:', err);
                this.toast('فشل تهيئة قاعدة البيانات: ' + err.message, 'error', 6000);
                return;
            }

            // Offline-first boot: render from the local cache immediately and
            // sync from Supabase in the BACKGROUND. Previously boot awaited a
            // full network hydrate before showing anything — slow to open on
            // mobile. We only block when the cache is empty (first login), since
            // there's nothing to render yet.
            let me = null;
            try {
                me = await global.Auth.currentTeacher();
                if (me && global.TeacherDB.hydrate) {
                    let hasCache = false;
                    try {
                        hasCache = (await global.TeacherDB.count('classes')) > 0
                                || (await global.TeacherDB.count('students')) > 0;
                    } catch (e) { /* count may fail on a brand-new DB */ }

                    if (hasCache) {
                        // Warm cache → open instantly, refresh in background,
                        // then repaint the current view with the fresh data.
                        global.TeacherDB.hydrate()
                            .then(() => { try { global.Router.resolve(); } catch (e) {} })
                            .catch((e) => console.warn('[TeacherApp] bg hydrate failed:', e.message));
                    } else {
                        // Cold cache → must fetch before there's anything to show.
                        await global.TeacherDB.hydrate();
                    }
                }
            } catch (e) {
                console.warn('[TeacherApp] boot hydrate skipped:', e.message);
            }

            // Cold launch always lands on the home screen. On mobile the app
            // reopens the last URL (e.g. #/settings or #/classes), which is
            // confusing — a fresh open should show the dashboard. In-app
            // navigation and hashchange are untouched (this runs once, at boot).
            if (me) {
                const path = (global.location.hash || '').replace(/^#/, '').split('?')[0];
                if (path !== '/login') global.location.hash = '#/dashboard';
            }

            this._bindGlobalUI();
            if (global.SettingsView && global.SettingsView.applyStoredPrefs) {
                await global.SettingsView.applyStoredPrefs();
            }
            if (global.Drawer)     global.Drawer.init();
            if (global.BottomNav)  global.BottomNav.init();
            global.Router.start();
        },

        _bindGlobalUI() {
            const logoutBtn = document.getElementById('btn-logout');
            if (logoutBtn) logoutBtn.addEventListener('click', async () => {
                await global.Auth.logout();
                this.toast('تم تسجيل الخروج.', 'info');
                global.location.hash = '#/login';
            });
        },

        /** Toast helper — available app-wide. */
        toast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('toast-container');
            if (!container) { console.log('[toast]', type, message); return; }

            const el = document.createElement('div');
            el.className = 'toast toast-' + type;
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');
            el.textContent = message;
            container.appendChild(el);

            global.setTimeout(() => {
                el.style.transition = 'opacity 250ms ease, transform 250ms ease';
                el.style.opacity   = '0';
                el.style.transform = 'translateY(-8px)';
                global.setTimeout(() => el.remove(), 260);
            }, duration);
        }
    };

    global.TeacherApp = App;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})(window);
