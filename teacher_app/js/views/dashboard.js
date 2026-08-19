/* ==========================================================================
   views/dashboard.js — Home screen with today summary + classes grid.
   ========================================================================== */

(function (global) {
    'use strict';

    const GRADES = {
        primary:      ['الصف الأول الابتدائي','الصف الثاني الابتدائي','الصف الثالث الابتدائي',
                       'الصف الرابع الابتدائي','الصف الخامس الابتدائي','الصف السادس الابتدائي'],
        intermediate: ['الصف الأول المتوسط','الصف الثاني المتوسط','الصف الثالث المتوسط'],
        secondary:    ['الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي']
    };

    const STAGE_LABELS = {
        primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي'
    };

    /* بقرار المستخدم (2026-08-04): لون واحد موحّد لكل الفصول —
       الرصاصي الفاتح. لا يوجد اختيار لون في الإضافة أو التعديل،
       والبطاقة تُرسم فاتحة بنص كحلي (.class-card.card-light). */
    const DEFAULT_CLASS_COLOR = '#ECEAE3';

    /* الرفيق الغامق للبطاقات الكبيرة (هيرو الفصل وسجل المتابعة):
       لونُ الهُويّة دائماً — بطلب المستخدم يكون داخل الفصل بلون التطبيق.
       ويُقرأ من `--primary` لا يُكتب بالاسم: كُتب كحلياً هنا فبقي كحلياً
       يوم صار التطبيق بترولياً، وأيقونةُ الفصل وحدها ظلّت من اللون القديم. */
    /* ومن `body` لا من `documentElement`: الوضعُ الداكن يعرّف `--primary`
       على `body.theme-dark`، فقراءتُه من الجذر تردُّ الفاتحَ في المظهرين. */
    const IDENTITY = () => {
        const v = getComputedStyle(document.body)
            .getPropertyValue('--primary').trim();
        return v || '#0A3F4A';
    };
    const DEEP_COMPANION = {
        '#EFE0BE': '#8C6D2F',   // (قيم قديمة من اللوحة السابقة)
        '#E9E4D6': '#8A6F48'
    };

    /* ---------- Stage colors ----------
       One BASE color per stage (saved in Settings under 'stage_colors');
       every class in the stage gets an automatic shade of that base so the
       stage looks unified while each class stays distinguishable.
       A class's shade slot is recoverable from its stored color, so no extra
       column is needed on the classes table. */
    /* بقرار المستخدم (2026-08-04): كل فصول المرحلة بنفس اللون تماماً —
       درجة واحدة فقط. بقيت آلية الدرجات كما هي لو رجعنا نفعّلها. */
    const SHADE_STEPS = [0];

    /* ratio > 0 → toward white, ratio < 0 → toward black */
    function mixHex(hex, ratio) {
        const h = hex.replace('#', '');
        const t = ratio > 0 ? 255 : 0;
        const r = Math.abs(ratio);
        const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
        return '#' + c.map((x) => Math.round(x + (t - x) * r)
            .toString(16).padStart(2, '0')).join('');
    }

    function shadeOf(base, slot) {
        const s = SHADE_STEPS[slot % SHADE_STEPS.length];
        return s === 0 ? base : mixHex(base, s);
    }

    function slotOf(base, color) {
        if (!base || !color) return -1;
        return SHADE_STEPS.findIndex((_, k) => shadeOf(base, k) === color);
    }

    /* إضاءة اللون (0..1) لتمييز البطاقات الفاتحة عن الغامقة أياً كان مصدرها */
    function relLuminance(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length !== 6) return 0;
        const [r, g, b] = [0, 2, 4].map((i) => {
            const v = parseInt(h.substr(i, 2), 16) / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const StageColors = {
        shadeOf,
        /** فاتح لدرجة تستدعي نصاً غامقاً؟ */
        isLight(color) {
            return relLuminance(color) > 0.5;
        },
        /** الرفيق الغامق للون فاتح — للبطاقات ذات الكتابة البيضاء.
         *  يتعرّف على درجات اللون المشتقّة (shadeOf) أيضاً. */
        deepFor(color) {
            const c = String(color || '').toLowerCase();
            for (const base of Object.keys(DEEP_COMPANION)) {
                for (let k = 0; k < SHADE_STEPS.length; k++) {
                    if (shadeOf(base, k).toLowerCase() === c) return DEEP_COMPANION[base];
                }
            }
            return StageColors.isLight(color) ? IDENTITY() : color;
        },
        /** توحيد كل الفصول على اللون الرصاصي المعتمد — تعمل مرة عند فتح
         *  القوائم وتتجاهل ما هو موحّد أصلاً (رخيصة وآمنة التكرار). */
        async normalizeAll(teacherId) {
            const all = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacherId);
            const stale = all.filter((c) => c.color !== DEFAULT_CLASS_COLOR);
            if (!stale.length) return;   // الحالة المعتادة: لا كتابة ولا انتظار
            /* كانت كتابةً متتابعة لكل فصل قديم اللون، وهذه الدالة تُنتظر قبل
               رسم قائمة الفصول — فمعلّم بعشرة فصول ملوّنة كان ينتظر ثلاث
               ثوانٍ عند أول فتح. الآن تمضي معاً. */
            await Promise.all(stale.map((c) => {
                c.color = DEFAULT_CLASS_COLOR;
                return global.TeacherDB.put('classes', c);
            }));
        },
        async get(stage) {
            const map = (await global.TeacherDB.Settings.get('stage_colors')) || {};
            return map[stage] || null;
        },
        async set(stage, color) {
            const map = (await global.TeacherDB.Settings.get('stage_colors')) || {};
            map[stage] = color;
            await global.TeacherDB.Settings.set('stage_colors', map);
        },
        /** Recolor every class of the stage as shades of `base`. Classes keep
         *  their previous shade slot when it can be derived from prevBase;
         *  the rest are assigned free slots in creation order. */
        async applyToStage(teacherId, stage, base, prevBase) {
            const all = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacherId);
            const list = all.filter((c) => c.stage === stage).sort((a, b) =>
                String(a.created_at || a.id).localeCompare(String(b.created_at || b.id)));
            const used = new Set();
            const pending = [];
            const slots = new Map();
            for (const c of list) {
                const k = slotOf(prevBase, c.color);
                if (k >= 0 && !used.has(k)) { used.add(k); slots.set(c, k); }
                else pending.push(c);
            }
            for (const c of pending) {
                let k = 0;
                while (used.has(k)) k++;
                used.add(k);
                slots.set(c, k);
            }
            for (const c of list) {
                const color = shadeOf(base, slots.get(c));
                if (c.color !== color) {
                    c.color = color;
                    await global.TeacherDB.put('classes', c);
                }
            }
        },
        /** Color for a NEW class: the first shade slot not already used. */
        async nextShade(teacherId, stage, base) {
            const all = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacherId);
            const used = new Set();
            all.filter((c) => c.stage === stage).forEach((c) => {
                const k = slotOf(base, c.color);
                if (k >= 0) used.add(k);
            });
            let k = 0;
            while (used.has(k)) k++;
            return shadeOf(base, k);
        }
    };
    global.StageColors = StageColors;

    /* المواد من مصدرٍ واحد — كانت منسوخةً هنا وفي التسجيل وشاشة الفصل. */
    const SUBJECTS       = (global.Subjects || {}).ALL || [];
    const STAGE_SUBJECTS = (global.Subjects || {}).BY_STAGE || {};
    const teacherSubjects = (t) => (global.Subjects ? global.Subjects.ofTeacher(t) : []);


    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function greet() {
        const h = new Date().getHours();
        if (h < 5)  return 'مساء الخير';
        if (h < 12) return 'صباح الخير';
        if (h < 18) return 'مساء الخير';
        return 'مساء الخير';
    }

    function nextClassWidgetHtml(info) {
        if (!info) return '';
        if (info.state === 'done') {
            return `
                <div class="next-class-widget done">
                    <span class="nc-icon">🎉</span>
                    <div>
                        <div class="nc-title">انتهت حصصك اليوم</div>
                        <div class="nc-sub">استمتع بباقي يومك</div>
                    </div>
                </div>
            `;
        }
        if (info.state === 'now') {
            return `
                <a href="#/class/${info.cls.id}" class="next-class-widget live">
                    <span class="nc-icon">▶️</span>
                    <div>
                        <div class="nc-title">حصتك الآن: ${info.cls.grade} / ${info.cls.section}</div>
                        <div class="nc-sub">${info.cls.subject} · حصة ${info.period.n} — تنتهي ${info.period.end}</div>
                    </div>
                </a>
            `;
        }
        if (info.state === 'upcoming') {
            const label = info.minsUntil <= 5 ? 'بعد دقائق ⏰' : `بعد ${info.minsUntil} دقيقة`;
            return `
                <a href="#/class/${info.cls.id}" class="next-class-widget upcoming">
                    <span class="nc-icon">🔔</span>
                    <div>
                        <div class="nc-title">حصتك القادمة: ${info.cls.grade} / ${info.cls.section} — ${label}</div>
                        <div class="nc-sub">${info.cls.subject} · حصة ${info.period.n} — ${info.period.start}</div>
                    </div>
                </a>
            `;
        }
        return '';
    }

    function hijriToday() {
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
            }).format(new Date());
        } catch {
            return new Date().toLocaleDateString('ar-SA');
        }
    }

    /* ---------- الرئيسية الجديدة (المعتمدة 2026-08-04) ---------- */

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    /** "07:55" → دقائق من منتصف الليل، أو null */
    function toMins(hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }

    const REM_TYPES = {
        exam:     { label: 'اختبار', color: '#EF4444' },
        homework: { label: 'واجب',   color: '#F59E0B' },
        meeting:  { label: 'اجتماع', color: '#8B5CF6' },
        activity: { label: 'نشاط',   color: '#0EA5E9' },
        other:    { label: 'أخرى',   color: '#64748B' }
    };

    /** «الرابع الابتدائي / أ» بصيغة مختصرة للحبّات: «الرابع/أ» */
    function chipName(cls) {
        const g = String(cls.grade || '').replace(/^\s*الصف\s+/, '').split(/\s+/)[0];
        return `${g}/${cls.section}`;
    }

    /* المرحلةُ سطرٌ ثانٍ تحت الاسم: «الأول/ب» وحدَها لا تكفي من يدرّس أولَ
       ابتدائيٍّ وأولَ متوسطٍ وأولَ ثانويٍّ في اليوم نفسه — ثلاثُ حبّاتٍ
       متطابقةٍ لا يميّزها. وخانةُ الجدول تفعل هذا أصلاً، فتتّحد القراءتان. */
    function chipStage(cls) {
        const m = String(cls.grade || '').match(/(ابتدائي|متوسط|ثانوي)/);
        return m ? m[1] : '';
    }

    /* بطاقة التذكيرات المطويّة — تُخفى كلياً عند صفر تذكيرات */
    /* البطاقة كانت تختفي تماماً بلا تذكيرات، فلا يجد المعلم من أين يضيف
       واحداً. صارت تظهر دائماً ومعها زرّ الإضافة. */
    function remindersCardHtml(reminders, classById) {
        if (!reminders.length) {
            return `
                <div class="rem-card is-empty" id="rem-card" role="button" tabindex="0" aria-expanded="false">
                    <div class="rem-head">
                        <div class="rem-ic">🔔</div>
                        <b>تذكيرات اليوم</b>
                        <span class="rem-empty-tx">لا شيء اليوم</span>
                        <button type="button" class="rem-add" id="rem-add" aria-label="إضافة تذكير">+</button>
                    </div>
                </div>`;
        }
        const rows = reminders.map((r) => {
            const meta = REM_TYPES[r.type] || REM_TYPES.other;
            const cls = r.class_id ? classById[r.class_id] : null;
            const sub = cls ? `${esc(cls.grade)} / ${esc(cls.section)} · اليوم` : 'اليوم';
            return `
                <div class="rem-it">
                    <span class="rem-dot" style="background:${meta.color}"></span>
                    <div class="rem-tx">
                        <div class="rem-tt">${esc(r.title)}</div>
                        <div class="rem-ss">${sub}</div>
                    </div>
                    <span class="rem-tag" style="background:color-mix(in srgb,${meta.color} 8%,#fff);color:${meta.color}">${meta.label}</span>
                </div>`;
        }).join('');
        return `
            <div class="rem-card" id="rem-card" role="button" tabindex="0" aria-expanded="false">
                <div class="rem-head">
                    <div class="rem-ic">🔔</div>
                    <b>تذكيرات اليوم</b>
                    <span class="rem-bd num">${reminders.length}</span>
                    <button type="button" class="rem-add" id="rem-add" aria-label="إضافة تذكير">+</button>
                </div>
                <div class="rem-body">
                    ${rows}
                    <div class="rem-it rem-all"><a href="#/reminders">كل التذكيرات ←</a></div>
                </div>
            </div>`;
    }

    /* صندوق حصص اليوم الكحلي — حبّات بحالة كل حصة */
    function periodsBoxHtml(todayRows, classById, periodByN) {
        if (!todayRows.length) return '';
        const now = new Date().getHours() * 60 + new Date().getMinutes();
        const chips = todayRows.map((r) => {
            const cls = r.class_id ? classById[r.class_id] : null;
            const p = periodByN[r.period];
            const start = p ? toMins(p.start) : null;
            const end = p ? toMins(p.end) : null;
            let st = '';
            if (end !== null && now >= end) st = 'past';
            else if (start !== null && end !== null && now >= start && now < end) st = 'live';
            const wait = !cls;
            const name = wait ? 'انتظار' : esc(chipName(cls));
            const stage = wait ? '' : esc(chipStage(cls));
            const inner = `
                <span class="pc-n num">${r.period}</span>
                <span class="pc-t num">${p ? esc(p.start) : ''}</span>
                <span class="pc-c">${name}</span>
                ${stage ? `<span class="pc-s">${stage}</span>` : ''}`;
            return wait
                ? `<div class="pchip wait ${st === 'past' ? 'past' : ''}">${inner}</div>`
                : `<a href="#/class/${cls.id}" class="pchip ${st}">${inner}</a>`;
        }).join('');
        return `
            <div class="pday-box">
                <div class="pday-head">
                    <b>🕐 حصص اليوم</b>
                    <a href="#/schedule">الجدول كاملاً</a>
                </div>
                <div class="pday-chips">${chips}</div>
            </div>`;
    }

    /* ---- حالات الإعداد الأولى (البدء) ---- */

    /* أول فتح بلا فصول: طريقان لا واحد — فرفعُ الجدول يبني الفصول
       والحصص معاً، وهو أسرع من إضافة ستّة فصولٍ يدوياً. والإنشاء اليدوي
       يبقى ظاهراً لمن جدولُه ليس بيده. */
    function startFirstClassHtml() {
        /* ── طريقان متساويان لا خطوتان ──
           كان الأولُ في بطاقةٍ مضيئةٍ والثاني زرّاً وحيداً تحتها، فيُقرأ
           خطوةً ثانيةً لا اختياراً آخر. وكان العنوانُ والزرُّ يقولان الشيء
           نفسه: «ارفع جدولك» مرّتين. فصارا صفَّين متساويي الحجم.

           و«ارفع جدولك» أوّلاً بقرار المستخدم (١٧ أغسطس ٢٠٢٦): هو الطريقُ
           الذي يبني الفصولَ والحصصَ معاً، فالبدءُ به أسرعُ من إضافة ستّة
           فصولٍ بيده. والإضافةُ اليدوية تبقى ظاهرةً لمن ليس جدولُه بيده.

           وبلا رمزين: مربّعُ الرمز كان يأخذ ستّةً وأربعين بكسلاً من صدر
           كل بطاقة، والعنوانُ يقول ما تقوله الصورةُ وأدقَّ منها. */
        return `
            <div class="start-two">
                <a href="#/schedule?import=1" class="start-card">
                    <span class="tx">
                        <span class="t">ارفع جدولك</span>
                        <span class="n">تُنشأ فصولك وحصصك تلقائياً</span>
                    </span>
                    <span class="chev">❮</span>
                </a>
                <button type="button" class="start-card" data-add-class>
                    <span class="tx"><span class="t">أضف فصلاً بنفسك</span></span>
                    <span class="chev">❮</span>
                </button>
            </div>`;
    }

    /* فصول موجودة بلا جدول: صندوق «أضف الجدول الأسبوعي» + زر «إضافة فصل» تحته */
    function startScheduleHtml() {
        return `
            <div class="start-box">
                <div class="start-halo"></div>
                <div class="start-ring">📅</div>
                <div class="start-t">أضف الجدول الأسبوعي</div>
                <div class="start-s">حدّد حصص فصولك في الجدول الأسبوعي<br>ليظهر يومك وحصتك القادمة هنا</div>
                <a href="#/schedule" class="start-cta">+ أضف الجدول الأسبوعي</a>
            </div>
            <button type="button" class="start-add-class" data-add-class>+ إضافة فصل</button>`;
    }

    /* يوم بلا حصص / إجازة نهاية الأسبوع */
    function restCardHtml(kind) {
        if (kind === 'weekend') {
            return `
                <div class="home-hero-alt">
                    <div class="ha-t">🌴 إجازة سعيدة</div>
                    <div class="ha-s">نلقاك الأحد بإذن الله</div>
                </div>`;
        }
        return `
            <div class="home-hero-alt">
                <div class="ha-t">🌤️ لا حصص لك اليوم</div>
                <div class="ha-s">يومك خالٍ من الحصص — وقت مناسب لتجهيز الاختبارات وأوراق العمل</div>
                <a href="#/schedule" class="home-alt-lk">📅 الجدول كاملاً ←</a>
            </div>`;
    }

    /* مربع «حصتك الحالية/القادمة» الكحلي — يُستدعى فقط في يوم فيه حصص */
    function heroHtml(info) {
        if (!info || info.state === 'done') {
            return `
                <div class="home-hero-alt">
                    <div class="ha-t">🎉 انتهت حصصك اليوم</div>
                    <div class="ha-s">استمتع بباقي يومك</div>
                </div>`;
        }
        const isNow = info.state === 'now';
        const badge = isNow
            ? '<span class="hh-badge"><i></i> الآن</span>'
            : `<span class="hh-badge soft num">${info.minsUntil <= 5 ? 'بعد دقائق ⏰' : 'بعد ' + info.minsUntil + ' دقيقة'}</span>`;
        return `
            <div class="home-hero">
                ${badge}
                <a href="#/class/${info.cls.id}" class="hh-body">
                    <div class="hh-l">${isNow ? 'حصتك الحالية' : 'حصتك القادمة'}</div>
                    <div class="hh-t">${esc(shortGrade(info.cls.grade))} / ${esc(info.cls.section)}</div>
                </a>
                <a href="#/class/${info.cls.id}/students" class="hh-cta">📋 سجل المتابعة</a>
            </div>`;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) {
            global.location.hash = '#/login';
            return;
        }

        await StageColors.normalizeAll(teacher.id);
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
        const nextClass = global.ScheduleView
            ? await global.ScheduleView.nextClassInfo(teacher)
            : null;

        const scheduleRows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const periods = (await global.TeacherDB.Settings.get('period_times')) || [];
        const periodByN = Object.fromEntries(periods.map((p) => [p.n, p]));
        const jsDay = new Date().getDay();
        const todayIdx = (jsDay >= 0 && jsDay <= 4) ? jsDay : -1;
        const todayRows = todayIdx === -1
            ? []
            : scheduleRows.filter((r) => r.day === todayIdx).sort((a, b) => a.period - b.period);

        const t = todayISO();
        const remindersToday = (await global.TeacherDB.getAllByIndex('reminders', 'teacher_id', teacher.id))
            .filter((r) => r.date === t && !r.done);

        const avatarHtml = global.ProfileView
            ? global.ProfileView.avatarInner(teacher, true)
            : `<span>${esc((teacher.name || '').charAt(0))}</span>`;
        const firstName = esc((teacher.name || '').trim().split(/\s+/)[0] || '');

        // فصل التجهيز: فصل الحصة الحالية/القادمة وإلا أول فصل

        // حالة الإعداد تحدّد محتوى الرئيسية
        const hasClasses     = classes.length > 0;
        const hasSchedule    = scheduleRows.length > 0;
        const isWeekend      = todayIdx === -1;
        const hasPeriodsToday = todayRows.length > 0;

        let body;
        if (!hasClasses) {
            // أول فتح: البطاقة الرصاصية «أضف فصلك الأول» فقط
            body = startFirstClassHtml();
        } else if (!hasSchedule) {
            // فصول بلا جدول: صندوق الجدول + زر إضافة فصل — بلا تذكيرات ولا تجهيز
            body = startScheduleHtml();
        } else if (isWeekend) {
            body = remindersCardHtml(remindersToday, classById) + restCardHtml('weekend');
        } else if (!hasPeriodsToday) {
            body = remindersCardHtml(remindersToday, classById) + restCardHtml('dayoff');
        } else {
            // يوم دراسي فيه حصص: الرئيسية الكاملة
            body = remindersCardHtml(remindersToday, classById)
                 + '<div class="home-sep"></div>'
                 + periodsBoxHtml(todayRows, classById, periodByN)
                 + '<div class="home-sep"></div>'
                 + heroHtml(nextClass);
        }

        container.innerHTML = `
            <div class="container home-v2">
                <div class="home-hd">
                    <div class="home-hd-tt">
                        <h2>${greet()}، ${firstName}</h2>
                        <div class="home-hij">${hijriToday()}</div>
                    </div>
                    <a href="#/profile" class="home-av" aria-label="بياناتي">${avatarHtml}</a>
                </div>
                ${body}
            </div>
        `;

        bind(container, teacher);
    }

    /* نصٌّ وحده: الزرُّ صار عريضاً في أسفل الشاشة، والإطارُ المتقطّع كان
       يرسم صندوقاً حول لا شيء. */
    function emptyState() {
        return `
            <div class="empty-classes">
                <h3>لا توجد لديك فصول بعد</h3>
            </div>
        `;
    }

    /* «الصف الرابع الابتدائي» → «الرابع الابتدائي» على البطاقة فقط */
    function shortGrade(grade) {
        return String(grade || '').replace(/^\s*الصف\s+/, '');
    }

    function classesHtml(classes) {
        const cards = classes.map((c) => `
            <button class="class-card ${StageColors.isLight(c.color) ? 'card-light' : ''}" data-class-id="${c.id}"
                    style="--card-color: ${c.color || DEFAULT_CLASS_COLOR};">
                <div>
                    <h4 class="class-card-title">${STAGE_LABELS[c.stage] || ''} — ${shortGrade(c.grade)} / ${c.section}</h4>
                    <div class="class-card-subject">${c.subject}</div>
                </div>
                <div class="class-card-meta">
                    <span>${global.Words.count(c.student_count || 0)}</span>
                    <span class="class-card-count">📖</span>
                </div>
            </button>
        `).join('');

        const addTile = `
            <button class="class-card class-card-add" data-add-class>
                <span class="plus">+</span>
                <span>إضافة فصل جديد</span>
            </button>
        `;
        return cards + addTile;
    }

    function bind(container, teacher) {
        const openAdd = () => openAddClassModal(teacher);

        const addBtn = container.querySelector('#btn-add-class');
        if (addBtn) addBtn.addEventListener('click', openAdd);

        container.querySelectorAll('[data-add-class], [data-empty-add]').forEach((el) => {
            el.addEventListener('click', openAdd);
        });

        container.querySelectorAll('.class-card[data-class-id]').forEach((el) => {
            el.addEventListener('click', () => {
                global.location.hash = '#/class/' + el.dataset.classId;
            });
        });

        /* الضغط في أي مكان من البطاقة يطوي/ينشر — كان الطيّ محصوراً في
           سهم صغير، والبطاقة كلها هدف أوسع وأسهل على الإبهام. */
        const remCard = container.querySelector('#rem-card');
        if (remCard) {
            const toggle = () => {
                const open = remCard.classList.toggle('open');
                remCard.setAttribute('aria-expanded', String(open));
            };
            remCard.addEventListener('click', toggle);
            remCard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
        }

        container.querySelector('#rem-add')?.addEventListener('click', (e) => {
            e.stopPropagation();   // لا يطوي البطاقة معه
            global.RemindersView.openSheet(teacher, null, () => render(container));
        });
    }

    /* ---------- Today's periods modal ---------- */
    const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

    async function openTodayPeriodsModal(teacher) {
        const jsDay = new Date().getDay();
        const todayIdx = (jsDay >= 0 && jsDay <= 4) ? jsDay : -1;

        const rows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
        const periods = (await global.TeacherDB.Settings.get('period_times')) || [];
        const periodByN = Object.fromEntries(periods.map((p) => [p.n, p]));

        const today = todayIdx === -1
            ? []
            : rows.filter((r) => r.day === todayIdx).sort((a, b) => a.period - b.period);

        const body = document.createElement('div');
        if (todayIdx === -1) {
            body.innerHTML = `<p class="text-muted" style="text-align:center; padding:var(--space-4);">
                اليوم عطلة (الجمعة/السبت).
            </p>`;
        } else if (today.length === 0) {
            body.innerHTML = `<p class="text-muted" style="text-align:center; padding:var(--space-4);">
                لا توجد حصص مسجّلة لليوم.
                <br><br>
                <a href="#/schedule" class="btn btn-secondary btn-sm" data-modal-close>إعداد الجدول الأسبوعي</a>
            </p>`;
        } else {
            const escape = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[m]));
            body.innerHTML = `
                <p class="text-muted" style="font-size:var(--fs-sm); margin:0 0 var(--space-4);">
                    📅 ${DAY_LABELS[todayIdx]} — ${today.length} حصص
                </p>
                <div style="display:flex; flex-direction:column; gap:var(--space-3);">
                    ${today.map((r) => {
                        const cls = classById[r.class_id];
                        const p   = periodByN[r.period];
                        const time = p ? `${p.start} — ${p.end}` : '';
                        const isWaiting = !cls;
                        // شريط جانبي فاتح لا يظهر — استخدم الرفيق الغامق
                        const color = isWaiting ? '#F59E0B' : StageColors.deepFor(cls?.color || DEFAULT_CLASS_COLOR);
                        const title = isWaiting
                            ? '⏳ حصة انتظار'
                            : `${escape(cls.grade)} / ${escape(cls.section)} — ${escape(cls.subject)}`;
                        const tag = isWaiting ? 'div' : 'a';
                        const hrefAttr = isWaiting ? '' : `href="#/class/${cls.id}" data-modal-close`;
                        return `
                            <${tag} ${hrefAttr} class="card"
                               style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3) var(--space-4); text-decoration:none;
                                      border-right:4px solid ${color}; ${isWaiting ? 'background:#FEF3C7;' : ''}">
                                <div style="flex:0 0 56px; text-align:center;">
                                    <div style="font-size:var(--fs-lg); font-weight:var(--fw-bold); color:${isWaiting ? '#78350F' : 'var(--primary)'};">${r.period}</div>
                                    <div style="font-size:var(--fs-xs); color:var(--text-muted);">الحصة</div>
                                </div>
                                <div style="flex:1; min-width:0;">
                                    <div style="font-weight:var(--fw-bold); color:${isWaiting ? '#78350F' : 'var(--text)'};">${title}</div>
                                    ${r.topic ? `<div class="text-muted" style="font-size:var(--fs-sm); margin-top:2px;">${escape(r.topic)}</div>` : ''}
                                    ${time ? `<div class="text-muted" style="font-size:var(--fs-xs); margin-top:2px;">⏰ ${time}</div>` : ''}
                                </div>
                            </${tag}>
                        `;
                    }).join('')}
                </div>
                <div style="text-align:center; margin-top:var(--space-4);">
                    <a href="#/schedule" class="btn btn-ghost btn-sm" data-modal-close>عرض الجدول الكامل</a>
                </div>
            `;
        }
        global.Modal.open({ title: '📅 حصص اليوم', body });
    }

    /* ---------- Add class modal ---------- */
    /* أربعُ شُعبٍ و«أخرى»: المعلّم يكتب ما بعدها بيده. ثمانيةُ أزرارٍ كانت
       تملأ سطرين ولا تُستعمل إلا أوّلُها. */
    const SECTIONS = ['أ', 'ب', 'ج', 'د'];

    /* لوحة إضافة الفصل باللمس — نفس أسلوب لوحة الجدول: مرحلة ← صف ← شعبة ←
       مادة، بلا قوائم منسدلة ولا زر حفظ؛ اختيار المادة هو الحفظ. */
    /* المواد التي يكتبها المعلم بنفسه تُحفظ فتظهر له جاهزة في كل مرة تالية. */
    async function loadCustomSubjects() {
        const v = await global.TeacherDB.Settings.get('custom_subjects');
        return Array.isArray(v) ? v : [];
    }

    async function rememberSubject(name) {
        const known = SUBJECTS.concat(await loadCustomSubjects());
        if (known.includes(name)) return;
        await global.TeacherDB.Settings.set('custom_subjects',
            (await loadCustomSubjects()).concat(name));
    }

    /**
     * نافذة إضافة الفصل — نفسها من الرئيسية ومن الجدول.
     * @param {object} teacher
     * @param {object} [opts] — { onCreated(cls) } فمن ناداها يقرّر أين يرجع:
     *        الرئيسية تفتح قائمة الفصول، والجدول يُسند الفصل لخانته فوراً.
     */
    async function openAddClassModal(teacher, opts) {
        opts = opts || {};
        /* المادةُ تبدأ بتخصّص المعلّم — هو الغالبُ في فصوله، فلا يختار شيئاً. */
        const pick = {
            stage: 'primary', grade: null, section: null,
            subject: (teacherSubjects(teacher) || [])[0] || ''
        };
        /* «أخرى» تفتح حقل كتابة بدل أن تكون قيمة تُحفظ كما هي. */
        const other = { sec: false, subj: false };
        let custom = await loadCustomSubjects();
        let saving = false;

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        paint();

        /* المادةُ منسدلةٌ لا مربّعاتٍ مبعثرة، وافتراضُها تخصّصُ المعلّم —
           فأكثرُ فصوله بمادّته، ولا يختار في الغالب شيئاً.

           وكان اختيارُ المادة يحفظ الفصلَ بلمسته، فصار الحفظُ زرّاً صريحاً:
           المنسدلةُ تُغيَّر ولا تُنشئ، والقرارُ يبقى للمعلّم. */
        function subjectPickHtml() {
            const mine = teacherSubjects(teacher).concat(custom)
                .filter((x, i, a) => x && a.indexOf(x) === i);
            const stageList = STAGE_SUBJECTS[pick.stage] || SUBJECTS;
            const rest = stageList.filter((x) => x !== 'أخرى' && !mine.includes(x));
            const opt = (x) => `<option value="${escapeAttr(x)}" ${pick.subject === x ? 'selected' : ''}>${escapeHtml(x)}</option>`;
            return `
                <div class="sch-lbl">المادة</div>
                <select class="subp-select" id="subj-select">
                    ${mine.length ? `<optgroup label="موادك">${mine.map(opt).join('')}</optgroup>` : ''}
                    ${rest.length ? `<optgroup label="مواد ${escapeHtml(STAGE_LABELS[pick.stage] || '')}">${rest.map(opt).join('')}</optgroup>` : ''}
                    <option value="__other__" ${other.subj ? 'selected' : ''}>✎ أخرى — اكتبها بنفسك</option>
                </select>
                ${other.subj ? `
                    <div class="sch-other" style="margin-top:9px">
                        <input type="text" class="input" id="subj-other" maxlength="40"
                               placeholder="اكتب اسم المادة" value="${escapeAttr(pick.subject || '')}">
                    </div>` : ''}
                <button type="button" class="fsave" style="margin-top:13px" data-subj-save>+ إضافة الفصل</button>`;
        }

        function paint() {
            const ready = pick.grade !== null && pick.section;
            body.innerHTML = `
                <div class="sch-lbl">المرحلة</div>
                <div class="sch-chips">
                    ${Object.keys(STAGE_LABELS).map((k) => `
                        <button type="button" class="sch-chip ${pick.stage === k ? 'on' : ''}" data-stage="${k}">${STAGE_LABELS[k]}</button>
                    `).join('')}
                </div>

                <div class="sch-lbl">الصف</div>
                <div class="sch-g3">
                    ${GRADES[pick.stage].map((g, i) => `
                        <button type="button" class="sch-gcell ${pick.grade === i ? 'on' : ''}" data-grade="${i}">
                            ${escapeHtml(g.replace(/^\s*الصف\s+/, '').split(/\s+/)[0])}
                        </button>
                    `).join('')}
                </div>

                <div class="sch-lbl" style="margin-top:13px">الشعبة</div>
                <div class="sch-secs">
                    ${SECTIONS.map((s) => `
                        <button type="button" class="sch-sec ${!other.sec && pick.section === s ? 'on' : ''}"
                                data-sec="${escapeAttr(s)}" ${pick.grade === null ? 'disabled' : ''}>${s}</button>
                    `).join('')}
                    <button type="button" class="sch-sec wide ${other.sec ? 'on' : ''}" data-sec-other
                            ${pick.grade === null ? 'disabled' : ''}>✎ أخرى</button>
                </div>
                ${other.sec ? `
                    <div class="sch-other">
                        <input type="text" class="input" id="sec-other" maxlength="12"
                               placeholder="اكتب اسم الشعبة" value="${escapeAttr(pick.section || '')}">
                    </div>` : ''}

                <div id="subj-wrap" style="margin-top:15px; ${ready ? '' : 'opacity:.45; pointer-events:none;'}">
                    <div class="sch-hint" id="subj-lock"
                         style="margin:0 0 9px; ${ready ? 'display:none' : ''}">اختر الصف والشعبة أولاً</div>
                    ${subjectPickHtml()}
                </div>
            `;
            /* الكتابة تُحدّث الاختيار مباشرةً بلا إعادة رسم كي لا يقفز المؤشر. */
            body.querySelector('#sec-other')?.addEventListener('input', (e) => {
                const v = e.target.value.trim();
                pick.section = v || null;
                const wrap = body.querySelector('#subj-wrap');
                const lock = body.querySelector('#subj-lock');
                if (wrap) wrap.style.cssText = 'margin-top:15px;' + (v ? '' : 'opacity:.45; pointer-events:none;');
                if (lock) lock.style.display = v ? 'none' : '';
            });
            body.querySelector('#subj-other')?.addEventListener('input', (e) => {
                pick.subject = e.target.value.trim();
            });
            body.querySelector('#subj-select')?.addEventListener('change', (e) => {
                if (e.target.value === '__other__') { other.subj = true; pick.subject = ''; return paint(); }
                other.subj = false;
                pick.subject = e.target.value;
            });
            if (other.sec)  body.querySelector('#sec-other')?.focus();
            if (other.subj) body.querySelector('#subj-other')?.focus();
        }

        body.addEventListener('click', async (e) => {
            const t = e.target;

            const stage = t.closest('[data-stage]');
            if (stage) { pick.stage = stage.dataset.stage; pick.grade = null; return paint(); }

            const grade = t.closest('[data-grade]');
            if (grade) { pick.grade = Number(grade.dataset.grade); return paint(); }

            if (t.closest('[data-sec-other]')) {
                other.sec = true; pick.section = null; return paint();
            }
            const sec = t.closest('[data-sec]');
            if (sec) { other.sec = false; pick.section = sec.dataset.sec; return paint(); }

            if (!t.closest('[data-subj-save]') || saving) return;
            if (pick.grade === null || !pick.section) return;

            const subject = String(pick.subject || '').trim();
            if (!subject) {
                return global.TeacherApp.toast('اكتب اسم المادة أولاً.', 'error', 3000);
            }

            saving = true;
            /* اللوحة تُغلق قبل الكتابة لا بعدها — الكتابة رحلة شبكة تقارب
               ربع ثانية كان المعلم ينتظرها ينظر إلى لوحة جامدة. */
            global.Modal.close();
            global.TeacherApp.toast('تمت إضافة الفصل ✅', 'success', 1200);

            let created;
            try {
                created = await global.ClassCreate.create({
                    teacher_id: teacher.id,
                    stage:   pick.stage,
                    grade:   GRADES[pick.stage][pick.grade],
                    section: pick.section,
                    subject
                });
            } catch (err) {
                saving = false;
                return global.TeacherApp.toast('فشل الحفظ: ' + err.message, 'error', 6000);
            }
            /* المادة المكتوبة تُحفظ للمرة القادمة — لا يُنتظر نجاحها لأن
               الفصل حُفظ فعلاً، وفشلها لا يعني فشل الإضافة.

               والشرطُ `other.subj`: كان اسماً لا وجودَ له (`typed`)، وقراءةُ
               اسمٍ غيرِ معرَّفٍ ترمي — فينقطع ما بعدها. والفصلُ كان قد حُفظ
               في السطر السابق، فيراه المعلّم بعد أن يتنقّل ولا يراه في
               مكانه: صفحةُ الفصول لا تُعاد، وخانةُ الجدول لا تأخذ فصلها. */
            if (other.subj) rememberSubject(subject).catch(() => {});

            /* من ناداها يقرّر أين يرجع. وبلا ردّ نداء: تُفتح قائمة الفصول
               ليرى المعلّم فصله مضافاً — لا يبقى في الرئيسية يتساءل.
               وإن كان فيها أصلاً فضبطُ المسار على قيمته لا يُطلق تنقّلاً،
               فتُعاد الشاشة يدوياً وإلا بقيت القائمة بلا الفصل الجديد. */
            if (opts.onCreated) return opts.onCreated(created);
            if (/^#?\/classes/.test(global.location.hash || '') && global.ClassesView) {
                await global.ClassesView.render(document.getElementById('view-classes'));
            } else {
                global.location.hash = '#/classes';
            }
        });

        global.Modal.open({ title: 'إضافة فصل جديد', body });
    }

    global.DashboardView = {
        render,
        // Exposed helpers so the standalone #/classes screen can reuse the
        // exact same rendering + modal without duplicating code.
        openAddClassModal,
        classesHtml,
        emptyClassesState: emptyState
    };
})(window);
