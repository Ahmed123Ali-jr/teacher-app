/* ==========================================================================
   question-editor.js — محرّر الأسئلة المشترك بين الاختبارات وأوراق العمل.

   البنيةُ مستويان لا مستوىً واحد، كما يكتب المعلّم ورقتَه فعلاً:
     · **السؤال** قسمٌ له نوعٌ وترويسةٌ تُطبع: «السؤال الأول: اختر
       الإجابة الصحيحة».
     · و**الفقرات** تحته، كلُّ فقرةٍ سؤالٌ من ذلك النوع مرقّمٌ داخله.
     · و«+ فقرة» تحت آخر فقرةٍ تزيد من النوع نفسِه بلا قائمةٍ ولا اختيار.
     · و«+ أضف سؤالاً» في الشريط السفلي يفتح الأنواعَ لقسمٍ جديد.
   (طلبُ المعلّم ٢١ أغسطس ٢٠٢٦، واعتُمد على معاينة q2.html.)

   وثمرةُ ذلك أن نوع السؤال يُختار مرّةً للقسم كلِّه، فتسقط قائمةٌ منسدلة
   كانت تتكرّر مع كل فقرة.

   والقسمُ واحدٌ لكل نوع: المصفوفةُ مسطّحةٌ يجمّعها `groupByType`،
   و`print-exam.js` يجمّع بالنوع أيضاً — فلو فُتح قسمان من نوعٍ واحد
   لاندمجا في الورقة واختلفت الشاشةُ عن الورق. ولذلك اختيارُ نوعٍ مفتوحٍ
   من ورقة الأنواع يُضيف فقرةً إلى قسمه بدل أن يفتح له قسماً ثانياً.

   ونصوصُ الترويسات هنا مصدرُها الوحيد، يقرأها `print-exam.js` منها:
   وعدُ المحرّر أن ما تراه هو ما يُطبع، ونسختان من النصّ تنقضان الوعدَ
   بأوّل تعديل.

   والفارق الوحيد بين الاختبار وورقة العمل درجة: الأول يحملها، والثانية لا.
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

    /* ترويسةُ القسم كما تُطبع حرفاً بحرف. النقطتان في آخرها للورق،
       وتُنزعان على الشاشة وحدَها.

       وبلا شكلٍ: كانت «صِل» وحدَها مشكولةً بين الخمس، فتصير الكسرةُ في
       ‎12.5px‎ نقطةً تحت الصاد تُقرأ غلطاً مطبعيّاً لا حركة. (بلاغُ
       المعلّم، ٢٢ أغسطس ٢٠٢٦.) وشدّةُ «عمّا» تبقى: تمييزٌ لا زينة. */
    const SECTION_TITLE = {
        mcq:   'اختر الإجابة الصحيحة فيما يأتي:',
        tf:    'ضع علامة (✓) أمام العبارة الصحيحة و(✗) أمام العبارة الخاطئة:',
        fill:  'أكمل الفراغ بما يناسبه:',
        essay: 'أجب عمّا يأتي:',
        match: 'صل العمود (أ) بما يناسبه من العمود (ب):'
    };
    const leadOf = (k) => String(SECTION_TITLE[k] || SECTION_TITLE.essay).replace(/\s*:\s*$/, '');

    const TYPES = [
        { k: 'mcq',   n: 'اختيار من متعدد' },
        { k: 'tf',    n: 'صح / خطأ' },
        { k: 'fill',  n: 'أكمل الفراغ' },
        { k: 'essay', n: 'مقالي' },
        { k: 'match', n: 'مطابقة' }
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
    const pWord = (n) => countWord(n, 'فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة');
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

    /** يحوّل تمارين ورقة العمل القديمة (نصٌّ حرّ) إلى فقراتٍ مقالية. */
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

    /** يُدرج الفقرة بعد آخر فقرةٍ من نوعها ليبقى الترتيب مجمّعاً. */
    function addOfType(qs, type, withPoints) {
        const q = blank(withPoints, type);
        let at = -1;
        qs.forEach((x, i) => { if (x.type === type) at = i; });
        if (at < 0) qs.push(q); else qs.splice(at + 1, 0, q);
        return qs.indexOf(q);
    }

    /* أيقونةُ الحذف مرسومةٌ لا رمزاً تعبيريّاً: الرمزُ يأخذ لونَ الخطّ
       الملوّن في النظام فيبقى رماديّاً على ترويسة القسم البترولية،
       والمرسومةُ تتبع `currentColor` فتُرى بيضاءَ عليها. */
    const TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

    const kindOf = (q) => (TYPE_LABELS[q.type] ? q.type : 'essay');

    function groupByType(qs) {
        const order = [];
        const map = new Map();
        qs.forEach((q, i) => {
            const t = kindOf(q);
            if (!map.has(t)) { map.set(t, []); order.push(t); }
            map.get(t).push({ q, i });
        });
        return order.map((t) => ({ type: t, items: map.get(t) }));
    }

    /* ------------------------------------------------------------------
       الرسم
       ------------------------------------------------------------------ */

    /** بطاقة الرأس: العنوان وحصيلة الورقة سؤالاً وفقرةً ودرجة. */
    function headHtml(title, qs, groups, o) {
        const total = qs.reduce((s, q) => s + (q.points || 0), 0);
        return `
        <div class="qe-head">
            <div class="qe-lbl">${escapeHtml((o && o.titleLabel) || 'عنوان الاختبار')}</div>
            <input class="qe-title" data-qe-title value="${escapeAttr(title || '')}"
                   placeholder="اكتب العنوان…">
            ${qs.length ? `<div class="qe-chips">
                <span class="qe-chip">${qWord(groups.length)}</span>
                <span class="qe-chip">${pWord(qs.length)}</span>
                ${o && o.points ? `<span class="qe-chip gold">${mWord(total)}</span>` : ''}
            </div>` : ''}
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

    /** الفقرة: رقمُها داخل قسمها، لا داخل الورقة كلِّها. */
    function itemHtml(q, i, k, o) {
        return `
        <div class="qe-item">
            <span class="qe-n">${arDigits(k + 1)}</span>
            <div class="qe-body">
                <textarea class="qe-ta" rows="2" data-qe-text="${i}"
                          placeholder="اكتب نصّ الفقرة…">${escapeHtml(q.text)}</textarea>
                ${miniFor(q, i)}
                <div class="qe-tools">
                    ${o.points ? `<span class="qe-pts-l">الدرجة</span>
                        <input class="qe-pts" type="number" min="1" max="20"
                               value="${q.points || 1}" data-qe-pts="${i}">` : ''}
                    ${typeof o.actions === 'function' ? o.actions(i) : ''}
                    <button type="button" class="qe-del" data-qe-del="${i}"
                            title="حذف الفقرة" aria-label="حذف الفقرة">${TRASH}</button>
                </div>
            </div>
        </div>`;
    }

    function secHtml(g, gi, o) {
        const sum = g.items.reduce((s, x) => s + (x.q.points || 0), 0);
        return `
        <section class="qe-sec" data-qe-sec="${g.type}">
            <div class="qe-sec-head">
                <div class="tx">
                    <b>السؤال ${ORDINALS[gi] || arDigits(gi + 1)}: ${escapeHtml(leadOf(g.type))}</b>
                    <span>${escapeHtml(typeOf(g.type).n)} — ${pWord(g.items.length)}</span>
                </div>
                ${o.points && sum ? `<span class="g">${mWord(sum)}</span>` : ''}
                <button type="button" class="qe-sec-del" data-qe-sec-del="${g.type}"
                        title="حذف السؤال بفقراته" aria-label="حذف السؤال بفقراته">${TRASH}</button>
            </div>
            <div class="qe-items">
                ${g.items.map((x, k) => itemHtml(x.q, x.i, k, o)).join('')}
            </div>
            <button type="button" class="qe-add-in" data-qe-add="${g.type}">+ فقرة</button>
        </section>`;
    }

    /* ورقةُ الأنواع: زرٌّ واحدٌ يفتحها بدل صفٍّ من خمسة أزرارٍ مبثوثة.
       والنوعُ المفتوح يبقى معروضاً لا يُخفى، لأن إخفاءه يجعل الزرَّ يفقد
       خياراته واحداً بعد واحدٍ حتى يصير بلا معنى. */
    function sheetHtml(qs) {
        const used = new Set(qs.map(kindOf));
        return `
        <div class="qe-sheet" data-qe-sheet hidden>
            <div class="qe-sheet-in" role="dialog" aria-label="نوع السؤال">
                <div class="h">نوعُ السؤال</div>
                ${TYPES.map((t) => `
                    <button type="button" class="${used.has(t.k) ? 'used' : ''}" data-qe-add="${t.k}">
                        <b>${escapeHtml(t.n)}</b>
                        <small>${used.has(t.k)
                            ? 'مفتوحٌ أصلاً — تُضاف فقرةٌ إليه'
                            : escapeHtml(leadOf(t.k))}</small>
                    </button>`).join('')}
            </div>
        </div>`;
    }

    /** زرُّ فتح ورقة الأنواع. تضعه الشاشةُ في شريطها السفلي الثابت. */
    const addBtnHtml = () =>
        '<button type="button" class="qe-addsec" data-qe-open>+ أضف سؤالاً</button>';

    const EMPTY_HINT = `
        <div class="qe-empty">
            <p>لا أسئلة بعد.</p>
            <p class="sub">اضغط «+ أضف سؤالاً» واخترْ نوعه، ثمّ أضف فقراتِه.</p>
        </div>`;

    /**
     * يرسم المحرّر: الرأس ثم الأقسام ثم ورقة الأنواع (مطويّة).
     * وزرُّ «+ أضف سؤالاً» ليس منه — تضعه الشاشةُ في شريطها الثابت.
     * @param {string} title
     * @param {Array} qs
     * @param {object} [o] { points:bool, actions:(i)=>string, titleLabel:string }
     */
    function editorHtml(title, qs, o) {
        o = o || {};
        const groups = groupByType(qs);
        const secs = groups.map((g, gi) => secHtml(g, gi, o)).join('');
        return headHtml(title, qs, groups, o)
             + `<div class="qe-secs">${groups.length ? secs : EMPTY_HINT}</div>`
             + sheetHtml(qs);
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
           بضغطةٍ واحدة عدّة فقرات. */
        if (root.__qeOff) root.__qeOff();

        const sheet = () => root.querySelector('[data-qe-sheet]');
        const openSheet = (on) => {
            const el = sheet();
            if (!el) return;
            el.hidden = !on;
            el.classList.toggle('on', !!on);
        };

        /* بعد الإضافة: الفقرةُ الجديدة إلى وسط الشاشة والمؤشّر فيها —
           فالمعلّم أضافها ليكتبها، لا لينزل إليها بإصبعه. */
        const focusItem = (at) => {
            const ta = root.querySelector(`[data-qe-text="${at}"]`);
            if (!ta) return;
            ta.focus({ preventScroll: true });
            ta.scrollIntoView({ block: 'center' });
        };

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
            /* النقرُ على العتمة خلف الورقة يُغلقها. ولا بدّ أن يسبق البحثَ
               عن زرّ: العتمةُ ليست زرّاً، فيسقط النقرُ صامتاً. */
            const sh = sheet();
            if (sh && e.target === sh) return openSheet(false);

            const b = e.target.closest('button');
            if (!b || !root.contains(b)) return;

            if (b.dataset.qeOpen !== undefined) return openSheet(true);

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
                if (!global.confirm('حذف هذه الفقرة؟')) return;
                qs.splice(Number(b.dataset.qeDel), 1);
                return rerender();
            }
            if (b.dataset.qeSecDel !== undefined) {
                const t = b.dataset.qeSecDel;
                const n = qs.filter((q) => kindOf(q) === t).length;
                if (!global.confirm(`حذف هذا السؤال و${pWord(n)} فيه؟`)) return;
                for (let i = qs.length - 1; i >= 0; i -= 1) {
                    if (kindOf(qs[i]) === t) qs.splice(i, 1);
                }
                return rerender();
            }
            if (b.dataset.qeAdd !== undefined) {
                const at = addOfType(qs, b.dataset.qeAdd, !!o.points);
                rerender();
                return focusItem(at);
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
        const groups = groupByType(qs);
        for (let gi = 0; gi < groups.length; gi += 1) {
            const at = groups[gi].items.findIndex((x) => !String(x.q.text || '').trim());
            if (at >= 0) {
                return `الفقرة ${arDigits(at + 1)} من السؤال ${ORDINALS[gi] || arDigits(gi + 1)}`
                     + ' بلا نصّ — اكتبها أو احذفها.';
            }
        }
        return null;
    }

    global.QuestionEditor = {
        TYPES, TYPE_LABELS, LETTERS, SECTION_TITLE,
        blank, addOfType, fromExercises, groupByType,
        editorHtml, addBtnHtml, bind, validate,
        arDigits, qWord, pWord, mWord
    };
})(window);
