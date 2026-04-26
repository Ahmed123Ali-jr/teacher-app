/* ==========================================================================
   router.js — Hash router with path params and auth guard.
   Routes:
     #/login               → LoginView
     #/dashboard           → DashboardView
     #/reminders           → RemindersView
     #/class/:id           → ClassView
     #/student/:id         → StudentView
   ========================================================================== */

(function (global) {
    'use strict';

    const routes = [
        { pattern: /^\/login$/,                    view: 'login',     auth: false, chrome: false },
        { pattern: /^\/dashboard$/,                view: 'dashboard', auth: true,  chrome: true  },
        { pattern: /^\/reminders$/,                view: 'reminders', auth: true,  chrome: true  },
        { pattern: /^\/class\/([\w-]+)$/,   keys: ['id'], view: 'class',   auth: true, chrome: true },
        { pattern: /^\/student\/([\w-]+)$/, keys: ['id'], view: 'student', auth: true, chrome: true },
        { pattern: /^\/settings$/,                 view: 'settings',  auth: true, chrome: true },
        { pattern: /^\/portfolio$/,                view: 'portfolio', auth: true, chrome: true },
        { pattern: /^\/schedule$/,                 view: 'schedule',  auth: true, chrome: true },
        { pattern: /^\/help$/,                     view: 'help',      auth: true, chrome: true },
        { pattern: /^\/reports$/,                  view: 'reports',   auth: true, chrome: true },
        { pattern: /^\/classes$/,                  view: 'classes',   auth: true, chrome: true },
        { pattern: /^\/shortcuts$/,                view: 'shortcuts', auth: true, chrome: true },
        { pattern: /^\/profile$/,                  view: 'profile',   auth: true, chrome: true }
    ];

    function parse() {
        const raw  = (global.location.hash || '').replace(/^#/, '');
        return raw.split('?')[0] || '/dashboard';
    }

    function match(path) {
        for (const r of routes) {
            const m = path.match(r.pattern);
            if (m) {
                const params = {};
                (r.keys || []).forEach((k, i) => { params[k] = m[i + 1]; });
                return { route: r, params };
            }
        }
        return null;
    }

    async function resolve() {
        const path = parse();
        let hit = match(path);

        if (!hit) {
            global.location.hash = '#/dashboard';
            return;
        }

        if (hit.route.auth) {
            const me = await global.Auth.currentTeacher();
            if (!me) { global.location.hash = '#/login'; return; }
        } else {
            const me = await global.Auth.currentTeacher();
            if (me && path === '/login') { global.location.hash = '#/dashboard'; return; }
        }

        render(hit.route, hit.params);
    }

    function setChrome(show) {
        const header = document.getElementById('app-header');
        const footer = document.getElementById('app-footer');
        if (header) header.hidden = !show;
        if (footer) footer.hidden = !show;
    }

    async function render(route, params) {
        if (global.Modal) global.Modal.close();
        setChrome(!!route.chrome);
        document.querySelectorAll('.view').forEach((v) => { v.hidden = true; });

        const updateHeaderName = async () => {
            const me = await global.Auth.currentTeacher();
            const nameEl = document.getElementById('header-teacher-name');
            if (nameEl && me) nameEl.textContent = me.name;
        };

        switch (route.view) {
            case 'login': {
                const el = document.getElementById('view-login');
                el.hidden = false;
                global.LoginView.render(el);
                break;
            }
            case 'dashboard': {
                const el = document.getElementById('view-dashboard');
                el.hidden = false;
                await global.DashboardView.render(el);
                await updateHeaderName();
                break;
            }
            case 'reminders': {
                const el = document.getElementById('view-reminders');
                el.hidden = false;
                await global.RemindersView.render(el);
                await updateHeaderName();
                break;
            }
            case 'class': {
                const el = document.getElementById('view-class');
                el.hidden = false;
                await global.ClassView.render(el, params.id);
                await updateHeaderName();
                break;
            }
            case 'student': {
                const el = document.getElementById('view-student');
                el.hidden = false;
                await global.StudentView.render(el, params.id);
                await updateHeaderName();
                break;
            }
            case 'settings': {
                const el = document.getElementById('view-settings');
                el.hidden = false;
                if (global.SettingsView.resetState) global.SettingsView.resetState();
                await global.SettingsView.render(el);
                await updateHeaderName();
                break;
            }
            case 'portfolio': {
                const el = document.getElementById('view-portfolio');
                el.hidden = false;
                await global.PortfolioView.render(el);
                await updateHeaderName();
                break;
            }
            case 'schedule': {
                const el = document.getElementById('view-schedule');
                el.hidden = false;
                await global.ScheduleView.render(el);
                await updateHeaderName();
                break;
            }
            case 'help': {
                const el = document.getElementById('view-help');
                el.hidden = false;
                global.HelpView.render(el);
                await updateHeaderName();
                break;
            }
            case 'reports': {
                const el = document.getElementById('view-reports');
                el.hidden = false;
                await global.ReportsView.render(el);
                await updateHeaderName();
                break;
            }
            case 'classes': {
                const el = document.getElementById('view-classes');
                el.hidden = false;
                await global.ClassesView.render(el);
                await updateHeaderName();
                break;
            }
            case 'shortcuts': {
                const el = document.getElementById('view-shortcuts');
                el.hidden = false;
                await global.ShortcutsView.render(el);
                await updateHeaderName();
                break;
            }
            case 'profile': {
                const el = document.getElementById('view-profile');
                el.hidden = false;
                await global.ProfileView.render(el);
                await updateHeaderName();
                break;
            }
        }

        // Scroll to top on navigation
        global.scrollTo({ top: 0, behavior: 'instant' });
    }

    function start() {
        global.addEventListener('hashchange', resolve);
        resolve();
    }

    global.Router = { start, resolve };
})(window);
