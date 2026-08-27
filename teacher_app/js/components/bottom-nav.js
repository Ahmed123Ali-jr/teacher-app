/* ==========================================================================
   components/bottom-nav.js — Fixed bottom navigation bar (mobile only).
   Five tabs: Home · Classes · Schedule · Shortcuts · Settings.
   All five are real routes now — no more scroll-within-page tricks.
   ========================================================================== */

(function (global) {
    'use strict';

    /**
     * Each item: { key, label, icon, href, matches: (path) => boolean }
     * `matches` decides when to mark the tab active based on the current hash.
     */
    const ITEMS = [
        {
            key: 'home',      label: 'الرئيسية', icon: '🏠',
            href: '#/dashboard',
            matches: (p) => p === '/dashboard' || p === '' || p === '/'
        },
        {
            /* 👥 لا 📚 — بقرار المعلّم (٢٨ أغسطس ٢٠٢٦). و📚 كانت تعمل
               عملين: شارةَ هذا التبويب، وشارةَ «الواجبات» في سبعة مواضعَ
               أخرى. والفصلُ عند المعلّم طلابُه لا كتبُه.
               وسقطت 🚪 وهي أوّلُ ما خطر له — فهي شارةُ «تسجيل الخروج» في
               القائمة الجانبية (index.html)، فبابان بمعنيين. */
            key: 'classes',   label: 'الفصول',   icon: '👥',
            href: '#/classes',
            // Also highlight while inside a specific class page
            matches: (p) => p === '/classes' || p.startsWith('/class/')
        },
        {
            key: 'schedule',  label: 'الجدول',   icon: '📅',
            href: '#/schedule',
            matches: (p) => p === '/schedule'
        },
        {
            key: 'shortcuts', label: 'إنجاز', icon: '📁',
            href: '#/shortcuts',
            // Active on the shortcuts hub and any destination reachable from it
            matches: (p) =>
                p === '/shortcuts' || p === '/portfolio' ||
                p === '/reports'   || p === '/help'
        },
        {
            key: 'settings',  label: 'الإعدادات', icon: '⚙️',
            href: '#/settings',
            matches: (p) => p === '/settings'
        }
    ];

    let rendered = false;

    function rootEl() { return document.getElementById('bottom-nav'); }

    function currentPath() {
        return (global.location.hash || '').replace(/^#/, '').split('?')[0] || '/dashboard';
    }

    function render() {
        const el = rootEl();
        if (!el) return;

        el.innerHTML = ITEMS.map((it) => `
            <a href="${it.href}" class="bn-item" data-nav="${it.key}">
                <span class="bn-icon" aria-hidden="true">${it.icon}</span>
                <span class="bn-label">${it.label}</span>
            </a>
        `).join('');

        rendered = true;
        updateActive();
    }

    function updateActive() {
        const el = rootEl();
        if (!el) return;
        const path = currentPath();
        el.querySelectorAll('.bn-item').forEach((a) => {
            const item = ITEMS.find((i) => i.key === a.dataset.nav);
            const active = item && item.matches(path);
            a.classList.toggle('is-active', !!active);
            if (active) a.setAttribute('aria-current', 'page');
            else        a.removeAttribute('aria-current');
        });
    }

    /** Show/hide based on auth: visible only when teacher logged in.
     *  وتُخفى في شاشة التهيئة: هي حاجز إلزامي، وشريط تنقّل فيها يوهم
     *  المعلم أن بإمكانه تخطّيها. */
    async function syncVisibility() {
        const el = rootEl();
        if (!el) return;
        const path = (global.location.hash || '').replace(/^#/, '').split('?')[0];
        if (path === '/setup') { el.hidden = true; return; }
        try {
            const me = await global.Auth.currentTeacher();
            el.hidden = !me;
        } catch {
            el.hidden = true;
        }
    }

    function init() {
        if (!rendered) render();
        syncVisibility();
        global.addEventListener('hashchange', () => {
            updateActive();
            syncVisibility();
        });
    }

    global.BottomNav = { init, render, updateActive, syncVisibility };
})(window);
