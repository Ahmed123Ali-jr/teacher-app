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

            // If we already have a session (page reload), hydrate the cache
            // before rendering so the first view reads from local IndexedDB.
            try {
                const me = await global.Auth.currentTeacher();
                if (me && global.TeacherDB.hydrate) {
                    await global.TeacherDB.hydrate();
                }
            } catch (e) {
                console.warn('[TeacherApp] boot hydrate skipped:', e.message);
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
