/* ==========================================================================
   print-exam.js — Render an exam into the hidden print container, trigger
   window.print(), then restore. Relies on css/print.css for layout.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    /** Build the printable HTML into #print-root, then window.print(). */
    function print(exam, cls, teacher) {
        const root = ensurePrintRoot();
        root.innerHTML = buildExamHtml(exam, cls, teacher);
        document.body.classList.add('is-printing');
        const done = () => {
            document.body.classList.remove('is-printing');
            global.removeEventListener('afterprint', done);
        };
        global.addEventListener('afterprint', done);
        setTimeout(() => global.print(), 50);
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

    function buildExamHtml(exam, cls, teacher) {
        const s = exam.settings || {};
        const total = exam.questions.reduce((sum, q) => sum + (q.points || 1), 0);
        const dateStr = new Date().toLocaleDateString('ar-SA');
        const p = global.PrintPrefs || {};

        const header = `
            ${s.include_school ? `
                <div class="print-header ${p.logoDataUrl ? 'has-logo' : ''}">
                    ${p.logoDataUrl ? `<img class="print-logo" src="${p.logoDataUrl}" alt="">` : ''}
                    <h1>${escapeHtml(teacher?.school_name || 'المدرسة')}</h1>
                    <div class="meta">
                        ${escapeHtml(exam.title)}
                        ${s.include_teacher ? ` · المعلم: ${escapeHtml(teacher?.name || '')}` : ''}
                        ${s.include_date ? ` · التاريخ: ${dateStr}` : ''}
                        ${p.academicYear ? ` · العام: ${escapeHtml(p.academicYear)}` : ''}
                    </div>
                </div>
            ` : ''}

            ${s.include_name || s.include_grade ? `
                <div class="print-info-row">
                    ${s.include_name  ? `<div>اسم الطالب: ................................................</div>` : ''}
                    ${s.include_grade ? `<div>الدرجة: <span class="grade-box">/ ${total}</span></div>` : ''}
                </div>
            ` : ''}

            ${s.include_instructions ? `
                <div class="print-instructions">
                    <strong>التعليمات:</strong>
                    اقرأ كل سؤال بعناية ثم أجب في المكان المخصص. لا تترك سؤالاً دون إجابة.
                </div>
            ` : ''}
        `;

        const questions = exam.questions.map((q, i) => questionHtml(q, i)).join('');

        const answerKey = s.include_answers ? `
            <div class="page-break"></div>
            <div class="print-header">
                <h1>نموذج الإجابة</h1>
                <div class="meta">${escapeHtml(exam.title)}</div>
            </div>
            <ol class="answer-key">
                ${exam.questions.map((q) => `
                    <li><strong>${formatAnswer(q)}</strong></li>
                `).join('')}
            </ol>
        ` : '';

        return `
            <div class="print-doc">
                ${header}
                <ol class="print-questions">${questions}</ol>
                ${answerKey}
            </div>
        `;
    }

    function questionHtml(q, i) {
        const pts = `<span class="q-points">(${q.points || 1} درجة)</span>`;
        if (q.type === 'mcq') {
            return `
                <li class="q avoid-break">
                    <div class="q-text">${escapeHtml(q.text)} ${pts}</div>
                    <ol class="q-opts">
                        ${(q.options || []).map((o) => `<li>☐ ${escapeHtml(o)}</li>`).join('')}
                    </ol>
                </li>
            `;
        }
        if (q.type === 'tf') {
            return `
                <li class="q avoid-break">
                    <div class="q-text">${escapeHtml(q.text)} ${pts}</div>
                    <div class="q-tf">
                        <span>☐ صح</span> <span style="display:inline-block; width: 24px;"></span>
                        <span>☐ خطأ</span>
                    </div>
                </li>
            `;
        }
        if (q.type === 'fill') {
            const withBlank = String(q.text || '').includes('..........')
                ? q.text
                : (q.text + ' ..........');
            return `
                <li class="q avoid-break">
                    <div class="q-text">${escapeHtml(withBlank)} ${pts}</div>
                </li>
            `;
        }
        // essay/match: leave writing space
        return `
            <li class="q avoid-break">
                <div class="q-text">${escapeHtml(q.text)} ${pts}</div>
                <div class="q-lines">
                    ${'<div class="line"></div>'.repeat(q.type === 'match' ? 4 : 4)}
                </div>
            </li>
        `;
    }

    function formatAnswer(q) {
        if (q.type === 'tf') return q.answer || '—';
        if (q.type === 'mcq') {
            const i = (q.options || []).indexOf(q.answer);
            const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
            return i >= 0 ? `${letters[i]}) ${q.answer}` : (q.answer || '—');
        }
        return q.answer || '—';
    }

    global.PrintExam = { print };

    /* ==========================================================================
       Worksheet printing
       ========================================================================== */

    function printWorksheet(sheet, cls, teacher) {
        const root = ensurePrintRoot();
        root.innerHTML = buildWorksheetHtml(sheet, cls, teacher);
        document.body.classList.add('is-printing');
        const done = () => {
            document.body.classList.remove('is-printing');
            global.removeEventListener('afterprint', done);
        };
        global.addEventListener('afterprint', done);
        setTimeout(() => global.print(), 50);
    }

    function buildWorksheetHtml(sheet, cls, teacher) {
        const dateStr = new Date().toLocaleDateString('ar-SA');
        return `
            <div class="print-doc">
                <div class="print-header">
                    <h1>${escapeHtml(teacher?.school_name || 'المدرسة')}</h1>
                    <div class="meta">
                        ${escapeHtml(sheet.title)}
                        · ${escapeHtml(cls.subject)}
                        · ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}
                        · ${dateStr}
                    </div>
                </div>
                <div class="print-info-row">
                    <div>اسم الطالب: ................................................</div>
                </div>
                <div class="print-instructions">
                    <strong>التعليمات:</strong> ${escapeHtml(sheet.instructions || '')}
                </div>
                <ol class="print-questions">
                    ${(sheet.exercises || []).map((ex) => `
                        <li class="q avoid-break">
                            <div class="q-text">${escapeHtml(ex.text)}</div>
                            <div class="q-lines">
                                <div class="line"></div><div class="line"></div>
                                <div class="line"></div><div class="line"></div>
                            </div>
                        </li>
                    `).join('')}
                </ol>
            </div>
        `;
    }

    global.PrintWorksheet = { print: printWorksheet };
})(window);
