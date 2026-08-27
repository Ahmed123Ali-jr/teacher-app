/* ==========================================================================
   components/bottom-nav.js — Fixed bottom navigation bar (mobile only).
   Five tabs: Home · Classes · Schedule · Shortcuts · Settings.
   All five are real routes now — no more scroll-within-page tricks.
   ========================================================================== */

(function (global) {
    'use strict';

    /* أيقونةُ «الفصول»: ثلاثةُ طلاب، مرسومةٌ لا إيموجي — ولذلك سببان.
       الأوّل أنّ 📚 كانت تعمل عملين: هي شارةُ هذا التبويب، وهي شارةُ
       «الواجبات» في خمسة مواضعَ أخرى (صفحة الفصل، وملفّ الإنجاز،
       والتذكيرات، والتقارير) — صورةٌ واحدةٌ لمعنيين.
       والثاني أنّ «الفصل» عند المعلّم طلابُه لا كتبُه.

       ولماذا ملوّنةٌ لا خطّيّة؟ بقرار المعلّم (٢٨ أغسطس ٢٠٢٦): إخوتُها في
       الشريط إيموجي ملوّنة، وخطٌّ أحاديُّ اللون بينها يبدو غريباً عنها.
       فالرؤوسُ صفراءُ كما تصنع الإيموجي بكلّ إنسانٍ فيها — ولها فائدةٌ
       ثانية: لا تُلزمنا باختيار لونِ بشرةٍ لطلابِ أحد.

       والألوانُ مثبَّتةٌ لا رموز: هي لا تتبع المظهر كما لا تتبعه الإيموجي
       جنبَها، وقد نُظر إليها في الوضعين فوق الأرضية البيضاء والداكنة وفوق
       الحبّة البترولية عند التنشيط. */
    const ICON_CLASSES =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<circle cx="4.9" cy="12.1" r="2.35" fill="#F7C13E"/>' +
            '<path d="M1.15 20.9a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="#E0743F"/>' +
            '<circle cx="19.1" cy="12.1" r="2.35" fill="#F7C13E"/>' +
            '<path d="M15.35 20.9a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="#4FA86E"/>' +
            '<circle cx="12" cy="6.7" r="3.25" fill="#F7C13E"/>' +
            '<path d="M6.1 17.9a5.9 5.9 0 0 1 11.8 0v4.05H6.1z" fill="#3E86C0"/>' +
        '</svg>';

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
            key: 'classes',   label: 'الفصول',   icon: ICON_CLASSES,
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
