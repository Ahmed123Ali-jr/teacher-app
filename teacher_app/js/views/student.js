/* ==========================================================================
   views/student.js — Student detail view.
   Phase 3: attendance history, grades/participation averages, notes, delete.
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    const ATTENDANCE = {
        present: { label: 'حاضر',  color: '#10B981' },
        absent:  { label: 'غائب',  color: '#EF4444' },
        late:    { label: 'متأخر', color: '#F59E0B' },
        excused: { label: 'مستأذن', color: '#3B82F6' }
    };

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function formatDate(iso) {
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'short', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }

    async function render(container, studentId) {
        const student = await global.TeacherDB.get('students', studentId);
        if (!student) {
            container.innerHTML = `
                <div class="container"><div class="empty-state">
                    <div class="icon">⚠️</div><h3>الطالب غير موجود</h3>
                    <a href="#/dashboard" class="btn btn-primary">الرئيسية</a>
                </div></div>`;
            return;
        }

        const cls = await global.TeacherDB.get('classes', student.class_id);
        const teacher = await global.Auth.currentTeacher();
        if (!cls || cls.teacher_id !== teacher.id) {
            container.innerHTML = `<div class="container"><p>غير مصرّح.</p></div>`;
            return;
        }

        const attendance    = (await global.TeacherDB.getAllByIndex('attendance', 'student_id', studentId))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const participation = (await global.TeacherDB.getAllByIndex('participation', 'student_id', studentId))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const columns = Array.isArray(cls.eval_columns) && cls.eval_columns.length
            ? cls.eval_columns
            : [];
        const stats = computeStats(attendance, participation, columns);

        container.innerHTML = `
            <div class="container">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <a href="#/class/${cls.id}" class="btn btn-ghost btn-sm">← فصل ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}</a>
                </div>

                <div class="student-header card">
                    <div class="student-avatar">${initials(student.name)}</div>
                    <div class="student-meta">
                        <h2 style="margin:0">${escapeHtml(student.name)}</h2>
                        <div class="text-muted">
                            ${STAGE_LABELS[cls.stage] || ''} — ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}
                            · ${escapeHtml(cls.subject)}
                        </div>
                    </div>
                    <div class="student-header-actions">
                        <button class="btn btn-ghost btn-sm" id="btn-edit-student">✏️ تعديل</button>
                        <button class="btn btn-ghost btn-sm" id="btn-delete-student">🗑️ حذف</button>
                    </div>
                </div>

                <div class="grid grid-4" style="margin-block: var(--space-6);">
                    ${statCard('📅', stats.totalDays, 'أيام مسجّلة')}
                    ${statCard('✅', stats.presentPct + '%', 'نسبة الحضور', 'var(--success)')}
                    ${stats.columnAverages.slice(0, 2).map((col) =>
                        statCard(col.icon, col.display, 'متوسط ' + col.name, 'var(--primary)')
                    ).join('')}
                </div>

                <div class="grid grid-2">
                    <div class="card">
                        <h3 class="card-title">📅 سجل الحضور</h3>
                        ${attendanceList(attendance)}
                    </div>

                    <div class="card">
                        <h3 class="card-title">📝 الملاحظات</h3>
                        <textarea class="textarea" id="student-notes" rows="5"
                                  placeholder="ملاحظات خاصة بالطالب...">${escapeHtml(student.notes || '')}</textarea>
                        <button class="btn btn-primary btn-sm" id="btn-save-notes"
                                style="margin-top: var(--space-3);">💾 حفظ الملاحظات</button>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#btn-delete-student')?.addEventListener('click', async () => {
            if (!global.confirm(`حذف الطالب "${student.name}" مع كل بياناته؟`)) return;
            await deleteStudent(studentId);
            await updateClassCount(cls.id);
            global.TeacherApp.toast('تم الحذف.', 'info');
            global.location.hash = '#/class/' + cls.id;
        });

        container.querySelector('#btn-edit-student')?.addEventListener('click', () => {
            editStudentName(student, container);
        });

        container.querySelector('#btn-save-notes')?.addEventListener('click', async () => {
            const btn = container.querySelector('#btn-save-notes');
            const origLabel = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ جارٍ الحفظ...';
            try {
                student.notes = container.querySelector('#student-notes').value.trim();
                student.updated_at = new Date().toISOString();
                await global.TeacherDB.put('students', student);
                global.TeacherApp.toast('تم حفظ الملاحظات ✅', 'success', 1500);
                // Send the teacher back to the class page (the natural "home"
                // for student records) once the save lands.
                global.location.hash = '#/class/' + cls.id;
            } catch (err) {
                console.error('[student] save notes failed:', err);
                global.TeacherApp.toast('تعذّر الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error', 5000);
                btn.disabled = false;
                btn.textContent = origLabel;
            }
        });
    }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return (parts[0] || '').charAt(0) + (parts[1] || '').charAt(0);
    }

    function statCard(icon, value, label, color) {
        return `
            <div class="card stat-card">
                <div class="stat-icon">${icon}</div>
                <div class="stat-value num" ${color ? `style="color:${color}"` : ''}>${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    }

    function readValues(row) {
        if (row && row.values && typeof row.values === 'object') return row.values;
        const v = {};
        if (row && typeof row.rating === 'number' && row.rating > 0) v.participation = row.rating;
        if (row && typeof row.grade  === 'number')                  v.grade         = row.grade;
        return v;
    }

    function computeStats(attendance, participation, columns) {
        const totalDays  = attendance.length;
        const present    = attendance.filter((r) => r.status === 'present' || r.status === 'late').length;
        const presentPct = totalDays === 0 ? 0 : Math.round(present / totalDays * 100);

        const columnAverages = columns.map((col) => {
            const values = participation
                .map((r) => readValues(r)[col.id])
                .filter((v) => typeof v === 'number');
            const avg = values.length === 0 ? null :
                values.reduce((a, b) => a + b, 0) / values.length;

            let icon = '📊';
            if (col.type === 'stars') icon = '⭐';
            else if (col.type === 'check') icon = '✓';
            else if (col.type === 'tri')   icon = '△';

            const display = avg == null ? '—'
                          : col.type === 'check' ? Math.round(avg * 100) + '%'
                          : avg.toFixed(1);

            return { id: col.id, name: col.name, icon, display };
        });

        return { totalDays, presentPct, columnAverages };
    }

    function attendanceList(rows) {
        if (rows.length === 0) {
            return `<p class="text-muted">لا يوجد سجل حضور بعد.</p>`;
        }
        return `
            <div class="att-history">
                ${rows.slice(0, 30).map((r) => {
                    const meta = ATTENDANCE[r.status] || ATTENDANCE.absent;
                    return `
                        <div class="att-history-row">
                            <span class="att-dot" style="background:${meta.color}"></span>
                            <span>${formatDate(r.date)}</span>
                            <span class="text-muted">${meta.label}</span>
                        </div>
                    `;
                }).join('')}
                ${rows.length > 30 ? `<p class="text-muted" style="margin-top:var(--space-2);">... و ${rows.length - 30} سجل أقدم</p>` : ''}
            </div>
        `;
    }

    function editStudentName(student, container) {
        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">اسم الطالب</label>
                <input class="input" id="e-student-name" type="text" required
                       value="${escapeHtml(student.name)}">
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">حفظ</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            student.name = form.querySelector('#e-student-name').value.trim();
            student.updated_at = new Date().toISOString();
            await global.TeacherDB.put('students', student);
            global.Modal.close();
            global.TeacherApp.toast('تم التعديل.', 'success');
            render(container, student.id);
        });
        global.Modal.open({ title: 'تعديل اسم الطالب', body: form });
    }

    async function deleteStudent(studentId) {
        await global.TeacherDB.remove('students', studentId);
        const att = await global.TeacherDB.getAllByIndex('attendance', 'student_id', studentId);
        for (const r of att) await global.TeacherDB.remove('attendance', r.id);
        const par = await global.TeacherDB.getAllByIndex('participation', 'student_id', studentId);
        for (const r of par) await global.TeacherDB.remove('participation', r.id);
    }

    async function updateClassCount(classId) {
        const cls = await global.TeacherDB.get('classes', classId);
        if (!cls) return;
        const list = await global.TeacherDB.getAllByIndex('students', 'class_id', classId);
        cls.student_count = list.length;
        await global.TeacherDB.put('classes', cls);
    }

    global.StudentView = { render };
})(window);
