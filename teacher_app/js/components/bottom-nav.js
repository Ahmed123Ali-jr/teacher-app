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

       ── التجسيم ──
       بقرار المعلّم (٢٨ أغسطس ٢٠٢٦) بعد أن رأى المسطّحة والمجسَّمة.
       والحجمُ مصنوعٌ بثلاثة: تدرّجٌ من ضوءٍ إلى ظلّ في كلّ سطح، ووجهٌ
       أغمقُ يمينَ كلّ جسمٍ فالضوءُ من اليسار، وظلٌّ ناعمٌ على الأرض.
       ولا صورةَ تُحمَّل — كلُّه مسارات، فلا طلبَ ولا وزن.

       وجُرّب الإيزومترك (مكعّباتٌ بثلاثة أوجه) فسقط: عند ‎20‎ بكسل صارت
       الخمسةُ صناديقَ ملوّنةً لا يُفرَّق بينها. عند هذا الحجم يُرى الشكلُ
       لا العمق.

       ── ولمَ ألوانٌ مثبَّتةٌ لا رموز؟ ──
       هي لا تتبع المظهر كما لا تتبعه الإيموجي، ونُظر إليها في الوضعين
       فوق الأرضيّة البيضاء والداكنة وفوق الحبّة البترولية عند التنشيط.
       والرؤوسُ بلون بشرةٍ لا صفراء — بقراره أيضاً.

       وتعريفاتُ التدرّج تُكرَّر في كلّ أيقونةٍ ببادئةٍ خاصّة بدل مستودعٍ
       مشترك: `url(#id)` يُحلّ على مستوى الصفحة كلِّها، فمستودعٌ واحدٌ
       يجعل الخمسةَ تنكسر معاً إن أُعيد رسمُ جزءٍ منها. والتكرارُ بضعةُ
       بايتات، والانكسارُ شريطٌ بلا أيقونات. */

    /** تدرّجاتُ أيقونةٍ واحدة، مسبوقةً ببادئتها كي لا تتصادم مع أختها. */
    function iconDefs(p) {
        const lin = (id, a, b) =>
            '<linearGradient id="' + p + id + '" x1=".18" y1="0" x2=".82" y2="1">' +
            '<stop offset="0" stop-color="' + a + '"/>' +
            '<stop offset="1" stop-color="' + b + '"/></linearGradient>';
        return '<defs>' +
            lin('bl', '#8CBEEA', '#215788') + lin('or', '#F8B084', '#A84718') +
            lin('gr', '#93D8AE', '#2C7448') + lin('sk', '#FDE0C6', '#CE8551') +
            lin('rf', '#E89A6C', '#8E3A1A') + lin('wl', '#FDE0C6', '#C98F60') +
            lin('pg', '#88B8E4', '#265885') + lin('fb', '#E4B15C', '#8E580F') +
            lin('ff', '#FCE29C', '#C68F30') + lin('gy', '#C2CDD6', '#4F5C69') +
            /* لمعةُ الضوء: بيضاءُ تذوب — تصلح فوق أيِّ لون. */
            '<radialGradient id="' + p + 'gl" cx=".33" cy=".26" r=".8">' +
                '<stop offset="0" stop-color="#fff" stop-opacity=".62"/>' +
                '<stop offset=".65" stop-color="#fff" stop-opacity=".06"/>' +
                '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="' + p + 'hl" cx=".35" cy=".3" r=".8">' +
                '<stop offset="0" stop-color="#FBFDFF"/>' +
                '<stop offset="1" stop-color="#C3CED8"/></radialGradient>' +
            /* ظلُّ الأرض: أسودُ يذوب، فلا يُسوّد الأرضيّةَ الداكنة. */
            '<radialGradient id="' + p + 'sd" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#000" stop-opacity=".3"/>' +
                '<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
            '</defs>';
    }

    /** يلفّ محتوى الأيقونة في `<svg>` ويُلحق تدرّجاتِها وظلَّها. */
    function icon(p, body) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            iconDefs(p) +
            '<ellipse cx="12" cy="22.3" rx="8.6" ry="1.5" fill="url(#' + p + 'sd)"/>' +
            body + '</svg>';
    }

    /* الرئيسية — بيتٌ بقرميدٍ وجدارٍ طينيٍّ وبابٍ أزرق. */
    const ICON_HOME = icon('nvh-',
        '<path d="M12 2.6 22.4 11.4H1.6z" fill="url(#nvh-rf)"/>' +
        '<path d="M12 2.6 22.4 11.4h-4.1L12 6.1z" fill="#5F220C" opacity=".26"/>' +
        '<path d="M4.7 11.4h14.6v9.4a1.2 1.2 0 0 1-1.2 1.2H5.9a1.2 1.2 0 0 1-1.2-1.2z" fill="url(#nvh-wl)"/>' +
        '<path d="M15.6 11.4h3.7v9.4a1.2 1.2 0 0 1-1.2 1.2h-2.5z" fill="#8E5A32" opacity=".22"/>' +
        '<path d="M4.7 11.4h14.6v1.5H4.7z" fill="#6E2B10" opacity=".3"/>' +
        '<path d="M9.5 22v-4.8a2.5 2.5 0 0 1 5 0V22z" fill="url(#nvh-bl)"/>' +
        '<path d="M12.7 14.9a2.5 2.5 0 0 1 1.8 2.3V22h-1.8z" fill="#123E63" opacity=".3"/>');

    /* الفصول — ثلاثةُ طلاب، الأوسطُ أمامَ صاحبيه. */
    const ICON_CLASSES = icon('nvc-',
        '<circle cx="4.9" cy="11.9" r="2.35" fill="url(#nvc-sk)"/>' +
        '<circle cx="4.9" cy="11.9" r="2.35" fill="url(#nvc-gl)"/>' +
        '<path d="M1.15 20.6a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="url(#nvc-or)"/>' +
        '<path d="M5.9 17.2a3.75 3.75 0 0 1 2.75 3.4v1.05H5.9z" fill="#7E3410" opacity=".26"/>' +
        '<circle cx="19.1" cy="11.9" r="2.35" fill="url(#nvc-sk)"/>' +
        '<circle cx="19.1" cy="11.9" r="2.35" fill="url(#nvc-gl)"/>' +
        '<path d="M15.35 20.6a3.75 3.75 0 0 1 7.5 0v1.05h-7.5z" fill="url(#nvc-gr)"/>' +
        '<path d="M20.1 17.2a3.75 3.75 0 0 1 2.75 3.4v1.05H20.1z" fill="#1D5533" opacity=".26"/>' +
        '<path d="M6.1 17.7a5.9 5.9 0 0 1 11.8 0v4.05H6.1z" fill="url(#nvc-bl)"/>' +
        '<path d="M13.6 12.5a5.9 5.9 0 0 1 4.3 5.2v4.05h-4.3z" fill="#123E63" opacity=".24"/>' +
        '<circle cx="12" cy="6.5" r="3.25" fill="url(#nvc-sk)"/>' +
        '<circle cx="12" cy="6.5" r="3.25" fill="url(#nvc-gl)"/>');

    /* الجدول — تقويمٌ برأسٍ قرميديٍّ وحلقتين وصفَّي أيّام. */
    const ICON_SCHEDULE = icon('nvs-',
        '<rect x="6.6" y="1.7" width="2.3" height="4.8" rx="1.15" fill="#8E3A1A"/>' +
        '<rect x="15.1" y="1.7" width="2.3" height="4.8" rx="1.15" fill="#8E3A1A"/>' +
        '<rect x="2.4" y="3.9" width="19.2" height="17.9" rx="2.7" fill="url(#nvs-pg)"/>' +
        '<path d="M18.2 3.9h.7a2.7 2.7 0 0 1 2.7 2.7v12.5a2.7 2.7 0 0 1-2.7 2.7h-.7z" fill="#113F68" opacity=".26"/>' +
        '<path d="M2.4 6.6a2.7 2.7 0 0 1 2.7-2.7h13.8a2.7 2.7 0 0 1 2.7 2.7v3.2H2.4z" fill="url(#nvs-or)"/>' +
        '<path d="M2.4 9.8h19.2v1.2H2.4z" fill="#0E3455" opacity=".38"/>' +
        '<circle cx="7.4" cy="14.8" r="1.6" fill="#fff"/>' +
        '<circle cx="12" cy="14.8" r="1.6" fill="#fff"/>' +
        '<circle cx="16.6" cy="14.8" r="1.6" fill="#fff"/>' +
        '<circle cx="7.4" cy="18.8" r="1.6" fill="#fff" opacity=".52"/>' +
        '<circle cx="12" cy="18.8" r="1.6" fill="#fff" opacity=".52"/>');

    /* إنجاز — مجلَّدٌ بلسانٍ خلفيٍّ ووجهٍ أماميٍّ أفتح. */
    const ICON_SHORTCUTS = icon('nvf-',
        '<path d="M2.3 6.9a2.1 2.1 0 0 1 2.1-2.1h4.5l2.3 2.7h8.4a2.1 2.1 0 0 1 2.1 2.1v9.2a2.1 2.1 0 0 1-2.1 2.1H4.4a2.1 2.1 0 0 1-2.1-2.1z" fill="url(#nvf-fb)"/>' +
        '<path d="M2.3 10.4h19.4v8.4a2.1 2.1 0 0 1-2.1 2.1H4.4a2.1 2.1 0 0 1-2.1-2.1z" fill="url(#nvf-ff)"/>' +
        '<path d="M17.6 10.4h4.1v8.4a2.1 2.1 0 0 1-2.1 2.1h-2z" fill="#8E600F" opacity=".22"/>' +
        '<path d="M2.3 10.4h19.4v1.1H2.3z" fill="#6E4708" opacity=".34"/>');

    /* الإعدادات — ترسٌ بثمانية أسنان. أربعةُ قضبانٍ متقاطعةٍ تصنعها،
       فتُكتب أربعُ صيغٍ بدل ثمانٍ. والجسمُ عريضٌ عمداً: جُرّبت أسنانٌ
       رفيعةٌ طويلةٌ فصار عند ‎20‎ بكسل نجمةَ ثلجٍ لا ترساً. */
    const ICON_SETTINGS = icon('nvg-',
        '<g fill="url(#nvg-gy)">' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(45 12 12)"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(90 12 12)"/>' +
        '<rect x="9.6" y="1.4" width="4.8" height="21.2" rx="2.4" transform="rotate(135 12 12)"/>' +
        '<circle cx="12" cy="12" r="7.8"/></g>' +
        '<path d="M12 4.2a7.8 7.8 0 0 1 0 15.6 7.8 7.8 0 0 0 0-15.6z" fill="#3B4753" opacity=".4"/>' +
        '<circle cx="12" cy="12" r="7.8" fill="url(#nvg-gl)"/>' +
        '<circle cx="12" cy="12" r="3.1" fill="url(#nvg-hl)"/>');

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
