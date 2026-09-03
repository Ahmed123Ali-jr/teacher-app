/* ==========================================================================
   notify.js — الإشعاراتُ النظاميّة: محوّلٌ رقيقٌ بين التطبيق والغلاف
   ==========================================================================
   الجرسُ داخلَ التطبيق يكفيه Web Audio. وحين يُغلَق التطبيقُ لا يبقى إلّا
   الإشعارُ المحلّيُّ النظاميّ — والنظامُ هو الذي يسلّمه، لا التطبيق. وذاك
   لا يكون إلّا داخل الغلاف (Capacitor).

   ── ولماذا محوّلٌ لا نداءٌ مباشر ──
   الشيفرةُ تعمل اليومَ في المتصفّح وغداً في الغلاف. فلو نودي المكوّنُ
   الإضافيُّ مباشرةً من `bell.js` لانكسر المتصفّحُ اليوم، أو امتلأ الملفُّ
   بشروطٍ متفرّقة. فهنا بابٌ واحد: `available()` تقول أين نحن، والبقيّةُ
   تصمت في المتصفّح ولا ترمي.

   ── ثلاثةُ فخاخٍ مقيسةٍ في الوثائق، مكتوبةٌ هنا لئلّا تُنسى ──
   ١) **`on` لا `at`+`repeats`.** الموعدُ الأسبوعيُّ المتكرّر يُكتب
      `schedule: { on: { weekday, hour, minute } }` فيصير
      `UNCalendarNotificationTrigger(repeats:true)`. أمّا `at` مع `repeats`
      فيُترجَم على iOS إلى فاصلٍ زمنيٍّ يُحسب **من لحظة الجدولة** — فينزلق
      الموعدُ ولا يثبت.
   ٢) **الأحدُ ١ لا ٠.** `Weekday.Sunday === 1` في الإضافة، و`getDay()`
      يعدّه صفراً. والإزاحةُ بواحدٍ هنا تعني رنيناً في اليوم الخطأ طوالَ
      الفصل، ولا اختبارَ يكشفها إلّا انتظارُ يومٍ كامل.
   ٣) **الصوتُ لا يُقرأ من `public/`.** `npx cap sync` ينسخ أصولَ الويب إلى
      `ios/App/App/public/`، و`UNNotificationSound(named:)` لا يقرأ من
      مجلّدٍ فرعيّ. فيُضاف `bell.wav` و`alert.wav` يدوياً إلى
      **Copy Bundle Resources** في Xcode. وإن أُخطئ الاسمُ أو المكانُ
      **صمت الإشعارُ بلا رسالة** — لا صوتَ افتراضيَّ حتى.

   ── وما لا يُختبر في المتصفّح ──
   البديلُ الويبيُّ للإضافة يتجاهل `on` ويُطلق فوراً. فرؤيةُ إشعارٍ في
   المتصفّح **لا تعني أنّ الجدولة صحيحة**. لا يُصدَّق شيءٌ من هذا إلّا على
   جهازٍ حقيقيٍّ والشاشةُ مطفأة.
   ========================================================================== */

(function (global) {
    'use strict';

    function plugin() {
        const cap = global.Capacitor;
        if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
        const p = (cap.Plugins && cap.Plugins.LocalNotifications) || global.LocalNotifications;
        return p || null;
    }

    /** أنحن داخل الغلاف ومعنا المكوّن؟ */
    function available() { return !!plugin(); }

    /**
     * حالُ الإذن: `granted` أو `denied` أو `prompt` أو `unavailable`.
     * @returns {Promise<string>}
     */
    async function permission() {
        const p = plugin();
        if (!p) return 'unavailable';
        try {
            const r = await p.checkPermissions();
            return (r && r.display) || 'prompt';
        } catch (e) { return 'unavailable'; }
    }

    /** يُطلب مرّةً واحدة؛ الرفضُ لا يُسأل بعده برمجيّاً. */
    async function request() {
        const p = plugin();
        if (!p) return 'unavailable';
        try {
            const r = await p.requestPermissions();
            return (r && r.display) || 'denied';
        } catch (e) { return 'denied'; }
    }

    /**
     * يستبدل الجدولةَ كلَّها: إلغاءُ ما مضى ثمّ جدولةُ الخطّة.
     * الاستبدالُ لا الإضافة — لأنّ المعرّفات محسوبةٌ من (اليوم والوقت)،
     * فتعديلُ أوقات الحصص يُغيّرها ويترك القديمَ معلّقاً لولا الإلغاء.
     * @param {Array} items مخرجُ `Bell.weeklyPlan().items`
     * @returns {Promise<number>} عددُ ما جُدول
     */
    async function replaceWeekly(items) {
        const p = plugin();
        if (!p) return 0;
        await cancelAll();
        if (!items || !items.length) return 0;
        const notifications = items.map((it) => ({
            id: it.id,
            title: it.title,
            body: it.body,
            sound: it.sound,
            /* **ولا `Critical Alerts`.** بقرار المعلّم (٣ سبتمبر ٢٠٢٦):
               «خلّه يخضع لمفتاح الصامت». فمن أصمت جوّالَه لا يسمع الجرس —
               وهو ما يريده. والتجاوزُ يحتاج استحقاقاً يُطلب من آبل بنموذجٍ
               وتَمنحه للطوارئ لا لجرس مدرسة، فطلبُه بابُ رفضٍ لا بابُ ميزة.

               و`allowWhileIdle` لأندرويد (وضعُ السبات) — لا أثرَ لها على
               iOS، وتُترك لئلّا يُنسى حين يأتي دورُه. */
            schedule: { on: { weekday: it.weekday, hour: it.hour, minute: it.minute },
                        allowWhileIdle: true }
        }));
        await p.schedule({ notifications });
        return notifications.length;
    }

    async function cancelAll() {
        const p = plugin();
        if (!p) return;
        try {
            if (p.cancelAll) { await p.cancelAll(); return; }
            const pend = await p.getPending();
            const ids = ((pend && pend.notifications) || []).map((n) => ({ id: n.id }));
            if (ids.length) await p.cancel({ notifications: ids });
        } catch (e) { /* لا يوقف شيئاً */ }
    }

    /** عددُ المعلَّق فعلاً عند النظام — للقياس لا للعرض المستمرّ. */
    async function pendingCount() {
        const p = plugin();
        if (!p) return 0;
        try {
            const r = await p.getPending();
            return ((r && r.notifications) || []).length;
        } catch (e) { return 0; }
    }

    global.Notify = { available, permission, request, replaceWeekly, cancelAll, pendingCount };
})(window);
