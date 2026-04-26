/* ==========================================================================
   components/modal.js — Tiny modal controller.
   Usage: Modal.open({ title, body, onClose }); Modal.close();
   `body` may be HTMLElement or HTML string.
   ========================================================================== */

(function (global) {
    'use strict';

    const state = { onClose: null, keyHandler: null };

    function root()  { return document.getElementById('modal-root'); }
    function title() { return document.getElementById('modal-title'); }
    function body()  { return document.getElementById('modal-body'); }

    function open({ title: t, body: b, onClose } = {}) {
        const r = root();
        if (!r) return;

        title().textContent = t || '';
        const bodyEl = body();
        bodyEl.innerHTML = '';
        if (b instanceof HTMLElement) {
            bodyEl.appendChild(b);
        } else if (typeof b === 'string') {
            bodyEl.innerHTML = b;
        }

        state.onClose = typeof onClose === 'function' ? onClose : null;

        r.hidden = false;
        document.body.style.overflow = 'hidden';

        // Focus first focusable element
        const focusable = bodyEl.querySelector('input, select, textarea, button');
        if (focusable) focusable.focus();

        // ESC to close
        state.keyHandler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', state.keyHandler);

        // Close on backdrop or [data-modal-close]
        r.querySelectorAll('[data-modal-close]').forEach((el) => {
            el.addEventListener('click', close, { once: true });
        });
    }

    function close() {
        const r = root();
        if (!r || r.hidden) return;
        r.hidden = true;
        document.body.style.overflow = '';
        if (state.keyHandler) {
            document.removeEventListener('keydown', state.keyHandler);
            state.keyHandler = null;
        }
        const cb = state.onClose;
        state.onClose = null;
        if (cb) cb();
    }

    global.Modal = { open, close };
})(window);
