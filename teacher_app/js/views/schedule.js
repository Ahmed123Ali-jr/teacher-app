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

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const classes  = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const schedule = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const periods  = await getPeriodTimes();

        const grid = buildGrid(schedule, periods.length);

        container.innerHTML = `
            <div class="container">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <div>
                        <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
                        <h2 class="section-title" style="display:inline-block; margin-right:var(--space-3);">
                            📅 الجدول الأسبوعي
                        </h2>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-ghost" id="btn-times">⏰ توقيت الحصص</button>
                        <button class="btn btn-ghost" id="btn-clear-all">🗑️ مسح الكل</button>
                    </div>
                </div>

                ${classes.length === 0 ? classesEmptyHint() : ''}

                <div class="schedule-wrapper">
                    ${renderGrid(grid, periods, classes)}
                </div>

                <p class="text-muted" style="font-size: var(--fs-sm); margin-top: var(--space-3);">
                    اضغط على أي خانة فارغة لإضافة حصة، أو على خانة مشغولة للتعديل.
                </p>
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

    function renderGrid(grid, periods, classes) {
        const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
        return `
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th class="period-col">الحصة</th>
                        ${DAYS.map((d) => `<th>${d.label}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${periods.map((p) => `
                        <tr>
                            <td class="period-col">
                                <div class="period-n">الحصة ${p.n}</div>
                                <div class="period-time num">${p.start} — ${p.end}</div>
                            </td>
                            ${DAYS.map((d) => {
                                const cell = grid[d.index]?.[p.n];
                                const cls  = cell ? classById[cell.class_id] : null;
                                if (!cell || !cls) {
                                    return `<td class="schedule-cell empty"
                                               data-day="${d.index}" data-period="${p.n}">
                                        <span class="cell-plus">+</span>
                                    </td>`;
                                }
                                return `<td class="schedule-cell filled"
                                           data-day="${d.index}" data-period="${p.n}"
                                           style="--cell-color: ${cls.color || '#1E40AF'};">
                                    <div class="cell-class">${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}</div>
                                    <div class="cell-subject">${escapeHtml(cls.subject)}</div>
                                    ${cell.topic ? `<div class="cell-topic">${escapeHtml(cell.topic)}</div>` : ''}
                                </td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function bind(container, ctx) {
        container.querySelectorAll('.schedule-cell').forEach((td) => {
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

    function openCellEditor(day, period, ctx, container) {
        const existing = ctx.schedule.find((r) => r.day === day && r.period === period);

        const form = document.createElement('form');
        form.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                ${DAYS[day].label} — الحصة ${period}
            </p>

            <div class="field">
                <label class="label">الفصل *</label>
                <select class="select" id="cell-class" required>
                    <option value="">— اختر فصلاً —</option>
                    ${ctx.classes.map((c) => `
                        <option value="${c.id}" ${existing?.class_id === c.id ? 'selected' : ''}>
                            ${escapeHtml(c.grade)} / ${escapeHtml(c.section)} — ${escapeHtml(c.subject)}
                        </option>
                    `).join('')}
                </select>
            </div>

            <div class="field">
                <label class="label">الموضوع / الدرس (اختياري)</label>
                <input class="input" id="cell-topic" type="text"
                       placeholder="مثلاً: جمع الأعداد"
                       value="${existing ? escapeAttr(existing.topic || '') : ''}">
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ' : 'إضافة'}</button>
                ${existing ? '<button type="button" class="btn btn-danger" id="cell-clear">🗑️ إزالة الحصة</button>' : ''}
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const classId = form.querySelector('#cell-class').value || null;
            const topic   = form.querySelector('#cell-topic').value.trim();
            if (!classId) return global.TeacherApp.toast('اختر فصلاً.', 'warning');

            const row = {
                teacher_id: ctx.teacher.id,
                day, period,
                class_id: classId,
                topic,
                updated_at: new Date().toISOString()
            };

            if (existing) {
                row.id = existing.id;
                row.created_at = existing.created_at;
                await global.TeacherDB.put('schedule', row);
            } else {
                row.created_at = new Date().toISOString();
                await global.TeacherDB.add('schedule', row);
            }

            global.Modal.close();
            global.TeacherApp.toast('تم الحفظ ✅', 'success', 1500);
            await render(container);
        });

        form.querySelector('#cell-clear')?.addEventListener('click', async () => {
            if (!global.confirm('إزالة هذه الحصة من الجدول؟')) return;
            await global.TeacherDB.remove('schedule', existing.id);
            global.Modal.close();
            global.TeacherApp.toast('تمت الإزالة.', 'info');
            await render(container);
        });

        global.Modal.open({
            title: existing ? 'تعديل حصة' : 'إضافة حصة',
            body: form
        });
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
