/* ==========================================================================
   components/bottom-nav.js — Fixed bottom navigation bar (mobile only).
   Five tabs: Home · Classes · Schedule · Shortcuts · Settings.
   All five are real routes now — no more scroll-within-page tricks.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ══ أيقونات الشريط الخمس ══
       مرسومةٌ بيدٍ واحدة، لا إيموجي. ولذلك ثلاثةُ أسباب:

       ١) 📚 كانت تعمل عملين: شارةَ «الفصول» هنا، وشارةَ «الواجبات» في
          خمسة مواضعَ أخرى (صفحة الفصل، وملفّ الإنجاز، والتذكيرات،
          والتقارير) — صورةٌ واحدةٌ لمعنيين. والفصلُ عند المعلّم طلابُه.
       ٢) الإيموجي يرسمها كلُّ نظامٍ بيده، وآبل تغيّر أشكالَها بين
          الإصدارات — فيتبدّل شريطُ المعلّم دون أن نلمسه.
       ٣) خمسٌ من مصمّمين مختلفين لا تبدو أسرةً واحدة.

       ── ومسطّحةٌ لا مجسَّمة ──
       بقرار المعلّم (٢٨ أغسطس ٢٠٢٦) بعد أن رأى الاثنتين على جهازه.
       وقد نُفّذت المجسَّمةُ فعلاً — تدرّجاتٌ وظلٌّ ووجهٌ أغمقُ يميناً —
       ثمّ رُدّت: التجسيمُ ظلالٌ ناعمة، والظلُّ الناعمُ يحتاج مساحةً
       ليُرى. وعند ‎20‎ بكسل يُرى الشكلُ لا العمق، فالتدرّجاتُ ثمنٌ بلا
       ثمرة. (وجُرّب الإيزومترك قبلَها فسقط أسوأ: صارت الخمسةُ صناديقَ
       ملوّنةً لا يُفرَّق بينها.)

       ── الألوان ──
       مثبَّتةٌ لا رموز: هي لا تتبع المظهر كما لا تتبعه الإيموجي جنبَها،
       ونُظر إليها في الوضعين فوق الأرضيّة البيضاء والداكنة وفوق الحبّة
       البترولية عند التنشيط.

       وهي من عائلةٍ واحدةٍ لا من هوًى: البيتُ والطلابُ يتشاركان الطينَ
       `#F0B183` والقرميدَ `#E0743F`/`#C25E37`، والتقويمُ وبابُ البيت
       يتشاركان الأزرقَ. فتبدو أسرةً لا خمسةَ غرباء. */

    /** يلفّ محتوى الأيقونة في `<svg>` — والقياسُ في views.css. */
    function icon(body) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
               body + '</svg>';
    }

    /* الرئيسية — بيتٌ بقرميدٍ وجدارٍ طينيٍّ وبابٍ أزرق. */
    const ICON_HOME = icon(
        '<path d="M12 2.7 22.2 11.3H1.8z" fill="#C25E37"/>' +
        '<path d="M4.7 11.3h14.6v9.5a1.2 1.2 0 0 1-1.2 1.2H5.9a1.2 1.2 0 0 1-1.2-1.2z" fill="#F0B183"/>' +
        '<path d="M9.5 22v-4.9a2.5 2.5 0 0 1 5 0V22z" fill="#3E86C0"/>');

    /* الفصول — ثلاثةُ طلاب، الأوسطُ أمامَ صاحبيه. */
    const ICON_CLASSES = icon(
        '<circle cx="4.9" cy="12.1" r="2.35" fill="#F0B183"/>' +
        '<path d="M1.15 20.9a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="#E0743F"/>' +
        '<circle cx="19.1" cy="12.1" r="2.35" fill="#F0B183"/>' +
        '<path d="M15.35 20.9a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="#4FA86E"/>' +
        '<circle cx="12" cy="6.7" r="3.25" fill="#F0B183"/>' +
        '<path d="M6.1 17.9a5.9 5.9 0 0 1 11.8 0v4.05H6.1z" fill="#3E86C0"/>');

    /* الجدول — تقويمٌ برأسٍ قرميديٍّ وحلقتين وصفَّي أيّام. */
    const ICON_SCHEDULE = icon(
        '<rect x="6.6" y="1.9" width="2.2" height="4.6" rx="1.1" fill="#C25E37"/>' +
        '<rect x="15.2" y="1.9" width="2.2" height="4.6" rx="1.1" fill="#C25E37"/>' +
        '<rect x="2.4" y="4" width="19.2" height="18" rx="2.6" fill="#4A85B5"/>' +
        '<path d="M2.4 6.6a2.6 2.6 0 0 1 2.6-2.6h14a2.6 2.6 0 0 1 2.6 2.6v3.2H2.4z" fill="#E0743F"/>' +
        '<circle cx="7.4" cy="14.4" r="1.5" fill="#fff"/>' +
        '<circle cx="12" cy="14.4" r="1.5" fill="#fff"/>' +
        '<circle cx="16.6" cy="14.4" r="1.5" fill="#fff"/>' +
        '<circle cx="7.4" cy="18.6" r="1.5" fill="#BBD7EC"/>' +
        '<circle cx="12" cy="18.6" r="1.5" fill="#BBD7EC"/>');

    /* إنجاز — مجلَّدٌ بلسانٍ خلفيٍّ ووجهٍ أماميٍّ أفتح. */
    const ICON_SHORTCUTS = icon(
        '<path d="M2.3 7a2.1 2.1 0 0 1 2.1-2.1h4.5l2.3 2.7h8.4A2.1 2.1 0 0 1 21.7 9.7v9.2a2.1 2.1 0 0 1-2.1 2.1H4.4a2.1 2.1 0 0 1-2.1-2.1z" fill="#C8862C"/>' +
        '<path d="M2.3 10.6h19.4v8.3a2.1 2.1 0 0 1-2.1 2.1H4.4a2.1 2.1 0 0 1-2.1-2.1z" fill="#E8B657"/>');

    /* الإعدادات — ترسٌ بثمانية أسنان. أربعةُ قضبانٍ متقاطعةٍ تصنعها،
       فتُكتب أربعُ صيغٍ بدل ثمانٍ. والجسمُ عريضٌ عمداً: جُرّبت أسنانٌ
       رفيعةٌ طويلةٌ فصار عند ‎20‎ بكسل نجمةَ ثلجٍ لا ترساً. */
    const ICON_SETTINGS = icon(
        '<g fill="#7C8B99">' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(45 12 12)"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(90 12 12)"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(135 12 12)"/>' +
        '<circle cx="12" cy="12" r="7.7"/></g>' +
        '<circle cx="12" cy="12" r="3" fill="#E8EDF1"/>');

    /**
     * Each item: { key, label, icon, href, matches: (path) => boolean }
     * `matches` decides when to mark the tab active based on the current hash.
     */
    const ITEMS = [
        {
            key: 'home',      label: 'الرئيسية', icon: ICON_HOME,
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
            key: 'schedule',  label: 'الجدول',   icon: ICON_SCHEDULE,
            href: '#/schedule',
            matches: (p) => p === '/schedule'
        },
        {
            key: 'shortcuts', label: 'إنجاز', icon: ICON_SHORTCUTS,
            href: '#/shortcuts',
            // Active on the shortcuts hub and any destination reachable from it
            matches: (p) =>
                p === '/shortcuts' || p === '/portfolio' ||
                p === '/reports'   || p === '/help'
        },
        {
            key: 'settings',  label: 'الإعدادات', icon: ICON_SETTINGS,
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
