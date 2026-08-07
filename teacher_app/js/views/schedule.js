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

    const DEFAULT_PERIODS = [
        { n: 1, start: '07:00', end: '07:45' },
        { n: 2, start: '07:45', end: '08:30' },
        { n: 3, start: '08:30', end: '09:15' },
        { n: 4, start: '09:45', end: '10:30' }, // after break
        { n: 5, start: '10:30', end: '11:15' },
        { n: 6, start: '11:15', end: '12:00' },
        { n: 7, start: '12:00', end: '12:45' }
    ];

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    async function getPeriodTimes() {
        const stored = await global.TeacherDB.Settings.get('period_times');
        return Array.isArray(stored) && stored.length ? stored : DEFAULT_PERIODS;
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

    /** تنظيف يومي: حصص «لهذا اليوم فقط» المنتهية، وإسنادات انتظار الأمس. */
    async function cleanupExpired(rows) {
        const today = todayKey();
        const survivors = [];
        for (const r of rows) {
            /* «انتظار لهذا اليوم» أُلغي كمفهوم — الصفوف القديمة تُحوَّل لانتظار
               عادي بدل حذفها حتى لا يفقد المعلم حصصاً أضافها سابقاً. */
            if (!r.class_id && r.wait_kind === 'today') {
                const norm = { ...r, wait_kind: 'perm', wait_date: null,
                               updated_at: new Date().toISOString() };
                await global.TeacherDB.put('schedule', norm);
                survivors.push(norm);
                continue;
            }
            if (!r.class_id && r.sub_class && r.sub_date !== today) {
                const clean = { ...r, sub_class: null, sub_date: null,
                                updated_at: new Date().toISOString() };
                await global.TeacherDB.put('schedule', clean);
                survivors.push(clean);
                continue;
            }
            survivors.push(r);
        }
        return survivors;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const classes  = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const rawSched = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const schedule = await cleanupExpired(rawSched);
        const periods  = await getPeriodTimes();

        const grid = buildGrid(schedule, periods.length);

        const todayIdx = (() => {
            const d = new Date().getDay();
            return (d >= 0 && d <= 4) ? d : -1;
        })();

        container.innerHTML = `
            <div class="container sched-v2">
                <div class="sched-head">
                    <h2>📅 الجدول الأسبوعي</h2>
                    <button type="button" class="sched-time-btn" id="btn-times">توقيت الحصص</button>
                </div>

                ${classes.length === 0 ? classesEmptyHint() : ''}

                ${renderGrid(grid, periods, classes, todayIdx)}

                <p class="sched-hint">اضغط أي خانة لإضافة حصة أو تعديلها</p>

                <button type="button" class="sched-clear" id="btn-clear-all">🗑️ مسح الجدول كاملاً</button>
            </div>
        `;

        bind(container, { teacher, classes, schedule, periods, grid });
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
        return `${g}/${cls.section}`;
    }

    /* الشبكة المعتمدة (البديل ب): الحصص صفوفٌ على اليمين والأيام أعمدة أعلى،
       الأيام الخمسة كلها ظاهرة بلا تمرير أفقي، وعمود اليوم الحالي ذهبي. */
    function renderGrid(grid, periods, classes, todayIdx) {
        const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
        return `
            <div class="sched-wrap">
                <table class="sched-table">
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
                                    <b class="num">ح${p.n}</b>
                                    <span class="num">${escapeHtml(p.start)}</span>
                                </td>
                                ${DAYS.map((d) => {
                                    const cell = grid[d.index]?.[p.n];
                                    const tc = d.index === todayIdx ? ' is-today' : '';
                                    const attrs = `data-day="${d.index}" data-period="${p.n}"`;
                                    if (!cell) {
                                        return `<td class="sched-cell${tc}" ${attrs}>
                                            <div class="sched-box empty">+</div>
                                        </td>`;
                                    }
                                    const cls = classById[cell.class_id];
                                    if (!cls) {
                                        // انتظار: يعرض الفصل المُسند اليوم إن وُجد
                                        return `<td class="sched-cell${tc}" ${attrs}>
                                            <div class="sched-box wait">
                                                ${cell.sub_class
                                                    ? `<span class="sb-sub">${escapeHtml(cell.sub_class)}</span>
                                                       <span class="sb-w">انتظار</span>`
                                                    : 'انتظار'}
                                            </div>
                                        </td>`;
                                    }
                                    return `<td class="sched-cell${tc}" ${attrs}>
                                        <div class="sched-box filled">
                                            <span class="sb-c">${escapeHtml(shortCell(cls))}</span>
                                            <span class="sb-s">${escapeHtml(cls.subject)}</span>
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

    function bind(container, ctx) {
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

        container.querySelector('#btn-times')?.addEventListener('click', () => openTimesEditor(ctx, container));

        container.querySelector('#btn-clear-all')?.addEventListener('click', async () => {
            if (!global.confirm('مسح الجدول كاملاً؟')) return;
            for (const row of ctx.schedule) await global.TeacherDB.remove('schedule', row.id);
            global.TeacherApp.toast('تم المسح.', 'info');
            await render(container);
        });
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
                    <span class="g">⏳ حصة انتظار</span>
                    <span class="s">اضغط لتُضاف فوراً</span>
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

        async function saveRow(patch) {
            const row = Object.assign({
                teacher_id: ctx.teacher.id,
                day, period,
                updated_at: new Date().toISOString()
            }, existing || {}, patch, { day, period });
            if (existing) {
                await global.TeacherDB.put('schedule', row);
            } else {
                row.created_at = new Date().toISOString();
                await global.TeacherDB.add('schedule', row);
            }
        }

        /* أي فشل في الحفظ كان يمرّ بصمت فيبدو أن الضغط «لم يفعل شيئاً» —
           الآن يُعرض سببه للمعلم وتبقى اللوحة مفتوحة ليعيد المحاولة. */
        async function commit(patch, okMsg) {
            try {
                await saveRow(patch);
            } catch (e) {
                global.TeacherApp.toast(
                    'تعذّر الحفظ: ' + (e && e.message ? e.message : 'خطأ غير معروف'),
                    'error', 6000
                );
                return false;
            }
            global.Modal.close();
            global.TeacherApp.toast(okMsg, 'success', 1400);
            await render(container);
            return true;
        }

        function pickClass(id) {
            return commit({ class_id: id, wait_kind: null, wait_date: null,
                            sub_class: null, sub_date: null }, 'تم الحفظ ✅');
        }

        /* حصة الانتظار بلا أنواع: تبقى في الجدول حتى يزيلها المعلم بنفسه. */
        function pickWait() {
            return commit({ class_id: null, wait_kind: 'perm', wait_date: null,
                            sub_class: null, sub_date: null }, 'تمت إضافة حصة انتظار ✅');
        }

        function pickSubstitute(label) {
            return commit({ class_id: null, sub_class: label, sub_date: todayKey() },
                          'تنتظر عند ' + label + ' اليوم ✅');
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
                               <span class="em">⏳</span>
                               <span class="tx">
                                   <span class="t">${escapeHtml(existing.sub_class)}</span>
                                   <span class="h">لهذا اليوم فقط · يُمسح نهاية اليوم</span>
                               </span>
                               <button type="button" class="x" data-unsub>✕</button>
                           </div>
                           <div class="sch-lbl">اختر فصلاً آخر لتغييره</div>`
                        : '')
                    + substituteHtml(subState)
                    + `<button type="button" class="sch-del" data-del>🗑️ إزالة الحصة من الجدول</button>
                       <div class="sch-hint">اضغط خارج اللوحة للإغلاق</div>`;
            } else {
                const title = existing ? 'تعديل الحصة' : 'اختر الفصل';
                body.innerHTML = sheetHead(day, period, ctx, { title })
                    + `<div class="sch-lbl">${existing ? 'الفصل — اضغط لتغييره فوراً' : 'اضغط الفصل ليُضاف فوراً'}</div>`
                    + classCardsHtml(ctx, existing ? existing.class_id : null)
                    + (existing
                        ? `<button type="button" class="sch-del" data-del>🗑️ إزالة الحصة من الجدول</button>
                           <div class="sch-hint">اضغط خارج اللوحة للإغلاق</div>`
                        : '');
            }
        }

        body.addEventListener('click', async (e) => {
            const t = e.target;
            const card = t.closest('[data-cls]');
            if (card) return pickClass(card.dataset.cls);

            if (t.closest('[data-wait]')) return pickWait();

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
                if (!global.confirm('إزالة هذه الحصة من الجدول؟')) return;
                try {
                    await global.TeacherDB.remove('schedule', existing.id);
                } catch (e) {
                    return global.TeacherApp.toast(
                        'تعذّر الحذف: ' + (e && e.message ? e.message : 'خطأ غير معروف'),
                        'error', 6000
                    );
                }
                global.Modal.close();
                global.TeacherApp.toast('تمت الإزالة.', 'info');
                return render(container);
            }
        });

        paint();
        global.Modal.open({ title: sheetTitle(existing, isWait), body });
    }

    function openTimesEditor(ctx, container) {
        const rows = ctx.periods.map((p) => ({ ...p }));

        const form = document.createElement('div');
        paint();

        function paint() {
            form.innerHTML = `
                <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                    عدّل أوقات الحصص كما في جدول مدرستك.
                </p>
                <div class="times-list">
                    ${rows.map((r, i) => `
                        <div class="times-row">
                            <span class="times-label">الحصة ${r.n}</span>
                            <input type="time" class="input input-sm" data-t="${i}" data-k="start" value="${r.start}">
                            <span>إلى</span>
                            <input type="time" class="input input-sm" data-t="${i}" data-k="end" value="${r.end}">
                            <button type="button" class="btn btn-ghost btn-sm" data-remove="${i}">🗑️</button>
                        </div>
                    `).join('')}
                </div>

                <div class="flex gap-2" style="margin-top: var(--space-3);">
                    <button type="button" class="btn btn-ghost btn-sm" id="add-period">+ إضافة حصة</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="reset-defaults">⟲ القيم الافتراضية</button>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button type="button" class="btn btn-primary" id="save-times">حفظ</button>
                    <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;
            bindInner();
        }

        function bindInner() {
            form.querySelectorAll('[data-t]').forEach((inp) => {
                inp.addEventListener('input', () => {
                    rows[Number(inp.dataset.t)][inp.dataset.k] = inp.value;
                });
            });
            form.querySelectorAll('[data-remove]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    rows.splice(Number(btn.dataset.remove), 1);
                    rows.forEach((r, i) => { r.n = i + 1; });
                    paint();
                });
            });
            form.querySelector('#add-period')?.addEventListener('click', () => {
                const last = rows[rows.length - 1];
                rows.push({
                    n: rows.length + 1,
                    start: last?.end || '08:00',
                    end:   '09:00'
                });
                paint();
            });
            form.querySelector('#reset-defaults')?.addEventListener('click', () => {
                rows.splice(0, rows.length, ...DEFAULT_PERIODS.map((p) => ({ ...p })));
                paint();
            });
            form.querySelector('#save-times')?.addEventListener('click', async () => {
                await savePeriodTimes(rows);
                global.Modal.close();
                global.TeacherApp.toast('تم حفظ الأوقات ✅', 'success');
                await render(container);
            });
        }

        global.Modal.open({ title: '⏰ توقيت الحصص', body: form });
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

    global.ScheduleView = { render, nextClassInfo };
})(window);
