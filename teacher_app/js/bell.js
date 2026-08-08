/* ==========================================================================
   bell.js — منبّه جرس المدرسة وتنبيه الحصص.

   صوتان مختلفان يُولَّدان في المتصفح لا يُحمَّلان من ملف: الجرس نغماتٌ
   متنافرة تخفت كما يخفت المعدن المطروق، والتنبيه نغمتان ليّنتان. بلا ملفات
   يعمل بلا إنترنت ولا يزيد حجم التطبيق.

   قيدٌ لا مفرّ منه: التطبيق صفحة ويب بلا خادم إشعارات، فالمنبّه يعمل
   والتطبيق مفتوح فقط. الرنين والجوال في الجيب يحتاج Web Push بخادم.
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
        preMinutes:  5
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

    function playBell() {
        const c = audioCtx();
        if (!c) return;
        const t = c.currentTime + 0.05;
        // ثلاث ضربات كجرس المدرسة لا ضربة واحدة
        strike(c, t,        660);
        strike(c, t + 0.55, 660);
        strike(c, t + 1.10, 660);
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
        return getPrefs();
    }

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

    async function tick() {
        if (!prefs.enabled) return;
        let teacher = null;
        try { teacher = await global.Auth.currentTeacher(); } catch { return; }
        if (!teacher) return;

        const now    = new Date();
        const dayIdx = now.getDay();
        if (dayIdx > 4) return;                    // الجمعة والسبت
        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        let periods = [];
        try {
            periods = (await global.TeacherDB.Settings.get('period_times')) || [];
        } catch { return; }
        if (!periods.length) return;

        /* حصص المعلم اليوم — التنبيه اللين يخصّها وحدها. */
        let mine = new Set();
        if (prefs.classAlert) {
            try {
                const rows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
                rows.filter((r) => r.day === dayIdx && r.class_id)
                    .forEach((r) => mine.add(r.period));
            } catch { /* نكمل بالجرس وحده */ }
        }

        const due = (targetSec) => {
            const diff = nowSec - targetSec;
            return diff >= 0 && diff < WINDOW_S;
        };

        for (const p of periods) {
            const startSec = timeToMin(p.start) * 60;
            const endSec   = timeToMin(p.end) * 60;

            if (prefs.classAlert && mine.has(p.n)) {
                const preSec = startSec - prefs.preMinutes * 60;
                const key = 'pre-' + p.n;
                if (due(preSec) && !alreadyFired(key) && markFired(key)) {
                    playAlert();
                    notify('حصتك بعد ' + prefs.preMinutes + ' دقائق', 'الحصة ' + p.n);
                }
            }

            if (prefs.schoolBell) {
                const ks = 'start-' + p.n;
                if (due(startSec) && !alreadyFired(ks) && markFired(ks)) {
                    playBell();
                    notify('بدأت الحصة ' + p.n, p.start);
                }
                const ke = 'end-' + p.n;
                if (due(endSec) && !alreadyFired(ke) && markFired(ke)) {
                    playBell();
                    notify('انتهت الحصة ' + p.n, p.end);
                }
            }
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
        /* عودة التطبيق للواجهة تفحص فوراً: المؤقّت كان مخنوقاً في الخلفية
           فقد يكون فات موعدٌ لم يُطلق بعد. */
        global.document.addEventListener('visibilitychange', () => {
            if (!global.document.hidden) tick().catch(() => {});
        });
    }

    /** طلب إذن الإشعارات — يُستدعى من زر في الإعدادات (يلزمه تفاعل مستخدم). */
    async function requestNotifications() {
        if (!global.Notification) return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        try { return await Notification.requestPermission(); }
        catch { return 'denied'; }
    }

    global.Bell = {
        start, getPrefs, savePrefs, loadPrefs,
        playBell, playAlert, requestNotifications,
        DEFAULTS
    };
})(window);
