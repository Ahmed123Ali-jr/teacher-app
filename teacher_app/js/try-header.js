/**
 * try-header.js — طبقةُ تجربةٍ للشريط العلوي. **ليست معتمدة.**
 *
 * تُحمَّل من `try-header.html` وحدها. تبني شريطاً بديلاً فوق شريط التطبيق
 * الحقيقي، على شاشاته الحقيقية وببياناته — فالحكمُ يقع على ما سيكون، لا
 * على معاينةٍ تشبهه.
 *
 * ── لماذا لا تلمس `index.html` ──
 * القيدُ المتّفق عليه: لا يُفرَّط في الأساسي. فما دام القرارُ لم يُتّخذ
 * تبقى التجربةُ في ملفّاتها الثلاثة، وحذفُها حذفُها.
 *
 * ── كيف تعمل ──
 * التطبيقُ يعيد بناء شاشاته عند كل تنقّل، فالشريطُ يُعاد بناؤه معها: نستمع
 * لتغيّر المسار وللتغيّرات في الشريط نفسه (MutationObserver) فنُعيد الكتابة.
 * وعناصرُنا خارج الشاشات — بين الشريط والمحتوى — فلا يمحوها إعادةُ الرسم.
 */
(function (global) {
    'use strict';

    const KEY = 'try_hdr_opt';
    const OPTS = ['0', 'a', 'b', 'c', 'd', 'e', 'f'];
    const LABEL = { '0': 'الحالي', a: 'أ', b: 'ب', c: 'ج', d: 'د', e: 'هـ', f: 'و' };

    /* عناوينُ الشاشات: المسارُ كما هو، أو نمطٌ فيه معرّف. الأطولُ أولاً
       فلا يبتلع `#/class/:id` مسارَ `#/class/:id/students`. */
    const TITLES = [
        ['#/class/:id/students',   'سجل الطلاب'],
        ['#/class/:id/curriculum', 'توزيع المنهج'],
        ['#/class/:id/exams',      'الاختبارات'],
        ['#/class/:id/worksheets', 'أوراق العمل'],
        ['#/class/:id/homework',   'الواجبات'],
        ['#/class/:id/books',      'الكتب'],
        ['#/class/:id/strategies', 'الاستراتيجيات'],
        ['#/class/:id',            'الفصل'],
        ['#/student/:id',          'الطالب'],
        ['#/dashboard',            'الرئيسية'],
        ['#/classes',              'الفصول'],
        ['#/schedule',             'الجدول الأسبوعي'],
        ['#/reminders',            'التذكيرات'],
        ['#/reports',              'التقارير'],
        ['#/portfolio',            'ملف الإنجاز'],
        ['#/initiatives',          'المبادرات'],
        ['#/shortcuts',            'الاختصارات'],
        ['#/profile',              'الملف التعريفي'],
        ['#/settings',             'الإعدادات'],
        ['#/help',                 'المساعدة']
    ];

    /* الجذورُ الخمسة: ما يُوصل إليه من الشريط السفلي — لا رجوعَ منها. */
    const ROOTS = ['#/dashboard', '#/classes', '#/schedule', '#/portfolio', '#/settings'];

    let originalInner = null;   // محتوى الشريط الأصلي، يُعاد عند اختيار «الحالي»
    let teacher = null;

    function routeInfo() {
        const h = location.hash || '#/dashboard';
        for (const [pat, title] of TITLES) {
            const rx = new RegExp('^' + pat.replace(/:id/g, '[^/]+').replace(/\//g, '\\/') + '$');
            if (rx.test(h)) return { title: title, root: ROOTS.indexOf(h) >= 0 };
        }
        return { title: 'إنجاز المعلم', root: true };
    }

    function hijri() {
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-arab',
                { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) + ' هـ';
        } catch (e) { return ''; }
    }

    function greetWord() {
        const h = new Date().getHours();
        return (h >= 5 && h < 12) ? 'صباح الخير' : 'مساء الخير';
    }

    function initials(name) {
        const parts = (name || 'معلم').trim().split(/\s+/);
        return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
    }

    /* ── بناءُ الشريط حسب البديل ── */
    function paint() {
        const opt = localStorage.getItem(KEY) || '0';
        const header = document.getElementById('app-header');
        const inner = header && header.querySelector('.header-inner');
        if (!inner) return;

        if (originalInner === null) originalInner = inner.innerHTML;
        document.body.dataset.hdr = opt;

        if (opt === '0') {
            if (inner.innerHTML !== originalInner) inner.innerHTML = originalInner;
            titlebar('', '');
            return;
        }

        const info = routeInfo();
        const burger = inner.querySelector('.hamburger-btn');
        const burgerHtml = burger ? burger.outerHTML : '';

        /* الجانبُ الأيسر: قائمةٌ في الجذور، ورجوعٌ فيما عداها. */
        const side = info.root
            ? burgerHtml
            : '<button type="button" class="try-back" aria-label="رجوع">→</button>';

        let start = '';
        if (opt === 'c' && info.root && location.hash.indexOf('#/dashboard') === 0) {
            const nm = (teacher && teacher.name) || 'معلم';
            start =
                '<div class="try-greet">' +
                    '<div class="av">' + initials(nm) + '</div>' +
                    '<div><div class="t">' + greetWord() + '، ' + nm.split(/\s+/)[0] + '</div>' +
                    '<div class="s">' + hijri() + '</div></div>' +
                '</div>';
        } else if (opt === 'd') {
            start = info.root
                ? '<div class="try-brand" style="font-size:16px;font-weight:700"><span class="dot">◆</span> إنجاز المعلم</div>'
                : '<div class="try-ttl">' + info.title + '</div>';
        } else if (opt === 'f') {
            start = '<div class="brand"><span class="brand-logo">🎓</span></div>';
        } else {
            start = '<div class="try-ttl">' + info.title + '</div>';
        }

        inner.innerHTML = start + side;

        const back = inner.querySelector('.try-back');
        if (back) back.addEventListener('click', () => history.back());

        /* شريطُ العنوان الكبير (ب) والعنوانِ في الصفحة (و). */
        if (opt === 'b' || opt === 'f') titlebar(info.title, subtitleFor(opt, info));
        else titlebar('', '');
    }

    function subtitleFor(opt, info) {
        if (!info.root) return '';
        return hijri();
    }

    /* عنصرٌ بين الشريط والمحتوى: خارج الشاشات، فلا تمحوه إعادةُ رسمها. */
    function titlebar(t, s) {
        let el = document.getElementById('try-titlebar');
        if (!el) {
            const header = document.getElementById('app-header');
            if (!header) return;
            el = document.createElement('div');
            el.id = 'try-titlebar';
            header.parentNode.insertBefore(el, header.nextSibling);
        }
        el.innerHTML = t ? '<div class="t">' + t + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') : '';
    }

    /* ── شريطُ التبديل ── */
    function switcher() {
        const bar = document.createElement('div');
        bar.id = 'try-bar';
        bar.innerHTML = '<span class="lbl">الشريط</span>' +
            OPTS.map((o) => '<button data-o="' + o + '">' + LABEL[o] + '</button>').join('');
        document.body.appendChild(bar);

        function mark() {
            const cur = localStorage.getItem(KEY) || '0';
            bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.o === cur));
        }
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            localStorage.setItem(KEY, b.dataset.o);
            originalInner = originalInner; // يبقى كما هو
            mark();
            paint();
        });
        mark();
    }

    async function boot() {
        try { teacher = await global.Auth.currentTeacher(); } catch (e) { /* زائرٌ أو غير داخل */ }
        switcher();
        paint();

        /* الاسمُ يُقرأ من جديدٍ عند كل تنقّل: من دخل ثم عدّل اسمه في
           «بياناتي» يجده متبدّلاً بلا إعادة فتح. */
        global.addEventListener('hashchange', () => setTimeout(async () => {
            try { teacher = await global.Auth.currentTeacher(); } catch (e) { /* لا شيء */ }
            paint();
        }, 60));

        /* التطبيقُ يُعيد كتابة الشريط عند التنقّل (اسمُ المعلّم مثلاً)،
           فنُعيد نحن الكتابة بعده. والحارسُ يمنع الحلقة: لا نُعيد إلا إن
           اختفى أثرُنا. */
        const header = document.getElementById('app-header');
        if (header) {
            new MutationObserver(() => {
                const opt = localStorage.getItem(KEY) || '0';
                if (opt === '0') return;
                const inner = header.querySelector('.header-inner');
                if (inner && !inner.querySelector('.try-ttl, .try-greet, .try-brand, .brand-logo')) paint();
            }).observe(header, { childList: true, subtree: true });
        }

        /* التمرير: العنوانُ الكبير يصغر ويعود إلى الشريط. */
        global.addEventListener('scroll', () => {
            document.body.classList.toggle('try-scrolled', global.scrollY > 40);
        }, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 700));
    } else {
        setTimeout(boot, 700);
    }
})(window);
