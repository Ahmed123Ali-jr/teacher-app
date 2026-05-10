/* ==========================================================================
   views/class.js — Class screen with 5 tabs.
   Phase 3: Students tab — dynamic evaluation columns + Arabic-digit input.
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    const TABS = [
        { key: 'students',   label: 'الطلاب',       icon: '👥' },
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

    const state = { classId: null, activeTab: 'students' };

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

    async function render(container, classId) {
        state.classId = classId;

        const cls = await global.TeacherDB.get('classes', classId);
        if (!cls) {
            container.innerHTML = `
                <div class="container"><div class="empty-state">
                    <div class="icon">⚠️</div>
                    <h3>لم يتم العثور على الفصل</h3>
                    <a href="#/dashboard" class="btn btn-primary">الرجوع للرئيسية</a>
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

        paint(container, cls);
    }

    async function paint(container, cls) {
        container.innerHTML = `
            <div class="container">
                <div class="class-topbar">
                    <div>
                        <button type="button" id="btn-class-back" class="btn btn-ghost btn-sm">← الفصول</button>
                        <h2 class="class-title">
                            <span class="class-dot" style="background:${cls.color || '#1E40AF'}"></span>
                            ${STAGE_LABELS[cls.stage] || ''} — ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}
                        </h2>
                        <div class="class-subtitle">${escapeHtml(cls.subject)}</div>
                    </div>
                    <div class="class-actions">
                        <button class="btn btn-ghost btn-sm" id="btn-edit-class">✏️ تعديل</button>
                        <button class="btn btn-ghost btn-sm" id="btn-delete-class">🗑️ حذف</button>
                    </div>
                </div>

                <nav class="tab-bar" role="tablist">
                    ${TABS.map((t) => `
                        <button class="tab ${state.activeTab === t.key ? 'active' : ''}"
                                data-tab="${t.key}" role="tab">
                            <span class="tab-icon">${t.icon}</span>
                            <span>${t.label}</span>
                        </button>
                    `).join('')}
                </nav>

                <div class="tab-panel" id="tab-panel"></div>
            </div>
        `;

        container.querySelectorAll('.tab').forEach((el) => {
            el.addEventListener('click', () => {
                state.activeTab = el.dataset.tab;
                paint(container, cls);
            });
        });

        container.querySelector('#btn-class-back')?.addEventListener('click', () => {
            if (global.history.length > 1) global.history.back();
            else global.location.hash = '#/classes';
        });
        container.querySelector('#btn-edit-class')?.addEventListener('click', () => editClass(cls, container));
        container.querySelector('#btn-delete-class')?.addEventListener('click', () => deleteClass(cls));

        renderTab(container, cls);
    }

    async function renderTab(container, cls) {
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

    async function renderStudents(panel, cls) {
        // Wait for any in-flight saves to land in the cache before reading,
        // otherwise the table can paint with stale data.
        await flushWrites();
        const columns = ensureColumns(cls);
        const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
        students.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

        const today = todayISO();
        const attendanceToday = [];
        const evalToday = [];
        for (const s of students) {
            const att = await global.TeacherDB.getAllByIndex('attendance', 'student_id', s.id);
            const par = await global.TeacherDB.getAllByIndex('participation', 'student_id', s.id);
            attendanceToday.push(att.find((r) => r.date === today) || null);
            evalToday.push(par.find((r) => r.date === today) || null);
        }

        // Preserve horizontal scroll of the table + page scroll across re-renders
        // so tapping a star/number doesn't snap the view back to the start.
        const prevWrapper    = panel.querySelector('.table-wrapper');
        const prevScrollLeft = prevWrapper ? prevWrapper.scrollLeft : null;
        const prevWinScrollY = global.scrollY;
        const prevSearch     = panel.querySelector('#student-search')?.value || '';

        panel.innerHTML = `
            <div class="students-toolbar">
                <div class="students-meta">
                    <strong class="num">${students.length}</strong> طالب
                    <span class="text-muted" style="margin-right:var(--space-3);">
                        📅 ${todayHuman()}
                    </span>
                </div>
                <div class="students-actions">
                    <input type="search" class="input search-input" id="student-search"
                           placeholder="🔍 بحث باسم الطالب...">
                    <button class="btn btn-ghost" id="btn-print-students" ${students.length === 0 ? 'disabled' : ''}>🖨️ طباعة السجل</button>
                    <button class="btn btn-secondary" id="btn-manage-columns">⚙️ إدارة الخانات</button>
                    <button class="btn btn-primary" id="btn-add-students">+ إضافة طلاب</button>
                </div>
            </div>

            ${students.length === 0 ? emptyStudentsState() : studentsTable(students, attendanceToday, evalToday, columns)}
        `;

        panel.querySelector('#btn-add-students')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openAddStudentsModal(cls));
        panel.querySelector('#btn-manage-columns')?.addEventListener('click', () => openColumnManager(cls, panel));
        panel.querySelector('#btn-print-students')?.addEventListener('click', () =>
            openPrintRegisterModal(cls, students, attendanceToday, evalToday, columns));

        const search = panel.querySelector('#student-search');
        if (search) search.addEventListener('input', (e) => {
            const q = e.target.value.trim();
            panel.querySelectorAll('.st-row').forEach((row) => {
                const name = row.dataset.name || '';
                row.style.display = (q === '' || name.includes(q)) ? '' : 'none';
            });
        });

        panel.querySelectorAll('.st-name-link').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                global.location.hash = '#/student/' + el.dataset.id;
            });
        });

        panel.querySelectorAll('[data-att-btn]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sid = btn.dataset.sid;
                await setAttendance(cls, sid, today, btn.dataset.status);
                await renderStudents(panel, cls);
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

        // Restore scroll + search that were lost by innerHTML replacement
        const newWrapper = panel.querySelector('.table-wrapper');
        if (newWrapper && prevScrollLeft !== null) {
            newWrapper.scrollLeft = prevScrollLeft;
        }
        if (newWrapper) attachSlowScroll(newWrapper);
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
                <p>أضف طلاب هذا الفصل يدوياً أو ألصق قائمة، أو ارفع ملف CSV.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة طلاب</button>
            </div>
        `;
    }

    /** Slow down touch-drag scrolling inside the register so the teacher
     *  can land precisely on a student row / column. We multiply the
     *  finger delta by SCROLL_SPEED — 0.9 ≈ 10 % slower than native. */
    const SCROLL_SPEED = 0.9;
    function attachSlowScroll(el) {
        if (el.dataset.slowAttached) return;
        el.dataset.slowAttached = '1';
        let lastX = 0, lastY = 0, active = false;
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) { active = false; return; }
            active = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
        }, { passive: true });
        el.addEventListener('touchmove', (e) => {
            if (!active || e.touches.length !== 1) return;
            const t = e.touches[0];
            const dx = (lastX - t.clientX) * SCROLL_SPEED;
            const dy = (lastY - t.clientY) * SCROLL_SPEED;
            lastX = t.clientX;
            lastY = t.clientY;
            el.scrollLeft += dx;
            el.scrollTop  += dy;
            e.preventDefault();
        }, { passive: false });
        el.addEventListener('touchend',    () => { active = false; });
        el.addEventListener('touchcancel', () => { active = false; });
    }

    function studentsTable(students, attToday, evalToday, columns) {
        const rows = students.map((s, i) => {
            const att = attToday[i];
            const values = readValues(evalToday[i]);
            const cells = columns.map((col) => `<td class="st-col">${renderCell(s.id, col, values[col.id])}</td>`).join('');

            return `
                <tr class="st-row" data-name="${escapeHtml(s.name)}">
                    <td class="st-num num">${i + 1}</td>
                    <td class="st-name">
                        <a href="#/student/${s.id}" class="st-name-link" data-id="${s.id}">
                            ${escapeHtml(s.name)}
                        </a>
                    </td>
                    <td class="st-att">${attendanceButtons(s.id, att)}</td>
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
                <table class="students-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الاسم</th>
                            <th>الحضور اليوم</th>
                            ${columns.map((c) => `<th>${escapeHtml(c.name)}${c.type === 'number' ? ` <span class="text-muted" style="font-weight:normal;">(من ${c.max})</span>` : ''}</th>`).join('')}
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p class="text-muted" style="margin-top: var(--space-3); font-size: var(--fs-sm);">
                اضغط أيقونة الحضور للتبديل. اضغط على اسم الطالب لعرض تفاصيله.
                يمكنك كتابة الأرقام بالعربية (٠-٩) أو الإنجليزية.
            </p>
        `;
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

    function openColumnManager(cls, panel) {
        const columns = ensureColumns(cls).map((c) => ({ ...c }));

        const form = document.createElement('div');

        function paintList() {
            form.innerHTML = `
                <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                    أضف أو احذف خانات التقييم التي تناسب طريقتك. التغييرات تحفظ فوراً عند الضغط على "تم".
                </p>
                <div class="columns-list" id="columns-list">
                    ${columns.length === 0
                        ? '<p class="text-muted">لا توجد خانات — أضف واحدة أدناه.</p>'
                        : columns.map((c, i) => columnRow(c, i)).join('')}
                </div>

                <button type="button" class="btn btn-secondary btn-sm" id="btn-add-col"
                        style="margin-top: var(--space-4);">
                    + إضافة خانة جديدة
                </button>

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

            form.querySelector('#btn-add-col')?.addEventListener('click', () => {
                columns.push({
                    id: genColId(),
                    name: 'خانة جديدة',
                    type: 'number',
                    max: COLUMN_TYPES.number.default_max
                });
                paintList();
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
        global.Modal.open({ title: '⚙️ إدارة خانات التقييم', body: form });
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
                    <button class="chip ${mode === 'manual' ? 'active' : ''}" data-mode="manual">✏️ إدخال واحد</button>
                    <button class="chip ${mode === 'csv'    ? 'active' : ''}" data-mode="csv">📄 ملف CSV</button>
                    <button class="chip ${mode === 'image'  ? 'active' : ''}" data-mode="image">📷 PDF/صورة (AI)</button>
                </div>
                ${mode === 'paste'  ? pasteForm()  : ''}
                ${mode === 'manual' ? manualForm() : ''}
                ${mode === 'csv'    ? csvForm()    : ''}
                ${mode === 'image'  ? imageForm()  : ''}
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
        function manualForm() { return `
            <div class="field">
                <label class="label">اسم الطالب</label>
                <input class="input" id="manual-name" type="text" required placeholder="أحمد بن محمد">
            </div>
            ${footer('إضافة')}`; }
        function csvForm() { return `
            <div class="field">
                <label class="label">ملف CSV أو نصي (.csv / .txt)</label>
                <input class="input" id="csv-file" type="file" accept=".csv,.txt">
                <div class="field-hint">عمود واحد للأسماء. أول صف يُتجاهل تلقائياً إذا كان عنواناً.</div>
            </div>
            ${footer('استيراد')}`; }
        function imageForm() { return `
            <div class="field">
                <label class="label">صورة أو ملف PDF لقائمة الطلاب</label>
                <input class="input" id="image-file" type="file" accept=".pdf,image/*">
                <div class="field-hint">سيقرأها الذكاء الاصطناعي ويستخرج الأسماء تلقائياً.</div>
            </div>
            ${footer('استخراج وإضافة')}`; }
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
                    if (mode === 'paste') names = parseNameList(form.querySelector('#paste-names').value);
                    else if (mode === 'manual') {
                        const v = form.querySelector('#manual-name').value.trim();
                        if (v) names = [v];
                    } else if (mode === 'csv') {
                        const file = form.querySelector('#csv-file').files[0];
                        if (!file) throw new Error('اختر ملفاً أولاً.');
                        names = parseCSV(await file.text());
                    } else if (mode === 'image') {
                        const file = form.querySelector('#image-file').files[0];
                        if (!file) throw new Error('اختر ملفاً أولاً.');
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

    function editClass(cls, container) {
        const SUBJECTS = [
            'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
            'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
            'الاجتماعيات', 'التاريخ', 'الجغرافيا',
            'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
        ];
        const COLORS = ['#1E40AF', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#8B5CF6', '#EC4899', '#14B8A6'];
        let selectedColor = cls.color || COLORS[0];

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
                    ${SUBJECTS.map((s) => `<option value="${s}" ${s === cls.subject ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="field">
                <label class="label">اللون</label>
                <div class="color-picker">
                    ${COLORS.map((c) => `
                        <button type="button" class="color-chip ${c === selectedColor ? 'selected' : ''}"
                                style="background:${c}" data-color="${c}"></button>
                    `).join('')}
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
            cls.color   = selectedColor;
            cls.updated_at = new Date().toISOString();
            await global.TeacherDB.put('classes', cls);
            global.Modal.close();
            global.TeacherApp.toast('تم حفظ التعديل.', 'success');
            paint(container, cls);
        });
        global.Modal.open({ title: 'تعديل الفصل', body: form });
    }

    async function deleteClass(cls) {
        const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
        const msg = students.length > 0
            ? `سيتم حذف الفصل و ${students.length} طالب وجميع سجلاتهم. متأكد؟`
            : 'حذف الفصل؟';
        if (!global.confirm(msg)) return;
        for (const s of students) await deleteStudent(s.id);
        await global.TeacherDB.remove('classes', cls.id);
        global.TeacherApp.toast('تم حذف الفصل.', 'info');
        global.location.hash = '#/dashboard';
    }

    /* ==========================================================================
       PRINT REGISTER MODAL
       ========================================================================== */

    function openPrintRegisterModal(cls, students, attToday, evalToday, columns) {
        const form = document.createElement('form');
        form.innerHTML = `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-bottom: var(--space-4);">
                ${students.length} طالب في "${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}"
            </p>

            <div class="field">
                <label class="label">نوع السجل</label>
                <div class="print-mode-list">
                    <label class="print-mode-option">
                        <input type="radio" name="mode" value="blank" checked>
                        <div>
                            <strong>سجل فارغ</strong>
                            <div class="text-muted" style="font-size: var(--fs-sm);">
                                قائمة بأسماء الطلاب + أعمدة فارغة للتعبئة يدوياً.
                            </div>
                        </div>
                    </label>
                    <label class="print-mode-option">
                        <input type="radio" name="mode" value="today">
                        <div>
                            <strong>سجل اليوم (معبّأ)</strong>
                            <div class="text-muted" style="font-size: var(--fs-sm);">
                                حضور اليوم والتقييمات كما أُدخلت الآن.
                            </div>
                        </div>
                    </label>
                    <label class="print-mode-option">
                        <input type="radio" name="mode" value="range">
                        <div>
                            <strong>سجل حضور لفترة</strong>
                            <div class="text-muted" style="font-size: var(--fs-sm);">
                                أيام كأعمدة + مجاميع الحضور والغياب.
                            </div>
                        </div>
                    </label>
                    <label class="print-mode-option">
                        <input type="radio" name="mode" value="summary">
                        <div>
                            <strong>تقرير مجمّع لفترة</strong>
                            <div class="text-muted" style="font-size: var(--fs-sm);">
                                ملخّص حضور + متوسط كل تقييم لكل طالب على فترة.
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <div id="range-options" hidden>
                <div class="grid grid-2">
                    <div class="field">
                        <label class="label">من تاريخ</label>
                        <input class="input" id="range-from" type="date" value="${isoDaysAgo(13)}">
                    </div>
                    <div class="field">
                        <label class="label">إلى تاريخ</label>
                        <input class="input" id="range-to" type="date" value="${todayISO()}">
                    </div>
                </div>
                <label class="cb-row" style="margin-top: var(--space-2);">
                    <input type="checkbox" id="range-include-evals">
                    <span>إضافة أعمدة التقييم فارغة في نهاية الجدول</span>
                </label>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">🖨️ معاينة وطباعة</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        const rangeBox = form.querySelector('#range-options');
        form.querySelectorAll('input[name="mode"]').forEach((r) => {
            r.addEventListener('change', () => {
                const needsRange = (r.value === 'range' || r.value === 'summary');
                rangeBox.hidden = !needsRange;
            });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = form.querySelector('input[name="mode"]:checked').value;
            const teacher = await global.Auth.currentTeacher();

            if (mode === 'range' || mode === 'summary') {
                const from = form.querySelector('#range-from').value;
                const to   = form.querySelector('#range-to').value;
                if (!from || !to || from > to) {
                    return global.TeacherApp.toast('اختر نطاق تاريخ صحيح.', 'warning');
                }

                // Collect both attendance and participation in the date window
                const attendanceAll    = [];
                const participationAll = [];
                for (const s of students) {
                    const att = await global.TeacherDB.getAllByIndex('attendance', 'student_id', s.id);
                    for (const r of att) if (r.date >= from && r.date <= to) attendanceAll.push(r);
                    const par = await global.TeacherDB.getAllByIndex('participation', 'student_id', s.id);
                    for (const r of par) if (r.date >= from && r.date <= to) participationAll.push(r);
                }

                global.Modal.close();
                global.PrintStudents.print({
                    mode, cls, teacher, students, columns,
                    dates: mode === 'range' ? expandDates(from, to) : null,
                    from, to,
                    attendance:    attendanceAll,
                    participation: participationAll,
                    includeEvals:  form.querySelector('#range-include-evals').checked
                });
                return;
            }

            global.Modal.close();
            global.PrintStudents.print({
                mode, cls, teacher, students, columns,
                attendance: attToday.filter(Boolean),
                participation: evalToday.filter(Boolean)
            });
        });

        global.Modal.open({ title: '🖨️ طباعة سجل الطلاب', body: form });
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

    global.ClassView = { render };
})(window);
