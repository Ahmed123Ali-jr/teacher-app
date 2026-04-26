/* ==========================================================================
   views/reports.js — Analytics & reports drawn from existing data.
   Attendance rates, top/low students, content production, per-class breakdown.
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function readValues(row) {
        if (row && row.values && typeof row.values === 'object') return row.values;
        const v = {};
        if (row && typeof row.rating === 'number' && row.rating > 0) v.participation = row.rating;
        if (row && typeof row.grade  === 'number')                  v.grade         = row.grade;
        return v;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        container.innerHTML = `
            <div class="container">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <div>
                        <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
                        <h2 class="section-title" style="display:inline-block; margin-right:var(--space-3);">
                            📊 التقارير
                        </h2>
                    </div>
                    <button class="btn btn-primary" id="btn-print-reports">🖨️ طباعة التقرير</button>
                </div>
                <div class="text-muted" style="padding: var(--space-6); text-align: center;">
                    ⏳ جارٍ حساب الإحصائيات...
                </div>
            </div>
        `;

        const data = await collectStats(teacher);

        container.querySelector('.container').innerHTML = `
            <div class="section-header" style="margin-top: var(--space-6);">
                <div>
                    <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
                    <h2 class="section-title" style="display:inline-block; margin-right:var(--space-3);">
                        📊 التقارير
                    </h2>
                </div>
                <button class="btn btn-primary" id="btn-print-reports">🖨️ طباعة التقرير</button>
            </div>

            ${data.totals.classes === 0 ? emptyView() : `
                ${overviewSection(data)}
                ${attendanceSection(data)}
                ${performanceSection(data)}
                ${topRatedSection(data)}
                ${productionSection(data)}
                ${perClassSection(data)}
            `}
        `;

        container.querySelector('#btn-print-reports')?.addEventListener('click', () => {
            global.print();
        });
    }

    function emptyView() {
        return `
            <div class="empty-state" style="margin-top: var(--space-6);">
                <div class="icon">📊</div>
                <h3>لا توجد بيانات للعرض بعد</h3>
                <p>أضف فصلاً وطلاباً، وسجّل الحضور والدرجات — ثم ستظهر تقارير تفصيلية هنا.</p>
            </div>
        `;
    }

    /* ==========================================================================
       DATA COLLECTION
       ========================================================================== */

    async function collectStats(teacher) {
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);

        // Per-class aggregates
        const perClass = [];
        let totalStudents = 0;
        let totalAttendance = { present: 0, absent: 0, late: 0, excused: 0 };
        let totalExams = 0, totalWorksheets = 0, totalHomework = 0;

        for (const cls of classes) {
            const students = await global.TeacherDB.getAllByIndex('students', 'class_id', cls.id);
            totalStudents += students.length;

            // Attendance summary
            const att = { present: 0, absent: 0, late: 0, excused: 0 };
            const byStudent = new Map(); // student_id → {present, absent, late, excused}
            for (const s of students) {
                const rows = await global.TeacherDB.getAllByIndex('attendance', 'student_id', s.id);
                const perS = { present: 0, absent: 0, late: 0, excused: 0 };
                for (const r of rows) {
                    if (att[r.status] !== undefined) att[r.status]++;
                    if (perS[r.status] !== undefined) perS[r.status]++;
                }
                byStudent.set(s.id, perS);
            }
            totalAttendance.present += att.present;
            totalAttendance.absent  += att.absent;
            totalAttendance.late    += att.late;
            totalAttendance.excused += att.excused;

            // Evaluation averages per column + a normalized 0-100% score per
            // student so we can rank top-rated students across mixed col types.
            const columns = Array.isArray(cls.eval_columns) ? cls.eval_columns : [];
            const colMap  = Object.fromEntries(columns.map((c) => [c.id, c]));
            const colStats = columns.map((c) => ({ col: c, sum: 0, count: 0 }));
            const studentScore = new Map(); // student_id → normalized % (0-100)

            for (const s of students) {
                const rows = await global.TeacherDB.getAllByIndex('participation', 'student_id', s.id);
                let normSum = 0, normCount = 0;
                for (const r of rows) {
                    const vals = readValues(r);
                    for (const cs of colStats) {
                        const v = vals[cs.col.id];
                        if (typeof v === 'number') {
                            cs.sum += v; cs.count++;
                        }
                    }
                    for (const [colId, v] of Object.entries(vals)) {
                        if (typeof v !== 'number') continue;
                        const col = colMap[colId];
                        if (!col) continue;
                        const max = Number(col.max) || 1;
                        if (max <= 0) continue;
                        normSum += Math.max(0, Math.min(1, v / max));
                        normCount++;
                    }
                }
                studentScore.set(s.id, normCount > 0 ? (normSum / normCount) * 100 : null);
            }

            // Top/low students by attendance rate.
            const studentsWithRate = students.map((s) => {
                const a = byStudent.get(s.id) || { present: 0, absent: 0, late: 0, excused: 0 };
                const considered = a.present + a.absent + a.late;  // excused excluded
                const rate = considered === 0 ? null : Math.round(((a.present + a.late) / considered) * 100);
                return {
                    student: s, attended: a, total: considered, rate,
                    score: studentScore.get(s.id)
                };
            });

            // Content from this class
            const examsList     = await global.TeacherDB.getAllByIndex('exams',       'class_id', cls.id);
            const worksheetsList= await global.TeacherDB.getAllByIndex('worksheets',  'class_id', cls.id);
            const homeworkList  = await global.TeacherDB.getAllByIndex('assignments', 'class_id', cls.id);

            totalExams += examsList.length;
            totalWorksheets += worksheetsList.length;
            totalHomework += homeworkList.length;

            perClass.push({
                cls, students, att, colStats, studentsWithRate,
                examsCount: examsList.length,
                worksheetsCount: worksheetsList.length,
                homeworkCount: homeworkList.length
            });
        }

        // Teacher activity (portfolio items)
        const strategies = await global.TeacherDB.getAllByIndex('strategies', 'teacher_id', teacher.id);
        const initiatives= await global.TeacherDB.getAllByIndex('initiatives','teacher_id', teacher.id);

        // Global attendance rate — excused excluded from denominator.
        const attConsidered = totalAttendance.present + totalAttendance.absent + totalAttendance.late;
        const attTotal = attConsidered + totalAttendance.excused;
        const attendanceRate = attConsidered === 0 ? null
            : Math.round(((totalAttendance.present + totalAttendance.late) / attConsidered) * 100);

        return {
            teacher,
            totals: {
                classes: classes.length,
                students: totalStudents,
                exams: totalExams,
                worksheets: totalWorksheets,
                homework: totalHomework,
                strategies: strategies.length,
                initiatives: initiatives.length,
                attendance: totalAttendance,
                attTotal,
                attendanceRate
            },
            perClass
        };
    }

    /* ==========================================================================
       SECTION RENDERERS
       ========================================================================== */

    function overviewSection(data) {
        const t = data.totals;
        return `
            <div class="dashboard-section">
                <h3 class="section-title">📌 نظرة عامة</h3>
                <div class="grid grid-4">
                    ${statTile('📚', t.classes, 'فصول')}
                    ${statTile('👥', t.students, 'طلاب')}
                    ${statTile('📝', t.exams + t.worksheets + t.homework, 'محتوى أُنتج')}
                    ${statTile('✅', t.attendanceRate == null ? '—' : t.attendanceRate + '%', 'نسبة الحضور العامة', 'var(--success)')}
                </div>
            </div>
        `;
    }

    function statTile(icon, value, label, color) {
        return `
            <div class="card stat-card">
                <div class="stat-icon">${icon}</div>
                <div class="stat-value num" ${color ? `style="color:${color}"` : ''}>${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    }

    function attendanceSection(data) {
        const a = data.totals.attendance;
        const total = data.totals.attTotal;
        if (total === 0) return '';

        const rows = [
            { key: 'present', label: 'حاضر', color: '#10B981', count: a.present },
            { key: 'late',    label: 'متأخر', color: '#F59E0B', count: a.late },
            { key: 'excused', label: 'مستأذن', color: '#3B82F6', count: a.excused },
            { key: 'absent',  label: 'غائب',  color: '#EF4444', count: a.absent }
        ];

        return `
            <div class="dashboard-section">
                <h3 class="section-title">📅 توزيع الحضور</h3>
                <div class="card">
                    <div class="stacked-bar">
                        ${rows.map((r) => `
                            <div class="sb-seg"
                                 style="width: ${total ? (r.count / total * 100) : 0}%; background: ${r.color};"
                                 title="${r.label}: ${r.count}"></div>
                        `).join('')}
                    </div>
                    <div class="legend-grid" style="margin-top: var(--space-4);">
                        ${rows.map((r) => `
                            <div class="legend-item">
                                <span class="legend-dot" style="background: ${r.color};"></span>
                                <span>${r.label}</span>
                                <strong class="num">${r.count}</strong>
                                <span class="text-muted">(${total ? Math.round(r.count / total * 100) : 0}%)</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function performanceSection(data) {
        // Top 5 & lowest 5 students by attendance rate, across all classes
        const all = [];
        data.perClass.forEach((p) => {
            p.studentsWithRate.forEach((s) => {
                if (s.rate != null) all.push({ ...s, class: p.cls });
            });
        });
        if (all.length === 0) return '';

        // Top = students with rate >= 90% (committed), sorted descending.
        const top = all
            .filter((s) => s.rate >= 90)
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 5);

        // Low = only students who have at least one real absence, sorted ascending by rate.
        const low = all
            .filter((s) => (s.attended?.absent || 0) > 0)
            .sort((a, b) => a.rate - b.rate)
            .slice(0, 5);

        return `
            <div class="dashboard-section">
                <h3 class="section-title">🏆 الطلاب الأبرز</h3>
                <div class="grid grid-2">
                    <div class="card">
                        <h4 style="color: var(--success); margin-top:0;">🌟 الأعلى التزاماً بالحضور</h4>
                        ${studentsMini(top, 'success')}
                    </div>
                    <div class="card">
                        <h4 style="color: var(--danger); margin-top:0;">⚠️ أكثر الطلاب تغيّباً</h4>
                        ${studentsMini(low, 'danger')}
                    </div>
                </div>
            </div>
        `;
    }

    function studentsMini(list, tone) {
        if (list.length === 0) {
            const msg = tone === 'success'
                ? 'لا يوجد طلاب بنسبة حضور ٩٠٪ فأكثر بعد.'
                : 'ممتاز! لا يوجد طلاب متغيّبون.';
            return `<p class="text-muted">${msg}</p>`;
        }
        return `
            <div class="mini-list">
                ${list.map((s) => {
                    const isLow = tone !== 'success';
                    const pct   = isLow ? (100 - s.rate) : s.rate;
                    const color = isLow ? 'var(--danger)' : 'var(--success)';
                    const absCount = (s.attended?.absent || 0);
                    const sub = isLow
                        ? `${absCount} غياب`
                        : `${s.attended?.present + s.attended?.late || 0} حضور`;
                    return `
                        <div class="mini-row">
                            <a href="#/student/${s.student.id}" class="mini-name">${escapeHtml(s.student.name)}</a>
                            <span class="text-muted" style="font-size: var(--fs-xs);">
                                ${escapeHtml(s.class.grade)} / ${escapeHtml(s.class.section)} · ${sub}
                            </span>
                            <span class="mini-rate num" style="color: ${color};">
                                ${pct}%
                            </span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function topRatedSection(data) {
        // Collect students that have at least one numeric evaluation
        const all = [];
        data.perClass.forEach((p) => {
            p.studentsWithRate.forEach((s) => {
                if (typeof s.score === 'number') all.push({ ...s, class: p.cls });
            });
        });
        if (all.length === 0) return '';

        const top = all.slice().sort((a, b) => b.score - a.score).slice(0, 5);

        return `
            <div class="dashboard-section">
                <h3 class="section-title">🌟 الطلاب المتميّزون</h3>
                <div class="card">
                    <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                        أعلى ٥ طلاب في متوسّط التقييمات (محسوب كنسبة مئوية موحّدة
                        بين جميع أنواع الخانات: النجوم، الأرقام، العلامات، المتدرّج).
                    </p>
                    <div class="mini-list">
                        ${top.map((s, i) => `
                            <div class="mini-row">
                                <span style="color: ${['#F59E0B','#94A3B8','#B45309','var(--text-muted)','var(--text-muted)'][i]}; font-weight: var(--fw-bold); min-width: 22px;">
                                    ${['🥇','🥈','🥉','4.','5.'][i]}
                                </span>
                                <a href="#/student/${s.student.id}" class="mini-name">${escapeHtml(s.student.name)}</a>
                                <span class="text-muted" style="font-size: var(--fs-xs);">
                                    ${escapeHtml(s.class.grade)} / ${escapeHtml(s.class.section)}
                                </span>
                                <span class="mini-rate num" style="color: var(--primary);">
                                    ${Math.round(s.score)}%
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function productionSection(data) {
        const t = data.totals;
        const items = [
            { icon: '📝', label: 'اختبارات', value: t.exams },
            { icon: '📄', label: 'أوراق عمل', value: t.worksheets },
            { icon: '📚', label: 'واجبات', value: t.homework },
            { icon: '🎯', label: 'استراتيجيات', value: t.strategies },
            { icon: '🌟', label: 'مبادرات', value: t.initiatives }
        ];
        return `
            <div class="dashboard-section">
                <h3 class="section-title">🧑‍🏫 إنتاجي</h3>
                <div class="grid grid-4">
                    ${items.map((it) => `
                        <div class="card stat-card">
                            <div class="stat-icon">${it.icon}</div>
                            <div class="stat-value num">${it.value}</div>
                            <div class="stat-label">${it.label}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function perClassSection(data) {
        if (data.perClass.length === 0) return '';
        return `
            <div class="dashboard-section">
                <h3 class="section-title">📚 تفصيل لكل فصل</h3>
                <div class="table-wrapper">
                    <table class="students-table">
                        <thead>
                            <tr>
                                <th>الفصل</th>
                                <th>المادة</th>
                                <th>الطلاب</th>
                                <th>نسبة الحضور</th>
                                <th>اختبارات</th>
                                <th>أوراق</th>
                                <th>واجبات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.perClass.map((p) => {
                                const considered = p.att.present + p.att.absent + p.att.late;
                                const rate = considered === 0 ? '—' :
                                    Math.round(((p.att.present + p.att.late) / considered) * 100) + '%';
                                return `
                                    <tr>
                                        <td>
                                            <a href="#/class/${p.cls.id}" class="st-name-link">
                                                ${STAGE_LABELS[p.cls.stage] || ''} — ${escapeHtml(p.cls.grade)} / ${escapeHtml(p.cls.section)}
                                            </a>
                                        </td>
                                        <td>${escapeHtml(p.cls.subject)}</td>
                                        <td class="num">${p.students.length}</td>
                                        <td class="num" style="color: var(--success); font-weight: var(--fw-bold);">${rate}</td>
                                        <td class="num">${p.examsCount}</td>
                                        <td class="num">${p.worksheetsCount}</td>
                                        <td class="num">${p.homeworkCount}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    global.ReportsView = { render };
})(window);
