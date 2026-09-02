/* ==========================================================================
   components/bottom-nav.js — Fixed bottom navigation bar (mobile only).
   Five tabs: Home · Classes · Schedule · Shortcuts · Settings.
   All five are real routes now — no more scroll-within-page tricks.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ══ رسومٌ خطّيّةٌ بدل الإيموجي (٢ سبتمبر ٢٠٢٦، بطلب المعلّم) ══
       الإيموجي شكلُها من نظام الجهاز لا من التطبيق: تختلف بين آيفون
       وأندرويد، وتحمل ألوانَها فلا تتبع لونَ الخانة النشطة ولا الوضعَ
       الداكن. والرسمُ الخطّيُّ يتبع `currentColor` فيرث حبرَ الخانة:
       ‎#575753‎ خاملاً، وأبيضَ نشطاً، و‎#D2D8E2‎ في الداكن — بلا سطرٍ واحد
       في CSS يلاحق الحالات.

       والنمطُ نمطُ التطبيق نفسِه لا نمطٌ جديد: سبعةُ ملفّاتٍ تكتب أيقوناتِها
       هكذا (`views/portfolio.js` و`class-books.js` و`class-exams.js`
       و`reminders.js` وغيرُها). والسُّمكُ ‎1.8‎ عند ‎22px‎ على مقياسها نفسِه
       (‎2‎ عند ‎15px‎، ‎1.8‎ عند ‎20px‎) — فلا يخرج الشريطُ أرقَّ من الشاشة
       التي يفتحها.

       و`fill="none"` تُكتب على الوسم لا في CSS: لا قاعدةَ في `css/` تمسّ
       وسمَ `svg` مجرّداً، فلو تُركت لامتلأت الأيقونةُ سوداء. */
    const D = {
        home:     'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
        users:    'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2'
                + 'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7'
                + 'M21 21v-2a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8',
        calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
        folder:   'M3 7h6l2 2h10v11H3z',
        /* ترسٌ بحلقةٍ وثماني أسنانٍ ملتصقةٍ بها — لا حلقةٌ صغيرةٌ وأشعّةٌ
           بعيدة: جُرّبت فقُرئت شمساً لا ترساً (قِيس على ‎22px‎). والأسنانُ
           تبدأ من محيط الحلقة نفسِه، وحُقٌّ صغيرٌ في الوسط يحسم المعنى.
           وترسُ Feather ذو الحافّة المسنّنة تلتحم أسنانُه عند هذا المقاس. */
        gear:     'M12 18.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13'
                + 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5'
                + 'M18.5 12h2.7M2.8 12h2.7M12 18.5v2.7M12 2.8v2.7'
                + 'M16.6 16.6l1.9 1.9M5.5 5.5l1.9 1.9M7.4 16.6l-1.9 1.9M18.5 5.5l-1.9 1.9'
    };

    function icon(name) {
        return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"'
             + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
             + ' stroke-linejoin="round" aria-hidden="true" focusable="false">'
             + '<path d="' + D[name] + '"/></svg>';
    }

    /**
     * Each item: { key, label, icon, href, matches: (path) => boolean }
     * `matches` decides when to mark the tab active based on the current hash.
     */
    const ITEMS = [
        {
            key: 'home',      label: 'الرئيسية', icon: 'home',
            href: '#/dashboard',
            matches: (p) => p === '/dashboard' || p === '' || p === '/'
        },
        {
            /* 👥 لا 📚 — بقرار المعلّم (٢٨ أغسطس ٢٠٢٦). و📚 كانت تعمل
               عملين: شارةَ هذا التبويب، وشارةَ «الواجبات» في سبعة مواضعَ
               أخرى. والفصلُ عند المعلّم طلابُه لا كتبُه.
               وسقطت 🚪 وهي أوّلُ ما خطر له — فهي شارةُ «تسجيل الخروج» في
               القائمة الجانبية (index.html)، فبابان بمعنيين. */
            key: 'classes',   label: 'الفصول',   icon: 'users',
            href: '#/classes',
            // Also highlight while inside a specific class page
            matches: (p) => p === '/classes' || p.startsWith('/class/')
        },
        {
            key: 'schedule',  label: 'الجدول',   icon: 'calendar',
            href: '#/schedule',
            matches: (p) => p === '/schedule'
        },
        {
            key: 'shortcuts', label: 'إنجاز', icon: 'folder',
            href: '#/shortcuts',
            // Active on the shortcuts hub and any destination reachable from it
            matches: (p) =>
                p === '/shortcuts' || p === '/portfolio' ||
                p === '/reports'   || p === '/help'
        },
        {
            key: 'settings',  label: 'الإعدادات', icon: 'gear',
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
                <span class="bn-icon" aria-hidden="true">${icon(it.icon)}</span>
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
