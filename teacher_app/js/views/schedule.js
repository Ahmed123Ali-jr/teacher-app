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

    /* عدد الحصص ثابت ٧: المعلم يضبط أوقاتها فقط، فلا إضافة ولا حذف.
       أي بيانات قديمة بعدد مختلف تُقصّ أو تُكمَّل من القيم الافتراضية. */
    const PERIOD_COUNT = 7;

    async function getPeriodTimes() {
        const stored = await global.TeacherDB.Settings.get('period_times');
        const rows = Array.isArray(stored) && stored.length ? stored : DEFAULT_PERIODS;
        return Array.from({ length: PERIOD_COUNT }, (_, i) => ({
            ...(rows[i] || DEFAULT_PERIODS[i]), n: i + 1
        }));
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
        return rows.map((r) => {
            /* «انتظار لهذا اليوم» أُلغي كمفهوم — الصفوف القديمة تُحوَّل لانتظار
               عادي بدل حذفها حتى لا يفقد المعلم حصصاً أضافها سابقاً. */
            if (!r.class_id && r.wait_kind === 'today') {
                const norm = { ...r, wait_kind: 'perm', wait_date: null,
                               updated_at: new Date().toISOString() };
                bgSave(() => global.TeacherDB.put('schedule', norm));
                return norm;
            }
            if (!r.class_id && r.sub_class && r.sub_date !== today) {
                const clean = { ...r, sub_class: null, sub_date: null,
                                updated_at: new Date().toISOString() };
                bgSave(() => global.TeacherDB.put('schedule', clean));
                return clean;
            }
            return r;
        });
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

        const classes  = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const rawSched = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const schedule = cleanupExpired(rawSched);
        const periods  = await getPeriodTimes();
        const autofill = await global.TeacherDB.Settings.get('period_autofill');

        paintView(container, { teacher, classes, schedule, periods, autofill });
    }

    /* الرسم من الحالة المحفوظة في الذاكرة وحدها — بلا أي نداء للقاعدة، فيعود
       الجدول فوراً بعد كل تعديل بدل انتظار الشبكة. */
    function paintView(container, ctx) {
        const grid = buildGrid(ctx.schedule, ctx.periods.length);
        const todayIdx = (() => {
            const d = new Date().getDay();
            return (d >= 0 && d <= 4) ? d : -1;
        })();

        const editing = !!ctx.editing;

        container.innerHTML = `
            <div class="container sched-v2${editing ? ' is-editing' : ''}">
                <div class="sched-head">
                    <h2>📅 الجدول الأسبوعي</h2>
                    <button type="button" class="sched-time-btn" id="btn-times">توقيت الحصص</button>
                    <button type="button" class="sched-time-btn sched-edit-btn${editing ? ' on' : ''}"
                            id="btn-edit" aria-pressed="${editing}">
                        ${editing ? '✓ تم' : '✎ تعديل'}
                    </button>
                </div>

                ${ctx.classes.length === 0 ? classesEmptyHint() : ''}

                ${renderGrid(grid, ctx.periods, ctx.classes, todayIdx, editing)}

                <p class="sched-hint">${editing
                    ? 'اضغط أي خانة لإضافة حصة أو تعديلها'
                    : 'الجدول مقفول — اضغط «تعديل» لتغييره'}</p>

                ${editing ? `
                    <button type="button" class="sched-import" id="btn-import">
                        📷 استيراد الجدول من صورة أو ملف
                    </button>
                    <button type="button" class="sched-clear" id="btn-clear-all">🗑️ مسح الجدول كاملاً</button>
                ` : ''}
            </div>
        `;

        ctx.grid = grid;
        bind(container, ctx);
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
    function renderGrid(grid, periods, classes, todayIdx, editing) {
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
                                           بلمسة عابرة. */
                                        return `<td class="sched-cell${tc}" ${attrs}>
                                            <div class="sched-box empty">${editing ? '+' : ''}</div>
                                        </td>`;
                                    }
                                    const cls = classById[cell.class_id];
                                    if (!cls) {
                                        // انتظار: يعرض الفصل المُسند اليوم إن وُجد
                                        return `<td class="sched-cell${tc}" ${attrs}>
                                            <div class="sched-box wait">
                                                ${cell.sub_class
                                                    ? `<span class="sb-sub">${escapeHtml(shortSub(cell.sub_class))}</span>
                                                       <span class="sb-w">⏳ ${escapeHtml(stageOf(cell.sub_class))}</span>`
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

        container.querySelector('#btn-edit')?.addEventListener('click', () => {
            ctx.editing = !ctx.editing;
            paintView(container, ctx);
        });

        container.querySelector('#btn-times')?.addEventListener('click', () => openTimesEditor(ctx, container));

        container.querySelector('#btn-clear-all')?.addEventListener('click', () => {
            if (!global.confirm('مسح الجدول كاملاً؟')) return;
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
        const form = document.createElement('div');
        form.innerHTML = `
            <div class="field">
                <label class="label" for="sched-file">صورة الجدول أو ملف PDF</label>
                <input class="input" id="sched-file" type="file" accept="image/*,.pdf">
                <div class="field-hint">
                    صوّر جدولك المطبوع أو ارفعه ملفاً. تُقرأ الخانات وتُعرض عليك
                    قبل الحفظ — لن يتغيّر جدولك حتى تؤكّد.
                </div>
            </div>
            <div id="imp-result"></div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-primary" id="imp-go">قراءة الجدول</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        const resultEl = form.querySelector('#imp-result');
        const goBtn = form.querySelector('#imp-go');

        goBtn.addEventListener('click', async () => {
            const file = form.querySelector('#sched-file').files[0];
            const label = goBtn.textContent;
            goBtn.disabled = true;
            try {
                if (!file) throw new Error('اختر ملفاً أولاً.');
                if (!(await global.AI.hasApiKey())) {
                    throw new Error('مفتاح Claude API غير معرّف. أضفه من الإعدادات أولاً.');
                }
                if (file.size > 20 * 1024 * 1024) throw new Error('الملف كبير جداً (أقصى ٢٠ ميجابايت).');
                if (!ctx.classes.length) throw new Error('أضف فصولك أولاً — بلا فصول لا يمكن ربط الخانات.');

                goBtn.textContent = '⏳ جارٍ القراءة…';
                const pages = await global.PdfCore.fileToImagePages(file, 5);
                const cells = await global.AI.extractScheduleFromImage({
                    pages, classes: ctx.classes, periodCount: ctx.periods.length
                });
                showPreview(cells);
            } catch (err) {
                console.warn('[schedule] import failed:', err);
                global.TeacherApp.toast(err.message || 'تعذّر قراءة الجدول.', 'error', 6000);
            } finally {
                goBtn.disabled = false;
                goBtn.textContent = label;
            }
        });

        function showPreview(cells) {
            const byId = {};
            ctx.classes.forEach((c) => { byId[c.id] = c; });

            /* نقبل الخانة إن كان فصلها معروفاً ويومها وحصّتها في المدى. */
            const ok = [];
            const skipped = [];
            (cells || []).forEach((c) => {
                const day = Number(c.day), period = Number(c.period);
                const valid = byId[c.class_id]
                    && day >= 0 && day < DAYS.length
                    && period >= 1 && period <= ctx.periods.length;
                if (valid) ok.push({ day, period, class_id: c.class_id, topic: String(c.topic || '').trim() });
                else skipped.push(c);
            });

            if (!ok.length) {
                resultEl.innerHTML = `
                    <div class="callout callout-warn" style="margin-top: var(--space-4);">
                        لم أتعرّف على أيّ حصة. جرّب صورةً أوضح، أو تأكّد أن أسماء
                        الفصول في الصورة تشبه أسماء فصولك في التطبيق.
                    </div>`;
                return;
            }

            /* كم خانة ستُطمس؟ المعلّم يستحقّ أن يعرف قبل أن يوافق. */
            const overwrite = ok.filter((c) =>
                ctx.schedule.some((r) => r.day === c.day && r.period === c.period && r.class_id)).length;

            resultEl.innerHTML = `
                <div class="imp-box">
                    <div class="imp-sum">
                        <b>قُرئت ${arWord(ok.length)}</b>
                        ${skipped.length ? `<span class="imp-skip">وتُخطّيت ${arWord(skipped.length)} لم أتعرّف على فصلها</span>` : ''}
                        ${overwrite ? `<span class="imp-warn">وستُستبدل ${arWord(overwrite)} موجودة في جدولك</span>` : ''}
                    </div>
                    <ul class="imp-list">
                        ${ok.map((c) => {
                            const k = byId[c.class_id];
                            return `<li><span class="d">${DAYS[c.day].label}</span>
                                <span class="p">الحصة ${arDigits(c.period)}</span>
                                <span class="c">${escapeHtml(k.grade + ' / ' + k.section)}</span>
                                ${c.topic ? `<span class="t">${escapeHtml(c.topic)}</span>` : ''}</li>`;
                        }).join('')}
                    </ul>
                    <button type="button" class="btn btn-primary btn-block" id="imp-apply">
                        ✓ اعتمد ${arWord(ok.length)}
                    </button>
                </div>`;

            resultEl.querySelector('#imp-apply').addEventListener('click', async (e) => {
                const b = e.currentTarget;
                b.disabled = true;
                b.textContent = '⏳ جارٍ الحفظ…';
                try {
                    await applyCells(ok, ctx, container);
                    global.Modal.close();
                    global.TeacherApp.toast('تم استيراد ' + arWord(ok.length) + ' ✅', 'success', 3000);
                } catch (err) {
                    console.warn('[schedule] apply failed:', err);
                    global.TeacherApp.toast('تعذّر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error', 6000);
                    b.disabled = false;
                    b.textContent = '✓ اعتمد ' + arWord(ok.length);
                }
            });
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
                day: c.day, period: c.period, class_id: c.class_id, topic: c.topic,
                /* الاستيراد يُلغي حالات الانتظار والاحتياط: الخانة صارت حصةً. */
                wait_kind: null, wait_date: null, sub_class: null, sub_date: null,
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
    function arWord(n) {
        if (n === 1) return 'حصة واحدة';
        if (n === 2) return 'حصتان';
        if (n <= 10) return arDigits(n) + ' حصص';
        return arDigits(n) + ' حصة';
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
    const AUTOFILL_DEFAULT = { start: '07:00', dur: 45, breakAfter: 3, breakDur: 30 };

    /** يبني أوقات كل الحصص من وقت البداية ومدة الحصة، ويزيح ما بعد الفسحة. */
    function autofillRows(count, cfg) {
        const out = [];
        let cursor = timeToMin(cfg.start);
        for (let i = 1; i <= count; i++) {
            const end = cursor + cfg.dur;
            out.push({ n: i, start: minToTime(cursor), end: minToTime(end) });
            cursor = end;
            if (cfg.breakAfter && i === cfg.breakAfter) cursor += cfg.breakDur;
        }
        return out;
    }

    function openTimesEditor(ctx, container) {
        const rows = ctx.periods.map((p) => ({ ...p }));
        const cfg  = { ...AUTOFILL_DEFAULT, ...(ctx.autofill || {}) };

        const form = document.createElement('div');
        paint();

        function autofillHtml() {
            return `
                <div class="tf-box">
                    <div class="tf-title">⚡ تعبئة تلقائية</div>

                    <div class="tf-row">
                        <span class="tf-lbl">بداية الحصة الأولى</span>
                        <input type="time" class="input input-sm tf-time" id="tf-start" value="${cfg.start}">
                    </div>

                    <div class="tf-lbl2">مدة الحصة</div>
                    <div class="tf-chips">
                        ${DURATIONS.map((d) => `
                            <button type="button" class="tf-chip ${cfg.dur === d ? 'on' : ''}" data-dur="${d}">
                                ${d} د
                            </button>
                        `).join('')}
                        <input type="number" class="input input-sm tf-num" id="tf-dur" min="20" max="90"
                               value="${cfg.dur}" aria-label="مدة أخرى">
                    </div>

                    <div class="tf-lbl2">الفسحة</div>
                    <div class="tf-row">
                        <span class="tf-lbl">بعد الحصة</span>
                        <select class="input input-sm tf-sel" id="tf-after">
                            <option value="0" ${cfg.breakAfter === 0 ? 'selected' : ''}>بلا فسحة</option>
                            ${rows.map((r) => `
                                <option value="${r.n}" ${cfg.breakAfter === r.n ? 'selected' : ''}>الحصة ${r.n}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="tf-chips">
                        ${BREAK_LENGTHS.map((d) => `
                            <button type="button" class="tf-chip ${cfg.breakDur === d ? 'on' : ''}" data-brk="${d}">
                                ${d} د
                            </button>
                        `).join('')}
                        <input type="number" class="input input-sm tf-num" id="tf-brk" min="5" max="90"
                               value="${cfg.breakDur}" aria-label="مدة أخرى للفسحة">
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

        /* التعبئة فورية بلا زر: أي تغيير في البداية أو المدة أو الفسحة يعيد
           حساب الأوقات ويُحدّث القائمة وحدها — لا الصفحة كلها — حتى لا يفقد
           الحقل الذي يكتب فيه المعلم تركيزه. */
        function recalc() {
            rows.splice(0, rows.length, ...autofillRows(rows.length, cfg));
            const list = form.querySelector('#times-list');
            if (!list) return;
            list.innerHTML = rowsHtml();
            bindRows();
        }

        function paint() {
            form.innerHTML = autofillHtml() + `
                <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                    تُحسب فوراً — وتقدر تعدّل أي حصة يدوياً:
                </p>
                <div class="times-list" id="times-list">${rowsHtml()}</div>

                <div class="flex gap-2" style="margin-top: var(--space-3);">
                    <button type="button" class="btn btn-ghost btn-sm" id="reset-defaults">⟲ القيم الافتراضية</button>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button type="button" class="btn btn-primary" id="save-times">حفظ</button>
                    <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;
            bindInner();
        }

        function bindRows() {
            form.querySelectorAll('[data-t]').forEach((inp) => {
                inp.addEventListener('input', () => {
                    rows[Number(inp.dataset.t)][inp.dataset.k] = inp.value;
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
            form.querySelector('#tf-brk')?.addEventListener('input', (e) => {
                const v = Number(e.target.value);
                if (!(v >= 5 && v <= 90)) return;
                cfg.breakDur = v;
                form.querySelectorAll('[data-brk]').forEach((b) => b.classList.toggle('on', Number(b.dataset.brk) === v));
                recalc();
            });
            form.querySelectorAll('[data-dur]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cfg.dur = Number(btn.dataset.dur);
                    form.querySelector('#tf-dur').value = cfg.dur;
                    form.querySelectorAll('[data-dur]').forEach((b) => b.classList.toggle('on', b === btn));
                    recalc();
                });
            });
            form.querySelectorAll('[data-brk]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    cfg.breakDur = Number(btn.dataset.brk);
                    form.querySelector('#tf-brk').value = cfg.breakDur;
                    form.querySelectorAll('[data-brk]').forEach((b) => b.classList.toggle('on', b === btn));
                    recalc();
                });
            });

            bindRows();
            form.querySelector('#reset-defaults')?.addEventListener('click', () => {
                Object.assign(cfg, AUTOFILL_DEFAULT);
                rows.splice(0, rows.length, ...DEFAULT_PERIODS.map((p) => ({ ...p })));
                paint();
            });
            form.querySelector('#save-times')?.addEventListener('click', () => {
                const saved = rows.map((r) => ({ ...r }));
                ctx.periods  = saved;
                ctx.autofill = { ...cfg };
                global.Modal.close();
                paintView(container, ctx);
                global.TeacherApp.toast('تم حفظ الأوقات ✅', 'success', 1100);
                /* الإعدادات تُكتب في الخلفية؛ الجدول أمام المعلم بالأوقات
                   الجديدة قبل أن تصل الشبكة. */
                bgSave(async () => {
                    await savePeriodTimes(saved);
                    await global.TeacherDB.Settings.set('period_autofill', { ...cfg });
                }, () => render(container));
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

    function minToTime(mins) {
        const m = ((mins % 1440) + 1440) % 1440;
        return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }

    global.ScheduleView = { render, nextClassInfo };
})(window);
