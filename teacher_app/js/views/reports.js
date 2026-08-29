/* ==========================================================================
   views/reports.js — التقارير: أرقامٌ مستخرجةٌ ممّا سجّله المعلّم.

   البنيةُ «جوابٌ ثمّ دليلُه»: المعلّم يفتح هذه الشاشة ليسأل سؤالاً
   واحداً — «كيف حالي؟» — فتُجيبه نسبةُ الحضور كبيرةً في صدر الشاشة، وكلُّ
   ما تحتها شرحٌ لها. ولا تُصفّ النسبةُ مع «عدد فصولك»: الرقمُ الذي يقول
   إن كان عندك مشكلةٌ لا يُسوّى بعددٍ لا يقول شيئاً.
   (اختاره المعلّم — الشكل «ب» من معاينة rep.html، ٢٩ أغسطس ٢٠٢٦.)

   والأشرطةُ تُقاس بالعين لا بالأرقام: أربعُ خاناتِ حضورٍ متجاورةٌ أرقاماً
   تُقرأ واحدةً واحدة، وأشرطةً تُقرأ دفعةً واحدة.

   وجدولُ الفصول صار بطاقةً لكلّ فصل: سبعةُ أعمدةٍ تفيض على الجوّال
   فتُمرَّر أفقيّاً، والمعلّمُ لا يمرّر ورقةً ليقرأ صفَّه.

   والتصديرُ في `print-reports.js` — بالتصميم نفسِه على ورق A4.
   ========================================================================== */

(function (global) {
    'use strict';

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
                <div class="text-muted" style="padding: var(--space-8); text-align: center;">
                    جارٍ حساب الإحصائيات…
                </div>
            </div>
        `;

        const data = await collectStats(teacher);

        container.querySelector('.container').innerHTML = data.totals.classes === 0
            ? emptyView()
            : `<div class="rp-v2">
                ${heroSection(data)}
                ${attendanceSection(data)}
                ${studentsSections(data)}
                ${productionSection(data)}
                ${perClassSection(data)}
                <button type="button" class="btn btn-primary rp-export" id="btn-print-reports">
                    تصدير التقرير PDF
                </button>
               </div>`;

        /* التصديرُ عبر PdfCore لا `window.print()`: النداءُ خامدٌ داخل
           WKWebView، فكان الزرُّ لا يفعل شيئاً على iOS — والهدفُ آبل ستور. */
        container.querySelector('#btn-print-reports')?.addEventListener('click', async (e) => {
            const b = e.currentTarget;
            if (b.disabled) return;
            b.disabled = true;
            const was = b.textContent;
            b.textContent = 'جارٍ التجهيز…';
            try {
                await global.PrintReports.savePdf({ teacher, data });
            } finally {
                b.disabled = false;
                b.textContent = was;
            }
        });

        if (global.PrintReports) global.PrintReports.preloadPdfEngine();
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

    /* ── قوائمُ الطلاب تُشتقّ مرّةً واحدة ──
       العرضُ والطباعةُ يقرآن منها معاً، فلا يختلف المطبوعُ عن الشاشة
       باشتقاقين متوازيين ينزاح أحدهما يوماً. */
    function derive(data) {
        const all = [];
        data.perClass.forEach((p) => p.studentsWithRate.forEach((s) => {
            all.push(Object.assign({}, s, { cls: p.cls }));
        }));
        const rated = all.filter((s) => s.rate != null);
        return {
            top:  rated.filter((s) => s.rate >= 90).sort((a, b) => b.rate - a.rate).slice(0, 5),
            low:  rated.filter((s) => (s.attended.absent || 0) > 0)
                       .sort((a, b) => a.rate - b.rate).slice(0, 5),
            best: all.filter((s) => typeof s.score === 'number')
                     .sort((a, b) => b.score - a.score).slice(0, 5)
        };
    }

    const ATT_KINDS = [
        { k: 'present', l: 'حاضر',   c: '#10B981' },
        { k: 'late',    l: 'متأخر',  c: '#F59E0B' },
        { k: 'excused', l: 'مستأذن', c: '#3B82F6' },
        { k: 'absent',  l: 'غائب',   c: '#EF4444' }
    ];
    const PROD_KINDS = [
        { k: 'exams',       l: 'اختبارات' },   { k: 'worksheets',  l: 'أوراق عمل' },
        { k: 'homework',    l: 'واجبات' },     { k: 'strategies',  l: 'استراتيجيات' },
        { k: 'initiatives', l: 'مبادرات' }
    ];

    const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const pct = (n, of) => (of ? Math.round(n / of * 100) : 0);

    /* «الصف الخامس الابتدائي / أ» يبتلع سطرَ الطالب فيُقصّ اسمُه — والاسمُ
       هو المقصود. فيُختصر بدالّة التطبيق نفسِها كما تُسمّى الفصولُ في كلّ
       شاشةٍ أخرى: «الخامس الابتدائي / أ». */
    const clsName = (c) => escapeHtml(global.ClassCreate
        ? global.ClassCreate.label(c.grade, c.section)
        : String(c.grade || '') + ' / ' + String(c.section || ''));

    /* ── الصدر: الجوابُ في نظرة ── */
    function heroSection(data) {
        const t = data.totals;
        const considered = t.attendance.present + t.attendance.late + t.attendance.absent;
        return `
            <div class="rp-hero">
                <div class="k">نسبة الحضور العامة</div>
                <div class="v">${t.attendanceRate == null ? '—' : ar(t.attendanceRate) + '%'}</div>
                <div class="s">${considered
                    ? 'من ' + ar(considered) + ' حالة حضورٍ مرصودة'
                    : 'لم يُرصد حضورٌ بعد'}</div>
                <div class="row">
                    <div><div class="n">${ar(t.classes)}</div><div class="c">فصول</div></div>
                    <div><div class="n">${ar(t.students)}</div><div class="c">طلاب</div></div>
                    <div><div class="n">${ar(t.exams + t.worksheets + t.homework)}</div>
                         <div class="c">محتوى</div></div>
                </div>
            </div>`;
    }

    /* شريطٌ واحدٌ لكلّ خانة — تُقاس بالعين لا بالأرقام. */
    function meterRows(items) {
        const max = Math.max(1, ...items.map((x) => x.v));
        return `<div class="rp-meters">${items.map((x) => `
            <div class="rp-meter">
                <span class="lb">${x.l}</span>
                <span class="tr"><i style="width:${x.v / max * 100}%;background:${x.c || 'var(--primary)'}"></i></span>
                <span class="vn">${x.t}</span>
            </div>`).join('')}</div>`;
    }

    function attendanceSection(data) {
        const a = data.totals.attendance;
        if (!data.totals.attTotal) return '';
        return `
            <h3 class="rp-h">تفصيل الحضور</h3>
            <div class="rp-card">
                ${meterRows(ATT_KINDS.map((g) => ({
                    l: g.l, c: g.c, v: a[g.k],
                    t: ar(a[g.k]) + ' · ' + ar(pct(a[g.k], data.totals.attTotal)) + '%'
                })))}
            </div>`;
    }

    function rowsHtml(list, tone, rank) {
        return `<div class="rp-rows">${list.map((s, i) => {
            const isLow = tone === 'low';
            const shown = rank ? Math.round(s.score) : (isLow ? 100 - s.rate : s.rate);
            const color = rank ? 'var(--primary)' : (isLow ? 'var(--danger)' : 'var(--success)');
            const meta  = rank ? ''
                : (isLow ? ar(s.attended.absent || 0) + ' غياب'
                         : ar((s.attended.present || 0) + (s.attended.late || 0)) + ' حضور');
            return `
                <a href="#/student/${s.student.id}" class="rp-row">
                    ${rank ? `<span class="rk">${['١','٢','٣','٤','٥'][i]}</span>` : ''}
                    <span class="nm">${escapeHtml(s.student.name)}</span>
                    <span class="mt">${clsName(s.cls)}${meta ? ' · ' + meta : ''}</span>
                    <span class="pc" style="color:${color}">${ar(shown)}%</span>
                </a>`;
        }).join('')}</div>`;
    }

    function studentsSections(data) {
        const d = derive(data);
        let out = '';
        if (d.top.length) out += `
            <h3 class="rp-h">الأعلى التزاماً بالحضور</h3>
            <div class="rp-card">${rowsHtml(d.top, 'top')}</div>`;
        if (d.low.length) out += `
            <h3 class="rp-h">أكثر الطلاب تغيّباً</h3>
            <div class="rp-card">${rowsHtml(d.low, 'low')}</div>`;
        if (d.best.length) out += `
            <h3 class="rp-h">المتميّزون في التقييم</h3>
            <div class="rp-card">${rowsHtml(d.best, 'best', true)}</div>`;
        return out;
    }

    function productionSection(data) {
        const t = data.totals;
        const items = PROD_KINDS.map((p) => ({ l: p.l, v: t[p.k], t: ar(t[p.k]) }));
        if (!items.some((x) => x.v)) return '';
        return `
            <h3 class="rp-h">إنتاجي</h3>
            <div class="rp-card">${meterRows(items)}</div>`;
    }

    function perClassSection(data) {
        if (!data.perClass.length) return '';
        return `
            <h3 class="rp-h">تفصيل لكل فصل</h3>
            <div class="rp-cls">${data.perClass.map((p) => {
                const considered = p.att.present + p.att.absent + p.att.late;
                const rate = considered === 0 ? null
                    : Math.round((p.att.present + p.att.late) / considered * 100);
                return `
                    <a href="#/class/${p.cls.id}" class="rp-cls-card">
                        <div class="top">
                            <span class="t">${clsName(p.cls)}</span>
                            <span class="r">${rate == null ? '—' : ar(rate) + '%'}</span>
                        </div>
                        <div class="sub">${escapeHtml(p.cls.subject || '')}
                            · ${ar(p.students.length)} ${p.students.length === 1 ? 'طالب' : 'طالباً'}</div>
                        <div class="mini"><i style="width:${rate == null ? 0 : rate}%"></i></div>
                        <div class="facts">
                            <span>اختبارات <b>${ar(p.examsCount)}</b></span>
                            <span>أوراق <b>${ar(p.worksheetsCount)}</b></span>
                            <span>واجبات <b>${ar(p.homeworkCount)}</b></span>
                        </div>
                    </a>`;
            }).join('')}</div>`;
    }

    global.ReportsView = { render, collectStats, derive, ATT_KINDS, PROD_KINDS };
})(window);
