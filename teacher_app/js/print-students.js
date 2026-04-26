/* ==========================================================================
   print-students.js — Print the class student register.
   Modes:
     - blank:     empty boxes for paper use
     - today:     fills today's attendance + today's eval values
     - range:     attendance log across a date range (days as columns)
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
    const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const ATT_CHAR = { present: '✓', absent: '✗', late: '⏰', excused: 'م' };

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function formatDateShort(iso) {
        try {
            return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short' }).format(new Date(iso));
        } catch { return iso; }
    }

    function ensurePrintRoot() {
        let el = document.getElementById('print-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'print-root';
            document.body.appendChild(el);
        }
        return el;
    }

    function readValues(row) {
        if (row && row.values && typeof row.values === 'object') return row.values;
        const v = {};
        if (row && typeof row.rating === 'number' && row.rating > 0) v.participation = row.rating;
        if (row && typeof row.grade  === 'number')                  v.grade         = row.grade;
        return v;
    }

    /**
     * Main entry.
     * @param {object} opts — { mode, cls, teacher, students, attendance?, participation?, dates?, columns? }
     */
    async function print(opts) {
        const root = ensurePrintRoot();
        root.innerHTML = buildHtml(opts);

        document.body.classList.add('is-printing');
        const done = () => {
            document.body.classList.remove('is-printing');
            global.removeEventListener('afterprint', done);
        };
        global.addEventListener('afterprint', done);
        setTimeout(() => global.print(), 50);
    }

    function buildHtml(opts) {
        const { mode, cls, teacher, students, columns, dates, includeEvals, from, to } = opts;

        const periodText = (mode === 'range' || mode === 'summary') && from && to
            ? ` · الفترة: ${formatDateShort(from)} → ${formatDateShort(to)}`
            : '';

        const p = global.PrintPrefs || {};
        const header = `
            <div class="print-header ${p.logoDataUrl ? 'has-logo' : ''}">
                ${p.logoDataUrl ? `<img class="print-logo" src="${p.logoDataUrl}" alt="">` : ''}
                <h1>${escapeHtml(teacher?.school_name || 'المدرسة')}</h1>
                <div class="meta">
                    ${mode === 'summary' ? 'تقرير مجمّع للطلاب' : 'سجل متابعة الطلاب'} ·
                    ${STAGE_LABELS[cls.stage] || ''} — ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)} ·
                    ${escapeHtml(cls.subject)} ·
                    المعلم: ${escapeHtml(teacher?.name || '')} ·
                    التاريخ: ${new Date().toLocaleDateString('ar-SA')}
                    ${periodText}
                    ${p.academicYear ? ` · العام: ${escapeHtml(p.academicYear)}` : ''}
                </div>
            </div>
        `;

        let table = '';
        if (mode === 'range') {
            table = rangeTable(students, dates, opts.attendance, opts.participation, columns, includeEvals);
        } else if (mode === 'summary') {
            table = summaryTable(students, opts.attendance, opts.participation, columns);
        } else {
            table = simpleTable(students, cls, mode, columns, opts.attendance, opts.participation);
        }

        const legend = mode === 'summary' ? '' : `
            <div class="print-legend">
                <strong>الرموز:</strong>
                <span>✓ حاضر</span>
                <span>✗ غائب</span>
                <span>⏰ متأخر</span>
                <span>م مستأذن</span>
            </div>
        `;

        return `
            <div class="print-doc students-doc">
                ${header}
                ${table}
                ${legend}
            </div>
        `;
    }

    /**
     * Rows-per-page for each mode. Tuned empirically for A4 landscape @ 10pt
     * with our header + meta row. Safer to undershoot than let the browser
     * auto-paginate and clip borders between rows.
     */
    const ROWS_PER_PAGE = {
        blank:   22,
        today:   22,
        range:   18,
        summary: 20
    };

    /** Split an array into chunks of a given size. */
    function chunk(arr, size) {
        const out = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    /** Render multiple self-contained tables, one per page, separated by
     *  explicit .page-break divs. Avoids any cross-page row/border clipping. */
    function paginate(rows, mode, renderTable) {
        const size = ROWS_PER_PAGE[mode] || 20;
        const groups = chunk(rows, size);
        if (groups.length === 0) return renderTable([], 0, 1);
        return groups.map((g, i) => `
            ${renderTable(g, i * size, groups.length)}
            ${i < groups.length - 1 ? '<div class="page-break"></div>' : ''}
        `).join('');
    }

    /** Table for 'blank' or 'today' modes: one column per evaluation. */
    function simpleTable(students, cls, mode, columns, attToday, parToday) {
        const showToday = mode === 'today';
        const attByStudent = new Map((attToday || []).map((r) => [r.student_id, r]));
        const parByStudent = new Map((parToday || []).map((r) => [r.student_id, r]));

        return paginate(students, mode, (group, offset) => `
            <table class="students-register">
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-name">الاسم</th>
                        <th>الحضور</th>
                        ${(columns || []).map((c) => `<th>${escapeHtml(c.name)}${c.type === 'number' ? `<br><span class="col-hint">من ${c.max}</span>` : ''}</th>`).join('')}
                        <th class="col-notes">ملاحظات</th>
                    </tr>
                </thead>
                <tbody>
                    ${group.map((s, i) => {
                        const att = showToday ? attByStudent.get(s.id) : null;
                        const vals = showToday ? readValues(parByStudent.get(s.id)) : {};
                        return `
                            <tr>
                                <td class="col-num">${offset + i + 1}</td>
                                <td class="col-name">${escapeHtml(s.name)}</td>
                                <td class="cell-att">${att ? (ATT_CHAR[att.status] || '') : ''}</td>
                                ${(columns || []).map((c) => `
                                    <td class="cell-eval">${formatValue(c, vals[c.id])}</td>
                                `).join('')}
                                <td class="col-notes"></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `);
    }

    /** Table for 'range' mode: days as columns, each cell gets attendance code. */
    function rangeTable(students, dates, attendanceAll, participationAll, columns, includeEvals) {
        const attMap = new Map();
        for (const r of attendanceAll || []) {
            if (!attMap.has(r.student_id)) attMap.set(r.student_id, {});
            attMap.get(r.student_id)[r.date] = r.status;
        }

        const datesHeader = dates.map((d) => {
            const dt = new Date(d + 'T00:00:00');
            const day = DAY_NAMES[dt.getDay()];
            return `<th class="col-date">
                <div class="date-day">${day}</div>
                <div class="date-num">${formatDateShort(d)}</div>
            </th>`;
        }).join('');

        return paginate(students, 'range', (group, offset) => `
            <table class="students-register range-register">
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-name">الاسم</th>
                        ${datesHeader}
                        <th class="col-summary">حاضر</th>
                        <th class="col-summary">غائب</th>
                        ${includeEvals ? (columns || []).map((c) => `<th>${escapeHtml(c.name)}</th>`).join('') : ''}
                    </tr>
                </thead>
                <tbody>
                    ${group.map((s, i) => {
                        const row = attMap.get(s.id) || {};
                        let present = 0, absent = 0;
                        const cells = dates.map((d) => {
                            const status = row[d];
                            if (status === 'present' || status === 'late') present++;
                            else if (status === 'absent') absent++;
                            return `<td class="cell-att">${status ? (ATT_CHAR[status] || '') : ''}</td>`;
                        }).join('');
                        return `
                            <tr>
                                <td class="col-num">${offset + i + 1}</td>
                                <td class="col-name">${escapeHtml(s.name)}</td>
                                ${cells}
                                <td class="cell-att col-summary">${present}</td>
                                <td class="cell-att col-summary">${absent}</td>
                                ${includeEvals ? (columns || []).map(() => '<td class="cell-eval"></td>').join('') : ''}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `);
    }

    /**
     * Aggregated period report — one row per student with:
     *  - attendance counts (present/late/absent/excused) + rate
     *  - per-column aggregate (average for number/stars, done-ratio for check/tri)
     */
    function summaryTable(students, attendanceAll, participationAll, columns) {
        const attByStudent = new Map();
        for (const r of attendanceAll || []) {
            if (!attByStudent.has(r.student_id)) attByStudent.set(r.student_id, []);
            attByStudent.get(r.student_id).push(r);
        }
        const parByStudent = new Map();
        for (const r of participationAll || []) {
            if (!parByStudent.has(r.student_id)) parByStudent.set(r.student_id, []);
            parByStudent.get(r.student_id).push(r);
        }

        return paginate(students, 'summary', (group, offset) => `
            <table class="students-register summary-register">
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-name">الاسم</th>
                        <th class="col-summary">حاضر</th>
                        <th class="col-summary">غائب</th>
                        <th class="col-summary">متأخر</th>
                        <th class="col-summary">مستأذن</th>
                        <th class="col-summary">نسبة الحضور</th>
                        ${(columns || []).map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${group.map((s, i) => {
                        const attRows = attByStudent.get(s.id) || [];
                        const p = {
                            present: attRows.filter((r) => r.status === 'present').length,
                            absent:  attRows.filter((r) => r.status === 'absent').length,
                            late:    attRows.filter((r) => r.status === 'late').length,
                            excused: attRows.filter((r) => r.status === 'excused').length
                        };
                        const considered = p.present + p.absent + p.late;
                        const rate = considered === 0 ? '—' :
                            Math.round(((p.present + p.late) / considered) * 100) + '%';

                        const parRows = parByStudent.get(s.id) || [];

                        return `
                            <tr>
                                <td class="col-num">${offset + i + 1}</td>
                                <td class="col-name">${escapeHtml(s.name)}</td>
                                <td class="col-summary">${p.present}</td>
                                <td class="col-summary">${p.absent}</td>
                                <td class="col-summary">${p.late}</td>
                                <td class="col-summary">${p.excused}</td>
                                <td class="col-summary"><strong>${rate}</strong></td>
                                ${(columns || []).map((c) => `<td class="cell-eval">${aggregateCol(c, parRows)}</td>`).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `);
    }

    function aggregateCol(col, parRows) {
        const values = parRows
            .map((r) => {
                const v = (r.values && typeof r.values === 'object') ? r.values[col.id]
                        : (col.id === 'participation' ? r.rating
                        :  col.id === 'grade'         ? r.grade : undefined);
                return v;
            })
            .filter((v) => typeof v === 'number');

        if (values.length === 0) return '—';

        if (col.type === 'stars' || col.type === 'number') {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            return avg.toFixed(1);
        }
        if (col.type === 'check') {
            const done = values.filter((v) => v >= 1).length;
            return `${done}/${values.length}`;
        }
        if (col.type === 'tri') {
            // 2=done, 1=partial, 0=missing
            const done    = values.filter((v) => v === 2).length;
            const partial = values.filter((v) => v === 1).length;
            const missing = values.filter((v) => v === 0).length;
            return `${done}✓ ${partial}△ ${missing}✗`;
        }
        return values[values.length - 1]; // fallback: last value
    }

    function formatValue(col, v) {
        if (v == null || v === '') return '';
        if (col.type === 'stars') return '★'.repeat(Math.round(v));
        if (col.type === 'check') return v >= 1 ? '✓' : '';
        if (col.type === 'tri')   return v === 2 ? '✓' : v === 1 ? '△' : v === 0 ? '✗' : '';
        return String(v);
    }

    global.PrintStudents = { print };
})(window);
