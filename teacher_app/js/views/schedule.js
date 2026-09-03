/* ==========================================================================
   views/schedule.js — Weekly schedule (Sun-Thu × periods).
   Stored in `schedule` store as { teacher_id, day (0-4), period (1-N), class_id, topic }.
   Period times stored in settings: key "period_times".
   ========================================================================== */

(function (global) {
    'use strict';

    const DAYS = [
        { index: 0, label: 'الأحد' },
        { index: 1, label: 'الاثنين' },
        { index: 2, label: 'الثلاثاء' },
        { index: 3, label: 'الأربعاء' },
        { index: 4, label: 'الخميس' }
    ];

    /* نسخةٌ واحدةٌ من الافتراضيّ في `period-times.js` — ولو كُتبت هنا
       أيضاً لتغيّرت إحداهما يوماً وبقيت الأخرى. */
    const DEFAULT_PERIODS = global.PeriodTimes.DEFAULTS;

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    /* عدد الحصص ثابت ٧: المعلم يضبط أوقاتها فقط، فلا إضافة ولا حذف.
       أي بيانات قديمة بعدد مختلف تُقصّ أو تُكمَّل من القيم الافتراضية. */

    /* المنطقُ انتقل إلى `PeriodTimes` — مُحمَّلٌ دائماً، والجرسُ يحتاجه
       قبل أن تُفتح هذه الشاشة. ويبقى التصديرُ هنا لمن كان يناديه. */
    async function getPeriodTimes() {
        return global.PeriodTimes.get();
    }

    async function savePeriodTimes(rows) {
        await global.TeacherDB.Settings.set('period_times', rows);
    }

    /* ---------- حصص الانتظار ----------
       wait_kind: 'perm'  → انتظار دائم يبقى كل أسبوع
                  'today' → لهذا اليوم فقط، يُحذف تلقائياً بعده
       sub_class: نص الفصل المُسند للانتظار اليوم (قد يكون فصلاً لا يدرّسه
                  المعلم، لذا يُخزَّن نصاً لا معرّفاً)، مع sub_date ليُمسح غداً. */
    function todayKey() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    /* التنظيف اليومي لا يوقف الرسم: الصفوف تُصحَّح في الذاكرة فوراً وتُكتب في
       قاعدة البيانات في الخلفية — الكتابة تستغرق مئات الأجزاء من الثانية. */
    function cleanupExpired(rows) {
        const today = todayKey();
        const out = [];
        rows.forEach((r) => {
            if (!r.class_id && r.wait_kind === 'today') {
                /* صفوفٌ قديمةٌ من عهدٍ كان فيه «انتظار اليوم» بلا تاريخ:
                   تُحوَّل إلى انتظارٍ دائم بدل حذفها، فلا يفقد المعلّم حصصاً
                   أضافها قبل أن يعود التاريخ إلى الصفّ. */
                if (!r.wait_date) {
                    const norm = { ...r, wait_kind: 'perm', wait_date: null,
                                   updated_at: new Date().toISOString() };
                    bgSave(() => global.TeacherDB.put('schedule', norm));
                    out.push(norm);
                    return;
                }
                /* وانتظارُ اليوم يمضي مع يومه: صفُّ الأمس يُحذف من نفسه صباحاً
                   قبل أن يُرسم — فلا يجد المعلّم في جدوله انتظاراً انتهى. */
                if (r.wait_date !== today) {
                    if (r.id) bgSave(() => global.TeacherDB.remove('schedule', r.id));
                    return;
                }
            }
            if (!r.class_id && r.sub_class && r.sub_date !== today) {
                const clean = { ...r, sub_class: null, sub_date: null,
                                updated_at: new Date().toISOString() };
                bgSave(() => global.TeacherDB.put('schedule', clean));
                out.push(clean);
                return;
            }
            out.push(r);
        });
        return out;
    }

    /* يومُ الأسبوع كما يفهمه الجدول: الأحد ٠ … الخميس ٤، و‎-1‎ في العطلة. */
    function todayIndex() {
        const d = new Date().getDay();
        return (d >= 0 && d <= 4) ? d : -1;
    }

    /* كل كتابة تمرّ من هنا: تنطلق في الخلفية، وإن فشلت أُبلغ المعلم بدل أن
       يمرّ الفشل بصمت. onFail يُستخدم لإرجاع الشاشة إلى حقيقة القاعدة. */
    function bgSave(fn, onFail) {
        return Promise.resolve().then(fn).catch((e) => {
            global.TeacherApp.toast(
                'تعذّر الحفظ: ' + (e && e.message ? e.message : 'خطأ غير معروف'),
                'error', 6000
            );
            if (onFail) onFail();
        });
    }

    /* كتابات الخانة الواحدة تتسلسل: لو بدّل المعلم الفصل قبل أن تعود إضافته
       الأولى، تنتظر الثانية معرّفها بدل أن تُنشئ صفاً مكرراً. */
    const cellWrites = new Map();

    function queueWrite(day, period, fn, onFail) {
        const key  = day + ':' + period;
        const prev = cellWrites.get(key) || Promise.resolve();
        const next = prev.then(fn, fn);
        cellWrites.set(key, next.catch(() => {}));
        return next.catch((e) => {
            global.TeacherApp.toast(
                'تعذّر الحفظ: ' + (e && e.message ? e.message : 'خطأ غير معروف'),
                'error', 6000
            );
            if (onFail) onFail();
        });
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        /* دخولٌ جديد للشاشة يعني بطاقةً مطويّة: حالتها حيّة في وحدتها،
           فبدون هذا يجدها المعلّم مفتوحةً كما تركها قبل صفحتين. */
        if (global.CalendarCard) global.CalendarCard.reset();

        const classes  = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const rawSched = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const schedule = cleanupExpired(rawSched);
        const periods  = await getPeriodTimes();
        const autofill = await global.TeacherDB.Settings.get('period_autofill');
        /* التقويم يحتاج إدارة التعليم واختيار المعلّم إن بدّله. القراءتان
           من الإعدادات المحلية فلا رحلةَ شبكة. */
        const dept     = await global.TeacherDB.Settings.get('education_dept');
        const calPick  = await global.TeacherDB.Settings.get('academic_calendar');

        /* «ارفع جدولك» في الرئيسية يصل إلى هنا بعلامةٍ في المسار، فتُفتح
           شاشة الاستيراد رأساً — وإلا وقف المعلّم أمام جدولٍ فارغ يبحث
           عن الزرّ الذي وُعد به. والعلامة تُمحى فلا تُفتح مع كل رجوع. */
        const wantsImport = /[?&]import=1/.test(global.location.hash || '');
        const ctx = { teacher, classes, schedule, periods, autofill, dept, calPick,
                      editing: wantsImport ? true : undefined };
        paintView(container, ctx);
        if (wantsImport) {
            global.history.replaceState(null, '', '#/schedule');
            openImport(ctx, container);
            return;
        }

        /* أول دخولٍ للجدول: «✎» ليست ظاهرةَ المعنى — تُبرَز مرّةً واحدة.
           ولا تُعرض مع الاستيراد المفتوح فوقها فيتزاحمان. */
        if (global.Hints) {
            global.Hints.showOnce('sched_edit', {
                selector: '#btn-edit',
                title: 'لتعديل جدولك اضغط هنا',
                text:  'تضيف الحصص وتغيّرها وتحذفها.'
            }).catch(() => {});
        }
    }

    /* الرسم من الحالة المحفوظة في الذاكرة وحدها — بلا أي نداء للقاعدة، فيعود
       الجدول فوراً بعد كل تعديل بدل انتظار الشبكة. */
    function paintView(container, ctx) {
        const grid = buildGrid(ctx.schedule, ctx.periods.length);
        const todayIdx = todayIndex();

        const editing = !!ctx.editing;
        /* وضعُ الاختيار لا يعيش إلا في يومٍ دراسيّ وخارج التعديل: لو تُرك
           قائماً بعد فتح التعديل لتزاحم حارسان على الخانة الواحدة. */
        const picking = !!ctx.picking && todayIdx >= 0 && !editing;
        ctx.picking = picking;

        container.innerHTML = `
            <div class="container sched-v2${editing ? ' is-editing' : ''}${picking ? ' is-picking' : ''}">
                <div class="sched-head">
                    ${todayIdx >= 0 && !editing ? `
                        <button type="button" class="sched-wait-btn${picking ? ' on' : ''}"
                                id="btn-wait" aria-pressed="${picking}">
                            ${picking ? '✕ إلغاء' : '+ حصة انتظار اليوم'}
                        </button>` : ''}
                    <button type="button" class="sched-time-btn" id="btn-times">توقيت الحصص</button>
                    <button type="button" class="sched-time-btn sched-edit-btn${editing ? ' on' : ''}"
                            id="btn-edit" aria-pressed="${editing}">
                        ${editing ? '✓ تم' : '✎ تعديل'}
                    </button>
                </div>

                ${ctx.classes.length === 0 ? classesEmptyHint() : ''}

                ${renderGrid(grid, ctx.periods, ctx.classes, todayIdx, editing, picking)}

                <p class="sched-hint">${picking
                    ? 'اضغط حصةً من عمود اليوم لتصير انتظاراً'
                    : editing
                        ? 'اضغط أي خانة لإضافة حصة أو تعديلها'
                        : 'الجدول مقفول — اضغط «تعديل» لتغييره'}</p>

            </div>

            ${editing ? `
                <div class="container sched-tools">
                    <button type="button" class="sched-import" id="btn-import">
                        ${Icons.svg('camera')} استيراد الجدول من صورة أو ملف
                    </button>
                    <button type="button" class="sched-clear" id="btn-clear-all">${Icons.svg('trash')} مسح الجدول كاملاً</button>
                </div>` : ''}

            ${calendarHtml(ctx)}
        `;

        ctx.grid = grid;
        bind(container, ctx);
        bindCalendar(container, ctx);
    }

    /* وزرّا التعديل **خارجه** كذلك، وللسبب نفسه: كانا داخل الحاوية
       المقفلة الارتفاع فيأكلان نحو تسعين بكسلاً، **فتُقصّ الحصة السابعة
       بصمت** بلا شريط تمرير — بلاغ المستخدم: «ست حصص في وضع التعديل،
       وسبع حين أضغط تمّ».

       البطاقة **خارج** ‎.sched-v2‎ لا داخله.

       الجدول مصمَّمٌ ليملأ الشاشة تماماً: ‎max-height: 100dvh - 170px‎
       مع ‎overflow:hidden‎، فتتوزّع الحصص على ما تبقّى مهما كان عددها.
       وأيّ شيء يوضع داخله بعد الشبكة يُقصّ حتماً — وهذا ما حدث بالبطاقة
       على جهاز المعلّم. فصارت شقيقةً له في حاويةٍ مستقلّة تنساب مع
       الصفحة، والجدول يحتفظ بسلوكه بلا تعديل.

       وهي اختيارية: لو لم تُحمَّل وحدتاها لأيّ سبب، يبقى الجدول كما هو
       بلا خطأٍ ولا فراغ. */
    function calendarHtml(ctx) {
        if (!global.CalendarCard || !global.AcademicCalendar) return '';
        try {
            return '<div class="container ac-wrap">'
                 + global.CalendarCard.html({ dept: ctx.dept, override: ctx.calPick })
                 + '</div>';
        } catch (err) {
            console.warn('[schedule] calendar card failed:', err);
            return '';
        }
    }

    function bindCalendar(container, ctx) {
        if (!global.CalendarCard || !container.querySelector('.ac-card')) return;
        global.CalendarCard.bind(
            container,
            { dept: ctx.dept, override: ctx.calPick },
            () => paintView(container, ctx),
            (next) => {
                ctx.calPick = next;
                paintView(container, ctx);
                /* الحفظ بالخلفية: التبديل يظهر فوراً، ولا ينتظر الشبكة. */
                bgSave(() => next
                    ? global.TeacherDB.Settings.set('academic_calendar', next)
                    : global.TeacherDB.Settings.unset('academic_calendar'));
            }
        );
    }

    function classesEmptyHint() {
        return `
            <div class="callout callout-warn" style="margin-bottom: var(--space-4);">
                ℹ️ أضف فصولاً أولاً من الرئيسية قبل بناء الجدول.
            </div>
        `;
    }

    /** Convert flat rows to a grid[day][period] map. */
    function buildGrid(rows, periodCount) {
        const grid = {};
        for (let d = 0; d < DAYS.length; d++) {
            grid[d] = {};
            for (let p = 1; p <= periodCount; p++) grid[d][p] = null;
        }
        for (const r of rows) {
            if (!grid[r.day]) continue;
            grid[r.day][r.period] = r;
        }
        return grid;
    }

    /** «الصف الرابع الابتدائي» → «الرابع/أ» — مختصر يناسب خانة الجدول. */
    function shortCell(cls) {
        const g = String(cls.grade || '').replace(/^\s*الصف\s+/, '').split(/\s+/)[0];
        /* بلا شعبة: الصفُّ وحده — لا شرطةٌ يتيمة بعده. */
        return cls.section ? `${g}/${cls.section}` : g;
    }

    /** «الرابع الابتدائي/أ» → «الرابع/أ» — اسم فصل الانتظار داخل الخانة الضيقة. */
    function shortSub(label) {
        return String(label || '').replace(/\s+(الابتدائي|المتوسط|الثانوي)\s*/, '');
    }

    /** المرحلة من نص الصف: «الصف الأول الثانوي» → «ثانوي».
        بدونها لا يميّز المعلم «الأول ابتدائي» عن «الأول ثانوي» في الخانة. */
    function stageOf(text) {
        const m = String(text || '').match(/(ابتدائي|متوسط|ثانوي)/);
        return m ? m[1] : '';
    }

    /* الشبكة المعتمدة (البديل ب): الحصص صفوفٌ على اليمين والأيام أعمدة أعلى،
       الأيام الخمسة كلها ظاهرة بلا تمرير أفقي، وعمود اليوم الحالي ذهبي. */
    function renderGrid(grid, periods, classes, todayIdx, editing, picking) {
        const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
        return `
            <div class="sched-wrap">
                <table class="sched-table" style="--rows:${periods.length}">
                    <thead>
                        <tr>
                            <th class="sched-corner">الحصة</th>
                            ${DAYS.map((d) => `
                                <th class="${d.index === todayIdx ? 'is-today' : ''}">${d.label}</th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${periods.map((p) => `
                            <tr>
                                <td class="sched-per">
                                    <b class="num">${p.n}</b>
                                    <span class="num">${escapeHtml(p.start)}</span>
                                </td>
                                ${DAYS.map((d) => {
                                    const cell = grid[d.index]?.[p.n];
                                    const tc = d.index === todayIdx ? ' is-today' : '';
                                    const attrs = `data-day="${d.index}" data-period="${p.n}"`;
                                    if (!cell) {
                                        /* الخانة الفارغة بلا علامة خارج وضع التعديل:
                                           «+» دعوةٌ للضغط، وهي ما جعلت الجدول يتغيّر
                                           بلمسة عابرة. وفي وضع اختيار الانتظار تُعرض
                                           «+» في خانات اليوم وحدها — هي وحدها الهدف. */
                                        const pk = picking && d.index === todayIdx;
                                        return `<td class="sched-cell${tc}${pk ? ' is-pick' : ''}" ${attrs}>
                                            <div class="sched-box empty">${editing || pk ? '+' : ''}</div>
                                        </td>`;
                                    }
                                    const cls = classById[cell.class_id];
                                    if (!cls) {
                                        // انتظار: يعرض الفصل المُسند اليوم إن وُجد
                                        return `<td class="sched-cell${tc}" ${attrs}>
                                            <div class="sched-box wait">
                                                ${cell.sub_class
                                                    ? `<span class="sb-sub">${escapeHtml(shortSub(cell.sub_class))}</span>
                                                       <span class="sb-w">${Icons.svg('clock')} ${escapeHtml(stageOf(cell.sub_class))}</span>`
                                                    : 'انتظار'}
                                            </div>
                                        </td>`;
                                    }
                                    return `<td class="sched-cell${tc}" ${attrs}>
                                        <div class="sched-box filled">
                                            <span class="sb-c">${escapeHtml(shortCell(cls))}</span>
                                            <span class="sb-s">${escapeHtml(stageOf(cls.grade))}</span>
                                        </div>
                                    </td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /* ---------- زرّ «حصة انتظار اليوم» ----------
       المعلّم يُسنَد إليه انتظارٌ صباحَ يومه، فيريد تسجيله في حصّته بضغطتين
       بلا أن يفتح وضع التعديل ويبحث عن الخانة ويختار نوعها. */

    function hasFreePeriodToday(ctx) {
        const day = todayIndex();
        if (day < 0) return false;
        return ctx.periods.some((p) =>
            !ctx.schedule.some((r) => r.day === day && r.period === p.n));
    }

    function addWaitToday(period, ctx, container) {
        const day = todayIndex();
        if (day < 0) return;
        /* حارسٌ على الخانة نفسها: بين الرسم والضغط قد تكون امتلأت من نافذةٍ
           أخرى للمعلّم، والكتابة فوقها تمحو حصةً حقيقية. */
        if (ctx.schedule.some((r) => r.day === day && r.period === period)) {
            ctx.picking = false;
            paintView(container, ctx);
            return;
        }

        const now = new Date().toISOString();
        const row = {
            teacher_id: ctx.teacher.id,
            day, period,
            class_id: null,
            wait_kind: 'today',
            wait_date: todayKey(),
            sub_class: null, sub_date: null,
            topic: '',
            created_at: now, updated_at: now
        };
        ctx.schedule.push(row);
        ctx.picking = false;
        paintView(container, ctx);
        global.TeacherApp.toast('أُضيفت حصة انتظار اليوم', 'success', 1400);

        queueWrite(day, period, async () => {
            if (row.id) await global.TeacherDB.put('schedule', row);
            else row.id = await global.TeacherDB.add('schedule', row);
        }, () => render(container));
    }

    function bind(container, ctx) {
        /* الخانات لا تفتح المحرّر إلا في وضع التعديل — الحارس هنا لا في
           الرسم وحده، حتى لا يفتحه ضغط على خانة معبّأة أيضاً. */
        if (ctx.editing) {
            container.querySelectorAll('.sched-cell').forEach((td) => {
                td.addEventListener('click', () => {
                    openCellEditor(
                        Number(td.dataset.day),
                        Number(td.dataset.period),
                        ctx,
                        container
                    );
                });
            });
        }

        /* وضعُ اختيار الانتظار: الخانات الفارغة من عمود اليوم وحدها تستقبل
           الضغط، فلا يفتح المعلّم محرّراً ولا يبدّل حصةً قائمة بالخطأ. */
        if (ctx.picking) {
            container.querySelectorAll('.sched-cell.is-pick').forEach((td) => {
                td.addEventListener('click', () => {
                    addWaitToday(Number(td.dataset.period), ctx, container);
                });
            });
        }

        container.querySelector('#btn-wait')?.addEventListener('click', () => {
            if (!ctx.picking && !hasFreePeriodToday(ctx)) {
                global.TeacherApp.toast('حصص اليوم كلها مشغولة.', 'info', 1600);
                return;
            }
            ctx.picking = !ctx.picking;
            paintView(container, ctx);
        });

        container.querySelector('#btn-edit')?.addEventListener('click', () => {
            ctx.editing = !ctx.editing;
            ctx.picking = false;
            paintView(container, ctx);
        });

        container.querySelector('#btn-times')?.addEventListener('click', () => openTimesEditor(ctx, container));

        container.querySelector('#btn-clear-all')?.addEventListener('click', async () => {
            if (!(await global.TeacherApp.confirm({ title: 'مسح الجدول كاملاً؟', ok: 'مسح', danger: true }))) return;
            const doomed = ctx.schedule.slice();
            ctx.schedule = [];
            paintView(container, ctx);
            global.TeacherApp.toast('تم المسح.', 'info', 1200);
            /* الحذف بالتوازي لا واحداً تلو الآخر — عشر حصص كانت تعني عشر
               رحلات متتابعة للخادم. */
            bgSave(
                () => Promise.all(doomed.filter((r) => r.id)
                    .map((r) => global.TeacherDB.remove('schedule', r.id))),
                () => render(container)
            );
        });

        container.querySelector('#btn-import')?.addEventListener('click', () => openImport(ctx, container));
    }

    /* ==========================================================================
       استيراد الجدول من صورة أو ملف.

       الاستعمال الثاني — والأخير — المسموح للذكاء الاصطناعي في التطبيق:
       المعلّم يصوّر جدوله المطبوع فيُقرأ ويُملأ. راجع القرار في
       [[no-ai-except-imports]].

       وقاعدةٌ تحكم التنفيذ: **لا يُكتب شيء قبل أن يراه المعلّم**. القراءة
       الآلية تخطئ، وجدولٌ مكتوبٌ بالخطأ فوق جدولٍ صحيح خسارةٌ لا تُسترد.
       فالنتيجة تُعرض أولاً، ولا تُحفظ إلا بضغطة تأكيد.
       ========================================================================== */

    function openImport(ctx, container) {
        /* حالةُ هذه النافذة: تُصفَّر مع كل ملفٍّ جديد. */
        let lastPages = null;
        let pickedName = '';
        /* الصفحةُ التي عُرف أنّها صفحتُه — من طبقة نصّ الملفّ لا من النموذج. */
        let picked = null;

        const form = document.createElement('div');
        form.innerHTML = `
            <!-- زرُّ الرفع نفسُه المستعمَل في كشف الطلاب (stu-up)، لا حقلُ
                 المتصفّح الخام: كان رماديّاً بخطٍّ لاتينيٍّ ونصٍّ من النظام
                 («لم يتمّ اختيار أيّ ملفّ») — غريباً عن كلّ ما حوله.

                 والشرحُ في داخله لا في field-hint: المظهرُ الأبيض يُخفي
                 كلَّ field-hint بـ!important، فما كُتب فيها لا يُرى أصلاً.
                 (كُشف بالمعاينة ٣٠ أغسطس ٢٠٢٦.)
                 ولا شَرَطاتٍ مائلةً هنا — التعليقُ داخل قالبٍ نصّيّ. -->
            <button type="button" class="stu-up" id="sched-up">
                <span class="ic">${Icons.svg('file')}</span>
                <span class="tx">
                    <span class="t">صورة الجدول أو ملف PDF</span>
                    <span class="s">تبدأ القراءة فور اختياره</span>
                </span>
                <span class="chev" aria-hidden="true">❮</span>
            </button>
            <input type="file" id="sched-file" hidden accept="image/*,.pdf">
            <div id="imp-result"></div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-primary" id="imp-go" hidden>أعد القراءة</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        const resultEl = form.querySelector('#imp-result');
        const goBtn = form.querySelector('#imp-go');

        /* ══ الملفُّ هو الأمر، لا الزرّ ══
           كان المعلّم يختار ملفَّه ثمّ يبحث عن «قراءة الجدول» ليضغطه —
           خطوةٌ لا معنى لها: من رفع جدولَه فقد قال ما يريد. فالقراءةُ
           تبدأ فورَ الاختيار، ويظهر «جاري استخراج البيانات» في اللحظة
           نفسِها. (طلبُه ٣٠ أغسطس ٢٠٢٦.)

           والزرُّ يبقى مخفيّاً، ولا يظهر إلا بعد إخفاقٍ — «أعد القراءة» —
           فلا يُترك المعلّم بلا سبيلٍ إن انقطع اتّصالٌ في منتصف الطريق. */
        const upBtn = form.querySelector('#sched-up');
        upBtn.addEventListener('click', () => form.querySelector('#sched-file').click());
        form.querySelector('#sched-file').addEventListener('change', () => { showPicked(); start(); });
        goBtn.addEventListener('click', () => start());

        /** يكتب اسمَ الملفّ في الزرّ — فيرى المعلّم ما اختاره. */
        function showPicked() {
            const f = form.querySelector('#sched-file').files[0];
            if (!f) return;
            upBtn.querySelector('.ic').textContent = '✓';
            upBtn.querySelector('.t').textContent  = f.name;
            upBtn.querySelector('.s').textContent  = 'اضغط لاختيار ملفٍ آخر';
        }

        /** يُظهر سطرَ انتظارٍ في مكان النتيجة — يُرى قبل أن يبدأ العمل. */
        function waiting(msg) {
            resultEl.innerHTML = '<div class="callout" style="margin-top:var(--space-4)">' + Icons.svg('clock') + ' '
                + escapeHtml(msg) + '</div>';
        }

        async function start() {
            const file = form.querySelector('#sched-file').files[0];
            /* ملفٌّ جديد يعني بدايةً جديدة: كان اسمُ المعلّم المختار يبقى
               من الرفعة السابقة، فتُقرأ الصورة الثانية باسم معلّمٍ اخترته
               لصورةٍ أخرى — فيُختار هو نفسه دائماً، أو لا يُقرأ شيءٌ أصلاً
               لأنه ليس في الصورة الجديدة. */
            pickedName = '';
            lastPages = null;
            picked = null;
            goBtn.hidden = true;
            goBtn.disabled = true;
            /* قبل كلّ عمل: السطرُ يُرسم أوّلاً ثمّ يُعمل، وإلا بقيت الشاشةُ
               ساكنةً حتى تنتهي القراءة فتبدو واقفة. */
            waiting('جاري استخراج البيانات…');
            await new Promise((r) => setTimeout(r, 0));
            try {
                if (!file) { resultEl.innerHTML = ''; return; }
                if (!(await global.AI.isAvailable())) {
                    throw new Error('انتهت جلستك — سجّل الدخول ثمّ أعد المحاولة.');
                }
                if (file.size > 20 * 1024 * 1024) throw new Error('الملف كبير جداً (أقصى ٢٠ ميجابايت).');
                /* لا حارسَ على «بلا فصول»: الاستيراد صار يُنشئها. وكان
                   يمنع الحالة التي بُني لها — معلّمٌ جديد يرفع جدوله
                   ليبني به فصوله، فيُقال له «أضف فصولك أولاً». */

                /* ══ صفحتُك وحدَها ══
                   جدولُ المدرسة صفحةٌ لكلّ معلّم. وكان الملفُّ يُرسل كلُّه
                   مرّتين: مرّةً ليُسأل النموذجُ «أيُّ هؤلاء أنت؟» ومرّةً
                   ليقرأ صفحتك. وقِيس على فاتورة ٣٠ أغسطس ٢٠٢٦: النداءُ
                   الأوّل وحدَه ‎٣٠٬١٥٠‎ توكناً ليعود بـ‎٢٤٤‎ — ‎٤٤٪‎ من
                   الثمن، لمعرفة اسمٍ مكتوبٍ في رأس الورقة.

                   فيُقرأ الاسمُ هنا، على الجهاز، من طبقة نصّ الملفّ —
                   بلا توكنٍ واحد. راجع `pdf-text.js`.
                   وإن كان الملفُّ مسحاً ضوئيّاً بلا نصّ، فلا يتغيّر شيء:
                   يمضي المسارُ القديم كما كان. */
                const scan = global.PdfText ? await global.PdfText.scan(file) : null;
                if (scan && scan.teachers.length > 1) {
                    const hit = global.PdfText.pickPage(scan.teachers, ctx.teacher && ctx.teacher.name);
                    if (!hit) return askWho(file, scan);      /* السؤالُ مجّانيّ */
                    picked = hit;
                }

                await readPages(file, picked ? [picked.n] : null,
                                picked ? picked.name : (pickedName || ''));
            } catch (err) {
                console.warn('[schedule] import failed:', err);
                /* والزرُّ يظهر هنا وحدَه: ما فشل يُعاد، وما نجح لا يحتاجه. */
                resultEl.innerHTML = '';
                goBtn.hidden = false;
                global.TeacherApp.toast(err.message || 'تعذّر قراءة الجدول.', 'error', 6000);
            } finally {
                goBtn.disabled = false;
            }
        }

        /** يرسم الصفحاتِ المطلوبةَ ثمّ يقرؤها. `only` مصفوفةُ أرقامٍ أو
         *  `null` للملفّ كلِّه. */
        async function readPages(file, only, name) {
            /* بلا سقفٍ منّا: يُقرأ الملف كلّه حتى سقف النموذج نفسه.
               وإن تجاوزه، يُقال صراحةً — فإهمالُ صفحةٍ بصمتٍ يُقرأ
               نجاحاً وهو نقص. */
            const pages = await global.PdfCore.fileToImagePages(file, null, false, only);
            lastPages = pages;
            if (pages.skipped > 0) {
                global.TeacherApp.toast(
                    'الملف ' + pages.total + ' صفحة، وأقصى ما يُقرأ دفعةً '
                    + global.PdfCore.MAX_IMAGE_PAGES + '. قُرئت الأولى منها فقط.',
                    'warning', 7000);
            }
            const cells = await global.AI.extractScheduleFromImage({
                pages, classes: ctx.classes, periodCount: ctx.periods.length,
                /* الاسمُ يُرسل حين نعرف صفحتَه — فيُعصم النموذجُ من الخلط.
                   ولا يُرسل حين نرسل الملفَّ كلَّه بلا معرفة: الغالبُ أن
                   المعلّم يرفع جدوله وحده، وإرسالُ اسم حسابه كان يُفشل
                   الصورة المفردة حين يختلف عن الاسم المطبوع — يبحث
                   النموذج عمّن لا يجده فيعيدها فارغة. */
                teacherName: name || ''
            });
            showPreview(cells);
        }

        /* ── السؤالُ صار مجّانيّاً ──
           كان يُسأل النموذجُ عن أسماء المعلّمين بالملفّ كلِّه، ثمّ يُرسل
           الملفُّ ثانيةً بعد اختياره. والأسماءُ الآن بين أيدينا من طبقة
           النصّ، فيُسأل المعلّمُ مباشرةً — بلا نداءٍ ولا توكن. */
        function askWho(file, scan) {
            resultEl.innerHTML = `
                <div class="imp-stage">
                    <div class="imp-stage-t">الملف فيه جداول ${arDigits(scan.teachers.length)} معلّمين — أيّهم أنت؟</div>
                    <div class="imp-stage-c">
                        ${scan.teachers.map((t) => `
                            <button type="button" class="sch-chip" data-pg="${t.n}"
                                    data-who="${escapeAttr(t.name)}">${escapeHtml(t.name)}</button>
                        `).join('')}
                    </div>
                    <!-- ولا بدّ من مخرج: قد لا يلتقط قارئُ النصّ عنوانَ صفحته
                         (خطٌّ غريب، أو عنوانٌ بصيغةٍ لم نعرفها)، فلو لم يكن
                         إلا هذه الأسماء لوقف المعلّمُ أمام قائمةٍ ليس فيها.
                         فيُقرأ الملفُّ كلُّه كما كان يُقرأ قبل هذا كلِّه. -->
                    <button type="button" class="btn btn-ghost" data-all
                            style="margin-top: var(--space-3); width: 100%;">
                        لستُ فيهم — اقرأ الملفّ كلّه
                    </button>
                </div>`;
            resultEl.querySelector('[data-all]').addEventListener('click', async () => {
                picked = null;
                pickedName = '';
                waiting('جاري استخراج البيانات من الملفّ كلّه…');
                await new Promise((r) => setTimeout(r, 0));
                try { await readPages(file, null, ''); }
                catch (err) {
                    global.TeacherApp.toast(err.message || 'تعذّر قراءة الجدول.', 'error', 6000);
                }
            });
            resultEl.querySelectorAll('[data-pg]').forEach((el) => {
                el.addEventListener('click', async () => {
                    picked = { n: +el.dataset.pg, name: el.dataset.who };
                    pickedName = picked.name;
                    waiting('جاري استخراج جدولك…');
                    await new Promise((r) => setTimeout(r, 0));
                    try { await readPages(file, [picked.n], picked.name); }
                    catch (err) {
                        global.TeacherApp.toast(err.message || 'تعذّر قراءة الجدول.', 'error', 6000);
                    }
                });
            });
        }

        /* يبقى هذا للمسح الضوئيّ: ملفٌّ بلا طبقة نصّ لا تُعرف صفحاتُه إلا
           بالنموذج، فيُسأل عن الأسماء ثمّ يُعاد الملفُّ كلُّه باسمٍ مختار. */
        async function rereadAs(name) {
            pickedName = name;
            waiting('جاري استخراج جدولك…');
            try {
                const cells = await global.AI.extractScheduleFromImage({
                    pages: lastPages, classes: ctx.classes,
                    periodCount: ctx.periods.length, teacherName: name
                });
                showPreview(cells);
            } catch (err) {
                global.TeacherApp.toast(err.message || 'تعذّر قراءة الجدول.', 'error', 6000);
            }
        }

        function showPreview(cells) {
            const byId = {};
            ctx.classes.forEach((c) => { byId[c.id] = c; });
            const CC = global.ClassCreate;

            /* موادّ المعلّم أولاً — فما يدرّسه هو أول ما يجده. */
            const subjectList = global.Subjects
                ? global.Subjects.merge(global.Subjects.ofTeacher(ctx.teacher), global.Subjects.ALL)
                : [];

            /* المرحلة لا تُكتب في الجداول غالباً. فتُؤخذ من فصول المعلّم
               إن كان له فصول، وإلا سُئل عنها مرّةً في المعاينة. */
            function commonStage() {
                const n = {};
                ctx.classes.forEach((c) => { if (c.stage) n[c.stage] = (n[c.stage] || 0) + 1; });
                return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || null;
            }
            let stage = commonStage();

            let ok = [], skipped = [], news = [], askStage = false;

            const inRange = (d, p) => d >= 0 && d < DAYS.length && p >= 1 && p <= ctx.periods.length;

            /* يُعاد الفرز كلّما تغيّرت المرحلة — فاختيارُها يُحيي خاناتٍ
               كانت ساقطة. */
            function sortCells() {
                ok = []; skipped = []; news = []; askStage = false;
                const newKey = {};

                (cells || []).forEach((c) => {
                    const day = Number(c.day), period = Number(c.period);
                    if (!inRange(day, period)) return skipped.push(c);
                    const topic = String(c.topic || '').trim();

                    if (byId[c.class_id]) return ok.push({ day, period, class_id: c.class_id, topic });

                    /* حصة انتظار: خانةٌ في الجدول بلا فصل — والتطبيق يعرفها. */
                    if (c.wait) return ok.push({ day, period, class_id: null, wait: true, topic: '' });
                    if (!CC) return skipped.push(c);

                    /* «١/٣» قد يصل في حقلٍ واحد — فيُشقّ. */
                    const lab = CC.splitLabel(c.new_grade, c.new_section);
                    const parsed = lab.grade ? CC.parseGrade(lab.grade, stage) : null;
                    if (!parsed) return skipped.push(c);
                    /* الشعبة اختيارية — مدارسُ كثيرة فصلٌ واحدٌ لكل صف،
                       واشتراطُها كان يُسقط الجدول كلّه. */
                    const section = CC.parseSection(lab.section);

                    /* صفٌّ مقروءٌ بلا مرحلة: يُسأل عنها ولا تُهمل خانته. */
                    if (!parsed.grade) { askStage = true; return skipped.push(c); }

                    const found = CC.findExisting(ctx.classes, parsed.grade, section, c.new_subject);
                    if (found) return ok.push({ day, period, class_id: found.id, topic });

                    /* المادة جزءٌ من هُويّة الفصل: معلّمٌ يدرّس «ثالث ابتدائي»
                       تربيةً بدنيةً وفنيةً له عندهم فصلان لا فصل — ولولاها
                       ضاعت حصص إحدى المادّتين في الأخرى. */
                    const subj = CC.normalizeSubject(c.new_subject, subjectList);
                    const key = CC.fold(parsed.grade) + '|' + CC.fold(section)
                              + '|' + CC.foldSubject(subj);
                    if (newKey[key] == null) {
                        newKey[key] = news.length;
                        news.push({
                            stage: parsed.stage, grade: parsed.grade, section,
                            subject: subj,
                            take: true, cells: []
                        });
                    }
                    news[newKey[key]].cells.push({ day, period, topic });
                });

            }
            sortCells();

            /* الملف فيه جداول معلّمين: لا يُدمجون، بل يُسأل أيّهم هو.
               وكان يدمجهم فيخرج المعلّم بجدولٍ ليس جدوله. */
            /* ولا يُسأل مرّتين: بعد اختياره اسماً، سببُ الفراغ شيءٌ آخر
               (مرحلةٌ مجهولة مثلاً) — وإعادة السؤال دورةٌ لا تنتهي. */
            const who = (cells && cells.teachers) || [];
            if (!pickedName && !ok.length && !news.length && who.length > 1) {
                resultEl.innerHTML = `
                    <div class="imp-stage">
                        <div class="imp-stage-t">الملف فيه ${who.length === 1 ? 'جدول معلّم' : 'جداول ' + arDigits(who.length) + ' معلّمين'} — أيّهم أنت؟</div>
                        <div class="imp-stage-c">
                            ${who.map((n) => `
                                <button type="button" class="sch-chip" data-who="${escapeAttr(n)}">${escapeHtml(n)}</button>
                            `).join('')}
                        </div>
                    </div>`;
                resultEl.querySelectorAll('[data-who]').forEach((el) => {
                    el.addEventListener('click', () => rereadAs(el.dataset.who));
                });
                return;
            }

            /* سؤالُ المرحلة يسبق الرسالةَ الميتة: لا خانةَ نجت، لكنّ سببها
               معروفٌ ويُحلّ بضغطة — فلا يُقال «لم أفهم» ثم يُحرم المعلّم
               من الجواب. */
            if (!ok.length && !news.length && !askStage) {
                /* رسالةٌ واحدة لحالتين مختلفتين كانت تكذب: «لم أتعرّف على
                   أيّ حصة» تُقال حتى لو قرأ النموذج الجدول كلّه ثم أسقطناه
                   نحن لأننا لم نفهم أسماء صفوفه. فالمعلّم يلوم صورته وهي
                   سليمة. */
                const read = (cells || []).length;
                const sample = (cells || []).slice(0, 3)
                    .map((c) => [c.new_grade, c.new_section].filter(Boolean).join(' / '))
                    .filter(Boolean);
                console.warn('[schedule] لم تنجُ خانة. المقروء:', cells);

                resultEl.innerHTML = read ? `
                    <div class="callout callout-warn" style="margin-top: var(--space-4);">
                        قرأتُ ${arWord(read)} من الصورة، لكن لم أفهم أسماء الفصول فيها
                        ${sample.length ? `(مثل: <b>${escapeHtml(sample.join('، '))}</b>)` : ''}.
                        <br>أضف فصولك يدوياً مرّةً واحدة، ثم أعِد الاستيراد — سيربطها بها.
                    </div>` : `
                    <div class="callout callout-warn" style="margin-top: var(--space-4);">
                        لم أتعرّف على أيّ حصة في الصورة. جرّب صورةً أوضح للجدول كاملاً،
                        بحيث تظهر أسماء الأيام وأرقام الحصص.
                    </div>`;
                return;
            }


            /* «الناقصة» يقرؤها الرسمُ والحارس معاً، فلا تُحبس في نطاق
               أحدهما — وحبسُها كان يُسقط الاعتماد بمرجعٍ غير معرّف. */
            let naked = [];

            /* ── الخطّة: خانةٌ واحدة لكل موضع ──
               كانت النتيجة قائمتين (فصولٌ قائمة وفصولٌ جديدة) لا تُقارَن
               بورقة المعلّم. فصارت خريطةً واحدةً تُرسم شبكةً كجدوله، ويُعدّل
               فيها قبل الحفظ لا بعده. */
            let plan = {};          // 'يوم:حصة' → {kind, ni|class_id}
            let editing = false;
            /* لوحة اختيار الخانة داخل المعاينة لا في نافذةٍ ثانية:
               `Modal.open` يستبدل محتوى النافذة، فكانت تمحو المعاينة
               ولا تعود. */
            let pickKey = null;

            function buildPlan() {
                plan = {};
                ok.forEach((c) => {
                    plan[c.day + ':' + c.period] = c.wait
                        ? { kind: 'wait' }
                        : { kind: 'have', class_id: c.class_id };
                });
                news.forEach((n, i) => n.cells.forEach((c) => {
                    plan[c.day + ':' + c.period] = { kind: 'new', ni: i };
                }));
            }

            /** كل الفصول المتاحة للاختيار: ما عنده وما سيُنشأ من الصورة. */
            function choices() {
                const out = news.map((n, i) => ({
                    key: 'new:' + i, kind: 'new', ni: i,
                    label: CC.label(n.grade, n.section), sub: n.subject
                }));
                const used = {};
                ok.forEach((c) => { if (c.class_id) used[c.class_id] = true; });
                Object.keys(used).forEach((id) => {
                    const k = byId[id];
                    if (k) out.push({ key: 'have:' + id, kind: 'have', class_id: id,
                                      label: CC.label(k.grade, k.section), sub: k.subject });
                });
                return out;
            }

            function cellOf(e) {
                if (!e) return null;
                if (e.kind === 'wait') return { label: Icons.svg('clock') + ' انتظار', sub: '', cls: 'wait' };
                if (e.kind === 'new') {
                    const n = news[e.ni];
                    return n ? { label: CC.label(n.grade, n.section), sub: n.subject, cls: 'new' } : null;
                }
                const k = byId[e.class_id];
                return k ? { label: CC.label(k.grade, k.section), sub: k.subject, cls: '' } : null;
            }

            /** الشبكة: أيامٌ أعمدة وحصصٌ صفوف — كجدول التطبيق تماماً. */
            function gridHtml() {
                const P = ctx.periods.length;
                let h = '<div class="impg' + (editing ? ' edit' : '') + '">'
                      + '<div class="impg-row head"><span class="impg-h">الحصة</span>'
                      + DAYS.map((d) => '<span class="impg-h">' + escapeHtml(d.label) + '</span>').join('')
                      + '</div>';
                for (let p = 1; p <= P; p++) {
                    h += '<div class="impg-row"><span class="impg-p">' + arDigits(p) + '</span>';
                    for (let d = 0; d < DAYS.length; d++) {
                        const v = cellOf(plan[d + ':' + p]);
                        h += '<button type="button" class="impg-c ' + (v ? v.cls : 'empty') + '"'
                           + ' data-cell="' + d + ':' + p + '"' + (editing ? '' : ' disabled') + '>'
                           + (v ? '<b>' + escapeHtml(v.label) + '</b>'
                                  + (v.sub ? '<i>' + escapeHtml(v.sub) + '</i>' : '')
                                : (editing ? '＋' : ''))
                           + '</button>';
                    }
                    h += '</div>';
                }
                return h + '</div>';
            }

            function paintPreview() {
                /* لا اختيارَ لما يُعرف: المادة مقروءةٌ من الصورة، فسؤالُ
                   المعلّم عنها سبع مراتٍ تعطيلٌ لا تأكيد. ولا يُسأل إلا
                   عمّا لم يُقرأ. */
                /* العدّ من الشبكة لا من القراءة الأولى: المعلّم قد حذف
                   خانةً أو أضافها، فرقمٌ لا يتبعه يكذب عليه. */
                const keys = Object.keys(plan);
                const totalCells = keys.length;
                const usedNew = {};
                keys.forEach((k) => { if (plan[k].kind === 'new') usedNew[plan[k].ni] = true; });
                const taken = Object.keys(usedNew).map((i) => news[Number(i)]).filter(Boolean);
                naked = taken.filter((n) => !n.subject);

                /* كم خانة ستُطمس؟ المعلّم يستحقّ أن يعرف قبل أن يوافق. */
                const overwrite = keys.filter((k) => {
                    const [d, p] = k.split(':').map(Number);
                    return ctx.schedule.some((r) => r.day === d && r.period === p && r.class_id);
                }).length;

                const stageRow = askStage ? `
                    <div class="imp-stage">
                        <div class="imp-stage-t">جدولك يكتب الصفوف بالأرقام —
                            ${totalCells ? 'وبعضها بلا مرحلة. أيّ مرحلةٍ مدرستك؟'
                                         : 'أيّ مرحلةٍ مدرستك؟'}</div>
                        <div class="imp-stage-c">
                            ${Object.keys(CC.STAGE_LABELS).map((k) => `
                                <button type="button" class="sch-chip ${stage === k ? 'on' : ''}"
                                        data-stage-pick="${k}">${CC.STAGE_LABELS[k]}</button>
                            `).join('')}
                        </div>
                    </div>` : '';

                resultEl.innerHTML = `
                    <div class="imp-box">
                        ${stageRow}
                        <div class="imp-sum">
                            <b>قُرئت ${arWord(totalCells)}${taken.length ? ' · ' + clsWord(taken.length) + ' جديدة' : ''}</b>
                            ${skipped.length ? `<span class="imp-skip">وتُخطّيت ${arWord(skipped.length)} لم أتعرّف على فصلها</span>` : ''}
                            ${overwrite ? `<span class="imp-warn">وستُستبدل ${arWord(overwrite)} موجودة في جدولك</span>` : ''}
                        </div>

                        ${/* الفصول المعروفة مادّتها لا تُسرد: كلُّ واحدٍ منها
                              مكتوبٌ في خاناته داخل الشبكة، وسردُها ثمانيةَ
                              أسطرٍ يدفع الشبكة تحت الطيّ. ولا يُسأل إلا
                              عمّا لا تقوله الشبكة: مادةٌ لم تُقرأ. */''}
                        ${naked.length ? `
                            <div class="imp-new">
                                <div class="imp-new-t">
                                    ${naked.length === 1 ? 'فصلٌ ينقصه مادّته' : arDigits(naked.length) + ' فصولٍ تنقصها موادّها'}
                                </div>
                                ${news.map((n, i) => (!usedNew[i] || n.subject) ? '' : `
                                    <div class="imp-new-row">
                                        <span class="nm">${escapeHtml(CC.label(n.grade, n.section))}
                                            <span class="cnt">${arWord(n.cells.length)}</span></span>
                                        <select class="imp-new-sub" data-new-subj="${i}">
                                            <option value="">— اختر المادة —</option>
                                            ${subjectList.map((s) => `
                                                <option value="${escapeAttr(s)}">${escapeHtml(s)}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                `).join('')}
                            </div>` : ''}

                        ${pickHtml()}
                        ${totalCells ? `
                            ${editing ? '<p class="impg-hint">اضغط أي خانة لتغييرها — ثم «تمّ».</p>' : ''}
                            ${gridHtml()}` : ''}

                        <div class="imp-acts">
                            <button type="button" class="btn btn-primary" id="imp-apply"
                                    ${askStage && !totalCells ? 'disabled' : ''}>
                                ✓ اعتمد ${arWord(totalCells, true)}${taken.length ? ' و' + clsWord(taken.length, true) : ''}
                            </button>
                            ${totalCells ? `
                                <button type="button" class="btn btn-secondary" id="imp-edit">
                                    ${editing ? '✓ تمّ التعديل' : '✎ تعديل'}
                                </button>` : ''}
                        </div>
                    </div>`;
                bindPreview();
            }

            /** لوحةُ اختيارٍ داخل المعاينة: بمَ نملأ هذه الخانة؟ */
            function pickHtml() {
                if (!pickKey) return '';
                const [d, p] = pickKey.split(':').map(Number);
                const cur = plan[pickKey];
                return '<div class="impg-pick">'
                    + '<div class="impg-pick-t">' + escapeHtml(DAYS[d].label) + ' · الحصة ' + arDigits(p)
                    + '<button type="button" class="impg-pick-x" data-pick-close>✕</button></div>'
                    + '<div class="impg-pick-l">'
                    + choices().map((o) => '<button type="button" class="sch-chip'
                        + ((cur && ((o.kind === 'new' && cur.ni === o.ni) || (o.kind === 'have' && cur.class_id === o.class_id))) ? ' on' : '')
                        + '" data-pick="' + escapeAttr(o.key) + '">' + escapeHtml(o.label)
                        + (o.sub ? ' <small>' + escapeHtml(o.sub) + '</small>' : '') + '</button>').join('')
                    + '<button type="button" class="sch-chip' + (cur && cur.kind === 'wait' ? ' on' : '') + '" data-pick="wait">' + Icons.svg('clock') + ' انتظار</button>'
                    + '<button type="button" class="sch-chip danger" data-pick="clear">✕ فارغة</button>'
                    + '</div></div>';
            }

            function bindPreview() {
                resultEl.querySelector('#imp-edit')?.addEventListener('click', () => {
                    editing = !editing;
                    paintPreview();
                });
                resultEl.querySelectorAll('[data-cell]').forEach((el) => {
                    el.addEventListener('click', () => { pickKey = el.dataset.cell; paintPreview(); });
                });
                resultEl.querySelector('[data-pick-close]')?.addEventListener('click', () => {
                    pickKey = null; paintPreview();
                });
                resultEl.querySelectorAll('[data-pick]').forEach((el) => {
                    el.addEventListener('click', () => {
                        const v = el.dataset.pick, key = pickKey;
                        if (!key) return;
                        if (v === 'clear') delete plan[key];
                        else if (v === 'wait') plan[key] = { kind: 'wait' };
                        else if (v.startsWith('new:')) plan[key] = { kind: 'new', ni: Number(v.slice(4)) };
                        else plan[key] = { kind: 'have', class_id: v.slice(5) };
                        pickKey = null;
                        paintPreview();
                    });
                });
                resultEl.querySelectorAll('[data-stage-pick]').forEach((el) => {
                    el.addEventListener('click', () => {
                        stage = el.dataset.stagePick;
                        sortCells();          /* الاختيار يُحيي خاناتٍ كانت ساقطة */
                        buildPlan();
                        paintPreview();
                    });
                });
                resultEl.querySelectorAll('[data-new-subj]').forEach((el) => {
                    el.addEventListener('change', () => {
                        news[Number(el.dataset.newSubj)].subject = el.value;
                        paintPreview();   /* اكتملت مادّته فيخرج من قائمة الناقص */
                    });
                });

                resultEl.querySelector('#imp-apply').addEventListener('click', async (e) => {
                    /* يُكتب ما في الشبكة لا ما قرأه النموذج: المعلّم قد
                       عدّل، وتجاهلُ تعديله أسوأ من ألّا نعرضه. */
                    const keys = Object.keys(plan);
                    const usedNew = {};
                    keys.forEach((k) => { if (plan[k].kind === 'new') usedNew[plan[k].ni] = true; });

                    /* لا فصلَ بلا مادة — والاسم وحده لا يميّز فصلين لمعلّمٍ
                       يدرّس مادتين لنفس الصف. */
                    const missing = Object.keys(usedNew)
                        .map((i) => news[Number(i)]).filter((n) => n && !n.subject);
                    if (missing.length) {
                        return global.TeacherApp.toast(
                            'اختر مادة ' + CC.label(missing[0].grade, missing[0].section) + '.',
                            'warning', 4000);
                    }

                    const b = e.currentTarget;
                    b.disabled = true;
                    b.textContent = 'جارٍ الحفظ…';
                    try {
                        /* تُنشأ الفصول المستعملة في الشبكة وحدها — فما حذفه
                           المعلّم من كل خاناته لا يُنشأ له فصل. */
                        const made = {};
                        for (const i of Object.keys(usedNew)) {
                            const n = news[Number(i)];
                            const cls = await CC.create({
                                teacher_id: ctx.teacher.id,
                                stage: n.stage, grade: n.grade, section: n.section, subject: n.subject
                            });
                            ctx.classes.push(cls);
                            made[i] = cls.id;
                        }
                        const all = keys.map((k) => {
                            const [day, period] = k.split(':').map(Number);
                            const e2 = plan[k];
                            if (e2.kind === 'wait') return { day, period, class_id: null, wait: true, topic: '' };
                            return { day, period, topic: '',
                                     class_id: e2.kind === 'new' ? made[e2.ni] : e2.class_id };
                        });
                        await applyCells(all, ctx, container);
                        global.Modal.close();
                        const nMade = Object.keys(made).length;
                        global.TeacherApp.toast(
                            'تم استيراد ' + arWord(all.length, true)
                            + (nMade ? ' وإنشاء ' + clsWord(nMade, true) : '') + '',
                            'success', 3500);
                    } catch (err) {
                        console.warn('[schedule] apply failed:', err);
                        global.TeacherApp.toast('تعذّر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error', 6000);
                        paintPreview();
                    }
                });
            }

            buildPlan();
            paintPreview();
        }

        global.Modal.open({ title: 'استيراد الجدول', body: form });
    }

    /** يكتب الخانات المقروءة فوق ما يقابلها، ويترك ما عداه كما هو. */
    async function applyCells(cells, ctx, container) {
        const writes = [];
        cells.forEach((c) => {
            const idx = ctx.schedule.findIndex((r) => r.day === c.day && r.period === c.period);
            const prev = idx >= 0 ? ctx.schedule[idx] : null;
            const row = Object.assign({
                teacher_id: ctx.teacher.id,
                created_at: prev ? prev.created_at : new Date().toISOString()
            }, prev || {}, {
                day: c.day, period: c.period, class_id: c.wait ? null : c.class_id, topic: c.topic,
                /* الاستيراد يُلغي الاحتياط، ويُثبت الانتظار حيث قرأه. */
                wait_kind: c.wait ? 'perm' : null, wait_date: null,
                sub_class: null, sub_date: null,
                updated_at: new Date().toISOString()
            });
            if (idx >= 0) ctx.schedule[idx] = row; else ctx.schedule.push(row);
            writes.push(row);
        });

        paintView(container, ctx);

        /* كتابةٌ متوازية لا متتابعة — ثلاثون خانةً تعني ثلاثين رحلة. */
        await Promise.all(writes.map(async (row) => {
            if (row.id) return global.TeacherDB.put('schedule', row);
            row.id = await global.TeacherDB.add('schedule', row);
        }));
    }

    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    /* صيغتان لا واحدة: «قُرئت حصتان» مرفوعةٌ فاعلاً، و«اعتمد حصتين»
       منصوبةٌ مفعولاً. وكانت واحدةً فقرأ المعلّم «اعتمد ٦ حصص وفصلان». */
    function clsWord(n, acc) {
        if (n === 1) return 'فصل واحد';
        if (n === 2) return acc ? 'فصلين' : 'فصلان';
        if (n <= 10) return arDigits(n) + ' فصول';
        return arDigits(n) + ' فصلاً';
    }
    function arWord(n, acc) {
        if (n === 1) return 'حصة واحدة';
        if (n === 2) return acc ? 'حصتين' : 'حصتان';
        if (n <= 10) return arDigits(n) + ' حصص';
        return arDigits(n) + (acc ? ' حصةً' : ' حصة');
    }


    /* ==========================================================================
       لوحة اختيار الفصل / تعديل الحصة — باللمس فقط بلا زر حفظ
       ========================================================================== */

    const GRADE_NAMES = {
        primary:      ['الأول','الثاني','الثالث','الرابع','الخامس','السادس'],
        intermediate: ['الأول','الثاني','الثالث'],
        secondary:    ['الأول','الثاني','الثالث']
    };
    const STAGE_SUFFIX = { primary: 'الابتدائي', intermediate: 'المتوسط', secondary: 'الثانوي' };
    const STAGE_LABEL  = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
    const SECTIONS = ['أ','ب','ج','د','هـ','و','ز','ح'];

    function sheetHead(day, period, ctx, opts = {}) {
        const p = ctx.periods.find((x) => x.n === period);
        const time = p ? `${escapeHtml(p.start)} — ${escapeHtml(p.end)}` : '';
        return `
            <div class="sch-head">
                ${opts.back ? '<button type="button" class="sch-back" data-back>›</button>' : ''}
                <div class="sch-slot ${opts.amber ? 'amber' : ''}">
                    <b class="num">ح${period}</b><span>${opts.amber ? 'انتظار' : 'الحصة'}</span>
                </div>
                <div class="sch-tt">
                    <h3>${escapeHtml(opts.title)}</h3>
                    <div class="num">${DAYS[day].label}${time ? ' · ' + time : ''}</div>
                </div>
            </div>`;
    }

    /** عنوان نافذة النظام (شريط الإغلاق) حسب حالة الخانة. */
    function sheetTitle(existing, isWait) {
        if (isWait) return 'حصة انتظار';
        return existing ? 'تعديل الحصة' : 'إضافة حصة';
    }

    function classCardsHtml(ctx, selectedId) {
        return `
            <div class="sch-grid">
                ${ctx.classes.map((c) => `
                    <button type="button" class="sch-card ${selectedId === c.id ? 'on' : ''}" data-cls="${c.id}">
                        <span class="g">${escapeHtml(shortCell(c))}</span>
                        <span class="s">${escapeHtml(c.subject)}</span>
                    </button>
                `).join('')}
                <button type="button" class="sch-card wait ${selectedId === '__wait__' ? 'on' : ''}" data-wait>
                    <span class="g">${Icons.svg('clock')} حصة انتظار</span>
                    <span class="s">اضغط لتُضاف فوراً</span>
                </button>
                <button type="button" class="sch-card new" data-newcls>
                    <span class="g">＋ فصل جديد</span>
                    <span class="s">يُضاف هنا فور إنشائه</span>
                </button>
            </div>`;
    }

    /** اختيار الفصل المُسند للانتظار: مرحلة ← صف ← شعبة (كل فصول المدرسة) */
    function substituteHtml(state) {
        return `
            <div class="sch-lbl">المرحلة</div>
            <div class="sch-chips">
                ${Object.keys(STAGE_LABEL).map((k) => `
                    <button type="button" class="sch-chip ${state.stage === k ? 'on' : ''}" data-stage="${k}">${STAGE_LABEL[k]}</button>
                `).join('')}
            </div>
            <div class="sch-lbl">الصف</div>
            <div class="sch-g3">
                ${GRADE_NAMES[state.stage].map((g, i) => `
                    <button type="button" class="sch-gcell ${state.grade === i ? 'on' : ''}" data-grade="${i}">${g}</button>
                `).join('')}
            </div>
            <div class="sch-lbl" style="margin-top:13px">الشعبة</div>
            <div class="sch-secs">
                ${SECTIONS.map((s) => `
                    <button type="button" class="sch-sec" data-sec="${escapeAttr(s)}"
                            ${state.grade === null ? 'disabled' : ''}>${s}</button>
                `).join('')}
            </div>`;
    }

    function openCellEditor(day, period, ctx, container) {
        const existing = ctx.schedule.find((r) => r.day === day && r.period === period);
        const isWait   = !!existing && !existing.class_id;

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        const subState = { stage: 'primary', grade: null };

        /* الضغطة تُغلق اللوحة وترسم الخانة فوراً من الذاكرة، والكتابة في
           القاعدة تمضي في الخلفية — كانت تُبقي المعلم ينتظر ربع ثانية أو أكثر
           على الشبكة قبل أن يرى شيئاً. وإن فشلت الكتابة يُبلَّغ وتُستعاد
           الحقيقة من القاعدة. */
        function commit(patch, okMsg) {
            const row = Object.assign({
                teacher_id: ctx.teacher.id,
                created_at: existing ? existing.created_at : new Date().toISOString()
            }, existing || {}, patch, { day, period, updated_at: new Date().toISOString() });

            const idx = ctx.schedule.findIndex((r) => r.day === day && r.period === period);
            if (idx >= 0) ctx.schedule[idx] = row; else ctx.schedule.push(row);

            global.Modal.close();
            paintView(container, ctx);
            if (okMsg) global.TeacherApp.toast(okMsg, 'success', 1100);

            queueWrite(day, period, async () => {
                /* المعرّف قد يكون وصل للصف السابق أثناء انتظار الدور. */
                if (!row.id && existing && existing.id) row.id = existing.id;
                if (row.id) await global.TeacherDB.put('schedule', row);
                else row.id = await global.TeacherDB.add('schedule', row);
            }, () => render(container));
            return true;
        }

        function pickClass(id) {
            return commit({ class_id: id, wait_kind: null, wait_date: null,
                            sub_class: null, sub_date: null }, 'تم الحفظ');
        }

        /* حصة الانتظار بلا أنواع: تبقى في الجدول حتى يزيلها المعلم بنفسه. */
        function pickWait() {
            return commit({ class_id: null, wait_kind: 'perm', wait_date: null,
                            sub_class: null, sub_date: null }, 'تمت إضافة حصة انتظار');
        }

        function pickSubstitute(label) {
            return commit({ class_id: null, sub_class: label, sub_date: todayKey() },
                          'تنتظر عند ' + label + ' اليوم');
        }

        function paint() {
            /* الضغطة الثانية على حصة انتظار تفتح مباشرةً اختيار فصول المدرسة
               كاملةً — بلا وصول سريع لفصول المعلم، فهو ينتظر عند فصل لا يدرّسه. */
            if (isWait) {
                body.innerHTML = sheetHead(day, period, ctx,
                    { title: existing.sub_class ? 'تنتظر عند: ' + existing.sub_class : 'عند أي فصل تنتظر؟',
                      amber: true })
                    + (existing.sub_class
                        ? `<div class="sch-cur">
                               <span class="em">${Icons.svg('clock')}</span>
                               <span class="tx">
                                   <span class="t">${escapeHtml(existing.sub_class)}</span>
                                   <span class="h">لهذا اليوم فقط · يُمسح نهاية اليوم</span>
                               </span>
                               <button type="button" class="x" data-unsub>✕</button>
                           </div>
                           <div class="sch-lbl">اختر فصلاً آخر لتغييره</div>`
                        : '')
                    + substituteHtml(subState)
                    + `<button type="button" class="sch-del" data-del>${Icons.svg('trash')} إزالة الحصة من الجدول</button>
                       <div class="sch-hint">اضغط خارج اللوحة للإغلاق</div>`;
            } else {
                const title = existing ? 'تعديل الحصة' : 'اختر الفصل';
                body.innerHTML = sheetHead(day, period, ctx, { title })
                    + `<div class="sch-lbl">${existing ? 'الفصل — اضغط لتغييره فوراً' : 'اضغط الفصل ليُضاف فوراً'}</div>`
                    + classCardsHtml(ctx, existing ? existing.class_id : null)
                    + (existing
                        ? `<button type="button" class="sch-del" data-del>${Icons.svg('trash')} إزالة الحصة من الجدول</button>
                           <div class="sch-hint">اضغط خارج اللوحة للإغلاق</div>`
                        : '');
            }
        }

        body.addEventListener('click', async (e) => {
            const t = e.target;
            const card = t.closest('[data-cls]');
            if (card) return pickClass(card.dataset.cls);

            if (t.closest('[data-wait]')) return pickWait();

            /* فصلٌ ناقص لا يُخرج المعلّم من جدوله: يُنشئه من هنا ويُسنَد
               للخانة فوراً، فيرى الحصة مكانها بلا رحلة ذهابٍ وإياب. */
            if (t.closest('[data-newcls]')) {
                global.Modal.close();
                return global.DashboardView.openAddClassModal(ctx.teacher, {
                    onCreated: (cls) => {
                        ctx.classes.push(cls);
                        const row = Object.assign({
                            teacher_id: ctx.teacher.id,
                            created_at: existing ? existing.created_at : new Date().toISOString()
                        }, existing || {}, {
                            day, period, class_id: cls.id,
                            wait_kind: null, wait_date: null, sub_class: null, sub_date: null,
                            updated_at: new Date().toISOString()
                        });
                        const i = ctx.schedule.findIndex((r) => r.day === day && r.period === period);
                        if (i >= 0) ctx.schedule[i] = row; else ctx.schedule.push(row);

                        paintView(container, ctx);
                        global.TeacherApp.toast('أُضيف الفصل وحصّته', 'success', 1600);

                        queueWrite(day, period, async () => {
                            if (row.id) await global.TeacherDB.put('schedule', row);
                            else row.id = await global.TeacherDB.add('schedule', row);
                        }, () => render(container));
                    }
                });
            }

            const stage = t.closest('[data-stage]');
            if (stage) { subState.stage = stage.dataset.stage; subState.grade = null; return paint(); }

            const grade = t.closest('[data-grade]');
            if (grade) { subState.grade = Number(grade.dataset.grade); return paint(); }

            const sec = t.closest('[data-sec]');
            if (sec && subState.grade !== null) {
                const g = GRADE_NAMES[subState.stage][subState.grade];
                return pickSubstitute(`${g} ${STAGE_SUFFIX[subState.stage]}/${sec.dataset.sec}`);
            }

            if (t.closest('[data-unsub]')) {
                return commit({ sub_class: null, sub_date: null }, 'تم إلغاء الإسناد.');
            }

            if (t.closest('[data-del]')) {
                if (!(await global.TeacherApp.confirm({ title: 'إزالة هذه الحصة؟', ok: 'إزالة', danger: true }))) return;
                const idx = ctx.schedule.findIndex((r) => r.day === day && r.period === period);
                if (idx >= 0) ctx.schedule.splice(idx, 1);
                global.Modal.close();
                paintView(container, ctx);
                global.TeacherApp.toast('تمت الإزالة.', 'info', 1100);
                queueWrite(day, period, () => {
                    /* صف أُضيف قبل لحظة قد يكون معرّفه وصل أثناء انتظار الدور. */
                    if (!existing.id) return;
                    return global.TeacherDB.remove('schedule', existing.id);
                }, () => render(container));
                return;
            }
        });

        paint();
        global.Modal.open({ title: sheetTitle(existing, isWait), body });
    }

    const DURATIONS = [40, 45, 50];
    const BREAK_LENGTHS = [15, 20, 30];
    /* الراحةُ بين كلّ حصّتين — غيرُ الفسحة الطويلة. أكثرُ المدارس تجعلها
       خمساً (بقول المعلّم، ٣ سبتمبر ٢٠٢٦)، والصفرُ افتراضيٌّ لأنّ تغييرَه
       يُزيح أوقاتَ كلّ معلّمٍ لم يطلب شيئاً. */
    const GAPS = [0, 5, 10];
    const AUTOFILL_DEFAULT = { start: '07:00', dur: 45, breakAfter: 3, breakDur: 30, gap: 0 };

    /** يبني أوقات كل الحصص من وقت البداية ومدة الحصة، ويزيح ما بعد الفسحة. */
    function autofillRows(count, cfg) {
        const out = [];
        const gap = Math.max(0, Number(cfg.gap) || 0);
        let cursor = timeToMin(cfg.start);
        for (let i = 1; i <= count; i++) {
            const end = cursor + cfg.dur;
            out.push({ n: i, start: minToTime(cursor), end: minToTime(end) });
            cursor = end;
            if (i === count) break;                       /* لا راحةَ بعد الأخيرة */
            /* الفسحةُ تُغني عن الراحة في موضعها — وإلّا جُمعتا فصارت
               الفسحةُ ٣٥ دقيقةً والمعلّمُ طلب ٣٠. */
            if (cfg.breakAfter && i === cfg.breakAfter) cursor += cfg.breakDur;
            else cursor += gap;
        }
        return out;
    }

    function openTimesEditor(ctx, container) {
        const rows = ctx.periods.map((p) => ({ ...p }));
        const cfg  = { ...AUTOFILL_DEFAULT, ...(ctx.autofill || {}) };

        const form = document.createElement('div');
        paint();

        /* حقلُ «أخرى» يبقى فارغاً ما دامت الحبّةُ المضيئة تقول المدّة —
           كتابةُ الرقم مرّتين حشوٌ يشغل العين. ولا يُملأ إلا بمدّةٍ لا حبّةَ
           لها، فهو حينئذٍ الموضعُ الوحيد الذي يحفظها. */
        function otherVal(list, v) { return list.includes(v) ? '' : v; }

        function autofillHtml() {
            return `
                <div class="tf-box">
                    <div class="tf-row">
                        <span class="tf-lbl">بداية الحصة الأولى</span>
                        <input type="time" class="input input-sm tf-time" id="tf-start" value="${cfg.start}">
                    </div>

                    <div class="tf-chips">
                        <span class="tf-lbl">مدة الحصة</span>
                        ${DURATIONS.map((d) => `
                            <button type="button" class="tf-chip ${cfg.dur === d ? 'on' : ''}" data-dur="${d}">
                                ${d} د
                            </button>
                        `).join('')}
                        <input type="number" class="input input-sm tf-num" id="tf-dur" min="20" max="90"
                               value="${otherVal(DURATIONS, cfg.dur)}" placeholder="أخرى" aria-label="مدة أخرى">
                    </div>

                    <div class="tf-chips">
                        <span class="tf-lbl">الراحة بين الحصص</span>
                        ${GAPS.map((d) => `
                            <button type="button" class="tf-chip ${cfg.gap === d ? 'on' : ''}" data-gap="${d}">
                                ${d === 0 ? 'بلا' : d + ' د'}
                            </button>
                        `).join('')}
                        <input type="number" class="input input-sm tf-num" id="tf-gap" min="0" max="30"
                               value="${otherVal(GAPS, cfg.gap)}" placeholder="أخرى"
                               aria-label="مدة أخرى للراحة بين الحصص">
                    </div>

                    <div class="tf-row">
                        <span class="tf-lbl">الفسحة بعد الحصة</span>
                        <select class="input input-sm tf-sel" id="tf-after">
                            <option value="0" ${cfg.breakAfter === 0 ? 'selected' : ''}>بلا فسحة</option>
                            ${rows.map((r) => `
                                <option value="${r.n}" ${cfg.breakAfter === r.n ? 'selected' : ''}>الحصة ${r.n}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="tf-chips">
                        <span class="tf-lbl">مدة الفسحة</span>
                        ${BREAK_LENGTHS.map((d) => `
                            <button type="button" class="tf-chip ${cfg.breakDur === d ? 'on' : ''}" data-brk="${d}">
                                ${d} د
                            </button>
                        `).join('')}
                        <input type="number" class="input input-sm tf-num" id="tf-brk" min="5" max="90"
                               value="${otherVal(BREAK_LENGTHS, cfg.breakDur)}" placeholder="أخرى"
                               aria-label="مدة أخرى للفسحة">
                    </div>

                </div>`;
        }

        function rowsHtml() {
            return rows.map((r, i) => `
                <div class="times-row">
                    <span class="times-label">ح${r.n}</span>
                    <input type="time" class="input input-sm" data-t="${i}" data-k="start" value="${r.start}">
                    <span>إلى</span>
                    <input type="time" class="input input-sm" data-t="${i}" data-k="end" value="${r.end}">
                </div>
            `).join('');
        }

        /* ---------- الحفظ التلقائيّ ----------
           التثبيتُ في `ctx` فوريٌّ فلا يضيع شيءٌ لو أُغلقت اللوحة في الحال،
           والكتابةُ في القاعدة بعد سكونِ ثلثَي ثانية: كتابةُ «٤٥» تُطلق
           حدثين، وضبطُ سبع حصصٍ يدويّاً يُطلق عشرات — فلا تُرسل كلُّها.

           والرسمُ خلف اللوحة يُؤجَّل إلى إغلاقها: اللوحةُ تغطّيه فلا يُرى،
           وإعادةُ رسمِه مع كلّ حرفٍ عملٌ لا يراه أحد. */
        let saveTimer = null, dirty = false;

        function flash(text) {
            const el = form.querySelector('#tf-state');
            if (!el) return;
            el.textContent = text;
            el.classList.add('on');
            global.setTimeout(() => el.classList.remove('on'), 1400);
        }

        function writeNow() {
            if (!dirty) return Promise.resolve();
            dirty = false;
            const saved = rows.map((r) => ({ ...r }));
            const conf  = { ...cfg };
            return bgSave(async () => {
                await savePeriodTimes(saved);
                await global.TeacherDB.Settings.set('period_autofill', conf);
                /* والمنبّهُ يُعاد جدولتُه: خطّتُه مبنيّةٌ على هذه الأوقات،
                   وكانت تبقى على القديم حتّى إعادة تشغيل التطبيق —
                   فيرنّ الجرسُ على توقيتٍ بدّله المعلّمُ قبل قليل. */
                if (global.Bell && global.Bell.reschedule) global.Bell.reschedule();
            }, () => render(container));
        }

        function commit() {
            ctx.periods  = rows.map((r) => ({ ...r }));
            ctx.autofill = { ...cfg };
            dirty = true;
            global.clearTimeout(saveTimer);
            saveTimer = global.setTimeout(() => {
                writeNow().then(() => flash('حُفظت ✓'));
            }, 650);
        }

        /* التعبئة فورية بلا زر: أي تغيير في البداية أو المدة أو الفسحة يعيد
           حساب الأوقات ويُحدّث القائمة وحدها — لا الصفحة كلها — حتى لا يفقد
           الحقل الذي يكتب فيه المعلم تركيزه. */
        function recalc() {
            rows.splice(0, rows.length, ...autofillRows(rows.length, cfg));
            const list = form.querySelector('#times-list');
            if (list) { list.innerHTML = rowsHtml(); bindRows(); }
            commit();
        }

        /* لا «حفظ» ولا «إلغاء»: كلُّ تغييرٍ يُحفظ ساعةَ وقوعه. كان الزرّان
           فوق القائمة لأن المعلّم يمرّ بسبع حصصٍ قبل أن يبلغهما في الذيل،
           ثم سقطا أصلاً — والزرُّ الذي لا يُنسى هو الذي لا يوجد.
           (طلبُ المعلّم، ٢٢ أغسطس ٢٠٢٦.)

           ومكانَهما سطرٌ يطمئنه أن ما غيّره محفوظ — وإلّا ظنّ أنه ضاع
           وبحث عن زرٍّ ليس هناك. */
        function paint() {
            form.innerHTML = autofillHtml() + `
                <p class="times-auto" id="tf-state">تُحفظ التغييرات تلقائياً</p>

                <div class="times-list" id="times-list">${rowsHtml()}</div>
            `;
            bindInner();
        }

        function bindRows() {
            form.querySelectorAll('[data-t]').forEach((inp) => {
                inp.addEventListener('input', () => {
                    /* الوقتُ الفارغ حالةُ عبورٍ أثناء الكتابة لا اختيار،
                       فلا يُثبَّت وإلّا حُفظت حصّةٌ بلا بداية. */
                    if (!inp.value) return;
                    rows[Number(inp.dataset.t)][inp.dataset.k] = inp.value;
                    commit();
                });
            });
        }

        function bindInner() {
            form.querySelector('#tf-start')?.addEventListener('input', (e) => {
                if (!e.target.value) return;
                cfg.start = e.target.value;
                recalc();
            });
            form.querySelector('#tf-after')?.addEventListener('change', (e) => {
                cfg.breakAfter = Number(e.target.value);
                recalc();
            });
            /* أثناء الكتابة يمرّ رقم ناقص («٤» قبل «٤٥») فنتجاهله حتى يصير ضمن المدى. */
            form.querySelector('#tf-dur')?.addEventListener('input', (e) => {
                const v = Number(e.target.value);
                if (!(v >= 20 && v <= 90)) return;
                cfg.dur = v;
                form.querySelectorAll('[data-dur]').forEach((b) => b.classList.toggle('on', Number(b.dataset.dur) === v));
                recalc();
            });
            form.querySelector('#tf-gap')?.addEventListener('input', (e) => {
                /* الفارغُ يعني «بلا» لا «تجاهل»: الصفرُ اختيارٌ صحيحٌ هنا
                   بخلاف المدّة والفسحة، فلا يُشترط مدىً أدنى. */
                const v = e.target.value === '' ? 0 : Number(e.target.value);
                if (!(v >= 0 && v <= 30)) return;
                cfg.gap = v;
                form.querySelectorAll('[data-gap]').forEach((b) => b.classList.toggle('on', Number(b.dataset.gap) === v));
                recalc();
            });
            form.querySelector('#tf-brk')?.addEventListener('input', (e) => {
                const v = Number(e.target.value);
                if (!(v >= 5 && v <= 90)) return;
                cfg.breakDur = v;
                form.querySelectorAll('[data-brk]').forEach((b) => b.classList.toggle('on', Number(b.dataset.brk) === v));
                recalc();
            });
            /* واختيارُ حبّةٍ يُفرغ «أخرى»: الحبّةُ صارت هي التي تقول المدّة،
               فلو بقي الرقمُ فيه لتناقض الاثنان في عين المعلّم. */
            form.querySelectorAll('[data-dur]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cfg.dur = Number(btn.dataset.dur);
                    form.querySelector('#tf-dur').value = '';
                    form.querySelectorAll('[data-dur]').forEach((b) => b.classList.toggle('on', b === btn));
                    recalc();
                });
            });
            form.querySelectorAll('[data-gap]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cfg.gap = Number(btn.dataset.gap);
                    form.querySelector('#tf-gap').value = '';
                    form.querySelectorAll('[data-gap]').forEach((b) => b.classList.toggle('on', b === btn));
                    recalc();
                });
            });
            form.querySelectorAll('[data-brk]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cfg.breakDur = Number(btn.dataset.brk);
                    form.querySelector('#tf-brk').value = '';
                    form.querySelectorAll('[data-brk]').forEach((b) => b.classList.toggle('on', b === btn));
                    recalc();
                });
            });

            bindRows();
        }

        /* بلا تركيزٍ تلقائيّ: النافذةُ حبّاتُ مدّةٍ تُضغط قبل أن تكون حقلاً
           يُكتب، فقفزُ لوحة المفاتيح عليها يغطّي نصفَها قبل أن يراها
           المعلّم. فليضغط الحقلَ بنفسه. (طلبُه، ٢٢ أغسطس ٢٠٢٦؛ والنظيرُ
           في «+ خانة جديدة» و«تعديل الخانات» و«طباعة السجل».) */
        global.Modal.open({
            title: 'توقيت الحصص', body: form, autofocus: false,
            /* الإغلاقُ يكتب ما لم تبلغه المهلةُ بعد — فمن غيّر وأغلق في
               الحال لا يفقد تغييرَه — ثمّ يُعاد رسمُ الجدول بالأوقات. */
            onClose: () => {
                global.clearTimeout(saveTimer);
                writeNow();
                paintView(container, ctx);
            }
        });
    }

    /* ==========================================================================
       Smart widget: "next class" for dashboard
       ========================================================================== */

    /** Returns the current or upcoming class within the next `lookAheadMin` minutes. */
    async function nextClassInfo(teacher) {
        try {
            const schedule = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
            if (schedule.length === 0) return null;

            const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
            const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
            const periods = await getPeriodTimes();

            const now = new Date();
            const dayIdx = jsDayToSchedule(now.getDay());
            if (dayIdx === -1) return null; // weekend

            const nowMin = now.getHours() * 60 + now.getMinutes();

            const todayPeriods = schedule
                .filter((r) => r.day === dayIdx)
                .map((r) => {
                    const p = periods.find((x) => x.n === r.period);
                    if (!p) return null;
                    const start = timeToMin(p.start);
                    const end   = timeToMin(p.end);
                    return { row: r, cls: classById[r.class_id], period: p, start, end };
                })
                .filter((x) => x && x.cls)
                .sort((a, b) => a.start - b.start);

            // 1. Is there a class happening now?
            const current = todayPeriods.find((x) => nowMin >= x.start && nowMin < x.end);
            if (current) return { state: 'now',  ...current };

            // 2. Upcoming today?
            const upcoming = todayPeriods.find((x) => x.start > nowMin);
            if (upcoming) {
                const minsUntil = upcoming.start - nowMin;
                return { state: 'upcoming', minsUntil, ...upcoming };
            }

            // 3. Nothing today
            return { state: 'done' };
        } catch (err) {
            console.warn('[schedule] nextClassInfo failed:', err);
            return null;
        }
    }

    function jsDayToSchedule(jsDay) {
        // JS: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
        // Our: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu (Fri/Sat = weekend)
        if (jsDay >= 0 && jsDay <= 4) return jsDay;
        return -1;
    }

    function timeToMin(hhmm) {
        const [h, m] = String(hhmm || '00:00').split(':').map(Number);
        return h * 60 + m;
    }

    function minToTime(mins) {
        const m = ((mins % 1440) + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    /* و`getPeriodTimes` مُصدَّرةٌ لأن الرئيسية كانت تقرأ الرمزَ خاماً
       (`Settings.get('period_times') || []`) بلا افتراضيٍّ ولا إكمال —
       فمن لم يفتح محرّرَ التوقيت قطُّ يرى الجدولَ بأوقاتٍ والرئيسيةَ بلا
       أيّ علامة. مصدرٌ واحدٌ للأوقات يمنع اختلافَ الشاشتين. */
    global.ScheduleView = { render, nextClassInfo, getPeriodTimes };
})(window);
