/* ==========================================================================
   guest-notice.js — يُعلم الزائرَ أنّه زائر، عند أوّل عملٍ حقيقيّ.
   ==========================================================================
   `is_guest` كان يُحسب في `Auth` ولا يقرؤه أحد. فالزائر يبني فصولَه
   وجدولَه ولا شيء يقول له إنّ هذا حسابٌ مؤقّت — حتى يخرج، فلا يعود.

   **ولا يُقال له عند الدخول.** من يجرّب تطبيقاً لا يقرأ ما يُعرض عليه قبل
   أن يرى شيئاً. وإنّما يُقال عند أوّل ما يخاف عليه: أوّلِ فصلٍ يُنشئه،
   أوّلِ طالبٍ يُضيفه، أوّلِ حصّةٍ يرفعها.

   **و«عملٌ حقيقيّ» محدّدٌ لا مطّاط:** كتابةٌ ناجحةٌ في مخزنِ محتوى. أمّا
   الإعداداتُ وبياناتُ المعلّم فتهيئةٌ لا عمل — ولو أُطلقت عندها لجاءت
   والزائرُ لم يُنشئ شيئاً بعد، فلا يفهم ما يُقال له.
   ========================================================================== */

(function (global) {
    'use strict';

    /* المخازنُ التي تحمل عملَ المعلّم. `settings` و`teachers` خارجَها
       عمداً — راجع أعلاه. */
    const WORK_STORES = [
        'classes', 'students', 'schedule', 'attendance', 'participation',
        'assignments', 'exams', 'worksheets', 'books', 'reminders',
        'strategies', 'strategy_logs', 'initiatives', 'initiative_logs', 'portfolio'
    ];

    const KEY = 'teacher_app_guest_notice';

    function alreadyTold(uid) {
        try { return global.localStorage.getItem(KEY) === uid; } catch (e) { return false; }
    }
    function remember(uid) {
        try { global.localStorage.setItem(KEY, uid); } catch (e) { /* لا يوقف شيئاً */ }
    }

    let checking = false;

    /**
     * تُنادى بعد كلّ كتابةٍ **ناجحة** في مخزن محتوى.
     * لا تُبطئ الكتابة: تعمل بعدها ولا تُنتظر، وأيُّ خطأٍ فيها يُبتلع —
     * تنبيهٌ لا يظهر أهونُ من كتابةٍ تفشل.
     */
    async function maybeTell() {
        if (checking) return;
        checking = true;
        try {
            const me = await global.Auth.currentTeacher();
            if (!me || !me.is_guest || alreadyTold(me.id)) return;
            remember(me.id);
            if (global.TeacherApp && global.TeacherApp.toast) {
                global.TeacherApp.toast(
                    'أنت تجرّب كزائر — وما أدخلته محفوظ وينتقل معك. '
                    + 'احفظ حسابك من الإعدادات ← «احفظ حسابك».',
                    'info', 9000);
            }
        } catch (e) {
            /* لا يُزعج المعلّمَ بفشلِ تنبيه. */
        } finally {
            checking = false;
        }
    }

    /**
     * يلفّ `put` و`add` من الخارج بدل أن يُدسّ نداءٌ في كلّ فرعٍ داخلهما —
     * ولهما فروعٌ كثيرة (المعلّم، ملفّ الإنجاز، الإعدادات، الكتب…) فكان
     * النسيانُ في أحدها مسألةَ وقت.
     */
    function wrap(name) {
        const DB = global.TeacherDB;
        const orig = DB && DB[name];
        if (typeof orig !== 'function') return;
        DB[name] = function (storeName) {
            const out = orig.apply(this, arguments);
            if (WORK_STORES.indexOf(storeName) !== -1 && out && typeof out.then === 'function') {
                out.then(() => maybeTell(), () => {});   // الفشلُ ليس عملاً
            }
            return out;
        };
    }

    function install() {
        if (!global.TeacherDB || !global.Auth) return;
        wrap('put');
        wrap('add');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install);
    } else {
        install();
    }

    global.GuestNotice = { install, maybeTell, WORK_STORES };
})(window);
