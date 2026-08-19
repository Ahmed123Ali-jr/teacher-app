/* ==========================================================================
   views/class.js — Class screen with 5 tabs.
   Phase 3: Students tab — dynamic evaluation columns + Arabic-digit input.
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    const TABS = [
        { key: 'students',   label: null, icon: '👥' },   // النص يُحسب عند الرسم
        { key: 'books',      label: 'الكتب',        icon: '📖' },
        { key: 'curriculum', label: 'توزيع المنهج', icon: '🗓️' },
        { key: 'exams',      label: 'الاختبارات',   icon: '📝' },
        { key: 'worksheets', label: 'أوراق العمل',  icon: '📄' },
        { key: 'homework',   label: 'الواجبات',     icon: '📚' },
        { key: 'strategies', label: 'الاستراتيجيات', icon: '🎯' }
    ];

    const ATTENDANCE = {
        present: { label: 'حاضر',  icon: '✓', color: '#10B981' },
        absent:  { label: 'غائب',  icon: '✗', color: '#EF4444' },
        late:    { label: 'متأخر', icon: '⏰', color: '#F59E0B' },
        excused: { label: 'مستأذن', icon: '📝', color: '#3B82F6' }
    };

    const COLUMN_TYPES = {
        stars:  { label: 'تقييم بالنجوم (٠-٥)', default_max: 5  },
        number: { label: 'رقم (مثال: من ١٠)',     default_max: 10 },
        check:  { label: 'علامة ✓ / —',           default_max: 1  },
        tri:    { label: 'تم / جزئي / لم يتم',    default_max: 3  }
    };

    const DEFAULT_COLUMNS = [
        { id: 'participation', name: 'المشاركة', type: 'stars',  max: 5  },
        { id: 'grade',         name: 'التقييم',  type: 'number', max: 10 }
    ];

    const state = { classId: null, activeTab: null };

    /* ---------- Helpers ---------- */

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    /* ---------- تاريخ السجل ----------
       السجل كان مقفولاً على اليوم، فمن نسي التحضير أمس لا يملك طريقة. صار
       له تاريخ مختار يُقرأ ويُكتب عليه، ويعود لليوم عند فتح فصل جديد. */
    const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const STRIP_DAYS = 30;   // ثلاثون يوم دراسة ≈ ستة أسابيع، وما قبلها من التقويم

    let _regDate = null;

    function isoOf(d) {
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function regDate() { return _regDate || todayISO(); }

    function dayLabel(iso) {
        const d = new Date(iso + 'T00:00:00');
        return { dow: AR_DAYS[d.getDay()], num: d.getDate() };
    }

    function humanDate(iso) {
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'long'
            }).format(new Date(iso + 'T00:00:00'));
        } catch { return iso; }
    }

    /** أيام الدراسة (الأحد–الخميس) من اليوم رجوعاً — الأحدث أولاً. */
    function schoolDaysBack(count) {
        const out = [];
        const d = new Date();
        let guard = 0;
        while (out.length < count && guard++ < count * 3) {
            if (d.getDay() <= 4) out.push(isoOf(d));
            d.setDate(d.getDate() - 1);
        }
        return out;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    /* لون البطاقات الكبيرة (هيرو الفصل وسجل المتابعة): الألوان الفاتحة
       تُستبدل برفيقها الغامق حتى تبقى الكتابة البيضاء مقروءة. */
    function heroColor(cls) {
        const c = (cls && cls.color) || '#ECEAE3';
        return (global.StageColors && global.StageColors.deepFor)
            ? global.StageColors.deepFor(c) : c;
    }

    /** Convert Arabic-Indic / Persian digits to ASCII and parse as number. */
    function parseArabicNumber(raw) {
        if (raw === null || raw === undefined) return null;
        const s = String(raw)
            .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
            .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48))
            .replace(/٫|،/g, '.')
            .trim();
        if (s === '') return null;
        const n = Number(s);
        return isNaN(n) ? null : n;
    }

    /** Attach to a text input so the user can type Arabic or ASCII digits. */
    function bindArabicNumberInput(input) {
        input.setAttribute('inputmode', 'decimal');
        input.addEventListener('input', () => {
            const pos = input.selectionStart;
            const converted = input.value
                .replace(/[\u0660-\u0669]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
                .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48));
            if (converted !== input.value) {
                input.value = converted;
                try { input.setSelectionRange(pos, pos); } catch {}
            }
        });
    }

    function ensureColumns(cls) {
        if (!Array.isArray(cls.eval_columns) || cls.eval_columns.length === 0) {
            cls.eval_columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
        }
        return cls.eval_columns;
    }

    function genColId() {
        return 'col_' + Math.random().toString(36).slice(2, 9);
    }

    /** Read the values map from a participation/evaluation row, with legacy fallback. */
    function readValues(row) {
        if (row && row.values && typeof row.values === 'object') return row.values;
        const v = {};
        if (row && typeof row.rating === 'number' && row.rating > 0) v.participation = row.rating;
        if (row && typeof row.grade  === 'number')                  v.grade         = row.grade;
        return v;
    }

    /* ==========================================================================
       ENTRY
       ========================================================================== */

    async function render(container, classId, tab) {
        /* الدخول لفصل آخر يعيد السجل لليوم: لا يفتح المعلم فصلاً جديداً
           فيجده على تاريخ ماضٍ اختاره في فصل قبله. */
        if (state.classId !== classId) _regDate = null;
        state.classId = classId;
        state.activeTab = tab || null;

        const cls = await global.TeacherDB.get('classes', classId);
        if (!cls) {
            container.innerHTML = `
                <div class="container"><div class="empty-state">
                    <div class="icon">⚠️</div>
                    <h3>لم يتم العثور على الفصل</h3>
                    <a href="#/dashboard" class="btn btn-primary">الرئيسية</a>
                </div></div>`;
            return;
        }

        const teacher = await global.Auth.currentTeacher();
        if (cls.teacher_id !== teacher.id) {
            container.innerHTML = `<div class="container"><p>غير مصرّح.</p></div>`;
            return;
        }

        // Ensure default columns on first visit and persist.
        if (!Array.isArray(cls.eval_columns)) {
            cls.eval_columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            await global.TeacherDB.put('classes', cls);
        }

        if (state.activeTab) {
            await paintSection(container, cls);
        } else {
            await paintHub(container, cls);
        }
    }

    /* ==========================================================================
       HUB — landing page for the class: featured students card + section grid
       ========================================================================== */

    async function paintHub(container, cls) {
        /* قراءة واحدة مجمّعة لكل مخزن (مفهرسة بالفصل) بلا حلقة على الطلاب.
           استعلام الحضور أُسقط مع إحصاءات البطاقة — لم يعد له مستهلك هنا. */
        const [students, books, exams, worksheets, homework] = await Promise.all([
            global.TeacherDB.getAllByIndex('students',    'class_id', cls.id),
            global.TeacherDB.getAllByIndex('books',       'class_id', cls.id),
            global.TeacherDB.getAllByIndex('exams',       'class_id', cls.id),
            global.TeacherDB.getAllByIndex('worksheets',  'class_id', cls.id),
            global.TeacherDB.getAllByIndex('assignments', 'class_id', cls.id)
        ]);
        /* عدّاد بطاقة الاستراتيجيات: كم استراتيجية مختلفة طُبِّقت في هذا
           الفصل — لا عدد مرات التطبيق، فالمهم التنوّع في ملف الإنجاز. */
        const stgLogs = await global.TeacherDB.getAllByIndex('strategy_logs', 'class_id', cls.id);
        const strategyCount = new Set(stgLogs.map((l) => l.strategy_key)).size;
        const GRID = [
            { key: 'books',      icon: '📖', label: 'الكتب',        count: books.length,      tint: '#7C3AED', bg: '#F5F1FE' },
            { key: 'exams',      icon: '📝', label: 'الاختبارات',   count: exams.length,      tint: '#DC2626', bg: '#FEF1F1' },
            { key: 'worksheets', icon: '📄', label: 'أوراق العمل',  count: worksheets.length, tint: '#059669', bg: '#EDFBF5' },
            { key: 'homework',   icon: '📚', label: 'الواجبات',     count: homework.length,   tint: '#D97706', bg: '#FFF8EB' },
            { key: 'curriculum', icon: '🗓️', label: 'توزيع المنهج', count: null,              tint: '#0891B2', bg: '#EDFAFD' },
            { key: 'strategies', icon: '🎯', label: 'الاستراتيجيات', count: strategyCount,     tint: '#BE185D', bg: '#FDF2F8' }
        ];

        /* ولا عنوانَ في الشريط: اسمُ الفصل مكتوبٌ تحته مباشرةً في بطاقته
           بخطٍّ كبير ومعه شعبتُه ومادّتُه وعددُ طلّابه. فكتابتُه في الشريط
           تقولُه مرّتين في نظرةٍ واحدة. يبقى السهمُ وحدَه. */

        container.innerHTML = `
            <div class="container">
                <div class="class-topbar">
                    <button type="button" id="btn-class-edit" class="cls-edit-btn"
                            aria-label="إدارة الفصل">✎ تعديل</button>
                </div>

                <div class="class-hero-split" style="--cls-color:${heroColor(cls)}">
                    <div class="chs-side">
                        <div class="chs-side-label">
                            <span class="chs-side-word">شعبة</span>
                            <span class="chs-side-letter${(cls.section || '').length > 2 ? ' small' : ''}">${escapeHtml(cls.section)}</span>
                        </div>
                    </div>
                    <div class="chs-body">
                        <h2 class="chs-name">${escapeHtml(cls.grade)}</h2>
                        <div class="chs-chips">
                            <span class="chs-chip tinted">📘 ${escapeHtml(cls.subject)}</span>
                            <span class="chs-chip">👥 ${global.Words.count(students.length)}</span>
                        </div>
                    </div>
                </div>

                <a class="hub-featured" href="#/class/${cls.id}/students" style="--cls-color:${heroColor(cls)}">
                    <div class="hub-featured-head">
                        <div class="hub-featured-titles">
                            <div class="hub-featured-title">سجل متابعة ${global.Words.students()}</div>
                            <div class="hub-featured-sub">التحضير والغياب والمشاركة</div>
                        </div>
                        <div class="hub-featured-chev" aria-hidden="true"></div>
                    </div>
                </a>

                <div class="hub-grid">
                    ${GRID.map((g) => `
                        <a class="hub-tile" href="#/class/${cls.id}/${g.key}">
                            <div class="hub-tile-icon" style="background:${g.bg}">${g.icon}</div>
                            <div class="hub-tile-body">
                                <div class="hub-tile-label">${g.label}</div>
                                <div class="hub-tile-count" style="color:${g.count ? g.tint : '#6B7686'}">
                                    ${g.count === null ? 'الخطة' : (g.count || '—')}
                                </div>
                            </div>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;

        /* إدارة الفصل: كانت لوحةً تُفتح من «تعديل» في صفحة الفصول، ونُقلت
           هنا لأن الصفّ هناك صار للفتح وحده. تحمل الإجراءين معاً — التعديل
           والحذف — فكلاهما لا مدخل له في التطبيق سواها. */
        /* `cls.id` لا `classId`: الأخيرُ معاملُ `render` لا يبلغ هنا، وقراءةُ
           اسمٍ غيرِ معرَّفٍ ترمي — فكان «حفظ التعديل» يكتب في القاعدة ولا
           يُعيد رسم الصفحة، فيرى المعلّم اسمه القديم حتى ينتقل ويعود.
           و`null` مكان `tab`: لا نصل هنا إلا والفصلُ على لوحته بلا قسم. */
        container.querySelector('#btn-class-edit')?.addEventListener('click', () => {
            openClassActions(cls, () => render(container, cls.id, null));
        });
    }

    /* ==========================================================================
       SECTION PAGE — dedicated full page for one section
       ========================================================================== */

    async function paintSection(container, cls) {
        const tab = TABS.find((t) => t.key === state.activeTab);
        if (!tab) { global.location.hash = '#/class/' + cls.id; return; }

        container.innerHTML = `
            <div class="container">
                <div class="tab-panel" id="tab-panel"></div>
            </div>
        `;

        const panel = container.querySelector('#tab-panel');
        switch (state.activeTab) {
            case 'students':   await renderStudents(panel, cls); break;
            case 'strategies': await global.ClassStrategiesView.render(panel, cls); break;
            case 'books':      await global.ClassBooksTab.render(panel, cls); break;
            case 'curriculum': await global.ClassCurriculumTab.render(panel, cls); break;
            case 'exams':      await global.ClassExamsTab.render(panel, cls); break;
            case 'worksheets': await global.ClassWorksheetsTab.render(panel, cls); break;
            case 'homework':   await global.ClassHomeworkTab.render(panel, cls); break;
        }
    }

    /* ==========================================================================
       STUDENTS TAB
       ========================================================================== */

    /* Guards against interleaved renders: if two renderStudents calls race
       (fast taps, quick navigation), only the newest one is allowed to touch
       the DOM — otherwise both attach listeners to the same elements and
       every click fires twice. */
    let _studentsRenderGen = 0;

    /* Name search matches the student's OWN name (start of any word), NOT
       father/grandfather names — so «حمد» finds حمد, not «علي بن حمد».
       Arabic is normalized (alef/ya/ta-marbuta forms + tashkeel) so the
       teacher doesn't have to match hamza exactly. */
    function normalizeArabic(s) {
        return String(s || '')
            .replace(/[ً-ْٰ]/g, '')  // strip tashkeel
            .replace(/[إأآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .trim();
    }
    function matchesStudentName(fullName, query) {
        const q = normalizeArabic(query);
        if (!q) return true;
        // Match only the student's first name (the leading word).
        return normalizeArabic(fullName).startsWith(q);
    }

    /* Frozen membership of the active stats-bar filter: the set of student
       ids that matched when the filter was tapped. Kept across re-renders so
       changing a student's status doesn't hide his row; recomputed on the
       next filter tap (and irrelevant once the filter is off). */
    let _attFilterIds = null;

    /* لقطة البيانات المعروضة حالياً — تُعاد للاستخدام عند التنقّل بين
       الخانات (تبديل عرض فقط، لا تغيير بيانات) فيصير التنقّل فورياً بلا
       انتظار الحفظ المعلّق ولا إعادة قراءة من القاعدة. */
    let _snapshot = null;

    /** يبقي نموذج التقييمات في الذاكرة متوافقاً مع ما يراه المعلم، حتى
     *  تكون اللقطة صالحة لإعادة العرض. */
    function syncEvalModel(evalToday, i, sid, colId, value) {
        if (i == null || i < 0) return;
        let row = evalToday[i];
        if (!row) { row = { student_id: sid, values: {} }; evalToday[i] = row; }
        if (!row.values) row.values = readValues(row);
        if (!value) delete row.values[colId];
        else row.values[colId] = value;
    }

    /* شريط الأيام: زرّ تقويم ثابت للقفز البعيد، ثم أيام الدراسة الأحدث
       أولاً. والنقطة تحت اليوم تعني أن فيه تحضيراً محفوظاً. */
    function dateStripHtml(date, markedDates) {
        const today = todayISO();
        const days  = schoolDaysBack(STRIP_DAYS);
        /* يوم مختار خارج الشريط (اختير من التقويم) يُضاف في مكانه الزمني
           وإلا اختفى المؤشّر ولم يعرف المعلم أين هو. */
        if (!days.includes(date) && date < today) {
            days.push(date);
            days.sort((a, b) => b.localeCompare(a));
        }
        const marked = markedDates || new Set();

        return `
            <div class="rd-wrap">
                <div class="rd-strip">
                    <button type="button" class="rd-cal" id="rd-cal"
                            aria-label="اختر أي يوم">📅</button>
                    <input type="date" id="rd-input" max="${today}" value="${date}"
                           class="rd-input" aria-hidden="true" tabindex="-1">
                    <div class="rd-days" id="rd-days">
                        ${days.map((d) => {
                            const l = dayLabel(d);
                            return `
                                <button type="button" class="rd-day${d === date ? ' on' : ''}${d === today ? ' is-today' : ''}"
                                        data-d="${d}">
                                    <span class="dw">${l.dow}</span>
                                    <span class="dn num">${l.num}</span>
                                    <span class="dot${marked.has(d) ? '' : ' none'}"></span>
                                </button>`;
                        }).join('')}
                    </div>
                </div>
                ${date === today ? '' : `
                    <div class="rd-past">
                        <span>⚠️ تعدّل سجل ${escapeHtml(humanDate(date))}</span>
                        <button type="button" id="rd-back">ارجع لليوم</button>
                    </div>`}
            </div>
        `;
    }

    async function renderStudents(panel, cls, opts = {}) {
        const gen = ++_studentsRenderGen;
        const columns = ensureColumns(cls);
        let students, attendanceToday, evalToday, markedDates;

        /* التاريخ جزء من مفتاح اللقطة: بدونه يعرض السجل بيانات يوم على يوم
           آخر عند التنقّل بين الأيام. */
        const date = regDate();
        const snapUsable = opts.reuseData && _snapshot
                        && _snapshot.classId === cls.id && _snapshot.date === date;
        if (snapUsable) {
            ({ students, attendanceToday, evalToday, markedDates } = _snapshot);
        } else {
            // Wait for any in-flight saves to land in the cache before reading,
            // otherwise the table can paint with stale data.
            await flushWrites();
            students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
            students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

            // Two bulk reads by class (indexed) instead of 2×N per-student queries:
            // for 30+ students this is the single biggest speedup on this screen.
            const [attAll, parAll] = await Promise.all([
                global.TeacherDB.getAllByIndex('attendance', 'class_id', cls.id),
                global.TeacherDB.getAllByIndex('participation', 'class_id', cls.id)
            ]);
            const attByStudent = new Map();
            /* نجمع تواريخ الأيام المحضَّرة في المرور نفسه — النقطة تحت اليوم
               في الشريط تخبر المعلم أي يوم نسيه بلا أن يفتحه. */
            markedDates = new Set();
            for (const r of attAll) {
                if (r.date) markedDates.add(r.date);
                if (r.date === date) attByStudent.set(r.student_id, r);
            }
            const parByStudent = new Map();
            for (const r of parAll) if (r.date === date) parByStudent.set(r.student_id, r);
            attendanceToday = students.map((s) => attByStudent.get(s.id) || null);
            evalToday = students.map((s) => parByStudent.get(s.id) || null);
            _snapshot = { classId: cls.id, date, students, attendanceToday, evalToday, markedDates };
        }

        /* كل الكتابات تمضي على التاريخ المختار لا على اليوم. */
        const today   = date;
        const isToday = date === todayISO();

        // A newer render started while we were fetching — abort this one so
        // listeners never get attached twice to the same elements.
        if (gen !== _studentsRenderGen) return;

        // Preserve horizontal scroll of the table + page scroll across re-renders
        // so tapping a star/number doesn't snap the view back to the start.
        const prevWrapper    = panel.querySelector('.table-scroll, .table-wrapper');
        const prevScrollLeft = prevWrapper ? prevWrapper.scrollLeft : null;
        const prevWinScrollY = global.scrollY;
        const prevSearch     = panel.querySelector('#student-search')?.value || '';

        // Today's attendance stats (for the filterable stats bar)
        const stats = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
        attendanceToday.forEach((r) => {
            if (!r) stats.unmarked++;
            else if (stats[r.status] !== undefined) stats[r.status]++;
        });
        const attMarked = students.length - stats.unmarked;
        const attPct = attMarked > 0
            ? Math.round(((stats.present + stats.late) / attMarked) * 100)
            : null;
        if (panel.dataset.activeAttFilter
            && !['present', 'absent'].includes(panel.dataset.activeAttFilter)) {
            panel.dataset.activeAttFilter = '';
        }
        const activeFilter = panel.dataset.activeAttFilter || '';
        if (!activeFilter) _attFilterIds = null;

        // Column focus: 'attendance' (default) = attendance only,
        // 'notes' = the fixed notes column, otherwise an eval-column id.
        let focus = panel.dataset.activeColFocus || 'attendance';
        if (focus !== 'attendance' && focus !== 'notes'
            && !columns.some((c) => c.id === focus)) {
            focus = 'attendance';
        }
        const showAtt = focus === 'attendance';
        const visibleCols = focus === 'attendance' ? [] : columns.filter((c) => c.id === focus);
        const prevChips = panel.querySelector('#col-chips');
        const prevChipsScroll = prevChips ? prevChips.scrollLeft : null;

        panel.innerHTML = `
            <div class="hub-featured reg-hero" style="--cls-color:${heroColor(cls)}">
                <div class="hub-featured-head">
                    <div class="hub-featured-titles">
                        <div class="hub-featured-title">سجل متابعة ${global.Words.students()}</div>
                        <div class="hub-featured-sub">📅 ${humanDate(date)}${isToday ? '' : ' — سجل سابق'}</div>
                    </div>
                    <button class="reg-hero-print" id="btn-print-students" ${students.length === 0 ? 'disabled' : ''} aria-label="طباعة السجل">🖨️</button>
                </div>
                <div class="hub-featured-stats">
                    <div class="hf-stat"><div class="hf-num num">${students.length}</div><div class="hf-lbl">${global.Words.student()}</div></div>
                    <button class="hf-stat hf-tap ${activeFilter === 'present' ? 'active' : ''}" data-att-filter="present"><div class="hf-num num" data-hf="present">${stats.present}</div><div class="hf-lbl">حاضر</div></button>
                    <button class="hf-stat hf-tap ${activeFilter === 'absent' ? 'active' : ''}" data-att-filter="absent"><div class="hf-num num" data-hf="absent">${stats.absent}</div><div class="hf-lbl">غائب</div></button>
                    <div class="hf-stat"><div class="hf-num num" data-hf="pct">${attPct !== null ? attPct + '٪' : '—'}</div><div class="hf-lbl">الحضور</div></div>
                </div>
            </div>

            ${students.length > 0 ? dateStripHtml(date, markedDates) : ''}

            <div class="reg-toolrow">
                <input type="search" class="input search-input" id="student-search"
                       placeholder="🔍 بحث باسم ${global.Words.theStudent()}...">
                <button class="btn reg-add" id="btn-add-students" style="--cls-color:${heroColor(cls)}">+ إضافة ${global.Words.studentsBare()}</button>
            </div>

            ${students.length > 0 ? `
                <div class="col-chips-bar" id="col-chips">
                    <button class="col-chip ${focus === 'attendance' ? 'active' : ''}" data-col-focus="attendance">الحضور</button>
                    ${columns.map((c) => `
                        <button class="col-chip ${focus === c.id ? 'active' : ''}" data-col-focus="${c.id}">${escapeHtml(c.name)}</button>
                    `).join('')}
                    <button class="col-chip ${focus === 'notes' ? 'active' : ''}" data-col-focus="notes">📝 الملاحظات</button>
                    <button class="col-chip col-chip-add" id="chip-add-column" title="إضافة خانة جديدة">+</button>
                    <button class="col-chip col-chip-manage" id="btn-manage-columns">⚙️ تعديل الخانات</button>
                </div>
            ` : ''}

            ${showAtt && students.length > 0 ? `
                <div class="mark-bar">
                    <button class="mark-bar-btn" id="btn-mark-all"></button>
                    <div class="mark-bar-miss" id="mark-miss"></div>
                </div>
            ` : ''}

            ${students.length === 0 ? emptyStudentsState()
                : (focus === 'notes'
                    ? studentsNotesCards(students)
                    : studentsCards(students, attendanceToday, evalToday, visibleCols, showAtt))}
        `;

        /* التنقّل بين الأيام: تغيير التاريخ يعيد القراءة كاملةً — لا
           reuseData، فاللقطة تخصّ يوماً واحداً. */
        const goToDate = (d) => {
            if (!d || d > todayISO()) return;   // لا تحضير قبل وقته
            _regDate = d;
            renderStudents(panel, cls);
        };
        panel.querySelectorAll('.rd-day[data-d]').forEach((b) => {
            b.addEventListener('click', () => goToDate(b.dataset.d));
        });
        panel.querySelector('#rd-back')?.addEventListener('click', () => goToDate(todayISO()));

        const dateInput = panel.querySelector('#rd-input');
        panel.querySelector('#rd-cal')?.addEventListener('click', () => {
            if (!dateInput) return;
            /* showPicker يفتح تقويم النظام مباشرةً؛ وإن لم يدعمه المتصفح
               نضغط الحقل نفسه. */
            if (dateInput.showPicker) { try { return dateInput.showPicker(); } catch (e) { /* نكمل */ } }
            dateInput.click();
        });
        dateInput?.addEventListener('change', () => goToDate(dateInput.value));

        /* اليوم المختار يظهر في مرمى النظر لا خارج الشريط. */
        const onDay = panel.querySelector('.rd-day.on');
        if (onDay && onDay.scrollIntoView) {
            onDay.scrollIntoView({ block: 'nearest', inline: 'center' });
        }

        panel.querySelector('#btn-add-students')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('#btn-manage-columns')?.addEventListener('click', () => openColumnManager(cls, panel));
        panel.querySelector('#chip-add-column')?.addEventListener('click', () => openAddColumnModal(cls, panel));

        // Column focus chips: tap a column to see name + that column only.
        panel.querySelectorAll('[data-col-focus]').forEach((el) => {
            el.addEventListener('click', () => {
                if (el.classList.contains('active')) return;   // نفس الخانة
                panel.dataset.activeColFocus = el.dataset.colFocus;
                // تبديل عرض فقط → أعد استخدام اللقطة الحالية (فوري)
                renderStudents(panel, cls, { reuseData: true });
            });
        });
        const newChips = panel.querySelector('#col-chips');
        if (newChips && prevChipsScroll !== null) newChips.scrollLeft = prevChipsScroll;
        panel.querySelector('#btn-print-students')?.addEventListener('click', () =>
            openPrintRegisterModal(cls, students, attendanceToday, evalToday, columns));

        /* شريط التحضير: الزر يمين، ويسارُه أسماء مَن لم يُحضَّروا (تظهر فقط
           بعد بدء التحضير). عند اكتمال الجميع ينقلب الزر أحمر «إلغاء تحضير
           الكل» وضغطه يمسح تحضير اليوم كاملاً. */
        function paintMarkBar() {
            const btn  = panel.querySelector('#btn-mark-all');
            const miss = panel.querySelector('#mark-miss');
            if (!btn || !miss) return;
            const markedCount = attendanceToday.filter(Boolean).length;
            const allMarked   = students.length > 0 && markedCount === students.length;
            btn.classList.toggle('undo', allMarked);
            btn.textContent = allMarked ? '✕ إلغاء تحضير الكل' : '✓ تحضير الكل';
            if (markedCount > 0 && !allMarked) {
                const remaining = students.length - markedCount;
                miss.innerHTML = '<b>لم يتم تحضير :</b> <span class="num">' + remaining + '</span>';
            } else {
                miss.innerHTML = '';
            }
        }
        paintMarkBar();

        // "تحضير الكل": يحضّر غير المحضَّرين فقط (لا يغيّر الغائب/المتأخر).
        // وعند اكتمال تحضير الجميع يصبح «إلغاء تحضير الكل» ويمسح تحضير اليوم.
        panel.querySelector('#btn-mark-all')?.addEventListener('click', async () => {
            const btn = panel.querySelector('#btn-mark-all');
            btn.disabled = true;
            try {
                // Drain pending optimistic single-cell writes, then read the
                // real rows (with ids) so this works even after fast manual
                // taps left pseudo-rows in the local model.
                await flushWrites();
                const attNow = (await global.TeacherDB.getAllByIndex('attendance', 'class_id', cls.id))
                    .filter((r) => r.date === today);
                const byStudent = new Map(attNow.map((r) => [r.student_id, r]));
                const allMarkedNow = students.length > 0
                    && students.every((s) => byStudent.get(s.id));
                if (allMarkedNow) {
                    /* السؤالُ هنا لا قبل قراءة القاعدة: العددُ في الرسالة
                       يجب أن يكون العددَ الحقيقيَّ لا المرسومَ على الشاشة. */
                    const ids = students.map((s) => byStudent.get(s.id)).filter(Boolean).map((r) => r.id);
                    btn.disabled = false;
                    return confirmUnmarkAll(ids.length, async () => {
                        const b = panel.querySelector('#btn-mark-all');
                        if (b) { b.disabled = true; b.textContent = '⏳ جارٍ الإلغاء...'; }
                        try {
                            await global.TeacherDB.bulkRemove('attendance', ids);
                            global.TeacherApp.toast('تم إلغاء تحضير الجميع.', 'success', 2500);
                        } catch (err) {
                            global.TeacherApp.toast('تعذّر الإلغاء: ' + err.message, 'error');
                        }
                        await renderStudents(panel, cls);
                    });
                } else {
                    btn.textContent = '⏳ جارٍ التحضير...';
                    const rows = students
                        .filter((s) => !byStudent.get(s.id))
                        .map((s) => ({
                            teacher_id: cls.teacher_id,
                            class_id:   cls.id,
                            student_id: s.id,
                            date: today,
                            status: 'present'
                        }));
                    await global.TeacherDB.bulkPut('attendance', rows);
                    global.TeacherApp.toast('تم تحضير الجميع كحاضر ✅', 'success', 2500);
                }
            } catch (err) {
                global.TeacherApp.toast('تعذّر التحضير: ' + err.message, 'error');
            }
            await renderStudents(panel, cls);
        });

        // Stats-bar filtering: tap a stat to show only those rows; tap again to clear.
        // Membership is FROZEN at the moment the filter is tapped: changing a
        // student's status afterwards (e.g. marking him absent from the
        // «بلا تحضير» view) must NOT make his row vanish mid-work.
        const rowStatus = {};
        const sidIndex = {};
        students.forEach((s, i) => {
            rowStatus[s.id] = attendanceToday[i] ? attendanceToday[i].status : 'unmarked';
            sidIndex[s.id] = i;
        });

        /* Recompute the attendance counters + «تحضير الكل» button from the
           local model — used by optimistic taps so the screen updates
           instantly without rebuilding the whole table. */
        function refreshAttendanceUI() {
            const st = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
            attendanceToday.forEach((r) => {
                if (!r) st.unmarked++;
                else if (st[r.status] !== undefined) st[r.status]++;
            });
            const marked = students.length - st.unmarked;
            const pct = marked > 0 ? Math.round(((st.present + st.late) / marked) * 100) : null;
            const set = (sel, val) => { const el = panel.querySelector(sel); if (el) el.textContent = val; };
            set('[data-hf="present"]', String(st.present));
            set('[data-hf="absent"]',  String(st.absent));
            set('[data-hf="pct"]', pct !== null ? pct + '٪' : '—');
            paintMarkBar();
        }
        function applyRowFilters() {
            const q = (panel.querySelector('#student-search')?.value || '').trim();
            const f = panel.dataset.activeAttFilter || '';
            panel.querySelectorAll('.st-row').forEach((row) => {
                const name = row.dataset.name || '';
                const sid  = row.dataset.sid || row.querySelector('.st-name-link')?.dataset.id;
                const okSearch = matchesStudentName(name, q);
                const okFilter = (f === ''
                    || (_attFilterIds ? _attFilterIds.has(sid) : rowStatus[sid] === f));
                row.style.display = (okSearch && okFilter) ? '' : 'none';
            });
        }
        panel.querySelectorAll('[data-att-filter]').forEach((el) => {
            el.addEventListener('click', () => {
                const f = el.dataset.attFilter;
                panel.dataset.activeAttFilter = (panel.dataset.activeAttFilter === f) ? '' : f;
                _attFilterIds = panel.dataset.activeAttFilter
                    ? new Set(students.filter((s) => rowStatus[s.id] === f).map((s) => s.id))
                    : null;
                panel.querySelectorAll('[data-att-filter]').forEach((b) =>
                    b.classList.toggle('active', b.dataset.attFilter === panel.dataset.activeAttFilter));
                applyRowFilters();
            });
        });
        if (activeFilter) applyRowFilters();

        const search = panel.querySelector('#student-search');
        if (search) search.addEventListener('input', applyRowFilters);

        panel.querySelectorAll('.st-name-link').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                global.location.hash = '#/student/' + el.dataset.id;
            });
        });

        panel.querySelectorAll('[data-att-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sid    = btn.dataset.sid;
                const i      = sidIndex[sid];
                const cur    = attendanceToday[i] ? attendanceToday[i].status : null;
                // Toggle: tapping the ALREADY-active status clears it (back to
                // «بلا تحضير») — same idea as «تحضير الكل».
                const status = (cur === btn.dataset.status) ? null : btn.dataset.status;
                // Optimistic: update the local model + this row's buttons +
                // counters INSTANTLY, then persist in the background.
                if (status === null) attendanceToday[i] = null;
                else if (attendanceToday[i]) attendanceToday[i].status = status;
                else attendanceToday[i] = { student_id: sid, status };
                rowStatus[sid] = status || 'unmarked';
                panel.querySelectorAll(`[data-att-btn][data-sid="${sid}"]`).forEach((b) => {
                    b.classList.toggle('active', status !== null && b.dataset.status === status);
                });
                // Recolor the card stripe + status word for instant feedback.
                const meta = status ? ATTENDANCE[status] : null;
                const card = btn.closest('.st-card');
                if (card) {
                    card.style.setProperty('--stripe', meta ? meta.color : 'var(--stripe-none)');
                    const sw = card.querySelector('.stc-status');
                    if (sw) {
                        sw.textContent = meta ? meta.label : 'بلا تحضير';
                        sw.style.color = meta ? meta.color : 'var(--text-muted)';
                    }
                }
                refreshAttendanceUI();
                if (status === null) clearAttendance(sid, today);
                else setAttendance(cls, sid, today, status);
            });
        });

        // Stars, check, tri buttons (unified)
        panel.querySelectorAll('[data-eval-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sid   = btn.dataset.sid;
                const colId = btn.dataset.col;
                const value = Number(btn.dataset.value);
                const current = Number(btn.dataset.current);
                // الضغط على نفس القيمة يمسحها (يرجعها فارغة)
                const next = current === value ? 0 : value;

                /* تحديث فوري للأزرار في الشاشة ثم الحفظ بالخلفية — بلا
                   إعادة رسم السجل كاملاً (كان هذا سبب البطء). */
                const group = btn.closest('.stars-row, .tri-row') || btn.parentElement;
                const siblings = group
                    ? group.querySelectorAll(`[data-eval-btn][data-sid="${sid}"][data-col="${colId}"]`)
                    : [btn];
                siblings.forEach((b) => {
                    const bv = Number(b.dataset.value);
                    b.dataset.current = String(next);
                    if (b.classList.contains('star-btn')) {
                        const on = bv <= next;
                        b.classList.toggle('on', on);
                        b.textContent = on ? '★' : '☆';
                    } else if (b.classList.contains('tri-btn')) {
                        b.classList.toggle('on', bv === next);
                    } else if (b.classList.contains('check-btn')) {
                        const on = next >= 1;
                        b.classList.toggle('on', on);
                        b.textContent = on ? '✓' : '○';
                        b.title = on ? 'تم — اضغط للإلغاء' : 'لم يتم';
                    }
                });

                syncEvalModel(evalToday, sidIndex[sid], sid, colId, next);
                setEvalValue(cls, sid, today, colId, next);
            });
        });

        // Number inputs — save on every keystroke (debounced) so the value
        // is committed even if the user taps a star/attendance button
        // without first dismissing the keyboard or pressing Done.
        panel.querySelectorAll('input[data-eval-num]').forEach((inp) => {
            bindArabicNumberInput(inp);
            const sid   = inp.dataset.sid;
            const colId = inp.dataset.col;
            const max   = Number(inp.dataset.max);
            let timer;
            const commit = (showToast) => {
                clearTimeout(timer);
                const value = parseArabicNumber(inp.value);
                if (value === null) {
                    syncEvalModel(evalToday, sidIndex[sid], sid, colId, 0);
                    setEvalValue(cls, sid, today, colId, null);
                    return;
                }
                if (value < 0 || value > max) {
                    global.TeacherApp.toast(`القيمة يجب أن تكون بين ٠ و ${max}`, 'warning');
                    inp.value = '';
                    return;
                }
                syncEvalModel(evalToday, sidIndex[sid], sid, colId, value);
                setEvalValue(cls, sid, today, colId, value);
                if (showToast) global.TeacherApp.toast('تم الحفظ.', 'success', 1200);
            };
            inp.addEventListener('input',  () => {
                clearTimeout(timer);
                timer = setTimeout(() => commit(false), 250);
            });
            inp.addEventListener('change', () => commit(true));
            inp.addEventListener('blur',   () => commit(false));
        });

        panel.querySelectorAll('[data-del-student]').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sid = btn.dataset.delStudent;
                const name = btn.dataset.name;
                confirmDeleteStudent(name, async () => {
                    await deleteStudent(sid);
                    await updateClassStudentCount(cls.id);
                    global.TeacherApp.toast('تم حذف ' + global.Words.theStudent() + '.', 'info');
                    await renderStudents(panel, cls);
                });
            });
        });

        // Notes column — auto-grow + save in the background (no re-render, so
        // typing never loses the keyboard/cursor). Writes onto the student row.
        panel.querySelectorAll('textarea[data-note-sid]').forEach((inp) => {
            const student = students.find((s) => s.id === inp.dataset.noteSid);
            const grow = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
            grow();
            let timer;
            const commit = () => {
                clearTimeout(timer);
                if (!student) return;
                const v = inp.value.trim();
                if ((student.notes || '') === v) return;
                student.notes = v;
                student.updated_at = new Date().toISOString();
                global.TeacherDB.put('students', student).catch((err) =>
                    console.warn('[class.js] note save failed:', err));
            };
            inp.addEventListener('input', () => { grow(); clearTimeout(timer); timer = setTimeout(commit, 500); });
            inp.addEventListener('blur', commit);
        });

        // Restore scroll + search that were lost by innerHTML replacement
        const newWrapper = panel.querySelector('.table-scroll, .table-wrapper');
        if (newWrapper && prevScrollLeft !== null) {
            newWrapper.scrollLeft = prevScrollLeft;
        }

        // Split view: align the frozen (#/name) rows with the data rows.
        syncSplitRowHeights(panel);
        if (global.document.fonts && global.document.fonts.ready) {
            global.document.fonts.ready.then(() => syncSplitRowHeights(panel));
        }
        if (prevWinScrollY) {
            global.scrollTo({ top: prevWinScrollY, behavior: 'instant' });
        }
        const newSearch = panel.querySelector('#student-search');
        if (newSearch && prevSearch) {
            newSearch.value = prevSearch;
            newSearch.dispatchEvent(new Event('input'));
        }
    }

    function emptyStudentsState() {
        return `
            <div class="empty-state">
                <div class="icon">🎒</div>
                <h3>لا يوجد ${global.Words.studentsBare()} بعد</h3>
                <p>اكتب الأسماء، أو ارفع ملفاً أو صورةً بالقائمة.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة ${global.Words.studentsBare()}</button>
            </div>
        `;
    }

    const TABLE_HINT = `
            <p class="text-muted" style="margin-top: var(--space-3); font-size: var(--fs-sm);">
                اضغط أيقونة الحضور للتبديل. اضغط على اسم ${global.Words.theStudent()} لعرض التفاصيل.
                يمكنك كتابة الأرقام بالعربية (٠-٩) أو الإنجليزية.
            </p>`;

    function colHeader(c) {
        return `<th>${escapeHtml(c.name)}${c.type === 'number' ? ` <span class="text-muted" style="font-weight:normal;">(من ${c.max})</span>` : ''}</th>`;
    }

    /* Focus mode: one compact table that fits the screen (no h-scroll). */
    function studentsTable(students, attToday, evalToday, columns, showAttendance = true) {
        const rows = students.map((s, i) => {
            const att = attToday[i];
            const values = readValues(evalToday[i]);
            const cells = columns.map((col) => `<td class="st-col">${renderCell(s.id, col, values[col.id])}</td>`).join('');

            return `
                <tr class="st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}">
                    <td class="st-num num">${i + 1}</td>
                    <td class="st-name">
                        <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">
                            ${escapeHtml(s.name)}
                        </a>
                    </td>
                    ${showAttendance ? `<td class="st-att">${attendanceButtons(s.id, att)}</td>` : ''}
                    ${cells}
                    <td class="st-del">
                        <button class="btn btn-ghost btn-sm"
                                data-del-student="${s.id}"
                                data-name="${escapeHtml(s.name)}"
                                title="حذف">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-wrapper">
                <table class="students-table compact">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            ${showAttendance ? '<th>الحضور اليوم</th>' : ''}
                            ${columns.map(colHeader).join('')}
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${TABLE_HINT}
        `;
    }

    /* Notes focus: name + a comfortable notes box per student. The note is
       the student's own free-text note (same field shown on the student page,
       single source of truth). Saved in the background — no re-render — so the
       keyboard/cursor is never lost mid-typing. */
    function studentsNotesTable(students) {
        const rows = students.map((s, i) => `
            <tr class="st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}">
                <td class="st-num num">${i + 1}</td>
                <td class="st-name">
                    <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">
                        ${escapeHtml(s.name)}
                    </a>
                </td>
                <td class="st-note">
                    <textarea class="input st-note-input" data-note-sid="${s.id}" rows="1"
                              placeholder="اكتب ملاحظة…">${escapeHtml(s.notes || '')}</textarea>
                </td>
            </tr>
        `).join('');
        return `
            <div class="table-wrapper">
                <table class="students-table compact notes-table">
                    <thead><tr><th>#</th><th>الاسم</th><th>📝 الملاحظات</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${TABLE_HINT}
        `;
    }

    /* ==========================================================================
       Register CARDS (design «ج») — one comfortable card per student with a
       colored status stripe. No horizontal scroll → the iOS "blank names"
       bug is structurally impossible. Emits the SAME data hooks the handlers
       rely on (.st-row / .st-name-link / [data-att-btn] / [data-eval-btn] /
       input[data-eval-num] / [data-del-student]).
       ========================================================================== */
    function studentsCards(students, attToday, evalToday, columns, showAttendance = true) {
        const cards = students.map((s, i) => {
            const att    = attToday[i];
            const meta   = att && ATTENDANCE[att.status];
            const stripe = meta ? meta.color : 'var(--stripe-none)';
            const word   = meta ? meta.label : 'بلا تحضير';
            const values = readValues(evalToday[i]);
            const letter = escapeHtml((s.name || '؟').trim().charAt(0));

            // Left-side control: attendance squares («الكل»/«الحضور») or the
            // focused column's control (stars / number / check / tri).
            const ctl = showAttendance
                ? attendanceButtons(s.id, att)
                : (columns.length === 1 ? renderCell(s.id, columns[0], values[columns[0].id]) : '');

            return `
                <div class="st-card st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}" style="--stripe:${stripe};">
                    <div class="stc-av">${letter}</div>
                    <div class="stc-info">
                        <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">${escapeHtml(s.name)}</a>
                        <div class="stc-status" style="color:${meta ? stripe : 'var(--text-muted)'};">${word}</div>
                    </div>
                    <div class="stc-ab">${ctl}</div>
                </div>`;
        }).join('');
        return `<div class="st-cards">${cards}</div>${TABLE_HINT}`;
    }

    /* Notes focus as cards — name + a comfortable note box (same field shown
       on the student page; saved in the background, no re-render). */
    function studentsNotesCards(students) {
        const cards = students.map((s) => `
            <div class="st-card st-card-note st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}" style="--stripe:var(--stripe-none);">
                <div class="stc-av">${escapeHtml((s.name || '؟').trim().charAt(0))}</div>
                <div class="stc-info">
                    <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">${escapeHtml(s.name)}</a>
                </div>
                <div class="stc-note">
                    <textarea class="input st-note-input" data-note-sid="${s.id}" rows="2"
                              placeholder="اكتب ملاحظة…">${escapeHtml(s.notes || '')}</textarea>
                </div>
            </div>`).join('');
        return `<div class="st-cards">${cards}</div>${TABLE_HINT}`;
    }

    /* «الكل» view: SPLIT register — the #/name columns live in their own
       fixed table OUTSIDE the horizontal scroller, so nothing is sticky and
       the iOS "blank names while scrolling" bug is structurally impossible.
       Row heights are synced by syncSplitRowHeights() after every render. */
    function studentsTableSplit(students, attToday, evalToday, columns) {
        const frozenRows = [];
        const dataRows = [];
        students.forEach((s, i) => {
            const att = attToday[i];
            const values = readValues(evalToday[i]);
            const cells = columns.map((col) => `<td class="st-col">${renderCell(s.id, col, values[col.id])}</td>`).join('');
            frozenRows.push(`
                <tr class="st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}">
                    <td class="st-num num">${i + 1}</td>
                    <td class="st-name">
                        <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">
                            ${escapeHtml(s.name)}
                        </a>
                    </td>
                </tr>`);
            dataRows.push(`
                <tr class="st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}">
                    <td class="st-att">${attendanceButtons(s.id, att)}</td>
                    ${cells}
                    <td class="st-del">
                        <button class="btn btn-ghost btn-sm"
                                data-del-student="${s.id}"
                                data-name="${escapeHtml(s.name)}"
                                title="حذف">🗑️</button>
                    </td>
                </tr>`);
        });

        return `
            <div class="register-split" id="register-split">
                <table class="students-table frozen-cols">
                    <thead><tr><th>#</th><th>الاسم</th></tr></thead>
                    <tbody>${frozenRows.join('')}</tbody>
                </table>
                <div class="table-scroll">
                    <table class="students-table data-cols">
                        <thead>
                            <tr>
                                <th>الحضور اليوم</th>
                                ${columns.map(colHeader).join('')}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${dataRows.join('')}</tbody>
                    </table>
                </div>
            </div>
            ${TABLE_HINT}
        `;
    }

    /** Make each frozen row exactly as tall as its data row (and vice versa)
     *  so the two tables stay perfectly aligned. */
    function syncSplitRowHeights(panel) {
        const split = panel.querySelector('#register-split');
        if (!split) return;
        const a = split.querySelectorAll('.frozen-cols tr');
        const b = split.querySelectorAll('.data-cols tr');
        a.forEach((r) => { r.style.height = ''; });
        b.forEach((r) => { r.style.height = ''; });
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i++) {
            const h = Math.max(a[i].getBoundingClientRect().height,
                               b[i].getBoundingClientRect().height);
            a[i].style.height = h + 'px';
            b[i].style.height = h + 'px';
        }
    }

    function attendanceButtons(studentId, todayRow) {
        const current = todayRow ? todayRow.status : null;
        return Object.entries(ATTENDANCE).map(([key, meta]) => `
            <button type="button" class="att-btn ${current === key ? 'active' : ''}"
                    data-att-btn data-sid="${studentId}" data-status="${key}"
                    title="${meta.label}" style="--att-color:${meta.color};">
                ${meta.icon}
            </button>
        `).join('');
    }

    function renderCell(studentId, col, value) {
        const v = (typeof value === 'number') ? value : 0;

        if (col.type === 'stars') {
            const max = col.max || 5;
            let html = '<div class="stars-row">';
            for (let i = 1; i <= max; i++) {
                const on = i <= v;
                html += `<button type="button" class="star-btn ${on ? 'on' : ''}"
                                data-eval-btn data-sid="${studentId}" data-col="${col.id}"
                                data-value="${i}" data-current="${v}"
                                title="${i}">${on ? '★' : '☆'}</button>`;
            }
            html += '</div>';
            return html;
        }

        if (col.type === 'check') {
            const on = v >= 1;
            return `<button type="button" class="check-btn ${on ? 'on' : ''}"
                           data-eval-btn data-sid="${studentId}" data-col="${col.id}"
                           data-value="1" data-current="${v}"
                           title="${on ? 'تم — اضغط للإلغاء' : 'لم يتم'}">
                       ${on ? '✓' : '○'}
                    </button>`;
        }

        if (col.type === 'tri') {
            /* القيم: ٣ = تم · ٢ = جزئي · ١ = لم يتم · ٠/غير موجودة = فارغة.
               («لم يتم» لها قيمة خاصة بها حتى لا تظهر مختارة تلقائياً في
               الخانة الجديدة الفارغة.) */
            const options = [
                { v: 3, icon: '✓', label: 'تم',    color: '#10B981' },
                { v: 2, icon: '△', label: 'جزئي', color: '#F59E0B' },
                { v: 1, icon: '✗', label: 'لم يتم', color: '#EF4444' }
            ];
            return `<div class="tri-row">` + options.map((o) => `
                <button type="button" class="tri-btn ${v === o.v ? 'on' : ''}"
                        data-eval-btn data-sid="${studentId}" data-col="${col.id}"
                        data-value="${o.v}" data-current="${v}"
                        title="${o.label}" style="--tri-color:${o.color};">
                    ${o.icon}
                </button>
            `).join('') + `</div>`;
        }

        // number
        const display = (typeof value === 'number') ? value : '';
        return `<input type="text" class="input input-sm num-input"
                       data-eval-num data-sid="${studentId}" data-col="${col.id}"
                       data-max="${col.max}" value="${display}" placeholder="—">`;
    }

    /* ══ تأكيدُ إلغاء تحضير الجميع ══
       كان يُمحى تحضيرُ اليوم كلُّه بضغطةٍ واحدةٍ بلا سؤال — ومن أخطأ الزرَّ
       فقدَ عملَ الحصّة ولا يعرف كيف يعيده. فصار يسأل بلوحةٍ سفليّةٍ كلوحة
       حذف الطالب (البديل ب، ١٨ أغسطس ٢٠٢٦).

       والنصُّ سطرٌ واحدٌ بلا شرحٍ زائد (بطلبه، ١٨ أغسطس): العددُ واليومُ
       وكفى. والعنوانُ فوقه يقول ما الفعل، والزرُّ الأحمرُ يقول خطرَه —
       فتكرارُ ذلك في الجسم حشوٌ يُقرأ مرّةً ثم لا يُقرأ. */
    function confirmUnmarkAll(count, onConfirm) {
        const body = document.createElement('div');
        body.innerHTML = `
            <p style="margin-top:0">
                يُمحى تحضيرُ <strong>${global.Words.count(count)}</strong> لهذا اليوم.
            </p>
            <div class="modal-footer" style="margin: var(--space-5) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-danger" data-confirm>نعم، ألغِ التحضير</button>
                <button type="button" class="btn btn-ghost"  data-modal-close>تراجع</button>
            </div>
        `;
        body.querySelector('[data-confirm]').addEventListener('click', () => {
            global.Modal.close();
            onConfirm();
        });
        global.Modal.open({ title: 'إلغاء تحضير الجميع؟', body });
    }

    /** Custom confirmation dialog — replaces window.confirm() which is
     *  unreliable on iOS Safari. Uses the existing Modal component. */
    function confirmDeleteStudent(name, onConfirm) {
        const body = document.createElement('div');
        body.innerHTML = `
            <p style="margin-top:0">
                سيتم حذف ${global.Words.theStudent()} <strong>"${escapeHtml(name)}"</strong> مع كل
                سجلات الحضور والتقييمات والملاحظات.
                <br>لا يمكن التراجع.
            </p>
            <div class="modal-footer" style="margin: var(--space-5) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-danger" data-confirm>🗑️ حذف</button>
                <button type="button" class="btn btn-ghost"  data-modal-close>إلغاء</button>
            </div>
        `;
        body.querySelector('[data-confirm]').addEventListener('click', async () => {
            global.Modal.close();
            try { await onConfirm(); }
            catch (err) { global.TeacherApp.toast('فشل الحذف: ' + err.message, 'error'); }
        });
        global.Modal.open({ title: 'تأكيد حذف ' + global.Words.theStudent(), body });
    }

    /* ---------- Data ops ----------
       All writes go through a single promise chain. Two rapid taps (e.g.
       blurring a number input while clicking a star) used to read the cache
       in parallel before either had finished, then race to insert separate
       rows for the same (student, date) — overwriting each other's values.
       Serialising the writes guarantees each save reads the previous one's
       result before computing its own. */
    let _writeQueue = Promise.resolve();
    function queueWrite(fn) {
        const next = _writeQueue.then(fn);
        _writeQueue = next.catch((e) => { console.warn('[class.js] write failed:', e); });
        return next;
    }

    function setAttendance(cls, studentId, date, status) {
        return queueWrite(async () => {
            const all = await global.TeacherDB.getAllByIndex('attendance', 'student_id', studentId);
            const existing = all.find((r) => r.date === date);
            if (existing) {
                existing.status = status;
                await global.TeacherDB.put('attendance', existing);
            } else {
                await global.TeacherDB.add('attendance', {
                    teacher_id: cls.teacher_id,
                    class_id:   cls.id,
                    student_id: studentId,
                    date, status
                });
            }
        });
    }

    function clearAttendance(studentId, date) {
        return queueWrite(async () => {
            const all = await global.TeacherDB.getAllByIndex('attendance', 'student_id', studentId);
            const existing = all.find((r) => r.date === date);
            if (existing) await global.TeacherDB.remove('attendance', existing.id);
        });
    }

    function setEvalValue(cls, studentId, date, colId, value) {
        return queueWrite(async () => {
            const all = await global.TeacherDB.getAllByIndex('participation', 'student_id', studentId);
            let row = all.find((r) => r.date === date);
            if (!row) {
                row = {
                    teacher_id: cls.teacher_id,
                    class_id:   cls.id,
                    student_id: studentId,
                    date,
                    values: {}
                };
            }
            if (!row.values) row.values = readValues(row);
            if (value === null || value === 0) delete row.values[colId];
            else row.values[colId] = value;
            await global.TeacherDB.put('participation', row);
        });
    }

    /** Drain any pending writes — callers use this before re-reading
     *  the cache so they don't see stale data. */
    function flushWrites() { return _writeQueue; }

    /* كتابات مستقلة تُنفَّذ معاً بسقف متزامن: كل كتابة رحلة شبكة تقارب ربع
       ثانية، فحذف طالب له ٤٠ حضوراً و٤٠ مشاركة كان ثمانين رحلة متتابعة —
       أكثر من عشرين ثانية. والسقف يمنع إغراق المتصفح بمئات الطلبات دفعةً. */
    async function runPooled(items, fn, limit = 8) {
        const queue = items.slice();
        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
            while (queue.length) await fn(queue.shift());
        });
        await Promise.all(workers);
    }

    async function deleteStudent(studentId) {
        const [att, par] = await Promise.all([
            global.TeacherDB.getAllByIndex('attendance',    'student_id', studentId),
            global.TeacherDB.getAllByIndex('participation', 'student_id', studentId)
        ]);
        /* السجلات أولاً ثم الطالب: لو تعثّر شيء في المنتصف لا يبقى سجل
           معلّق بلا طالب. */
        await runPooled(
            att.map((r) => ['attendance', r.id]).concat(par.map((r) => ['participation', r.id])),
            ([store, id]) => global.TeacherDB.remove(store, id)
        );
        await global.TeacherDB.remove('students', studentId);
    }

    async function updateClassStudentCount(classId) {
        const cls = await global.TeacherDB.get('classes', classId);
        if (!cls) return;
        const list = await global.TeacherDB.getAllByIndex('students', 'class_id', classId);
        cls.student_count = list.length;
        await global.TeacherDB.put('classes', cls);
    }

    /* ==========================================================================
       COLUMN MANAGER MODAL
       ========================================================================== */

    /* Quick add from the [+] chip: name + type only — never lists the
       existing columns (the ⚙️ manager is for managing those). */
    function openAddColumnModal(cls, panel) {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label" for="nc-name">اسم الخانة *</label>
                <input class="input" id="nc-name" type="text" required maxlength="30"
                       placeholder="مثال: الواجبات">
            </div>
            <div class="field">
                <label class="label" for="nc-type">طريقة التقييم</label>
                <select class="select" id="nc-type">
                    ${Object.entries(COLUMN_TYPES).map(([k, v]) =>
                        `<option value="${k}" ${k === 'number' ? 'selected' : ''}>${v.label}</option>`).join('')}
                </select>
            </div>
            <div class="field" id="nc-max-field">
                <label class="label" for="nc-max">الحد الأعلى</label>
                <input class="input" id="nc-max" type="text" inputmode="numeric" value="10">
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">إضافة</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;
        const typeSel = form.querySelector('#nc-type');
        const maxInp  = form.querySelector('#nc-max');
        bindArabicNumberInput(maxInp);
        typeSel.addEventListener('change', () => {
            maxInp.value = COLUMN_TYPES[typeSel.value].default_max;
            form.querySelector('#nc-max-field').style.display =
                (typeSel.value === 'number' || typeSel.value === 'stars') ? '' : 'none';
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = form.querySelector('#nc-name').value.trim();
            if (!name) return;
            const type = typeSel.value;
            const n = parseArabicNumber(maxInp.value);
            const max = (type === 'number' || type === 'stars') && n && n > 0
                ? Math.min(1000, Math.round(n))
                : COLUMN_TYPES[type].default_max;
            const col = { id: genColId(), name, type, max };
            cls.eval_columns = ensureColumns(cls).map((c) => ({ ...c })).concat([col]);
            cls.updated_at = new Date().toISOString();
            await global.TeacherDB.put('classes', cls);
            global.Modal.close();
            global.TeacherApp.toast('تمت إضافة الخانة ✅', 'success');
            // Jump straight into the new column so grades can be entered now.
            panel.dataset.activeColFocus = col.id;
            await renderStudents(panel, cls);
        });
        global.Modal.open({ title: '+ خانة جديدة', body: form });
    }

    function openColumnManager(cls, panel) {
        const columns = ensureColumns(cls).map((c) => ({ ...c }));

        const form = document.createElement('div');

        function paintList() {
            form.innerHTML = `
                <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                    عدّل أو احذف خانات التقييم الموجودة. لإضافة خانة جديدة استخدم زر [+] في شريط الخانات.
                </p>
                <div class="columns-list" id="columns-list">
                    ${columns.length === 0
                        ? '<p class="text-muted">لا توجد خانات — أضف واحدة من زر [+] في شريط الخانات.</p>'
                        : columns.map((c, i) => columnRow(c, i)).join('')}
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button type="button" class="btn btn-primary" id="btn-save-cols">تم</button>
                    <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;
            bind();
        }

        function columnRow(c, i) {
            return `
                <div class="column-row" data-i="${i}">
                    <input class="input" data-field="name" value="${escapeHtml(c.name)}" placeholder="اسم الخانة">
                    <select class="select" data-field="type">
                        ${Object.entries(COLUMN_TYPES).map(([k, v]) =>
                            `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v.label}</option>`
                        ).join('')}
                    </select>
                    <input class="input num-input" data-field="max" value="${c.max}"
                           ${c.type !== 'number' && c.type !== 'stars' ? 'disabled' : ''}
                           placeholder="الحد الأعلى">
                    <button type="button" class="btn btn-ghost btn-sm" data-remove="${i}" title="حذف">🗑️</button>
                </div>
            `;
        }

        function bind() {
            form.querySelectorAll('.column-row').forEach((row) => {
                const i = Number(row.dataset.i);
                const nameInp = row.querySelector('[data-field="name"]');
                const typeSel = row.querySelector('[data-field="type"]');
                const maxInp  = row.querySelector('[data-field="max"]');

                bindArabicNumberInput(maxInp);

                nameInp.addEventListener('input', () => { columns[i].name = nameInp.value; });
                typeSel.addEventListener('change', () => {
                    columns[i].type = typeSel.value;
                    columns[i].max  = COLUMN_TYPES[typeSel.value].default_max;
                    paintList();
                });
                maxInp.addEventListener('change', () => {
                    const n = parseArabicNumber(maxInp.value);
                    columns[i].max = (n && n > 0) ? Math.min(1000, Math.round(n)) : COLUMN_TYPES[columns[i].type].default_max;
                    maxInp.value = columns[i].max;
                });
            });

            form.querySelectorAll('[data-remove]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    if (!global.confirm('حذف هذه الخانة؟ البيانات المسجلة فيها ستبقى لكن لن تظهر.')) return;
                    columns.splice(Number(btn.dataset.remove), 1);
                    paintList();
                });
            });

            form.querySelector('#btn-save-cols')?.addEventListener('click', async () => {
                // Read straight from the DOM — relying on the per-input
                // 'change' events misses values that the user typed but
                // never blurred out of (common on mobile: tap "تم" while
                // the keyboard is still up → no change event fires).
                form.querySelectorAll('.column-row').forEach((row) => {
                    const i = Number(row.dataset.i);
                    if (!columns[i]) return;
                    const nameInp = row.querySelector('[data-field="name"]');
                    const typeSel = row.querySelector('[data-field="type"]');
                    const maxInp  = row.querySelector('[data-field="max"]');
                    if (nameInp) columns[i].name = nameInp.value;
                    if (typeSel) columns[i].type = typeSel.value;
                    if (maxInp) {
                        const n = parseArabicNumber(maxInp.value);
                        const t = columns[i].type || 'number';
                        columns[i].max = (n && n > 0)
                            ? Math.min(1000, Math.round(n))
                            : COLUMN_TYPES[t].default_max;
                    }
                });

                const cleaned = columns
                    .map((c) => ({
                        id: c.id || genColId(),
                        name: (c.name || '').trim() || 'خانة',
                        type: c.type || 'number',
                        max: Number(c.max) || COLUMN_TYPES[c.type || 'number'].default_max
                    }));
                cls.eval_columns = cleaned;
                cls.updated_at = new Date().toISOString();
                await global.TeacherDB.put('classes', cls);
                global.Modal.close();
                global.TeacherApp.toast('تم حفظ الخانات ✅', 'success');
                await renderStudents(panel, cls);
            });
        }

        paintList();
        global.Modal.open({ title: '⚙️ تعديل الخانات', body: form, autofocus: false });
    }

    /* ==========================================================================
       ADD STUDENTS MODAL
       ========================================================================== */

    /* ══ شاشةٌ واحدةٌ لا حبّتا تبديل ══
       كانت حبّتان تُبدّلان بين «لصق قائمة» و«رفع ملف»، فتُخفى إحدى
       الطريقتين دائماً ويُطلب من المعلّم أن يقرّر طريقَه **قبل** أن يرى ما
       فيه. وعنوانُ المربّع فوقه يكرّر ما يقوله المربّعُ نفسُه.

       فصارتا حاضرتين معاً: المربّعُ مفتوحٌ وشرحُه داخلَه، وتحته صفُّ رفعٍ
       بمواد بطاقات التطبيق نفسِها (صفوفُ الفصول و«إنجاز» واستيرادُ الجدول)
       — فيدخل الشكلُ الجديد بلا أن يُشعر أنه غريب. (البديل أ، ١٨ أغسطس.) */
    function openAddStudentsModal(cls) {
        let file = null;                 /* الملفُّ المختار — إن اختار */
        const form = document.createElement('div');
        paint();

        function paint() {
            form.innerHTML = `
                <div class="field" style="margin-bottom: 0;">
                    <label class="label" for="paste-names">أسماء ${global.Words.students()}</label>
                    <textarea class="textarea" id="paste-names" rows="8"
                              placeholder="اكتب أسماء ${global.Words.students()} هنا — اسم في كل سطر"></textarea>
                    <div class="field-hint">يُتجاهل الفراغ والأسطر الفارغة.</div>
                </div>

                <button type="button" class="stu-up" id="stu-up">
                    <span class="ic">${file ? '✓' : '📄'}</span>
                    <span class="tx">
                        <span class="t">${file ? escapeHtml(file.name)
                                               : 'ارفع ملفاً أو صورةً بأسماء ' + global.Words.students()}</span>
                        <span class="s">${file ? 'اضغط لاختيار ملفٍ آخر'
                                               : 'صورة أو PDF أو ملف نصّي'}</span>
                    </span>
                    <span class="chev" aria-hidden="true">❮</span>
                </button>
                <input type="file" id="upload-file" accept=".csv,.txt,.pdf,image/*" hidden>

                ${footer('إضافة ' + global.Words.students())}
            `;
            const picker = form.querySelector('#upload-file');
            form.querySelector('#stu-up').addEventListener('click', () => picker.click());
            picker.addEventListener('change', () => {
                file = picker.files[0] || null;
                const txt = form.querySelector('#paste-names').value;
                paint();
                form.querySelector('#paste-names').value = txt;   /* لا يضيع ما كتب */
            });
            bindSubmit();
        }

        function footer(primary) { return `
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-primary" data-submit>${primary}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>`; }

        function bindSubmit() {
            const btn = form.querySelector('[data-submit]');
            if (!btn) return;
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                const origLabel = btn.textContent;
                try {
                    let names = [];
                    /* المكتوبُ يسبق المرفوع: إن كتب شيئاً فهو قصدُه، وإلّا
                       فالملفُّ — ولا يُسأل أيَّهما أراد. */
                    const typed = parseNameList(form.querySelector('#paste-names').value);
                    if (typed.length) {
                        names = typed;
                    } else {
                        if (!file) throw new Error('اكتب الأسماء أو ارفع ملفاً.');
                        // Text files (CSV/TXT) are read directly; PDF/images go to AI.
                        const isText = /\.(csv|txt)$/i.test(file.name)
                            || file.type === 'text/csv' || file.type === 'text/plain';
                        if (isText) {
                            names = parseCSV(await file.text());
                        } else {
                            if (!(await global.AI.hasApiKey())) {
                                throw new Error('مفتاح Claude API غير معرّف. أضفه من الإعدادات أولاً.');
                            }
                            if (file.size > 20 * 1024 * 1024) {
                                throw new Error('الملف كبير جداً (أقصى 20MB).');
                            }
                            btn.textContent = '⏳ جارٍ القراءة...';
                            /* بلا سقفٍ منّا — والكشف الطويل يُقرأ كلّه. */
                            const pages = await fileToImagePages(file);
                            if (pages.skipped > 0) {
                                global.TeacherApp.toast(
                                    'الملف ' + pages.total + ' صفحة، وأقصى ما يُقرأ دفعةً '
                                    + global.PdfCore.MAX_IMAGE_PAGES + '. قُرئت الأولى منها فقط.',
                                    'warning', 7000);
                            }
                            names = await global.AI.extractStudentNamesFromImage({ pages });
                        }
                    }
                    if (names.length === 0) throw new Error('لم يتم العثور على أي أسماء.');
                    btn.textContent = '⏳ جارٍ الإضافة...';
                    await runPooled(names, (name) => global.TeacherDB.add('students', {
                        teacher_id: cls.teacher_id,
                        class_id:   cls.id,
                        name,
                        notes: ''
                    }));
                    await updateClassStudentCount(cls.id);
                    global.Modal.close();
                    global.TeacherApp.toast('تمت إضافة ' + global.Words.count(names.length) + ' ✅', 'success');
                    const panel = document.querySelector('#tab-panel');
                    if (panel) await renderStudents(panel, cls);
                } catch (err) {
                    global.TeacherApp.toast(err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = origLabel;
                }
            });
        }

        global.Modal.open({ title: 'إضافة ' + global.Words.studentsBare(), body: form });
    }

    /* نسخة واحدة في PdfCore — كانت هذه الدالة مكرّرة حرفياً في ثلاثة
       ملفات، وكلها تشير إلى CDN خارجي. */
    function ensurePdfJs() {
        return global.PdfCore.ensurePdfJs();
    }

    /* نسخة واحدة في PdfCore — كانت هنا ثم احتاجها استيراد الجدول. */
    const fileToImagePages = (file, max) => global.PdfCore.fileToImagePages(file, max);

    function parseNameList(raw) {
        return String(raw || '').split(/\r?\n/)
            .map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 200);
    }
    function parseCSV(text) {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const rows = lines.map((l) => {
            const m = l.match(/^"([^"]*)"/);
            return m ? m[1] : l.split(',')[0].trim();
        });
        if (rows.length === 0) return [];
        const first = rows[0].toLowerCase();
        const isHeader = ['name', 'الاسم', 'اسم الطالب', 'student'].some((h) => first === h.toLowerCase());
        return (isHeader ? rows.slice(1) : rows).filter((n) => n.length > 0);
    }

    /* ==========================================================================
       EDIT / DELETE CLASS
       ========================================================================== */

    /* Opened from the classes list («تعديل» on the class card).
       onSaved is called after a successful save so the caller can repaint. */
    /** لوحة إدارة الفصل: تعديل أو حذف. */
    function openClassActions(cls, onDone) {
        const body = document.createElement('div');
        body.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin: 0 0 var(--space-4);">
                ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)} — ${escapeHtml(cls.subject)}
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <button type="button" class="btn btn-secondary btn-block" id="ca-edit">✏️ تعديل الفصل</button>
                <button type="button" class="btn btn-ghost btn-block" id="ca-delete"
                        style="color: #DC2626;">🗑️ حذف الفصل</button>
            </div>
        `;
        body.querySelector('#ca-edit').addEventListener('click', () => {
            global.Modal.close();
            editClass(cls, onDone);
        });
        body.querySelector('#ca-delete').addEventListener('click', async () => {
            global.Modal.close();
            /* بلا onDone: الفصل اختفى، فإعادة رسم صفحته خطأ — deleteClass
               ينقل إلى الرئيسية من تلقائه حين لا يُمرَّر رجوع. */
            await deleteClass(cls);
        });
        global.Modal.open({ title: 'إدارة الفصل', body });
    }

    async function editClass(cls, onSaved) {
        /* المواد من مصدرٍ واحد، ومعها موادّ المعلّم ومادّةُ هذا الفصل —
           فلا يضيع ما كتبه بيده حين يعدّل. */
        const me = await global.Auth.currentTeacher();
        const subjectList = global.Subjects.merge(
            global.Subjects.ofTeacher(me),
            cls.subject ? [cls.subject] : [],
            global.Subjects.ALL
        );
        // اللون موحّد لكل الفصول (رصاصي) — لا حقل لون في التعديل.
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">الشعبة *</label>
                <input class="input" id="e-section" type="text" required
                       value="${escapeHtml(cls.section)}" maxlength="8">
            </div>
            <div class="field">
                <label class="label">المادة *</label>
                <select class="select" id="e-subject" required>
                    ${subjectList.map((s) => `<option value="${escapeHtml(s)}" ${s === cls.subject ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">حفظ</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            cls.section = form.querySelector('#e-section').value.trim();
            cls.subject = form.querySelector('#e-subject').value;
            cls.updated_at = new Date().toISOString();
            await global.TeacherDB.put('classes', cls);
            global.Modal.close();
            global.TeacherApp.toast('تم حفظ التعديل.', 'success');
            if (onSaved) onSaved();
        });
        global.Modal.open({ title: 'تعديل الفصل', body: form });
    }

    async function deleteClass(cls, onDone) {
        const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
        const msg = students.length > 0
            ? `سيتم حذف الفصل و${global.Words.count(students.length)} وجميع سجلاتهم. متأكد؟`
            : 'حذف الفصل؟';
        if (!global.confirm(msg)) return;
        /* ثلاثة طلاب في وقت واحد لا أكثر: كل طالب يفتح بنفسه ثماني كتابات
           متزامنة، فثلاثة معاً تعني أربعاً وعشرين — حدٌّ يحتمله المتصفح. */
        await runPooled(students, (s) => deleteStudent(s.id), 3);
        await global.TeacherDB.remove('classes', cls.id);
        global.TeacherApp.toast('تم حذف الفصل.', 'info');
        if (onDone) onDone();
        else global.location.hash = '#/dashboard';
    }

    /* ==========================================================================
       PRINT REGISTER MODAL
       ========================================================================== */

    /* نافذة طباعة السجل — ٣ أنواع بخيارات فرعية (بالشكل والترتيب المعتمدين):
       ١) مُفرّغ: حضور فقط / كل الخانات   ٢) الحضور والغياب: اليوم / فترة
       ٣) كامل الخانات: اليوم / فترة (جدول مستقل لكل يوم).
       الطباعة بالعرض دائماً. */
    function openPrintRegisterModal(cls, students, attToday, evalToday, columns) {
        const TYPES = [
            { k: 'blank', ic: '🗒️', t: 'سجل مُفرّغ', d: 'فاضٍ للتعبئة باليد', sub: 'blankScope' },
            { k: 'attendance', ic: '✅', t: 'سجل الحضور والغياب', d: 'الحضور فقط — بدون خانات التقييم', sub: 'period' },
            { k: 'full', ic: '📋', t: 'سجل بكامل الخانات (معبّأ)', d: 'حضور + كل خانات التقييم بقيمها الفعلية', sub: 'period', note: 'الفترة: جدول مستقل لكل يوم' }
        ];

        const subHtml = (t) => {
            if (t.sub === 'period') {
                return `
                    <div class="popt-lbl">النطاق</div>
                    <div class="pseg-row">
                        <button type="button" class="pseg on" data-scope="today">اليوم</button>
                        <button type="button" class="pseg" data-scope="range">فترة محددة</button>
                    </div>
                    <div class="pdates">
                        <div class="fld"><label>من تاريخ</label><input type="date" data-from value="${isoDaysAgo(13)}"></div>
                        <div class="fld"><label>إلى تاريخ</label><input type="date" data-to value="${todayISO()}"></div>
                    </div>
                    ${t.note ? `<div class="pnote" hidden>▸ ${t.note}</div>` : ''}`;
            }
            return `
                <div class="popt-lbl">نوع الأعمدة</div>
                <div class="pseg-row">
                    <button type="button" class="pseg on" data-scope="att">حضور وغياب فقط</button>
                    <button type="button" class="pseg" data-scope="all">كل الخانات</button>
                </div>`;
        };

        const form = document.createElement('form');
        form.innerHTML = `
            <div class="popt-lbl" style="margin-top:0;">اختر نوع السجل</div>
            ${TYPES.map((t, i) => `
                <div class="popt ${i === 0 ? 'on' : ''}" data-k="${t.k}">
                    <div class="popt-hd">
                        <div class="popt-ic">${t.ic}</div>
                        <div class="popt-tx">
                            <div class="popt-tt">${t.t}</div>
                            <div class="popt-dd">${t.d}</div>
                        </div>
                        <div class="popt-rd"></div>
                    </div>
                    <div class="popt-sub">${subHtml(t)}</div>
                </div>
            `).join('')}
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">📄 حفظ وطباعة</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        // اختيار النوع
        form.querySelectorAll('.popt .popt-hd').forEach((hd) => {
            hd.addEventListener('click', () => {
                form.querySelectorAll('.popt').forEach((o) => o.classList.remove('on'));
                hd.closest('.popt').classList.add('on');
            });
        });
        // الخيارات الفرعية + إظهار التواريخ والملاحظة عند «فترة محددة»
        form.querySelectorAll('.pseg-row').forEach((row) => {
            row.querySelectorAll('.pseg').forEach((seg) => {
                seg.addEventListener('click', () => {
                    row.querySelectorAll('.pseg').forEach((s) => s.classList.remove('on'));
                    seg.classList.add('on');
                    const opt = seg.closest('.popt');
                    const dates = opt.querySelector('.pdates');
                    const note = opt.querySelector('.pnote');
                    if (dates) {
                        const isRange = seg.dataset.scope === 'range';
                        dates.classList.toggle('show', isRange);
                        if (note) note.hidden = !isRange;
                    }
                });
            });
        });

        /** يبني خيارات الطباعة من اختيار المعلم — مشتركة بين الطباعة وحفظ PDF.
         *  يُرجع null إذا كان نطاق التاريخ غير صحيح (بعد إظهار تنبيه). */
        async function buildPrintOptions() {
            const opt = form.querySelector('.popt.on');
            const kind = opt.dataset.k;
            const scope = opt.querySelector('.pseg.on')?.dataset.scope || 'today';
            const teacher = await global.Auth.currentTeacher();

            // فترة محددة (الحضور أو كامل الخانات)
            if ((kind === 'attendance' || kind === 'full') && scope === 'range') {
                const from = opt.querySelector('[data-from]').value;
                const to   = opt.querySelector('[data-to]').value;
                if (!from || !to || from > to) {
                    global.TeacherApp.toast('اختر نطاق تاريخ صحيح.', 'warning');
                    return null;
                }
                // قراءتان مجمّعتان بفهرس الفصل ثم تصفية بالفترة
                const [attRows, parRows] = await Promise.all([
                    global.TeacherDB.getAllByIndex('attendance', 'class_id', cls.id),
                    global.TeacherDB.getAllByIndex('participation', 'class_id', cls.id)
                ]);
                const sids = new Set(students.map((s) => s.id));
                const inWin = (r) => sids.has(r.student_id) && r.date >= from && r.date <= to;

                return {
                    mode: kind === 'attendance' ? 'range' : 'daily',
                    cls, teacher, students,
                    columns: kind === 'attendance' ? [] : columns,
                    dates: expandDates(from, to),
                    from, to,
                    attendance: attRows.filter(inWin),
                    participation: parRows.filter(inWin),
                    includeEvals: false
                };
            }

            if (kind === 'blank') {
                return {
                    mode: 'blank', cls, teacher, students,
                    columns: scope === 'all' ? columns : []
                };
            }
            // اليوم (حضور فقط أو كامل الخانات)
            return {
                mode: 'today', cls, teacher, students,
                columns: kind === 'attendance' ? [] : columns,
                attendance: attToday.filter(Boolean),
                participation: evalToday.filter(Boolean)
            };
        }

        /* زر واحد «حفظ وطباعة»: يُنشئ ملف PDF ثم تفتح ورقة المشاركة التي
           تتيح الحفظ في الملفات أو الطباعة أو الإرسال — والمطبوع مطابق
           للملف لأن كليهما من نفس الصور. */
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const opts = await buildPrintOptions();
            if (!opts) return;
            global.Modal.close();
            global.PrintStudents.savePdf(opts);
        });

        // تحميل محرّك PDF بالخلفية فور فتح النافذة حتى تكون ضغطة «حفظ PDF» فورية.
        if (global.PrintStudents && global.PrintStudents.preloadPdfEngine) {
            global.PrintStudents.preloadPdfEngine().catch(() => {});
        }
        global.Modal.open({ title: '🖨️ طباعة السجل', body: form, autofocus: false });
    }

    function isoDaysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function expandDates(from, to) {
        const out = [];
        const d = new Date(from + 'T00:00:00');
        const end = new Date(to + 'T00:00:00');
        while (d <= end) {
            // Skip Friday (5) and Saturday (6) — Saudi weekend
            const day = d.getDay();
            if (day !== 5 && day !== 6) {
                out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
            }
            d.setDate(d.getDate() + 1);
        }
        return out;
    }

    global.ClassView = { render, editClass, deleteClass };
})(window);
