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

    /* ══════════════════════════════════════════════════════════════════
       العنوانُ والجذر — لماذا هما في جدول المسارات

       الشريطُ العلويّ كان يكتب اسم التطبيق في الشاشات كلِّها: يُخبر
       المعلّم بما يعرف ولا يقول له أين هو. فصار يحمل **عنوان الشاشة**،
       ومصدرُ العنوان هنا لا في كل شاشةٍ على حدة — وإلّا افترق الاسمُ في
       الشريط عنه في الصفحة.

       و`root` تعني: شاشةٌ يُوصل إليها من الشريط السفلي، فلا رجوعَ منها —
       مكانُ الرجوع فيها زرُّ القائمة. وما عداها يحمل سهمَ رجوع.
       ══════════════════════════════════════════════════════════════════ */
    const routes = [
        { pattern: /^\/login$/,                    view: 'login',     auth: false, chrome: false },
        /* مسارٌ مستقلٌّ لاختيار كلمةٍ جديدة. ولا يكون `/login` لأنّ الداخلَ
           برابط الاستعادة **له جلسةٌ قائمة**، والموجّهُ يردّ أصحابَ الجلسات
           عن شاشة الدخول — فكان يُقذف إلى رئيسيّته بلا أن يُسأل عن كلمة. */
        { pattern: /^\/reset-password$/,           view: 'login',     auth: false, chrome: false },
        { pattern: /^\/setup$/,                    view: 'setup',     auth: true,  chrome: false },
        { pattern: /^\/dashboard$/,                view: 'dashboard', auth: true,  chrome: true, title: 'الرئيسية',        root: true },
        { pattern: /^\/reminders$/,                view: 'reminders', auth: true,  chrome: true, title: 'التذكيرات' },
        /* لوحةُ الفصل بلا عنوان: بطاقتُها تحمل الاسم كاملاً. وأقسامُه
           تحتها تحمل عناوينَها من `TAB_TITLES`. */
        { pattern: /^\/class\/([\w-]+)$/,   keys: ['id'], view: 'class',   auth: true, chrome: true, title: '' },
        { pattern: /^\/class\/([\w-]+)\/(\w+)$/, keys: ['id', 'tab'], view: 'class', auth: true, chrome: true, title: 'الفصل' },
        { pattern: /^\/student\/([\w-]+)$/, keys: ['id'], view: 'student', auth: true, chrome: true, title: 'الطالب' },
        { pattern: /^\/settings$/,                 view: 'settings',  auth: true, chrome: true, title: 'الإعدادات',       root: true },
        { pattern: /^\/portfolio$/,                view: 'portfolio', auth: true, chrome: true, title: 'ملف الإنجاز' },
        { pattern: /^\/schedule$/,                 view: 'schedule',  auth: true, chrome: true, title: 'الجدول الأسبوعي', root: true },
        { pattern: /^\/help$/,                     view: 'help',      auth: true, chrome: true, title: 'المساعدة' },
        { pattern: /^\/reports$/,                  view: 'reports',   auth: true, chrome: true, title: 'التقارير' },
        { pattern: /^\/classes$/,                  view: 'classes',   auth: true, chrome: true, title: 'الفصول',          root: true },
        { pattern: /^\/shortcuts$/,                view: 'shortcuts', auth: true, chrome: true, title: 'إنجاز',           root: true },
        { pattern: /^\/initiatives$/,              view: 'initiatives', auth: true, chrome: true, title: 'المبادرات' },
        { pattern: /^\/profile$/,                  view: 'profile',   auth: true, chrome: true, title: 'الملف التعريفي' }
    ];

    /* تبويباتُ الفصل: عنوانُ الشريط هو اسم التبويب لا اسم الفصل. */
    const TAB_TITLES = {
        students:   'سجل الطلاب',
        curriculum: 'توزيع المنهج',
        exams:      'الاختبارات',
        worksheets: 'أوراق العمل',
        homework:   'الواجبات',
        books:      'الكتب',
        strategies: 'الاستراتيجيات'
    };

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
            /* تسجيلُ الزائر جارٍ: شاشةُ التهيئة تُرسم الآن ولا تنتظره —
               حقولُها فارغةٌ لحسابٍ جديد، والحسابُ يُنتظر عند الحفظ. */
            if (!me && path === '/setup' && global.Auth.guestPending && global.Auth.guestPending()) {
                render(hit.route, hit.params);
                return;
            }
            if (!me) { global.location.hash = '#/login'; return; }
            /* التهيئة إلزامية: أي شاشة قبل إكمالها تُحوّل إليها — وإلا رأى
               المعلم تطبيقاً لا يعرف مدرسته ولا نوعها. */
            if (path !== '/setup' && global.SetupView) {
                if (!(await global.SetupView.isDone(me))) {
                    global.location.hash = '#/setup';
                    return;
                }
            }
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

    /* ══════════════════════════════════════════════════════════════════
       الشريطُ العلوي: العنوان، والرجوع.

       العنوانُ افتراضيّه من الجدول، وللشاشة أن تُدقّقه ببياناتها —
       صفحةُ الطالب تكتب اسمه، وصفحةُ الفصل اسمَ الفصل. فتُنادي
       `Router.setTitle(...)` بعد أن تجلب بياناتها.

       والرجوعُ `history.back()` لا مسارٌ ثابت: من دخل «سجل الطلاب» من
       الرئيسية يعود إليها، ومن دخله من الفصول يعود إلى الفصول. وإن لم
       يكن خلفه شيء (فُتح التطبيق على رابطٍ مباشر) فالرئيسية.
       ══════════════════════════════════════════════════════════════════ */
    function paintChrome(route, params) {
        /* أيُّ انتقالٍ بين المسارات يُسقط الاستعارة: من استعار السهم
           لصفحةٍ داخليّةٍ ثم غادر المسار كلَّه لا يترك سلوكَه خلفه. */
        _backOverride = null;
        const titleEl = document.getElementById('hdr-title');
        const backEl  = document.getElementById('hdr-back');
        const burger  = document.getElementById('btn-open-drawer');
        if (!titleEl) return;

        let title = route.title || '';
        if (route.view === 'class' && params && params.tab) {
            title = TAB_TITLES[params.tab] || title;
        }
        titleEl.textContent = title;

        const isRoot = !!route.root;
        if (backEl)  backEl.hidden = isRoot;
        if (burger)  burger.hidden = !isRoot;
    }

    function setTitle(text) {
        const el = document.getElementById('hdr-title');
        if (el && text) el.textContent = text;
    }

    /**
     * يُظهر سهمَ الرجوع في الشريط العلوي على شاشةٍ جذر، ويربطه بما يشاء
     * صاحبُها.
     *
     * شاشاتُ الجذر (التي يُوصل إليها من الشريط السفلي) بلا سهمِ رجوع —
     * وهو صحيح. لكنّ الإعدادات تفتح **صفحاتٍ فرعيّةً داخلها** بلا تغيير
     * المسار، فتبقى «جذراً» ولا سهمَ لها. فكانت تصنع زرّاً أبيضَ بحدٍّ
     * وظلٍّ داخل الصفحة — في مكانٍ غير مكان الرجوع في بقيّة التطبيق،
     * وبشكلٍ غير شكله. (بلاغ المستخدم، ٢٥ أغسطس ٢٠٢٦.)
     *
     * فالسهمُ نفسُه يُستعار هنا، ويعود إلى حاله عند الخروج.
     *
     * @param {(() => void)|null} handler ما يُفعل عند الضغط، أو `null`
     *        لإعادة السهم إلى سلوكه الأصلي (خطوةٌ في التاريخ) وإخفائه.
     */
    function overrideBack(handler) {
        const back = document.getElementById('hdr-back');
        const burger = document.getElementById('btn-open-drawer');
        if (!back) return;
        _backOverride = handler || null;
        back.hidden = !handler;
        if (burger) burger.hidden = !!handler;
    }

    let _backOverride = null;

    async function render(route, params) {
        if (global.Modal) global.Modal.close();

        /* شاشاتٌ تُنزَّل عند أول طلبٍ لها لا عند فتح التطبيق. والوعدُ يُنتظر
           هنا وحده: بعده تُنادى الشاشةُ كما كانت تماماً. */
        if (global.ViewLoader) {
            try {
                await global.ViewLoader.ensure(route.view);
            } catch (e) {
                console.error('[Router]', e.message);
                if (global.TeacherApp) {
                    global.TeacherApp.toast('تعذّر تحميل الشاشة — تحقّق من الإنترنت.', 'error', 5000);
                }
                return;
            }
        }

        setChrome(!!route.chrome);
        if (route.chrome) paintChrome(route, params);
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
            case 'setup': {
                const el = document.getElementById('view-setup');
                el.hidden = false;
                await global.SetupView.render(el);
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
                await global.ClassView.render(el, params.id, params.tab || null);
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
            case 'initiatives': {
                /* مكتبة المبادرات صفحة مستقلة أيضاً: الوصول إليها من
                   «إنجاز» بضغطة واحدة بدل فتح ملف الإنجاز ثم نشر قسمها.
                   نفس المكوّن يخدم الموضعين. */
                const el = document.getElementById('view-initiatives');
                el.hidden = false;
                el.innerHTML = `
                    <div class="container">
                        <div class="section-header classes-header" style="margin-top: var(--space-6);">
                            <a href="#/shortcuts" class="btn-add-gray">← إنجاز</a>
                        </div>
                        <div id="ini-panel"></div>
                    </div>`;
                await global.PortfolioInitiatives.render(
                    el.querySelector('#ini-panel'),
                    { teacher: await global.Auth.currentTeacher() }
                );
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

        // First view is on screen — fade out the boot splash (idempotent).
        const splash = document.getElementById('splash');
        if (splash) {
            splash.style.opacity = '0';
            global.setTimeout(() => splash.remove(), 300);
        }
    }

    function start() {
        global.addEventListener('hashchange', resolve);

        /* الرجوعُ خطوةٌ في التاريخ لا مسارٌ ثابت: من فتح «سجل الطلاب» من
           الرئيسية يعود إليها، ومن فتحه من الفصول يعود إلى الفصول. وإن
           فُتح التطبيق على رابطٍ مباشر فلا خلفَه شيء — فالرئيسية. */
        const back = document.getElementById('hdr-back');
        if (back) {
            back.addEventListener('click', () => {
                /* شاشةٌ استعارت السهم تتصرّف به أوّلاً. */
                if (_backOverride) { _backOverride(); return; }
                if (global.history.length > 1) global.history.back();
                else global.location.hash = '#/dashboard';
            });
        }

        resolve();
    }

    global.Router = { start, resolve, setTitle, overrideBack };
})(window);
