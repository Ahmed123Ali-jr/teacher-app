/* ==========================================================================
   question-editor.js — محرّر الأسئلة المشترك بين الاختبارات وأوراق العمل.

   البنيةُ مستويان لا مستوىً واحد، كما يكتب المعلّم ورقتَه فعلاً:
     · **السؤال** قسمٌ له نوعٌ وترويسةٌ تُطبع: «السؤال الأول: اختر
       الإجابة الصحيحة».
     · و**الفقرات** تحته، كلُّ فقرةٍ سؤالٌ من ذلك النوع مرقّمٌ داخله.
     · و«+ فقرة» تحت آخر فقرةٍ تزيد من النوع نفسِه بلا قائمةٍ ولا اختيار.
   (طلبُ المعلّم ٢١ أغسطس ٢٠٢٦، واعتُمد على معاينة q2.html.)

   ── وقسمٌ واحدٌ مفتوح ──
   الشاشةُ تُفتح خاليةً، و«+ أضف سؤالاً» يُظهر لوحةَ الأنواع في متن
   الصفحة — لا ورقةً منبثقةً فوقها. ويُكتب القسمُ ثمّ يُضغط «تم» فيُطوى
   إلى رأسه البتروليِّ باسم نوعه، ويعود الزرُّ لما بعده. والمطويُّ يُفتح
   بضغطةٍ عليه فينطوي المفتوحُ مكانَه.
   (طلبُ المعلّم ٢٩ أغسطس ٢٠٢٦، واعتُمد على معاينة q3.html — الشكل «د».)

   ولا سلّةَ حذفٍ في المطويّ **بشرطه**: حذفُ سؤالٍ بفقراته ضغطةٌ لا
   تُستدرك، فلا تُتاح إلّا وهو مفتوحٌ يرى ما يحذف. والمنعُ بالسلوك لا
   بالإخفاء — `display:none` يمنع الإصبعَ ولا يمنع الحدث، فأيُّ ضغطةٍ
   داخل شريطٍ مطويٍّ تفتحه ولا شيءَ غير ذلك.

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
                    <input class="qe-in${LTR ? ' qe-ltr' : ''}"${LTR ? ' dir="ltr"' : ''} value="${escapeAttr(o)}" data-qe-opt="${i}" data-k="${k}"
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
                <input class="qe-in${LTR ? ' qe-ltr' : ''}"${LTR ? ' dir="ltr"' : ''} value="${escapeAttr(q.answer || '')}" data-qe-ans="${i}"
                       placeholder="الإجابة الصحيحة">
            </div>`;
        }
        return '';
    }

    /* المطابقةُ طرفان لا طرف: نصُّ الفقرة هو العمود (أ)، وما يقابله في
       (ب) يسكن `answer` كما تسكنه إجابةُ «أكمل الفراغ». */
    const PLACEHOLDER = {
        fill:  'اكتب العبارة، وضع مكان الفراغ ……',
        tf:    'اكتب العبارة كاملةً'
    };

    /* حقلُ المطابقة سطرٌ لا مربّع: طرفاها كلمةٌ أو شبهُ جملة، والمربّعُ
       ذو السطرين يوهم أن المطلوب فقرةٌ كاملة. ووسمُ الحرف على كلٍّ منهما
       يبقى ظاهراً بعد الكتابة، والنائبُ عنه يختفي بأوّل حرف. */
    function fieldsHtml(q, i) {
        if (q.type !== 'match') {
            return `<textarea class="qe-ta${LTR ? ' qe-ltr' : ''}" rows="2" data-qe-text="${i}"
                          ${LTR ? 'dir="ltr"' : ''}
                          placeholder="${escapeAttr(PLACEHOLDER[q.type] || 'اكتب نصّ الفقرة…')}"
                          >${escapeHtml(q.text)}</textarea>`;
        }
        return `
            <div class="qe-pair">
                <span class="qe-tag">أ</span>
                <input class="qe-in${LTR ? ' qe-ltr' : ''}"${LTR ? ' dir="ltr"' : ''} data-qe-text="${i}" value="${escapeAttr(q.text)}"
                       placeholder="العمود (أ) — مثلاً: الخشب">
            </div>
            <div class="qe-pair">
                <span class="qe-tag">ب</span>
                <input class="qe-in${LTR ? ' qe-ltr' : ''}"${LTR ? ' dir="ltr"' : ''} data-qe-ans="${i}" value="${escapeAttr(q.answer || '')}"
                       placeholder="ما يقابله في العمود (ب)">
            </div>`;
    }

    /** الفقرة: رقمُها داخل قسمها، لا داخل الورقة كلِّها. */
    function itemHtml(q, i, k, o) {
        return `
        <div class="qe-item">
            <span class="qe-n">${arDigits(k + 1)}</span>
            <div class="qe-body">
                ${fieldsHtml(q, i)}
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

    /* ══ حالةُ الطيّ ══
       قسمٌ واحدٌ مفتوحٌ في كل مرّة، وما أنهاه المعلّم يُطوى إلى رأسه فوقَه.
       (طلبُ المعلّم ٢٩ أغسطس ٢٠٢٦، واعتُمد على معاينة q3.html — الشكل «د».)

       والحالةُ مقرونةٌ بمصفوفة الأسئلة نفسِها لا بالوحدة: المحرّرُ مشتركٌ
       بين الاختبارات وأوراق العمل، فلو كانت الحالةُ للوحدة لانتقل «المفتوح»
       من ورقةٍ إلى أخرى. ومقارنةُ الهويّة تُصفّرها عند تبدّل الورقة. */
    let FOLD = { qs: null, open: null, picking: false };
    function foldState(qs) {
        if (FOLD.qs !== qs) FOLD = { qs: qs, open: null, picking: false };
        return FOLD;
    }

    function secHtml(g, gi, o, folded) {
        /* المطويُّ يقول نوعَه لا ترويسةَ طباعته: الترويسةُ الطويلةُ تنفع
           مفتوحاً حيث تُراجَع بالعين، ولا تنفع سطراً يُلمح لمحاً. */
        if (folded) {
            return `
        <section class="qe-sec qe-fold" data-qe-sec="${g.type}">
            <div class="qe-sec-head">
                <div class="tx">
                    <b>السؤال ${ORDINALS[gi] || arDigits(gi + 1)}: ${escapeHtml(typeOf(g.type).n)}</b>
                    <span>${pWord(g.items.length)}</span>
                </div>
                ${o.points && g.items.reduce((x, y) => x + (y.q.points || 0), 0)
                    ? `<span class="g">${mWord(g.items.reduce((x, y) => x + (y.q.points || 0), 0))}</span>`
                    : ''}
            </div>
        </section>`;
        }
        return secOpenHtml(g, gi, o);
    }

    function secOpenHtml(g, gi, o) {
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

    /* لوحةُ الأنواع: في متن الصفحة لا ورقةً منبثقةً فوقها. المنبثقةُ كانت
       طبقةً ثالثةً بين المعلّم وورقته، وهنا الأنواعُ في مكان القسم الذي
       ستفتحه — فالنظرُ لا ينتقل والإصبعُ لا يعود.
       والنوعُ المفتوح يبقى معروضاً لا يُخفى، لأن إخفاءه يجعل القائمةَ تفقد
       خياراتها واحداً بعد واحدٍ حتى تصير بلا معنى. */
    function panelHtml(qs, head) {
        const used = new Set(qs.map(kindOf));
        return `
        <div class="qe-panel" role="group" aria-label="نوع السؤال">
            <div class="h">${head}</div>
            ${TYPES.map((t) => `
                <button type="button" class="${used.has(t.k) ? 'used' : ''}" data-qe-add="${t.k}">
                    <b>${escapeHtml(t.n)}</b>
                    <small>${used.has(t.k)
                        ? 'مفتوحٌ أصلاً — تُضاف فقرةٌ إليه'
                        : escapeHtml(leadOf(t.k))}</small>
                </button>`).join('')}
        </div>`;
    }

    /** زرُّ إظهار لوحة الأنواع. تضعه الشاشةُ في شريطها السفلي الثابت.
        ويسقط ما دام قسمٌ مفتوحاً أو اللوحةُ ظاهرة: زرٌّ يفتح ما هو مفتوحٌ
        زرٌّ يكذب. ويُنادى بعد `editorHtml` في الشاشتين، فالحالةُ مضبوطة. */
    const addBtnHtml = () => (FOLD.open || FOLD.picking) ? ''
        : '<button type="button" class="qe-addsec" data-qe-open>+ أضف سؤالاً</button>';

    /**
     * يرسم المحرّر: الرأس ثم الأقسام ثم ورقة الأنواع (مطويّة).
     * وزرُّ «+ أضف سؤالاً» ليس منه — تضعه الشاشةُ في شريطها الثابت.
     * @param {string} title
     * @param {Array} qs
     * @param {object} [o] { points:bool, actions:(i)=>string, titleLabel:string }
     */
    /* ── اتّجاهُ حقول الكتابة ──
       التطبيقُ عربيٌّ فحقولُه من اليمين، ومعلّمُ الإنجليزيّة يكتب سؤالَه
       الإنجليزيَّ فيلتصق باليمين ويقرؤه بعينٍ معكوسة. فالحقولُ وحدَها
       تُقلب حين تكون المادّةُ إنجليزيّة — لا الواجهةُ كلُّها. */
    let LTR = false;

    function editorHtml(title, qs, o) {
        o = o || {};
        LTR = !!o.ltr;
        const groups = groupByType(qs);
        const F = foldState(qs);

        /* قسمٌ حُذف وهو مفتوح: لولا هذا لبقي «تم» معروضاً وزرُّ الإضافة
           ساقطاً، فلا يجد المعلّم بابَ خروجٍ من شاشةٍ فارغة. */
        if (F.open && !groups.some((g) => g.type === F.open)) F.open = null;

        const secs = groups.map((g, gi) => secHtml(g, gi, o, g.type !== F.open)).join('');
        const tail = F.open
            ? '<button type="button" class="qe-done" data-qe-done>تم</button>'
            : (F.picking
                ? panelHtml(qs, groups.length ? 'اختر النوع الذي بعده:' : 'نوعُ السؤال:')
                : '');

        return headHtml(title, qs, groups, o)
             + `<div class="qe-secs">${secs}</div>`
             + tail;
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

        const F = foldState(qs);

        const onClick = (e) => {
            /* الشريطُ المطويُّ يُفتح بالضغط أيّاً كان موضعُ الإصبع منه.
               ولا سلّةَ حذفٍ فيه أصلاً — وحذفُ سؤالٍ بفقراته ضغطةٌ لا
               تُستدرك، فلا تُتاح إلّا وهو مفتوحٌ يرى ما يحذف. (شرطُ
               المعلّم عند اعتماد الشكل.) وهذا يسبق البحثَ عن زرّ: الشريطُ
               ليس زرّاً، فيسقط النقرُ عليه صامتاً لولا هذا. */
            const fold = e.target.closest('.qe-fold');
            if (fold && root.contains(fold)) {
                F.open = fold.dataset.qeSec;
                F.picking = false;
                return rerender();
            }

            const b = e.target.closest('button');
            if (!b || !root.contains(b)) return;

            if (b.dataset.qeOpen !== undefined) {
                F.picking = true;
                return rerender();
            }
            if (b.dataset.qeDone !== undefined) {
                F.open = null;
                F.picking = false;
                return rerender();
            }

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
                F.open = b.dataset.qeAdd;      /* المُضافُ إليه هو المفتوح */
                F.picking = false;
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
            const g = groups[gi];
            const sec = `السؤال ${ORDINALS[gi] || arDigits(gi + 1)}`;
            const at = g.items.findIndex((x) => !String(x.q.text || '').trim());
            if (at >= 0) {
                return `الفقرة ${arDigits(at + 1)} من ${sec} بلا نصّ — اكتبها أو احذفها.`;
            }
            /* المطابقةُ وحدَها تسقط بنصف فقرة: طرفٌ في (أ) بلا مقابلٍ في
               (ب) يخرج على الورق سطراً في عمودٍ وفراغاً في الآخر. */
            if (g.type === 'match') {
                const half = g.items.findIndex((x) => !String(x.q.answer || '').trim());
                if (half >= 0) {
                    return `الفقرة ${arDigits(half + 1)} من ${sec} بلا عمود (ب) —`
                         + ' اكتب ما يقابلها.';
                }
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
