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
       كحلي دائماً — بطلب المستخدم يكون داخل الفصل كحلياً. */
    const DEEP_COMPANION = {
        '#ECEAE3': '#0F2C5C',   // رصاصي → كحلي
        '#EFE0BE': '#8C6D2F',   // (قيم قديمة من اللوحة السابقة)
        '#DCE5F3': '#0F2C5C',
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
            return StageColors.isLight(color) ? '#0F2C5C' : color;
        },
        /** توحيد كل الفصول على اللون الرصاصي المعتمد — تعمل مرة عند فتح
         *  القوائم وتتجاهل ما هو موحّد أصلاً (رخيصة وآمنة التكرار). */
        async normalizeAll(teacherId) {
            const all = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacherId);
            for (const c of all) {
                if (c.color !== DEFAULT_CLASS_COLOR) {
                    c.color = DEFAULT_CLASS_COLOR;
                    await global.TeacherDB.put('classes', c);
                }
            }
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

    const SUBJECTS = [
        'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
        'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
        'الاجتماعيات', 'التاريخ', 'الجغرافيا',
        'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
    ];

    function teacherSubjects(teacher) {
        if (Array.isArray(teacher.subjects) && teacher.subjects.length) return teacher.subjects;
        return teacher.subject ? [teacher.subject] : [];
    }

    function subjectOptionsFor(teacher) {
        const mine  = teacherSubjects(teacher);
        const other = SUBJECTS.filter((s) => !mine.includes(s));
        const opts  = [`<option value="">— اختر المادة —</option>`];
        if (mine.length) {
            opts.push(`<optgroup label="المواد التي تدرّسها">`);
            mine.forEach((s) => opts.push(`<option value="${s}" ${s === mine[0] ? 'selected' : ''}>${s}</option>`));
            opts.push(`</optgroup>`);
        }
        if (other.length) {
            opts.push(`<optgroup label="مواد أخرى">`);
            other.forEach((s) => opts.push(`<option value="${s}">${s}</option>`));
            opts.push(`</optgroup>`);
        }
        return opts.join('');
    }

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

    /* بطاقة التذكيرات المطويّة — تُخفى كلياً عند صفر تذكيرات */
    function remindersCardHtml(reminders, classById) {
        if (!reminders.length) return '';
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
            <div class="rem-card" id="rem-card">
                <div class="rem-head">
                    <div class="rem-ic">🔔</div>
                    <b>تذكيرات اليوم</b>
                    <span class="rem-bd num">${reminders.length}</span>
                    <button type="button" class="rem-toggle" id="rem-toggle" aria-label="عرض التذكيرات">▾</button>
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
        let done = 0;
        const chips = todayRows.map((r) => {
            const cls = r.class_id ? classById[r.class_id] : null;
            const p = periodByN[r.period];
            const start = p ? toMins(p.start) : null;
            const end = p ? toMins(p.end) : null;
            let st = '';
            if (end !== null && now >= end) { st = 'past'; done++; }
            else if (start !== null && end !== null && now >= start && now < end) st = 'live';
            const wait = !cls;
            const name = wait ? 'انتظار' : esc(chipName(cls));
            const inner = `
                <span class="pc-n num">ح${r.period}</span>
                <span class="pc-t num">${p ? esc(p.start) : ''}</span>
                <span class="pc-c">${name}</span>`;
            return wait
                ? `<div class="pchip wait ${st === 'past' ? 'past' : ''}">${inner}</div>`
                : `<a href="#/class/${cls.id}" class="pchip ${st}">${inner}</a>`;
        }).join('');
        return `
            <div class="pday-box">
                <div class="pday-head">
                    <b>🕐 حصص اليوم</b>
                    <span class="pday-cnt num">${done} / ${todayRows.length}</span>
                    <a href="#/schedule">الجدول كاملاً</a>
                </div>
                <div class="pday-chips">${chips}</div>
            </div>`;
    }

    /* أزرار تجهيز فصل الحصة القادمة/الحالية */
    function prepHtml(cls) {
        if (!cls) return '';
        return `
            <div class="prep-l">تجهيز ${esc(shortGrade(cls.grade))} / ${esc(cls.section)}</div>
            <div class="prep-grid">
                <a href="#/class/${cls.id}/exams">📝 الاختبارات</a>
                <a href="#/class/${cls.id}/worksheets">📄 أوراق العمل</a>
                <a href="#/class/${cls.id}/homework">📚 الواجبات</a>
            </div>`;
    }

    /* مربع «حصتك الحالية/القادمة» الكحلي في أسفل الصفحة */
    function heroHtml(info, hasClasses, hasSchedule, isWeekend) {
        if (!hasClasses) {
            return `
                <div class="home-hero-alt dashed">
                    <div class="ha-t">أضف فصلك الأول 🎒</div>
                    <div class="ha-s">لتبدأ متابعة طلابك وحصصك من هنا</div>
                    <button type="button" class="btn btn-primary" data-add-class style="min-height:48px;">+ إضافة فصل</button>
                </div>`;
        }
        if (isWeekend) {
            return `
                <div class="home-hero-alt">
                    <div class="ha-t">🌴 إجازة سعيدة</div>
                    <div class="ha-s">نلقاك الأحد بإذن الله</div>
                </div>`;
        }
        if (!hasSchedule) {
            return `
                <div class="home-hero-alt dashed">
                    <div class="ha-t">📅 أضف جدولك الأسبوعي</div>
                    <div class="ha-s">لتظهر حصتك الحالية هنا كل صباح</div>
                    <a href="#/schedule" class="btn btn-primary" style="min-height:48px;">إعداد الجدول</a>
                </div>`;
        }
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
        let progress = '';
        if (isNow) {
            const s = toMins(info.period.start), e = toMins(info.period.end);
            const now = new Date().getHours() * 60 + new Date().getMinutes();
            const pct = (s !== null && e !== null && e > s)
                ? Math.max(0, Math.min(100, Math.round(((now - s) / (e - s)) * 100)))
                : 0;
            progress = `
                <div class="hh-prog">
                    <div class="hh-bar"><i style="width:${pct}%"></i></div>
                    <span class="num">تنتهي ${esc(info.period.end)}</span>
                </div>`;
        } else {
            progress = `<div class="hh-prog"><span class="num">تبدأ ${esc(info.period.start)}</span></div>`;
        }
        return `
            <div class="home-hero">
                ${badge}
                <a href="#/class/${info.cls.id}" class="hh-body">
                    <div class="hh-l">${isNow ? 'حصتك الحالية' : 'حصتك القادمة'}</div>
                    <div class="hh-t">${esc(shortGrade(info.cls.grade))} / ${esc(info.cls.section)}</div>
                    <div class="hh-s">${esc(info.cls.subject)} · حصة <span class="num">${info.period.n}</span></div>
                    ${progress}
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
        const prepClass = (nextClass && nextClass.cls) || classes[0] || null;

        container.innerHTML = `
            <div class="container home-v2">
                <div class="home-hd">
                    <div class="home-hd-tt">
                        <h2>${greet()}، ${firstName} 👋</h2>
                        <div class="home-hij">${hijriToday()}</div>
                    </div>
                    <a href="#/profile" class="home-av" aria-label="بياناتي">${avatarHtml}</a>
                </div>

                ${remindersCardHtml(remindersToday, classById)}
                ${periodsBoxHtml(todayRows, classById, periodByN)}
                ${prepHtml(prepClass)}
                ${heroHtml(nextClass, classes.length > 0, scheduleRows.length > 0, todayIdx === -1)}
            </div>
        `;

        bind(container, teacher);
    }

    function emptyState() {
        return `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon">🏫</div>
                <h3>لا توجد فصول بعد</h3>
                <p>ابدأ بإضافة فصلك الأول لتنظيم طلابك ومتابعتهم.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة فصلي الأول</button>
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
                    style="--card-color: ${c.color || '#1E40AF'};">
                <div>
                    <h4 class="class-card-title">${STAGE_LABELS[c.stage] || ''} — ${shortGrade(c.grade)} / ${c.section}</h4>
                    <div class="class-card-subject">${c.subject}</div>
                </div>
                <div class="class-card-meta">
                    <span>${c.student_count || 0} طالب</span>
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

        // طي/فتح بطاقة تذكيرات اليوم
        container.querySelector('#rem-toggle')?.addEventListener('click', () => {
            container.querySelector('#rem-card')?.classList.toggle('open');
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
                        const color = isWaiting ? '#F59E0B' : StageColors.deepFor(cls?.color || '#1E40AF');
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
    function openAddClassModal(teacher) {
        let stage = 'primary';

        const form = document.createElement('form');
        form.id = 'form-add-class';
        form.innerHTML = `
            <div class="field">
                <label class="label" for="c-stage">المرحلة *</label>
                <select class="select" id="c-stage" required>
                    <option value="primary">ابتدائي</option>
                    <option value="intermediate">متوسط</option>
                    <option value="secondary">ثانوي</option>
                </select>
            </div>

            <div class="field">
                <label class="label" for="c-grade">الصف *</label>
                <select class="select" id="c-grade" required></select>
            </div>

            <div class="field">
                <label class="label" for="c-section">الشعبة *</label>
                <input class="input" id="c-section" type="text" required
                       placeholder="أ" maxlength="8">
            </div>

            <div class="field">
                <label class="label" for="c-subject">المادة *</label>
                <select class="select" id="c-subject" required>
                    ${subjectOptionsFor(teacher)}
                </select>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">حفظ الفصل</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        const gradeSel = form.querySelector('#c-grade');
        function refreshGrades() {
            gradeSel.innerHTML = GRADES[stage]
                .map((g) => `<option value="${g}">${g}</option>`).join('');
        }
        refreshGrades();

        form.querySelector('#c-stage').addEventListener('change', (e) => {
            stage = e.target.value; refreshGrades();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const chosenStage = form.querySelector('#c-stage').value;
                // كل الفصول بلون واحد معتمد — لا اختيار للون.
                const color = DEFAULT_CLASS_COLOR;
                await global.TeacherDB.add('classes', {
                    teacher_id: teacher.id,
                    stage:      chosenStage,
                    grade:      form.querySelector('#c-grade').value,
                    section:    form.querySelector('#c-section').value.trim(),
                    subject:    form.querySelector('#c-subject').value,
                    color,
                    student_count: 0,
                    created_at: new Date().toISOString()
                });
                global.Modal.close();
                global.TeacherApp.toast('تمت إضافة الفصل ✅', 'success');
                // Refresh whichever screen is currently in front so the new
                // class shows up without a manual navigation.
                const hash = (global.location.hash || '').replace(/^#/, '');
                if (hash.startsWith('/classes') && global.ClassesView) {
                    await global.ClassesView.render(document.getElementById('view-classes'));
                } else {
                    await render(document.getElementById('view-dashboard'));
                }
            } catch (err) {
                global.TeacherApp.toast('فشل الحفظ: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });

        global.Modal.open({ title: 'إضافة فصل جديد', body: form });
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
