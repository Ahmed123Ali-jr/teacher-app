/* ==========================================================================
   question-editor.js — محرّر الأسئلة المشترك بين الاختبارات وأوراق العمل.

   كان المحرّر داخل class-exams.js وحده، وكانت ورقة العمل تمارينَ نصّيةً
   حرّة لا أنواع لها. ولمّا صارت الورقتان تُطبعان بمحرّك PDF واحد، لم
   يبقَ لاختلاف المحرّرَين معنى — فاستُخرج هنا لتُحرَّرا بالطريقة نفسها.

   الفارق الوحيد بينهما درجة: الاختبار يحملها، وورقة العمل لا.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }
    const escapeAttr = escapeHtml;
    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    const TYPE_LABELS = {
        mcq:   'اختيار من متعدد',
        tf:    'صح/خطأ',
        fill:  'أكمل الفراغ',
        essay: 'مقالي',
        match: 'مطابقة'
    };

    /* عدّاد لا وقتٌ فقط: إضافتان في الملّي ثانية نفسها كانتا تتشاركان
       المعرّف، فيلتبس أيّهما تُحذف. */
    let seq = 0;
    function blank(withPoints) {
        seq += 1;
        return {
            id: 'q_' + Date.now() + '_' + seq,
            type: 'mcq', text: '', options: ['', '', '', ''], answer: '',
            points: withPoints ? 1 : 0
        };
    }

    /** يحوّل تمارين ورقة العمل القديمة (نصٌّ حرّ) إلى أسئلة مقالية. */
    function fromExercises(exercises) {
        return (exercises || []).map((ex, i) => ({
            id: ex.id || 'q_legacy_' + i,
            type: 'essay',
            text: ex.hint ? `${ex.text}\n(${ex.hint})` : (ex.text || ''),
            options: ['', '', '', ''],
            answer: '',
            points: 0
        }));
    }

    /**
     * @param {object} q     السؤال
     * @param {number} i     ترتيبه
     * @param {object} [o]   { points:bool, actions:string }
     */
    function card(q, i, o) {
        o = o || {};
        let body = '';
        if (q.type === 'mcq') {
            body = `
                <div class="opts-list">
                    ${(q.options || ['', '', '', '']).map((opt, k) => `
                        <div class="opt-row">
                            <input type="radio" name="ans-${i}" ${q.answer === opt && opt !== '' ? 'checked' : ''}
                                   data-q-ans="${i}" data-k="${k}">
                            <input class="input" data-q-opt="${i}" data-k="${k}" value="${escapeAttr(opt)}">
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (q.type === 'tf') {
            body = `
                <div class="flex gap-3" style="margin-top: var(--space-2);">
                    <label><input type="radio" name="tf-${i}" value="صح" ${q.answer === 'صح' ? 'checked' : ''} data-q-tf="${i}"> صح ✓</label>
                    <label><input type="radio" name="tf-${i}" value="خطأ" ${q.answer === 'خطأ' ? 'checked' : ''} data-q-tf="${i}"> خطأ ✗</label>
                </div>
            `;
        } else if (q.type === 'fill') {
            body = `
                <div class="field" style="margin:0;">
                    <label class="label">الإجابة الصحيحة</label>
                    <input class="input" value="${escapeAttr(q.answer || '')}" data-q-fill="${i}">
                </div>
            `;
        } else if (q.type === 'essay') {
            body = '<div class="text-muted" style="font-size:var(--fs-sm);">'
                 + 'سؤال مقالي — تُطبع تحته أربعة سطور للإجابة.</div>';
        } else {
            body = '<div class="text-muted" style="font-size:var(--fs-sm);">سؤال مطابقة.</div>';
        }

        return `
            <article class="q-card" data-q="${i}">
                <div class="q-header">
                    <span class="q-index">${arDigits(i + 1)}</span>
                    <select class="select select-sm" data-q-type="${i}">
                        ${Object.entries(TYPE_LABELS).map(([k, v]) =>
                            `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`
                        ).join('')}
                    </select>
                    ${o.points ? `<input class="input input-sm" data-q-points="${i}" type="number" min="1" max="10"
                           value="${q.points || 1}" title="الدرجة" style="max-width: 70px;">` : ''}
                    <div class="q-actions">
                        ${typeof o.actions === 'function' ? o.actions(i) : (o.actions || '')}
                        <button class="btn btn-ghost btn-sm" data-q-del="${i}" title="حذف">🗑️</button>
                    </div>
                </div>
                <div class="field" style="margin-bottom: var(--space-3);">
                    <textarea class="textarea" data-q-text="${i}" rows="2"
                              placeholder="اكتب نصّ السؤال…">${escapeHtml(q.text)}</textarea>
                </div>
                ${body}
            </article>
        `;
    }

    const HINT = 'لا أسئلة بعد.<br>أضف سؤالاً واختر نوعه: اختيار من متعدد، '
               + 'أو صح وخطأ، أو أكمل الفراغ، أو مقالي.';

    function listHtml(questions, o) {
        if (!questions.length) {
            return `<p class="text-muted" style="text-align:center; padding:var(--space-5) 0;
                        font-size:var(--fs-sm); line-height:1.9;">${HINT}</p>`;
        }
        return questions.map((q, i) => card(q, i, o)).join('');
    }

    /**
     * يربط المحرّر بمصفوفة الأسئلة. تغييرُ النوع والحذف يحتاجان إعادة
     * رسم، فيُطلب من المستدعي عبر rerender بدل أن تفترض الوحدة شكل شاشته.
     * @param {HTMLElement} root
     * @param {Array} qs
     * @param {object} o { rerender:fn }
     */
    function bind(root, qs, o) {
        const rerender = (o && o.rerender) || (() => {});

        root.querySelectorAll('[data-q-text]').forEach((el) =>
            el.addEventListener('input', (e) => {
                qs[Number(el.dataset.qText)].text = e.target.value;
            }));
        root.querySelectorAll('[data-q-points]').forEach((el) =>
            el.addEventListener('change', (e) => {
                qs[Number(el.dataset.qPoints)].points = Number(e.target.value) || 1;
            }));
        root.querySelectorAll('[data-q-type]').forEach((el) =>
            el.addEventListener('change', (e) => {
                const q = qs[Number(el.dataset.qType)];
                q.type = e.target.value;
                if (q.type === 'mcq' && !q.options) q.options = ['', '', '', ''];
                rerender();
            }));
        root.querySelectorAll('[data-q-opt]').forEach((el) =>
            el.addEventListener('input', (e) => {
                const q = qs[Number(el.dataset.qOpt)];
                const k = Number(el.dataset.k);
                /* لو كان هذا الخيار هو المعلَّم صحيحاً، تتبع الإجابةُ نصَّه
                   الجديد — وإلّا بقيت تشير إلى نصٍّ لم يعد موجوداً. */
                const wasAnswer = q.answer !== '' && q.answer === q.options[k];
                q.options[k] = e.target.value;
                if (wasAnswer) q.answer = e.target.value;
            }));
        root.querySelectorAll('[data-q-ans]').forEach((el) =>
            el.addEventListener('change', () => {
                const q = qs[Number(el.dataset.qAns)];
                q.answer = q.options[Number(el.dataset.k)];
            }));
        root.querySelectorAll('[data-q-tf]').forEach((el) =>
            el.addEventListener('change', (e) => {
                qs[Number(el.dataset.qTf)].answer = e.target.value;
            }));
        root.querySelectorAll('[data-q-fill]').forEach((el) =>
            el.addEventListener('input', (e) => {
                qs[Number(el.dataset.qFill)].answer = e.target.value;
            }));
        root.querySelectorAll('[data-q-del]').forEach((btn) =>
            btn.addEventListener('click', () => {
                if (!global.confirm('حذف هذا السؤال؟')) return;
                qs.splice(Number(btn.dataset.qDel), 1);
                rerender();
            }));
    }

    /** يمنع الطباعة قبل اكتمال الورقة. يُرجع رسالةً أو null. */
    function validate(qs) {
        if (!qs.length) return 'أضف سؤالاً واحداً على الأقل.';
        const blankAt = qs.findIndex((q) => !String(q.text || '').trim());
        if (blankAt >= 0) return `السؤال ${arDigits(blankAt + 1)} بلا نصّ — اكتبه أو احذفه.`;
        return null;
    }

    global.QuestionEditor = {
        TYPE_LABELS, blank, card, listHtml, bind, validate, fromExercises, arDigits
    };
})(window);
