/* ==========================================================================
   app.js — Application bootstrap.
   Opens the DB, wires global UI (logout, toasts), starts the router.
   ========================================================================== */

(function (global) {
    'use strict';

    const App = {
        version: '0.2.0-phase2',

        async init() {
            console.info('[TeacherApp] init', this.version);

            /* رمزُ الاستعادة يُلتقط **قبل الموجّه**: العميلُ مضبوطٌ على
               `detectSessionInUrl: false` لأنّ التطبيق يتنقّل بالـhash، فلو
               تُرك لمضى الموجّهُ بعنوانٍ لا يفهمه — أو دخل المعلّمُ إلى
               رئيسيّته بجلسةٍ مؤقّتةٍ بلا أن يُسأل عن كلمةٍ جديدة. */
            try {
                const recovery = global.Auth && global.Auth.consumeRecoveryLink
                    ? await global.Auth.consumeRecoveryLink() : null;
                if (recovery === 'recovery') {
                    global.location.hash = '#/reset-password';
                } else if (recovery === 'error') {
                    global.location.hash = '#/login';
                    this.toast('انتهت صلاحية الرابط أو استُعمل من قبل. اطلب رابطاً جديداً.',
                               'error', 8000);
                }
            } catch (e) {
                console.warn('[TeacherApp] recovery link:', e && e.message);
            }

            try {
                await global.TeacherDB.open();
            } catch (err) {
                console.error('[TeacherApp] DB init failed:', err);
                this.toast('فشل تهيئة قاعدة البيانات: ' + err.message, 'error', 6000);
                return;
            }

            /* مخزنُ الجهاز إن تعطّل، تُرجع كلُّ قراءةٍ لا شيء — فيرى المعلّم
               تطبيقاً فارغاً وبياناتُه سليمةٌ على الخادم. فيُقال له صراحةً
               ما جرى، وإلّا قرأ الفراغَ «ضاع عملي». وشريطٌ ثابتٌ لا نخبةٌ
               تمرّ: الحالةُ باقيةٌ حتى يُعاد فتحُ التطبيق. */
            if (global.TeacherDB.cacheDown) {
                const down = global.TeacherDB.cacheDown();
                if (down) this.cacheBanner(down);
                global.addEventListener('teacherdb:cachedown',
                    (ev) => this.cacheBanner(ev.detail));
                /* وإن عاد المخزن، يُرفع الشريط: إنذارٌ باقٍ بعد زوال سببه
                   يُعلّم المعلّمَ ألّا يُصدّق الإنذارات. */
                global.addEventListener('teacherdb:cacheup', () => {
                    const el = document.getElementById('cache-down');
                    if (el) el.remove();
                });
            }

            // Offline-first boot: render from the local cache immediately and
            // sync from Supabase in the BACKGROUND. Previously boot awaited a
            // full network hydrate before showing anything — slow to open on
            // mobile. We only block when the cache is empty (first login), since
            // there's nothing to render yet.
            let me = null;
            try {
                me = await global.Auth.currentTeacher();
                if (me && global.TeacherDB.hydrate) {
                    let hasCache = false;
                    try {
                        hasCache = (await global.TeacherDB.count('classes')) > 0
                                || (await global.TeacherDB.count('students')) > 0;
                    } catch (e) { /* count may fail on a brand-new DB */ }

                    if (hasCache) {
                        // Warm cache → open instantly, refresh in background,
                        // then repaint the current view with the fresh data.
                        global.TeacherDB.hydrate()
                            .then(() => { try { global.Router.resolve(); } catch (e) {} })
                            .catch((e) => console.warn('[TeacherApp] bg hydrate failed:', e.message));
                    } else {
                        // Cold cache → must fetch before there's anything to show.
                        await global.TeacherDB.hydrate();
                    }
                }
            } catch (e) {
                console.warn('[TeacherApp] boot hydrate skipped:', e.message);
            }

            // Cold launch always lands on the home screen. On mobile the app
            // reopens the last URL (e.g. #/settings or #/classes), which is
            // confusing — a fresh open should show the dashboard. In-app
            // navigation and hashchange are untouched (this runs once, at boot).
            if (me) {
                const path = (global.location.hash || '').replace(/^#/, '').split('?')[0];
                /* و`/reset-password` يُستثنى مثلَ `/login`: الداخلُ برابط
                   الاستعادة **له جلسةٌ قائمة**، فكان يُقذف إلى رئيسيّته
                   بجلسةٍ مؤقّتةٍ بلا أن يُسأل عن كلمةٍ جديدة — فيظنّ الرابطَ
                   معطوباً، وكلمتُه القديمة المنسيّة باقية. */
                if (path !== '/login' && path !== '/reset-password') {
                    global.location.hash = '#/dashboard';
                }
            }

            this._bindGlobalUI();
            if (global.SettingsView && global.SettingsView.applyStoredPrefs) {
                await global.SettingsView.applyStoredPrefs();
            }
            /* الكلمات تُقرأ قبل الرسم: نوع المدرسة يقلب «طالب/طالبة» في كل
               الشاشات، وقراءتها بعد الرسم تعني وميض الكلمة الخطأ. */
            if (global.Words) await global.Words.reload();
            if (global.Drawer)     global.Drawer.init();
            if (global.BottomNav)  global.BottomNav.init();
            /* المنبّه لا يوقف الإقلاع: يقرأ تفضيله ويبدأ مؤقّته في الخلفية. */
            if (global.Bell) global.Bell.start().catch(() => {});
            global.Router.start();
        },

        _bindGlobalUI() {
            const logoutBtn = document.getElementById('btn-logout');
            if (logoutBtn) logoutBtn.addEventListener('click', async () => {
                await global.Auth.logout();
                this.toast('تم تسجيل الخروج.', 'info');
                global.location.hash = '#/login';
            });
        },

        /** Toast helper — available app-wide. */
        /**
         * شريطٌ ثابتٌ يعلن تعطّلَ المخزن المحلّي. يُرسم مرّةً واحدة مهما
         * تكرّر السبب، ولا يزول إلّا بإعادة فتح التطبيق — فالحالةُ نفسُها
         * لا تزول.
         */
        cacheBanner(reason) {
            if (document.getElementById('cache-down')) return;
            const el = document.createElement('div');
            el.id = 'cache-down';
            el.className = 'cache-down';
            el.setAttribute('role', 'alert');
            el.innerHTML = '<b>تعذّر فتحُ مخزن الجهاز.</b> '
                + 'بياناتُك سليمةٌ في حسابك، لكن هذه الشاشة قد تظهر فارغة. '
                + '<span class="cd-why"></span>';
            el.querySelector('.cd-why').textContent = reason || '';
            const main = document.querySelector('.app-main') || document.body;
            main.insertBefore(el, main.firstChild);
        },

        toast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('toast-container');
            if (!container) { console.log('[toast]', type, message); return; }

            const el = document.createElement('div');
            el.className = 'toast toast-' + type;
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');
            el.textContent = message;
            container.appendChild(el);

            global.setTimeout(() => {
                el.style.transition = 'opacity 250ms ease, transform 250ms ease';
                el.style.opacity   = '0';
                el.style.transform = 'translateY(-8px)';
                global.setTimeout(() => el.remove(), 260);
            }, duration);
        }
    };

    global.TeacherApp = App;

    /* ==========================================================================
       الأخطاءُ التي لا يلتقطها أحد
       ==========================================================================
       كتابةٌ تفشل في مسارٍ لا ينتظرها أحد تختفي بلا أثر: لا رسالةَ للمعلّم،
       ولا سطرَ في السجلّ يُسأل عنه بعد شهر. فيُلتقط الرفضُ المهمَل وخطأُ
       التنفيذ عالمياً.

       ويُقال للمعلّم مرّتين لا أكثر: التكرارُ في شاشةٍ معطوبةٍ يُغرق الشاشةَ
       بنخبٍ لا تُقرأ ويحجب ما تحتها. وما بعدهما في السجلّ وحده — وهو مكانُه.
       ========================================================================== */
    const _seen = [];
    let _shown = 0;

    function noteFailure(what, detail) {
        const line = what + ': ' + detail;
        _seen.push(line);
        console.error('[TeacherApp] ' + line);
        if (_shown >= 2) return;
        _shown += 1;
        if (App.toast) App.toast('حدث خطأٌ غير متوقّع — إن تكرّر أعد فتح التطبيق.', 'error', 6000);
    }

    /** ما التُقط في هذه الجلسة — يقرؤه فاحصُ الدخان. */
    App.failures = () => _seen.slice();

    /* ==========================================================================
       دورانُ اليوم والتطبيقُ مفتوح
       ==========================================================================
       الجدولُ يُنظّف «انتظارَ اليوم» و«الإسنادَ» عند رسمه، بمقارنة تاريخِ
       الصفّ بتاريخ **لحظةِ الرسم**. وعلى الجوال لا يُغلق التطبيق: يفتحه
       المعلّم صباحاً فيرى شاشةَ الأمس كما تركها — انتظارُ أمسِ ما زال في
       جدوله، ويُطبع في ملفّ إنجازه على أنّه اليوم.

       فيُعاد الرسمُ حين يعود إلى التطبيق **وقد تغيّر اليوم فعلاً** — لا
       عند كلِّ عودة: إعادةُ رسمٍ لا داعيَ لها تُضيع موضعَ التمرير وما في
       الحقول. */
    let _dayStamp = new Date().toDateString();

    function checkDayRollover() {
        if (document.hidden) return;
        const now = new Date().toDateString();
        if (now === _dayStamp) return;
        _dayStamp = now;
        console.info('[TeacherApp] تغيّر اليوم — يُعاد رسمُ الشاشة.');
        if (global.Router && global.Router.resolve) global.Router.resolve();
    }

    document.addEventListener('visibilitychange', checkDayRollover);
    global.addEventListener('focus', checkDayRollover);

    global.addEventListener('unhandledrejection', (ev) => {
        const r = ev && ev.reason;
        noteFailure('وعدٌ مرفوض بلا ملتقط', (r && (r.message || r.name)) || String(r));
    });
    global.addEventListener('error', (ev) => {
        /* أخطاءُ تحميل الصور والملفّات تصل هنا بلا `message` — وهي ليست
           أعطالَ منطقٍ فلا تُنذر المعلّم. */
        if (!ev || !ev.message) return;
        noteFailure('خطأٌ غير ملتقَط', ev.message);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})(window);
