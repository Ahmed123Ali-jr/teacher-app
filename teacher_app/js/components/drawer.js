/* ==========================================================================
   components/drawer.js — Side drawer controlled by the mobile hamburger.
   Opens on tap of #btn-open-drawer; closes on backdrop / ESC / any
   element marked [data-drawer-close]. Populates user header at open time.
   ========================================================================== */

(function (global) {
    'use strict';

    const state = { keyHandler: null };

    function root() { return document.getElementById('drawer-root'); }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        const a = (parts[0] || '').charAt(0);
        const b = (parts[1] || '').charAt(0);
        return (a + b) || '👤';
    }

    async function fillUserBlock() {
        try {
            const me = await global.Auth.currentTeacher();
            const nameEl   = document.getElementById('drawer-name');
            const schoolEl = document.getElementById('drawer-school');
            const avatarEl = document.getElementById('drawer-avatar');
            if (!me) return;

            if (nameEl)   nameEl.textContent   = me.name || 'معلم';
            if (schoolEl) schoolEl.textContent = me.school_name || '';

            if (avatarEl) {
                if (me.photo instanceof Blob) {
                    const url = URL.createObjectURL(me.photo);
                    avatarEl.innerHTML = `<img src="${url}" alt="">`;
                    global.setTimeout(() => URL.revokeObjectURL(url), 30000);
                } else {
                    avatarEl.textContent = initials(me.name);
                }
            }
        } catch { /* ignore */ }
    }

    async function open() {
        const r = root();
        if (!r) return;
        if (!r.hidden) return;           // already open
        await fillUserBlock();

        r.hidden = false;
        document.body.classList.add('drawer-open');
        // Force reflow so the enter animation runs
        void r.offsetWidth;
        r.classList.add('is-open');

        state.keyHandler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', state.keyHandler);
    }

    function close() {
        const r = root();
        if (!r || r.hidden) return;
        r.classList.remove('is-open');
        document.body.classList.remove('drawer-open');

        if (state.keyHandler) {
            document.removeEventListener('keydown', state.keyHandler);
            state.keyHandler = null;
        }

        // Wait for the transition to finish before un-rendering
        window.setTimeout(() => { r.hidden = true; }, 220);
    }

    function toggle() {
        const r = root();
        if (!r) return;
        if (r.hidden) open(); else close();
    }

    /** Wire up global handlers (called once from app bootstrap). */
    function init() {
        const openBtn = document.getElementById('btn-open-drawer');
        if (openBtn) openBtn.addEventListener('click', open);

        // Any element with [data-drawer-close] closes the drawer on click
        document.addEventListener('click', (e) => {
            const t = e.target.closest('[data-drawer-close]');
            if (t && root() && !root().hidden) close();
        });

        // Logout inside drawer
        const logoutBtn = document.getElementById('btn-logout-drawer');
        if (logoutBtn) logoutBtn.addEventListener('click', async () => {
            close();
            await global.Auth.logout();
            if (global.TeacherApp?.toast) global.TeacherApp.toast('تم تسجيل الخروج.', 'info');
            global.location.hash = '#/login';
        });

        // Close on any hash change (navigation)
        global.addEventListener('hashchange', close);
    }

    global.Drawer = { init, open, close, toggle };
})(window);
