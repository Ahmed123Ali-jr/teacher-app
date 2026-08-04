/* ==========================================================================
   views/class.js — Class screen with 5 tabs.
   Phase 3: Students tab — dynamic evaluation columns + Arabic-digit input.
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    const TABS = [
        { key: 'students',   label: 'سجل متابعة الطلاب', icon: '👥' },
        { key: 'books',      label: 'الكتب',        icon: '📖' },
        { key: 'curriculum', label: 'توزيع المنهج', icon: '🗓️' },
        { key: 'exams',      label: 'الاختبارات',   icon: '📝' },
        { key: 'worksheets', label: 'أوراق العمل',  icon: '📄' },
        { key: 'homework',   label: 'الواجبات',     icon: '📚' }
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
        tri:    { label: 'تم / جزئي / لم يتم',    default_max: 2  }
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

    function todayHuman() {
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'long'
            }).format(new Date());
        } catch { return todayISO(); }
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
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
        // Live stats for the featured students card
        const today = todayISO();
        // One bulk read per store (indexed by class) — no per-student loop.
        const [students, attAll, books, exams, worksheets, homework] = await Promise.all([
            global.TeacherDB.getAllByIndex('students',    'class_id', cls.id),
            global.TeacherDB.getAllByIndex('attendance',  'class_id', cls.id),
            global.TeacherDB.getAllByIndex('books',       'class_id', cls.id),
            global.TeacherDB.getAllByIndex('exams',       'class_id', cls.id),
            global.TeacherDB.getAllByIndex('worksheets',  'class_id', cls.id),
            global.TeacherDB.getAllByIndex('assignments', 'class_id', cls.id)
        ]);
        const studentIds = new Set(students.map((s) => s.id));
        let present = 0, absent = 0, late = 0, marked = 0;
        const seen = new Set();
        for (const t of attAll) {
            if (t.date !== today || !studentIds.has(t.student_id) || seen.has(t.student_id)) continue;
            seen.add(t.student_id);
            marked++;
            if (t.status === 'present') present++;
            else if (t.status === 'absent') absent++;
            else if (t.status === 'late') late++;
        }
        const pct = marked > 0 ? Math.round(((present + late) / marked) * 100) : null;

        const GRID = [
            { key: 'books',      icon: '📖', label: 'الكتب',        count: books.length,      tint: '#7C3AED', bg: '#F5F1FE' },
            { key: 'exams',      icon: '📝', label: 'الاختبارات',   count: exams.length,      tint: '#DC2626', bg: '#FEF1F1' },
            { key: 'worksheets', icon: '📄', label: 'أوراق العمل',  count: worksheets.length, tint: '#059669', bg: '#EDFBF5' },
            { key: 'homework',   icon: '📚', label: 'الواجبات',     count: homework.length,   tint: '#D97706', bg: '#FFF8EB' },
            { key: 'curriculum', icon: '🗓️', label: 'توزيع المنهج', count: null,              tint: '#0891B2', bg: '#EDFAFD' }
        ];

        container.innerHTML = `
            <div class="container">
                <div class="class-topbar">
                    <button type="button" id="btn-class-back" class="btn-back-box" aria-label="الرجوع إلى الفصول"></button>
                </div>

                <div class="class-hero-split" style="--cls-color:${cls.color || '#1E40AF'}">
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
                            <span class="chs-chip">👥 <span class="num">${students.length}</span> طالباً</span>
                        </div>
                    </div>
                </div>

                <a class="hub-featured" href="#/class/${cls.id}/students" style="--cls-color:${cls.color || '#1E40AF'}">
                    <div class="hub-featured-bubble b1"></div>
                    <div class="hub-featured-bubble b2"></div>
                    <div class="hub-featured-head">
                        <div class="hub-featured-icon">👥</div>
                        <div class="hub-featured-titles">
                            <div class="hub-featured-title">سجل متابعة الطلاب</div>
                            <div class="hub-featured-sub">التحضير والغياب والمشاركة</div>
                        </div>
                        <div class="hub-featured-chev">‹</div>
                    </div>
                    <div class="hub-featured-stats">
                        <div class="hf-stat"><div class="hf-num num">${students.length}</div><div class="hf-lbl">طالب</div></div>
                        <div class="hf-stat"><div class="hf-num num">${marked ? present : '—'}</div><div class="hf-lbl">حاضر</div></div>
                        <div class="hf-stat"><div class="hf-num num">${marked ? absent : '—'}</div><div class="hf-lbl">غائب</div></div>
                        <div class="hf-stat"><div class="hf-num num">${pct !== null ? pct + '٪' : '—'}</div><div class="hf-lbl">الحضور</div></div>
                    </div>
                </a>

                <div class="hub-grid">
                    ${GRID.map((g) => `
                        <a class="hub-tile" href="#/class/${cls.id}/${g.key}">
                            <div class="hub-tile-icon" style="background:${g.bg}">${g.icon}</div>
                            <div class="hub-tile-body">
                                <div class="hub-tile-label">${g.label}</div>
                                <div class="hub-tile-count" style="color:${g.count ? g.tint : '#B6BFCC'}">
                                    ${g.count === null ? 'الخطة' : (g.count || '—')}
                                </div>
                            </div>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelector('#btn-class-back')?.addEventListener('click', () => {
            global.location.hash = '#/classes';
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
                <div class="section-page-bar">
                    <a class="btn-back-box" href="#/class/${cls.id}" aria-label="الرجوع إلى الفصل"></a>
                    <div class="section-page-title">
                        <span class="section-page-icon">${tab.icon}</span>
                        <span>${tab.label}</span>
                    </div>
                </div>
                <div class="tab-panel" id="tab-panel"></div>
            </div>
        `;

        const panel = container.querySelector('#tab-panel');
        switch (state.activeTab) {
            case 'students':   await renderStudents(panel, cls); break;
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

    async function renderStudents(panel, cls) {
        const gen = ++_studentsRenderGen;
        // Wait for any in-flight saves to land in the cache before reading,
        // otherwise the table can paint with stale data.
        await flushWrites();
        const columns = ensureColumns(cls);
        const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
        students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

        const today = todayISO();
        // Two bulk reads by class (indexed) instead of 2×N per-student queries:
        // for 30+ students this is the single biggest speedup on this screen.
        const [attAll, parAll] = await Promise.all([
            global.TeacherDB.getAllByIndex('attendance', 'class_id', cls.id),
            global.TeacherDB.getAllByIndex('participation', 'class_id', cls.id)
        ]);
        const attByStudent = new Map();
        for (const r of attAll) if (r.date === today) attByStudent.set(r.student_id, r);
        const parByStudent = new Map();
        for (const r of parAll) if (r.date === today) parByStudent.set(r.student_id, r);
        const attendanceToday = students.map((s) => attByStudent.get(s.id) || null);
        const evalToday = students.map((s) => parByStudent.get(s.id) || null);

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
        const allPresent = students.length > 0
            && attendanceToday.every((r) => r && r.status === 'present');

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
            <div class="students-toolbar">
                <div class="students-meta">
                    <strong class="num">${students.length}</strong> طالب
                    <span class="text-muted" style="margin-right:var(--space-3);">
                        📅 ${todayHuman()}
                    </span>
                </div>
                <button class="btn btn-ghost btn-sm" id="btn-print-students" ${students.length === 0 ? 'disabled' : ''}>🖨️ طباعة السجل</button>
            </div>

            <div class="students-actions">
                <input type="search" class="input search-input" id="student-search"
                       placeholder="🔍 بحث باسم الطالب...">
                <button class="btn btn-primary sa-add" id="btn-add-students">+ إضافة طلاب</button>
                <button class="btn btn-secondary ${allPresent ? 'mark-all-on' : ''}" id="btn-mark-all" ${students.length === 0 ? 'disabled' : ''}>${allPresent ? '✓ تم تحضير الكل' : '✓ تحضير الكل'}</button>
                ${students.length > 0 ? `
                <div class="att-mini-stats">
                    <button class="att-mini ${activeFilter === 'present' ? 'active' : ''}" data-att-filter="present" style="--stat-color:#059669;">حاضر <b class="num">${stats.present}</b></button>
                    <button class="att-mini ${activeFilter === 'absent' ? 'active' : ''}" data-att-filter="absent" style="--stat-color:#DC2626;">غائب <b class="num">${stats.absent}</b></button>
                    <span class="att-mini pct" style="--stat-color:#1E40AF;">الحضور <b class="num">${attPct !== null ? attPct + '٪' : '—'}</b></span>
                </div>` : ''}
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

            ${students.length === 0 ? emptyStudentsState()
                : (focus === 'notes'
                    ? studentsNotesCards(students)
                    : studentsCards(students, attendanceToday, evalToday, visibleCols, showAtt))}
        `;

        panel.querySelector('#btn-add-students')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('#btn-manage-columns')?.addEventListener('click', () => openColumnManager(cls, panel));
        panel.querySelector('#chip-add-column')?.addEventListener('click', () => openAddColumnModal(cls, panel));

        // Column focus chips: tap a column to see name + that column only.
        panel.querySelectorAll('[data-col-focus]').forEach((el) => {
            el.addEventListener('click', () => {
                panel.dataset.activeColFocus = el.dataset.colFocus;
                renderStudents(panel, cls);
            });
        });
        const newChips = panel.querySelector('#col-chips');
        if (newChips && prevChipsScroll !== null) newChips.scrollLeft = prevChipsScroll;
        panel.querySelector('#btn-print-students')?.addEventListener('click', () =>
            openPrintRegisterModal(cls, students, attendanceToday, evalToday, columns));

        // "تحضير الكل" toggle: press once → everyone becomes حاضر (the button
        // turns green); press again while everyone is حاضر → today's attendance
        // is cleared for the whole class.
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
                const allPresentNow = students.length > 0
                    && students.every((s) => byStudent.get(s.id)?.status === 'present');
                if (allPresentNow) {
                    btn.textContent = '⏳ جارٍ التراجع...';
                    const ids = students.map((s) => byStudent.get(s.id)).filter(Boolean).map((r) => r.id);
                    await global.TeacherDB.bulkRemove('attendance', ids);
                    global.TeacherApp.toast('تم التراجع عن تحضير الجميع.', 'success', 2500);
                } else {
                    btn.textContent = '⏳ جارٍ التحضير...';
                    const rows = [];
                    for (const s of students) {
                        const cur = byStudent.get(s.id);
                        if (cur) {
                            if (cur.status !== 'present') { cur.status = 'present'; rows.push(cur); }
                        } else {
                            rows.push({
                                teacher_id: cls.teacher_id,
                                class_id:   cls.id,
                                student_id: s.id,
                                date: today,
                                status: 'present'
                            });
                        }
                    }
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
            set('.att-mini[data-att-filter="present"] b', String(st.present));
            set('.att-mini[data-att-filter="absent"] b',  String(st.absent));
            set('.att-mini.pct b', pct !== null ? pct + '٪' : '—');
            const allPres = students.length > 0 && attendanceToday.every((r) => r && r.status === 'present');
            const mab = panel.querySelector('#btn-mark-all');
            if (mab) {
                mab.classList.toggle('mark-all-on', allPres);
                mab.textContent = allPres ? '✓ تم تحضير الكل' : '✓ تحضير الكل';
            }
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
                    card.style.setProperty('--stripe', meta ? meta.color : '#D8DEE9');
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
            btn.addEventListener('click', async () => {
                const sid   = btn.dataset.sid;
                const colId = btn.dataset.col;
                const value = Number(btn.dataset.value);
                const current = Number(btn.dataset.current);
                // Toggle off if clicking the same value (allow clearing)
                const next = current === value ? 0 : value;
                await setEvalValue(cls, sid, today, colId, next);
                await renderStudents(panel, cls);
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
                    setEvalValue(cls, sid, today, colId, null);
                    return;
                }
                if (value < 0 || value > max) {
                    global.TeacherApp.toast(`القيمة يجب أن تكون بين ٠ و ${max}`, 'warning');
                    inp.value = '';
                    return;
                }
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
                    global.TeacherApp.toast('تم حذف الطالب.', 'info');
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
                <h3>لا يوجد طلاب بعد</h3>
                <p>ألصق قائمة أسماء الطلاب، أو ارفع ملفاً أو صورة للقائمة.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة طلاب</button>
            </div>
        `;
    }

    const TABLE_HINT = `
            <p class="text-muted" style="margin-top: var(--space-3); font-size: var(--fs-sm);">
                اضغط أيقونة الحضور للتبديل. اضغط على اسم الطالب لعرض تفاصيله.
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
            const stripe = meta ? meta.color : '#D8DEE9';
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
            <div class="st-card st-card-note st-row" data-sid="${s.id}" data-name="${escapeHtml(s.name)}" style="--stripe:#D8DEE9;">
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
            const options = [
                { v: 2, icon: '✓', label: 'تم',    color: '#10B981' },
                { v: 1, icon: '△', label: 'جزئي', color: '#F59E0B' },
                { v: 0, icon: '✗', label: 'لم',    color: '#EF4444' }
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

    /** Custom confirmation dialog — replaces window.confirm() which is
     *  unreliable on iOS Safari. Uses the existing Modal component. */
    function confirmDeleteStudent(name, onConfirm) {
        const body = document.createElement('div');
        body.innerHTML = `
            <p style="margin-top:0">
                سيتم حذف الطالب <strong>"${escapeHtml(name)}"</strong> مع كل
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
        global.Modal.open({ title: 'تأكيد حذف الطالب', body });
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

    async function deleteStudent(studentId) {
        await global.TeacherDB.remove('students', studentId);
        const att = await global.TeacherDB.getAllByIndex('attendance', 'student_id', studentId);
        for (const r of att) await global.TeacherDB.remove('attendance', r.id);
        const par = await global.TeacherDB.getAllByIndex('participation', 'student_id', studentId);
        for (const r of par) await global.TeacherDB.remove('participation', r.id);
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

    function openAddStudentsModal(cls) {
        let mode = 'paste';
        const form = document.createElement('div');
        paint();

        function paint() {
            form.innerHTML = `
                <div class="filter-bar" style="margin-bottom: var(--space-5); flex-wrap: wrap;">
                    <button class="chip ${mode === 'paste'  ? 'active' : ''}" data-mode="paste">📋 لصق قائمة</button>
                    <button class="chip ${mode === 'upload' ? 'active' : ''}" data-mode="upload">📎 رفع ملف أو صورة</button>
                </div>
                ${mode === 'paste'  ? pasteForm()  : ''}
                ${mode === 'upload' ? uploadForm() : ''}
            `;
            form.querySelectorAll('[data-mode]').forEach((b) =>
                b.addEventListener('click', () => { mode = b.dataset.mode; paint(); }));
            bindSubmit();
        }

        function pasteForm() { return `
            <div class="field">
                <label class="label">ألصق أسماء الطلاب — اسم في كل سطر</label>
                <textarea class="textarea" id="paste-names" rows="10"
                          placeholder="أحمد بن محمد&#10;سارة بنت عبدالله&#10;خالد بن فيصل"></textarea>
                <div class="field-hint">يُتجاهل الفراغ والأسطر الفارغة.</div>
            </div>
            ${footer('إضافة الطلاب')}`; }
        function uploadForm() { return `
            <div class="field">
                <label class="label">ارفع ملف الأسماء أو صورة القائمة</label>
                <input class="input" id="upload-file" type="file" accept=".csv,.txt,.pdf,image/*">
                <div class="field-hint">ملف CSV أو نصي (يُقرأ مباشرة)، أو صورة/PDF لقائمة الطلاب (يستخرجها الذكاء الاصطناعي تلقائياً).</div>
            </div>
            ${footer('إضافة الطلاب')}`; }
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
                    if (mode === 'paste') {
                        names = parseNameList(form.querySelector('#paste-names').value);
                    } else if (mode === 'upload') {
                        const file = form.querySelector('#upload-file').files[0];
                        if (!file) throw new Error('اختر ملفاً أولاً.');
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
                            const pages = await fileToImagePages(file, 20);
                            names = await global.AI.extractStudentNamesFromImage({ pages });
                        }
                    }
                    if (names.length === 0) throw new Error('لم يتم العثور على أي أسماء.');
                    for (const name of names) {
                        await global.TeacherDB.add('students', {
                            teacher_id: cls.teacher_id,
                            class_id:   cls.id,
                            name,
                            notes: ''
                        });
                    }
                    await updateClassStudentCount(cls.id);
                    global.Modal.close();
                    global.TeacherApp.toast(`تمت إضافة ${names.length} طالب ✅`, 'success');
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

        global.Modal.open({ title: 'إضافة طلاب', body: form });
    }

    let _pdfJsPromise = null;
    function ensurePdfJs() {
        if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
        if (_pdfJsPromise) return _pdfJsPromise;
        const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
        _pdfJsPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = base + 'pdf.min.js';
            s.onload = () => {
                global.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
                resolve(global.pdfjsLib);
            };
            s.onerror = () => reject(new Error('تعذّر تحميل مكتبة عرض PDF.'));
            document.head.appendChild(s);
        });
        return _pdfJsPromise;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload  = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    /** File → array of images for Claude vision. Single image returns
     *  one element; multi-page PDFs return one image per page (capped). */
    async function fileToImagePages(file, maxPages) {
        const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name);
        if (!isPdf) {
            const dataUrl = await blobToDataUrl(file);
            const [meta, b64] = dataUrl.split(',');
            const mediaType = (meta.match(/data:([^;]+)/) || [])[1] || file.type || 'image/jpeg';
            return [{ base64: b64, mediaType }];
        }
        const pdfjs = await ensurePdfJs();
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const n = Math.min(doc.numPages, maxPages || 20);
        const pages = [];
        for (let i = 1; i <= n; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            pages.push({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
            page.cleanup();
        }
        return pages;
    }

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
    async function editClass(cls, onSaved) {
        const SUBJECTS = [
            'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
            'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
            'الاجتماعيات', 'التاريخ', 'الجغرافيا',
            'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية'
        ];
        // Include the teacher's custom subjects (added via «أخرى» in البيانات)
        // plus this class's own subject, so nothing is lost when editing.
        const me = await global.Auth.currentTeacher();
        const mine = (me && Array.isArray(me.subjects)) ? me.subjects : [];
        const subjectList = Array.from(new Set(
            SUBJECTS.concat(mine).concat(cls.subject ? [cls.subject] : [])
                .filter((s) => s && s !== 'أخرى')
        ));
        const COLORS = ['#1E40AF', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#8B5CF6', '#EC4899', '#14B8A6'];
        // The picker edits the STAGE's base color — unified across its classes.
        const stageBase = await global.StageColors.get(cls.stage);
        let selectedColor = stageBase || cls.color || COLORS[0];

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
            <div class="field">
                <label class="label">لون المرحلة</label>
                <div class="color-picker">
                    ${COLORS.map((c) => `
                        <button type="button" class="color-chip ${c === selectedColor ? 'selected' : ''}"
                                style="background:${c}" data-color="${c}"></button>
                    `).join('')}
                </div>
                <div class="text-muted" style="font-size: var(--fs-xs); margin-top: 6px;">
                    اللون موحّد للمرحلة كاملة — تغييره يعيد تلوين كل فصولها بدرجات متقاربة.
                </div>
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">حفظ</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;
        form.querySelectorAll('.color-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                form.querySelectorAll('.color-chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
                selectedColor = chip.dataset.color;
            });
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            cls.section = form.querySelector('#e-section').value.trim();
            cls.subject = form.querySelector('#e-subject').value;
            cls.updated_at = new Date().toISOString();
            await global.TeacherDB.put('classes', cls);
            // Unify the whole stage on the picked base color; each class keeps
            // (or gets) its own shade of it — including this one.
            const prevBase = await global.StageColors.get(cls.stage);
            await global.StageColors.set(cls.stage, selectedColor);
            await global.StageColors.applyToStage(cls.teacher_id, cls.stage, selectedColor, prevBase);
            global.Modal.close();
            global.TeacherApp.toast('تم حفظ التعديل.', 'success');
            if (onSaved) onSaved();
        });
        global.Modal.open({ title: 'تعديل الفصل', body: form });
    }

    async function deleteClass(cls, onDone) {
        const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
        const msg = students.length > 0
            ? `سيتم حذف الفصل و ${students.length} طالب وجميع سجلاتهم. متأكد؟`
            : 'حذف الفصل؟';
        if (!global.confirm(msg)) return;
        for (const s of students) await deleteStudent(s.id);
        await global.TeacherDB.remove('classes', cls.id);
        global.TeacherApp.toast('تم حذف الفصل.', 'info');
        if (onDone) onDone();
        else global.location.hash = '#/dashboard';
    }

    /* ==========================================================================
       PRINT REGISTER MODAL
       ========================================================================== */

    /* نافذة طباعة السجل — ٣ أنواع بخيارات فرعية (بالشكل المعتمد):
       ١) الحضور والغياب: اليوم / فترة   ٢) كامل الخانات: اليوم / فترة (جدول
       مستقل لكل يوم)   ٣) مُفرّغ: حضور فقط / كل الخانات. الطباعة بالعرض دائماً. */
    function openPrintRegisterModal(cls, students, attToday, evalToday, columns) {
        const TYPES = [
            { k: 'attendance', ic: '✅', t: 'سجل الحضور والغياب', d: 'الحضور فقط — بدون خانات التقييم', sub: 'period' },
            { k: 'full', ic: '📋', t: 'سجل بكامل الخانات (معبّأ)', d: 'حضور + كل خانات التقييم بقيمها الفعلية', sub: 'period', note: 'الفترة: جدول مستقل لكل يوم' },
            { k: 'blank', ic: '🗒️', t: 'سجل مُفرّغ', d: 'فاضٍ للتعبئة باليد', sub: 'blankScope' }
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
                <button type="submit" class="btn btn-primary">🖨️ معاينة وطباعة</button>
                <button type="button" class="btn btn-secondary" id="btn-save-pdf">📄 حفظ PDF</button>
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

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const opts = await buildPrintOptions();
            if (!opts) return;
            global.Modal.close();
            global.PrintStudents.print(opts);
        });

        form.querySelector('#btn-save-pdf').addEventListener('click', async () => {
            const opts = await buildPrintOptions();
            if (!opts) return;
            global.Modal.close();
            global.PrintStudents.savePdf(opts);
        });

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
