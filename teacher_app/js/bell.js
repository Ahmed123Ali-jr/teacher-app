/* ==========================================================================
   bell.js — منبّه جرس المدرسة وتنبيه الحصص.

   صوتان مختلفان يُولَّدان في المتصفح لا يُحمَّلان من ملف: الجرس نغماتٌ
   متنافرة تخفت كما يخفت المعدن المطروق، والتنبيه نغمتان ليّنتان. بلا ملفات
   يعمل بلا إنترنت ولا يزيد حجم التطبيق.

   ── قسمةُ العمل ──
   **المقدّمةُ لهذا الملفّ، والخلفيّةُ للنظام.** ما دام التطبيقُ مفتوحاً
   يرنّ الصوتُ المولَّدُ هنا — بلا إذنٍ ولا ملفّ. وحين يُغلَق فالإشعارُ
   المحلّيُّ النظاميُّ هو الذي يرنّ، ويُجدول من `weeklyPlan()` أدناه.
   ولا تعمل الجدولةُ النظاميّةُ إلّا داخل الغلاف (Capacitor) — وفي المتصفّح
   تبقى الحلقةُ وحدَها كما كانت.

   ── وثلاثةُ أرقامٍ تحكم التصميم ──
   ١) **iOS يقبل ‎٦٤‎ طلبَ إشعارٍ معلَّقٍ لكلّ تطبيق**، والزائدُ يسقط صامتاً
      بلا خطأٍ ولا سجلّ. (جوابُ مهندس آبل، منتدى المطوّرين ٨١١١٧١.)
   ٢) والطلبُ **المتكرّرُ** يشغل خانةً واحدةً مهما تكرّر — فالجدولُ الأسبوعيُّ
      الثابتُ يُجدول مرّةً ولا يُعاد. لكنّ خانتَه لا تُفرَّج أبداً.
   ٣) وسبعُ حصصٍ ببدايةٍ ونهايةٍ = ‎١٤‎ حدثاً يوميّاً، تنكمش إلى ‎٩‎ أوقاتٍ
      متمايزةٍ بالدمج، × ‎٥‎ أيّام = ‎٤٥‎ للجرس وحدَه. فمعلّمٌ بنصابٍ كاملٍ
      يتجاوز السقفَ ما لم تُدمج اللحظاتُ وتُرتَّب بالأولويّة — وذاك عملُ
      `weeklyPlan()`.
   ========================================================================== */

(function (global) {
    'use strict';

    const PREF_KEY  = 'bell_prefs';
    const FIRED_KEY = 'bell_fired';
    const TICK_MS   = 10000;   // كل عشر ثوانٍ
    /* نافذة واسعة عمداً: المتصفح يخنق المؤقّتات إلى مرة كل دقيقة حين تكون
       الصفحة في الخلفية أو الشاشة مطفأة، فنافذة ضيّقة تعني جرساً لا يرنّ.
       ثلاث دقائق تضمن أن يمرّ عليه نبضٌ واحد على الأقل — وأن يرنّ متأخراً
       دقيقةً خيرٌ من ألّا يرنّ. وكل موعد يُطلق مرة واحدة في اليوم. */
    const WINDOW_S  = 180;

    const DEFAULTS = {
        enabled:     false,   // مطفأ حتى يشغّله المعلم — لا نفاجئه بجرس
        schoolBell:  true,    // جرس بداية الحصة ونهايتها لكل الحصص
        classAlert:  true,    // تنبيه قبل حصصه هو
        preMinutes:  5,
        /* كم يدقّ الجرسُ داخل التطبيق — بطلبه (٤ سبتمبر ٢٠٢٦): «حطّ للمنبّه
           خيار كم ثانية يجلس يدقّ وخلّ المعلّم هو يختار». و‎4‎ افتراضاً
           لأنّها أقربُ إلى ما كان (ثلاثُ ضرباتٍ ≈ ‎3.55‎ ثانية). */
        ringSeconds: 4
    };

    let prefs   = { ...DEFAULTS };
    let timer   = null;
    let ctx     = null;
    let unlocked = false;

    /* ---------- الصوت ---------- */

    function audioCtx() {
        if (!ctx) {
            const AC = global.AudioContext || global.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    }

    /* المتصفحات تمنع الصوت قبل أول لمسة من المستخدم، فنفتح المسار عند أول
       تفاعل مهما كان — بعدها يرنّ المنبّه وحده. */
    function unlock() {
        if (unlocked) return;
        const c = audioCtx();
        if (!c) return;
        unlocked = true;
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
            global.removeEventListener(ev, unlock, true));
    }

    function armUnlock() {
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
            global.addEventListener(ev, unlock, true));
    }

    /** نغمة واحدة تخفت أُسّياً. */
    function tone(c, freq, startAt, dur, gain, type) {
        const osc = c.createOscillator();
        const amp = c.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, startAt);
        amp.gain.setValueAtTime(0.0001, startAt);
        amp.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
        osc.connect(amp).connect(c.destination);
        osc.start(startAt);
        osc.stop(startAt + dur + 0.05);
    }

    /* الجرس: نسب متنافرة كنسب الأجراس الحقيقية — لا مضاعفات صحيحة، وإلا
       سُمع كنغمة أرغن لا كجرس. */
    const BELL_PARTIALS = [0.56, 1, 1.5, 2.0, 2.66, 3.01];

    function strike(c, at, base) {
        BELL_PARTIALS.forEach((p, i) => {
            tone(c, base * p, at, 2.4 - i * 0.28, 0.16 / (i + 1), 'sine');
        });
    }

    /** الفاصلُ بين ضربتين — من وصفة الجرس نفسِها. */
    const STRIKE_GAP = 0.55;

    /**
     * الجرسُ يضرب حتى تنقضيَ المدّةُ التي اختارها المعلّم.
     *
     * ── ولماذا تكرارُ الضربة لا إطالةُ الضربة ──
     * الضربةُ الواحدة تخفت أُسّيّاً في ‎2.4‎ ثانية — وإطالتُها تجعلها أنيناً
     * لا جرساً. وجرسُ المدرسة الحقيقيُّ يضرب متتابعاً، فالتكرارُ هو الصوابُ
     * صوتاً قبل أن يكون أسهلَ برمجة.
     *
     * وآخرُ ضربةٍ تُترك تخفت كاملةً ولا تُقطع: المدّةُ المختارة هي مدّةُ
     * **الضرب** لا مدّةُ الصمت بعده.
     *
     * @param {number} [seconds] لتجاوز التفضيل — يستعمله زرُّ «جرّب».
     */
    function playBell(seconds) {
        const c = audioCtx();
        if (!c) return;
        const t = c.currentTime + 0.05;
        const secs = Math.max(1, Number(seconds || prefs.ringSeconds) || 4);
        const n = Math.max(1, Math.round(secs / STRIKE_GAP));
        for (let i = 0; i < n; i++) strike(c, t + i * STRIKE_GAP, 660);
    }

    /** التنبيه: نغمتان صاعدتان ليّنتان، مرتين — يتميّز عن الجرس بوضوح. */
    function playAlert() {
        const c = audioCtx();
        if (!c) return;
        const t = c.currentTime + 0.05;
        [0, 0.9].forEach((off) => {
            tone(c, 880,  t + off,        0.34, 0.13, 'triangle');
            tone(c, 1174, t + off + 0.20, 0.42, 0.13, 'triangle');
        });
    }

    /* ---------- التفضيلات ---------- */

    async function loadPrefs() {
        try {
            const v = await global.TeacherDB.Settings.get(PREF_KEY);
            prefs = { ...DEFAULTS, ...(v && typeof v === 'object' ? v : {}) };
        } catch { prefs = { ...DEFAULTS }; }
        return prefs;
    }

    function getPrefs() { return { ...prefs }; }

    async function savePrefs(next) {
        prefs = { ...prefs, ...next };
        await global.TeacherDB.Settings.set(PREF_KEY, prefs);
        restart();
        reschedule();
        return getPrefs();
    }

    /* ══════════════════════════════════════════════════════════════════
       الجدولةُ النظاميّة — تُبنى من `weeklyPlan` وتُستبدل كاملةً
       ══════════════════════════════════════════════════════════════════
       تُنادى من كلّ ما يغيّر الخطّة: التفضيلات، وتعديلُ الجدول، وأوقاتُ
       الحصص، وتبديلُ الفصل الدراسيّ، والدخول، وذيلُ الترطيب. والاستبدالُ
       كاملٌ لا تفاضليّ: المعرّفاتُ محسوبةٌ من (اليوم والوقت)، فتعديلُ وقتِ
       حصّةٍ يُغيّرها ويترك القديمَ معلّقاً لولا الإلغاء. */

    let _resTimer = null;

    /** آخرُ خطّةٍ حُسبت — تقرؤها شاشةُ الإعدادات لتقول للمعلّم كم جُدول. */
    let lastPlan = null;

    function reschedule() {
        clearTimeout(_resTimer);
        _resTimer = setTimeout(() => { rescheduleNow().catch(() => {}); }, 500);
    }

    /**
     * يحسب الخطّةَ ويُسلّمها للنظام. يعمل في المتصفّح أيضاً — يحسب ويحفظ
     * `lastPlan` ولا يجدول شيئاً، فيُرى العددُ في الإعدادات قبل التغليف.
     * @returns {Promise<object|null>}
     */
    async function rescheduleNow() {
        let teacher = null;
        try { teacher = await global.Auth.currentTeacher(); } catch (e) { teacher = null; }
        if (!teacher || !prefs.enabled) {
            lastPlan = { items: [], total: 0, kept: 0, dropped: 0 };
            if (global.Notify) await global.Notify.cancelAll();
            return lastPlan;
        }
        let periods = [];
        try { periods = await global.PeriodTimes.get(); } catch (e) { return null; }

        const byDay = {};
        try {
            const rows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
            /* ولا انتظارَ في الخطّة الأسبوعيّة — لا الدائمَ ولا انتظارَ اليوم.
               ضُمّت حصّةُ الانتظار إلى الجرس (٤ سبتمبر ٢٠٢٦)، ثمّ قيّدها
               بقوله: **«خلّ حصّة الانتظار الدائمة بدون جرس لين المعلّم
               يختار الفصل اللي بينتظر عنده»**. والاختيارُ يقع في يومه
               ويُمحى في آخره (`sub_class` مع `sub_date`) — فلا تعرفه خطّةٌ
               تُبنى للأسبوع كلِّه سلفاً. ولو جُدولت لرنّت كلَّ أسبوعٍ على
               حصّةٍ لم يُسنَد إليها فصل.
               فمكانُها الحلقةُ داخل التطبيق أدناه، حيث يُقرأ اليومُ كما هو. */
            rows.filter((r) => r.class_id).forEach((r) => {
                if (!byDay[r.day]) byDay[r.day] = new Set();
                byDay[r.day].add(r.period);
            });
        } catch (e) { /* الجرسُ وحدَه خيرٌ من لا شيء */ }

        lastPlan = weeklyPlan({ prefs, periods, byDay });
        if (global.Notify && global.Notify.available()) {
            const perm = await global.Notify.permission();
            if (perm === 'granted') await global.Notify.replaceWeekly(lastPlan.items);
        }
        return lastPlan;
    }

    /** الخطّةُ كما حُسبت آخرَ مرّة — للعرض لا للجدولة. */
    function planSummary() { return lastPlan; }

    /* ---------- ما أُطلق اليوم ---------- */

    function todayKey() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    /* الذاكرة المحلية لا الخادم: لو أعاد المعلم تحميل الصفحة بعد الجرس لا
       يرنّ مرة ثانية على الموعد نفسه. */
    function firedSet() {
        try {
            const raw = JSON.parse(global.localStorage.getItem(FIRED_KEY) || '{}');
            if (raw.date !== todayKey()) return { date: todayKey(), keys: [] };
            return { date: raw.date, keys: Array.isArray(raw.keys) ? raw.keys : [] };
        } catch { return { date: todayKey(), keys: [] }; }
    }

    function markFired(key) {
        const s = firedSet();
        if (s.keys.includes(key)) return false;
        s.keys.push(key);
        try { global.localStorage.setItem(FIRED_KEY, JSON.stringify(s)); } catch { /* وضع خاص */ }
        return true;
    }

    function alreadyFired(key) { return firedSet().keys.includes(key); }

    /* ---------- الجدولة ---------- */

    function timeToMin(hhmm) {
        const [h, m] = String(hhmm || '00:00').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function notify(title, body) {
        try {
            if (global.Notification && Notification.permission === 'granted') {
                new Notification(title, { body, tag: 'bell', silent: true });
            }
        } catch { /* بعض المتصفحات تمنع الإنشاء المباشر */ }
        if (global.TeacherApp && global.TeacherApp.toast) {
            global.TeacherApp.toast(title + (body ? ' — ' + body : ''), 'info', 5000);
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       اللحظاتُ — حسابٌ واحدٌ يقتسمه المساران
       ══════════════════════════════════════════════════════════════════
       كان الحسابُ داخلَ الحلقة، فلو نُسخ للجدولة النظاميّة لتفرّق المنطقُ
       نسختين تفترقان عند أوّل تعديل. فهو هنا دالّةٌ نقيّةٌ لا تقرأ قاعدةً
       ولا تلمس صوتاً — تُعطى ما تحتاج وتردّ اللحظات، فتُختبر بتاريخٍ
       مزيّفٍ بلا متصفّحٍ ولا جهاز. */

    /**
     * لحظاتُ التنبيه في يومٍ بعينه.
     * @param {object} ctx
     *   `prefs`   تفضيلاتُ المعلّم.
     *   `periods` أوقاتُ الحصص.
     *   `mine`    مجموعةُ أرقام حصصه في ذلك اليوم.
     * @returns {Array<{key:string, sec:number, kind:string, n:number}>}
     *   مرتّبةً بالوقت. `sec` ثوانٍ من منتصف الليل.
     */
    function momentsFor(ctx) {
        const { prefs: pf, periods, mine } = ctx;
        const out = [];
        for (const p of periods || []) {
            const startSec = timeToMin(p.start) * 60;
            const endSec   = timeToMin(p.end) * 60;
            if (pf.classAlert && mine && mine.has(p.n)) {
                out.push({ key: 'pre-' + p.n, sec: startSec - pf.preMinutes * 60,
                           kind: 'pre', n: p.n });
            }
            /* الجرسُ على حصصه هو لا على حصص المدرسة كلِّها — بقراره
               (٤ سبتمبر ٢٠٢٦): «جرس المدرسة يكون على حصص المعلّم فقط».
               وكان يرنّ لكلِّ حصّةٍ في الجدول ولو لم يُدرّسها، فيرنّ في يده
               سبعَ مرّاتٍ ذهاباً وسبعاً إياباً وهو يُدرّس أربعاً.
               وفائدةٌ ثانيةٌ تبعت: ‎٧٠‎ إشعاراً أسبوعيّاً نزلت إلى ما دون
               سقف آبل، فلم يعد شيءٌ يُقصّ. */
            if (pf.schoolBell && mine && mine.has(p.n)) {
                out.push({ key: 'start-' + p.n, sec: startSec, kind: 'start', n: p.n });
                out.push({ key: 'end-' + p.n,   sec: endSec,   kind: 'end',   n: p.n });
            }
        }
        return out.sort((a, b) => a.sec - b.sec);
    }

    function hhmm(sec) {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    /** نصُّ الإشعار للحظةٍ واحدة أو للحظاتٍ اجتمعت في وقتٍ واحد. */
    function textFor(list, preMinutes) {
        const pre   = list.filter((x) => x.kind === 'pre');
        const start = list.filter((x) => x.kind === 'start');
        const end   = list.filter((x) => x.kind === 'end');
        const parts = [];
        if (pre.length)   parts.push('حصتك بعد ' + preMinutes + ' دقائق — الحصة ' + pre[0].n);
        if (end.length)   parts.push('انتهت الحصة ' + end.map((x) => x.n).join(' و'));
        if (start.length) parts.push('بدأت الحصة ' + start.map((x) => x.n).join(' و'));
        return parts.join(' · ');
    }

    /* أيّامُ الدراسة: الأحدُ ٠ في جافاسكربت، و١ في تقويم آبل. */
    const STUDY_DAYS = [0, 1, 2, 3, 4];

    /** الميزانيّة: دون سقف النظام بأربع خاناتٍ احتياطاً لما قد يُجدول لاحقاً. */
    const BUDGET = 60;

    /**
     * الخطّةُ الأسبوعيّةُ للإشعارات النظاميّة — طلبٌ متكرّرٌ لكلّ (يومٍ ووقت).
     *
     * ثلاثُ خطواتٍ بهذا الترتيب:
     *   ١) **الدمجُ على الوقت لا على الحدث**: نهايةُ الحصّة الأولى وبدايةُ
     *      الثانية لحظةٌ واحدةٌ في الساعة، فإشعارٌ واحدٌ نصُّه يجمعهما.
     *      وهذا وحدَه ينزل بالجرس من ‎٧٠‎ إلى ‎٤٥‎.
     *   ٢) **الأولويّةُ عند الضيق**: تنبيهُ حصص المعلّم أوّلاً — وهو الذي
     *      يخسر بفقده — ثمّ بدايةُ الحصّة، ثمّ نهايتُها.
     *   ٣) **القصُّ عند السقف**: ما زاد يُترك ويُعَدّ، ويُقال للمعلّم في
     *      الإعدادات. الصمتُ هنا أسوأُ من النقص: النظامُ يُسقط الزائدَ بلا
     *      كلمة، فيصمت جرسُ آخرِ الأسبوع ولا يدري لماذا.
     *
     * @param {object} ctx `prefs` و`periods` و`byDay` (خريطةُ يومٍ ← مجموعةُ حصص).
     * @returns {{items:Array, total:number, kept:number, dropped:number}}
     */
    function weeklyPlan(ctx) {
        const pf = ctx.prefs || prefs;
        const rows = [];
        for (const day of STUDY_DAYS) {
            const mine = (ctx.byDay && ctx.byDay[day]) || new Set();
            const moments = momentsFor({ prefs: pf, periods: ctx.periods, mine });
            const byTime = new Map();
            for (const m of moments) {
                if (m.sec < 0) continue;                    /* تنبيهٌ قبل منتصف الليل */
                const t = hhmm(m.sec);
                if (!byTime.has(t)) byTime.set(t, []);
                byTime.get(t).push(m);
            }
            for (const [t, list] of byTime) {
                const [hour, minute] = t.split(':').map(Number);
                const hasPre = list.some((x) => x.kind === 'pre');
                rows.push({
                    /* معرّفٌ ثابتٌ محسوبٌ من (اليوم والوقت) — يُلغى ويُعاد بلا سجلّ. */
                    id: (day + 1) * 10000 + hour * 100 + minute,
                    weekday: day + 1,                        /* تقويمُ آبل: الأحد ١ */
                    hour: hour,
                    minute: minute,
                    title: textFor(list, pf.preMinutes),
                    body: t,
                    sound: hasPre ? 'alert.wav' : 'bell.wav',
                    rank: hasPre ? 0 : (list.some((x) => x.kind === 'start') ? 1 : 2)
                });
            }
        }
        rows.sort((a, b) => (a.rank - b.rank)
                         || (a.weekday - b.weekday)
                         || (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
        const kept = rows.slice(0, BUDGET);
        return { items: kept, total: rows.length, kept: kept.length,
                 dropped: Math.max(0, rows.length - BUDGET) };
    }

    /* ══════════════════════════════════════════════════════════════════
       الحلقةُ — المقدّمةُ وحدَها
       ══════════════════════════════════════════════════════════════════ */

    /** أإجازةٌ رسميّةٌ اليوم؟ `null` تعني «لا يعرف التقويمُ هذا اليوم». */
    async function officialOff(teacher) {
        if (!global.AcademicCalendar) return null;
        try {
            const override = await global.TeacherDB.Settings.get('academic_calendar');
            const cal = global.AcademicCalendar.resolve(
                teacher && teacher.education_dept, override);
            return global.AcademicCalendar.offInfo(cal, new Date());
        } catch (e) { return null; }
    }

    async function tick() {
        if (!prefs.enabled) return;
        let teacher = null;
        try { teacher = await global.Auth.currentTeacher(); } catch { return; }
        if (!teacher) return;

        const now    = new Date();
        const dayIdx = now.getDay();
        if (dayIdx > 4) return;                    // الجمعة والسبت
        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        /* الإجازةُ الرسميّةُ ثقبٌ كان مفتوحاً: `dayIdx > 4` يمنع الجمعةَ
           والسبتَ وحدَهما، فيرنّ الجرسُ ٧:٠٠ في إجازة الخريف خمسةَ أيّامٍ
           متّصلة. و`null` — يومٌ لا يعرفه التقويم — يُعامَل يومَ دوامٍ كما
           تفعل الرئيسيّةُ تماماً (`officialOffToday` في `dashboard.js`):
           تواريخُ الفصل الثاني لم تصل، وصمتُ نصفِ سنةٍ أسوأُ من رنّةٍ في
           إجازةٍ لا يعرفها. */
        const off = await officialOff(teacher);
        if (off && off.off) return;

        /* أوقاتٌ افتراضيّةٌ لمن لم يضبط أوقاته: كان يخرج هنا صامتاً، فيُفعّل
           المعلّمُ الجرسَ فلا يرنّ أبداً ولا كلمةَ تقول لماذا. */
        let periods = [];
        try {
            periods = await global.PeriodTimes.get();
        } catch { return; }
        if (!periods.length) return;

        /* حصصُ المعلّم اليوم. وكانت تُقرأ للتنبيه اللين وحدَه، فلمّا صار
           الجرسُ أيضاً على حصصه لزمت الاثنين — ولولا ذلك لصمت الجرسُ عند
           من أطفأ «تنبيه حصتك» وأبقى «جرس المدرسة». */
        let mine = new Set();
        if (prefs.classAlert || prefs.schoolBell) {
            try {
                const rows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
                /* وحصصُ الانتظار هنا، وبينهما فرق:
                   • **انتظارُ اليوم** أضافه المعلّمُ بيده لهذا اليوم، فهو
                     يعلم أنّه سيقفه — يرنّ بلا شرطٍ آخر.
                   • **والانتظارُ الدائم** خانةٌ في جدوله لا يعرف عند أيّ
                     فصلٍ سيقفها، فلا يرنّ **حتى يختار الفصل** — وذلك بقراره.
                   وكلاهما بتاريخه، فلا يُحسب صفُّ الأمس الذي لم يُنظَّف بعد. */
                const today = todayKey();
                rows.filter((r) => r.day === dayIdx && (
                        r.class_id
                        || (r.wait_kind === 'today' && r.wait_date === today)
                        || (r.wait_kind === 'perm' && r.sub_class && r.sub_date === today)))
                    .forEach((r) => mine.add(r.period));
            } catch { /* نكمل بالجرس وحده */ }
        }

        const due = (targetSec) => {
            const diff = nowSec - targetSec;
            return diff >= 0 && diff < WINDOW_S;
        };

        for (const m of momentsFor({ prefs, periods, mine })) {
            if (!due(m.sec) || alreadyFired(m.key) || !markFired(m.key)) continue;
            if (m.kind === 'pre') playAlert(); else playBell();
            notify(textFor([m], prefs.preMinutes), hhmm(m.sec));
        }
    }

    function restart() {
        if (timer) { clearInterval(timer); timer = null; }
        if (!prefs.enabled) return;
        timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
    }

    async function start() {
        armUnlock();
        await loadPrefs();
        restart();
        reschedule();
        /* التفضيلاتُ تصل متأخّرةً: `bell_prefs` مرآةٌ تُملأ بعد الترطيب،
           فجدولةُ الإقلاع قد تُبنى على تفضيلٍ قديمٍ والنظامُ يحترمه ولو
           غُيّر بعد ثانية. فيُعاد البناءُ حين ينتهي الترطيب. */
        global.addEventListener('teacherdb:hydrated', () => {
            loadPrefs().then(() => { restart(); reschedule(); }).catch(() => {});
        });
        /* عودة التطبيق للواجهة تفحص فوراً: المؤقّت كان مخنوقاً في الخلفية
           فقد يكون فات موعدٌ لم يُطلق بعد. */
        global.document.addEventListener('visibilitychange', () => {
            if (!global.document.hidden) tick().catch(() => {});
        });
    }

    /** طلب إذن الإشعارات — يُستدعى من زر في الإعدادات (يلزمه تفاعل مستخدم). */
    async function requestNotifications() {
        /* داخل الغلاف: إذنُ النظام لا إذنُ المتصفّح — و`Notification` لا
           وجودَ لها في WKWebView أصلاً. */
        if (global.Notify && global.Notify.available()) {
            const r = await global.Notify.request();
            if (r === 'granted') reschedule();
            return r;
        }
        if (!global.Notification) return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        try { return await Notification.requestPermission(); }
        catch { return 'denied'; }
    }

    global.Bell = {
        start, getPrefs, savePrefs, loadPrefs,
        playBell, playAlert, requestNotifications,
        /* مكشوفتان للاختبار وللجدولة النظاميّة — نقيّتان بلا أثرٍ جانبيّ. */
        momentsFor, weeklyPlan, textFor, reschedule, rescheduleNow, planSummary,
        BUDGET, DEFAULTS
    };
})(window);
