/* ==========================================================================
   question-editor.js — محرّر الأسئلة المشترك بين الاختبارات وأوراق العمل.

   التصميم المعتمد (ب): الأسئلة تحت عناوين «السؤال الأول: اختر الإجابة
   الصحيحة» كما ستُطبع تماماً — فما يبنيه المعلّم هو ما يراه على الورق.
   وثمرة ذلك أن نوع السؤال يُختار بالقسم الذي يُضاف فيه، فتسقط قائمةٌ
   منسدلة كانت تتكرّر مع كل سؤال.

   ترتيب المصفوفة يبقى مجمّعاً بالنوع: الإضافة تُدرَج بعد آخر سؤالٍ من
   نوعها لا في الذيل، لأن print-exam.js يجمّع بالنوع أيضاً — ولولا ذلك
   لاختلف ترتيب الشاشة عن ترتيب الورقة.

   الفارق الوحيد بين الاختبار وورقة العمل درجة: الأول يحملها، والثانية لا.
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

    const TYPES = [
        { k: 'mcq',   n: 'اختيار من متعدد', sec: 'اختر الإجابة الصحيحة' },
        { k: 'tf',    n: 'صح/خطأ',          sec: 'ضع علامة (✓) أمام الصحيحة و(✗) أمام الخاطئة' },
        { k: 'fill',  n: 'أكمل الفراغ',      sec: 'أكمل الفراغ بما يناسبه' },
        { k: 'essay', n: 'مقالي',           sec: 'أجب عمّا يأتي' },
        { k: 'match', n: 'مطابقة',          sec: 'صِل العمود (أ) بما يناسبه من العمود (ب)' }
    ];
    const TYPE_LABELS = TYPES.reduce((o, t) => { o[t.k] = t.n; return o; }, {});
    const typeOf  = (k) => TYPES.find((t) => t.k === k) || TYPES[3];
    const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع'];
    const LETTERS  = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

    function countWord(n, one, two, few, many) {
        if (n === 1) return one;
        if (n === 2) return two;
        if (n <= 10) return arDigits(n) + ' ' + few;
        return arDigits(n) + ' ' + many;
    }
    const qWord = (n) => countWord(n, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً');
    const mWord = (n) => countWord(n, 'درجة واحدة', 'درجتان', 'درجات', 'درجة');

    /* عدّاد لا وقتٌ فقط: إضافتان في الملّي ثانية نفسها كانتا تتشاركان
       المعرّف، فيلتبس أيّهما تُحذف. */
    let seq = 0;
    function blank(withPoints, type) {
        seq += 1;
        const t = type || 'mcq';
        return {
            id: 'q_' + Date.now() + '_' + seq,
            type: t,
            text: '',
            options: t === 'mcq' ? ['', '', '', ''] : [],
            answer: '',
            points: withPoints ? 1 : 0
        };
    }

    /** يحوّل تمارين ورقة العمل القديمة (نصٌّ حرّ) إلى أسئلة مقالية. */
    function fromExercises(exercises) {
        return (exercises || []).map((ex, i) => ({
            id: ex.id || 'q_legacy_' + i,
            type: 'essay',
            text: ex.hint ? `${ex.text}\n(${ex.hint})` : (ex.text || ''),
            options: [],
            answer: '',
            points: 0
        }));
    }

    /** يُدرج السؤال بعد آخر سؤالٍ من نوعه ليبقى الترتيب مجمّعاً. */
    function addOfType(qs, type, withPoints) {
        const q = blank(withPoints, type);
        let at = -1;
        qs.forEach((x, i) => { if (x.type === type) at = i; });
        if (at < 0) qs.push(q); else qs.splice(at + 1, 0, q);
        return qs.indexOf(q);
    }

    function groupByType(qs) {
        const order = [];
        const map = new Map();
        qs.forEach((q, i) => {
            const t = TYPE_LABELS[q.type] ? q.type : 'essay';
            if (!map.has(t)) { map.set(t, []); order.push(t); }
            map.get(t).push({ q, i });
        });
        return order.map((t) => ({ type: t, items: map.get(t) }));
    }

    /* ------------------------------------------------------------------
       الرسم
       ------------------------------------------------------------------ */

    /** بطاقة الرأس: العنوان وحصيلة الورقة. */
    function headHtml(title, qs, o) {
        const total = qs.reduce((s, q) => s + (q.points || 0), 0);
        return `
        <div class="qe-head">
            <div class="qe-lbl">${escapeHtml((o && o.titleLabel) || 'عنوان الاختبار')}</div>
            <input class="qe-title" data-qe-title value="${escapeAttr(title || '')}"
                   placeholder="اكتب العنوان…">
            <div class="qe-chips">
                <span class="qe-chip">${qWord(qs.length)}</span>
                ${o && o.points ? `<span class="qe-chip gold">${mWord(total)}</span>` : ''}
            </div>
        </div>`;
    }

    function miniFor(q, i) {
        if (q.type === 'mcq') {
            const opts = q.options && q.options.length ? q.options : ['', '', '', ''];
            return `<div class="qe-mini">
                ${opts.map((o, k) => `
                    <button type="button" class="qe-lt ${q.answer === o && o !== '' ? 'on' : ''}"
                            data-qe-pick="${i}" data-k="${k}" title="حدّد الإجابة الصحيحة">${LETTERS[k]}</button>
                    <input class="qe-in" value="${escapeAttr(o)}" data-qe-opt="${i}" data-k="${k}"
                           placeholder="الخيار ${LETTERS[k]}">
                `).join('')}
            </div>`;
        }
        if (q.type === 'tf') {
            return `<div class="qe-tf">
                <button type="button" data-qe-tf="${i}" data-val="صح" class="${q.answer === 'صح' ? 'on' : ''}">صح ✓</button>
                <button type="button" data-qe-tf="${i}" data-val="خطأ" class="${q.answer === 'خطأ' ? 'on' : ''}">خطأ ✗</button>
            </div>`;
        }
        if (q.type === 'fill') {
            return `<div class="qe-mini one">
                <input class="qe-in" value="${escapeAttr(q.answer || '')}" data-qe-ans="${i}"
                       placeholder="الإجابة الصحيحة">
            </div>`;
        }
        return '';
    }

    function itemHtml(q, i, k, o) {
        return `
        <div class="qe-item">
            <span class="qe-n">${arDigits(k + 1)}</span>
            <div class="qe-body">
                <textarea class="qe-ta" rows="2" data-qe-text="${i}"
                          placeholder="اكتب نصّ السؤال…">${escapeHtml(q.text)}</textarea>
                ${miniFor(q, i)}
                <div class="qe-tools">
                    ${o.points ? `<span class="qe-pts-l">الدرجة</span>
                        <input class="qe-pts" type="number" min="1" max="20"
                               value="${q.points || 1}" data-qe-pts="${i}">` : ''}
                    ${typeof o.actions === 'function' ? o.actions(i) : ''}
                    <button type="button" class="qe-del" data-qe-del="${i}" title="حذف السؤال">🗑️</button>
                </div>
            </div>
        </div>`;
    }

    const EMPTY_HINT = `
        <div class="qe-empty">
            <p>لا أسئلة بعد.</p>
            <p class="sub">اختر نوع السؤال من الأسفل، ويُفتح له قسمٌ يُطبع كما تراه.</p>
        </div>`;

    /**
     * يرسم المحرّر كاملاً: الرأس ثم الأقسام ثم أزرار فتح قسمٍ جديد.
     * @param {string} title
     * @param {Array} qs
     * @param {object} [o] { points:bool, actions:(i)=>string, titleLabel:string }
     */
    function editorHtml(title, qs, o) {
        o = o || {};
        const groups = groupByType(qs);

        const secs = groups.map((g, gi) => {
            const t = typeOf(g.type);
            const sum = g.items.reduce((s, x) => s + (x.q.points || 0), 0);
            return `
            <section class="qe-sec">
                <div class="qe-sec-head">
                    <span class="t">السؤال ${ORDINALS[gi] || arDigits(gi + 1)}: ${t.sec}</span>
                    ${o.points && sum ? `<span class="g">${mWord(sum)}</span>` : ''}
                </div>
                <div class="qe-items">
                    ${g.items.map((x, k) => itemHtml(x.q, x.i, k, o)).join('')}
                </div>
                <button type="button" class="qe-add-in" data-qe-add="${g.type}">+ سؤال في هذا القسم</button>
            </section>`;
        }).join('');

        const missing = TYPES.filter((t) => !groups.some((g) => g.type === t.k));
        const adder = missing.length ? `
            <div class="qe-new">
                <span class="lbl">${groups.length ? 'أضف قسماً جديداً' : 'ابدأ بقسم'}</span>
                ${missing.map((t) => `<button type="button" data-qe-add="${t.k}">${t.n}</button>`).join('')}
            </div>` : '';

        return headHtml(title, qs, o)
             + `<div class="qe-secs">${groups.length ? secs : EMPTY_HINT}${adder}</div>`;
    }

    /* ------------------------------------------------------------------
       الربط. تغييرُ البنية (إضافة/حذف/اختيار) يستدعي إعادة الرسم، أما
       الكتابة فلا — إعادة الرسم عند كل حرفٍ تفقد مؤشّر الكتابة.
       ------------------------------------------------------------------ */
    function bind(root, qs, o) {
        o = o || {};
        const rerender = o.rerender || (() => {});
        const onTitle  = o.onTitle  || (() => {});

        /* الاستماع مفوَّضٌ على الحاوية، والحاوية تبقى بين رسمةٍ وأخرى —
           فلولا نزع سابقيه لتراكمت المستمعات مع كل إعادة رسم، فتُحذف
           بضغطةٍ واحدة عدّة أسئلة. */
        if (root.__qeOff) root.__qeOff();

        const onInput = (e) => {
            const el = e.target;
            if (el.dataset.qeTitle !== undefined) return onTitle(el.value);
            if (el.dataset.qeText !== undefined) {
                qs[Number(el.dataset.qeText)].text = el.value; return;
            }
            if (el.dataset.qeAns !== undefined) {
                qs[Number(el.dataset.qeAns)].answer = el.value; return;
            }
            if (el.dataset.qePts !== undefined) {
                qs[Number(el.dataset.qePts)].points = Number(el.value) || 1; return;
            }
            if (el.dataset.qeOpt !== undefined) {
                const q = qs[Number(el.dataset.qeOpt)];
                const k = Number(el.dataset.k);
                /* لو كان هذا الخيار هو المعلَّم صحيحاً، تتبع الإجابةُ نصَّه
                   الجديد — وإلّا بقيت تشير إلى نصٍّ لم يعد موجوداً. */
                const wasAnswer = q.answer !== '' && q.answer === q.options[k];
                q.options[k] = el.value;
                if (wasAnswer) q.answer = el.value;
            }
        };

        const onClick = (e) => {
            const b = e.target.closest('button');
            if (!b || !root.contains(b)) return;

            if (b.dataset.qePick !== undefined) {
                const q = qs[Number(b.dataset.qePick)];
                q.answer = q.options[Number(b.dataset.k)];
                return rerender();
            }
            if (b.dataset.qeTf !== undefined) {
                qs[Number(b.dataset.qeTf)].answer = b.dataset.val;
                return rerender();
            }
            if (b.dataset.qeDel !== undefined) {
                if (!global.confirm('حذف هذا السؤال؟')) return;
                qs.splice(Number(b.dataset.qeDel), 1);
                return rerender();
            }
            if (b.dataset.qeAdd !== undefined) {
                addOfType(qs, b.dataset.qeAdd, !!o.points);
                return rerender();
            }
        };

        /* مجموع الدرجات في الرأس وفي رأس القسم لا يتحدّث مع الكتابة —
           فالكتابة لا تُعيد الرسم حفاظاً على مؤشّر الكتابة. فنعيده عند
           مغادرة خانة الدرجة: عندها لا مؤشّر يضيع. */
        const onChange = (e) => {
            if (e.target.dataset.qePts !== undefined) rerender();
        };

        root.addEventListener('input', onInput);
        root.addEventListener('click', onClick);
        root.addEventListener('change', onChange);
        root.__qeOff = () => {
            root.removeEventListener('input', onInput);
            root.removeEventListener('click', onClick);
            root.removeEventListener('change', onChange);
            root.__qeOff = null;
        };
    }

    /** يمنع الطباعة قبل اكتمال الورقة. يُرجع رسالةً أو null. */
    function validate(qs) {
        if (!qs.length) return 'أضف سؤالاً واحداً على الأقل.';
        const blankAt = qs.findIndex((q) => !String(q.text || '').trim());
        if (blankAt >= 0) return `السؤال ${arDigits(blankAt + 1)} بلا نصّ — اكتبه أو احذفه.`;
        return null;
    }

    global.QuestionEditor = {
        TYPES, TYPE_LABELS, LETTERS,
        blank, addOfType, fromExercises,
        editorHtml, bind, validate,
        arDigits, qWord, mWord
    };
})(window);
