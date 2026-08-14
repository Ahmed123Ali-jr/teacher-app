/* ==========================================================================
   print-exam.js — ورقة الاختبار وورقة العمل: التصميم الرسمي السعودي.

   كانت هذه الوحدة تبني HTML ثم تستدعي window.print()، وهو خامدٌ داخل
   WKWebView — أي أن المعلّم على جواله كان يضغط «طباعة» فلا يحدث شيء.
   صارت تبني الصفحات بنفسها وتُسلّمها لـPdfCore التقاطاً وتسليماً.

   ولماذا تُرقِّم بنفسها بدل PdfCore.paginate: قواعد ورقة الاختبار خاصّة
   — جدول صح/خطأ ينقسم عند صفوفه ويتكرّر رأسه، وعنوان القسم لا يُترك
   وحيداً في الذيل، و«تابع» يظهر حين ينتقل قسمٌ لم ينته. وهذا كما فعل
   السجل في splitPages: التصدير مشترك، والتقسيم لكلٍّ طبيعته.

   الترويسة الرسمية في الصفحة الأولى وحدها — قرار المعلّم: ما بعدها بلا
   ترويسة، فتُترك المساحة كلها للأسئلة ويكفي رقم الصفحة في الأسفل.
   ========================================================================== */

(function (global) {
    'use strict';

    const P = () => global.PdfCore.PAGE;

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* «درجة واحدة» لا «١ درجة»، و«درجتان» لا «٢ درجة» — ورقة الاختبار
       يقرؤها مشرفٌ والتصريف العربي يختلف بالعدد. */
    function marks(n) {
        if (!n) return '';
        if (n === 1) return 'درجة واحدة';
        if (n === 2) return 'درجتان';
        if (n <= 10) return ar(n) + ' درجات';
        return ar(n) + ' درجة';
    }

    /* درجةٌ غير مذكورة تعني «واحدة» في الاختبار، أما ورقة العمل فتمرّر
       صفراً صريحاً — فالفرق بين «لم تُذكر» و«لا درجة» فرقٌ حقيقي. */
    const pts = (q) => (q.points == null ? 1 : q.points);

    const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع'];
    const LETTERS  = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

    const SECTION_TITLE = {
        mcq:   'اختر الإجابة الصحيحة فيما يأتي:',
        tf:    'ضع علامة (✓) أمام العبارة الصحيحة و(✗) أمام العبارة الخاطئة:',
        fill:  'أكمل الفراغ بما يناسبه:',
        essay: 'أجب عمّا يأتي:',
        match: 'صِل العمود (أ) بما يناسبه من العمود (ب):'
    };
    /* أسئلة غير معروفة النوع تُعامل معاملة المقالي: مساحة كتابة. */
    const titleOf = (t) => SECTION_TITLE[t] || SECTION_TITLE.essay;

    /* ------------------------------------------------------------------
       تنسيق الورقة. مستقلٌّ عن print.css عمداً: هذه الأنماط لا تخصّ إلا
       ورقة الاختبار، وربطها بملفٍ مشترك يجعل أيّ تعديلٍ فيه خطراً عليها.
       ------------------------------------------------------------------ */
    const SHEET_CSS = `
    .ex-pg { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; color: #111; }
    .ex-pg h1, .ex-pg ol, .ex-pg ul, .ex-pg p { margin: 0; padding: 0; }
    .ex-pg ol, .ex-pg ul { list-style: none; }
    .ex-body > :first-child { margin-top: 0 !important; }
    .ex-foot {
        position: absolute; bottom: 26px; inset-inline: 57px;
        text-align: center; font-size: 11.5px; color: #555;
        border-top: 1px solid #DDD; padding-top: 6px;
    }
    .ex-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
    .ex-head .side { font-size: 13.5px; line-height: 2.05; font-weight: 700; }
    .ex-head .side.l { text-align: left; }
    .ex-logo { width: 78px; height: 78px; object-fit: contain; }
    .ex-logo-ph { width: 78px; height: 78px; }
    .ex-rule  { border: 0; border-top: 2px solid #111; margin: 10px 0 0; }
    .ex-rule2 { border: 0; border-top: 1px solid #111; margin: 2px 0 14px; }
    .ex-title { text-align: center; font-size: 18px; font-weight: 900; margin-bottom: 14px !important; }
    .ex-info { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .ex-info td { border: 1px solid #111; padding: 9px 10px; font-size: 14px; font-weight: 700; }
    .ex-note { font-size: 13px; line-height: 1.9; margin-bottom: 14px !important; }
    .ex-sec {
        display: flex; align-items: baseline; gap: 8px;
        font-size: 15.5px; font-weight: 900; margin: 18px 0 10px;
        border-bottom: 1.5px solid #111; padding-bottom: 5px;
    }
    .ex-sec .g { margin-inline-start: auto; font-size: 13px; font-weight: 700; }
    .ex-cont {
        font-size: 13px; font-weight: 900; color: #555;
        margin: 0 0 10px; padding-bottom: 4px; border-bottom: 1px dashed #BBB;
    }
    .ex-q { display: flex; gap: 8px; margin-bottom: 6px; align-items: baseline; }
    .ex-q .n { font-weight: 900; font-size: 15px; line-height: 1.9; }
    .ex-q .t { font-size: 15px; line-height: 1.9; }
    .ex-q .m { margin-inline-start: auto; font-size: 12.5px; color: #555; white-space: nowrap; }
    .ex-opts { display: flex; flex-wrap: wrap; gap: 4px 26px; margin: 0 0 16px 0; padding-inline-start: 22px; }
    .ex-opts li { font-size: 14.5px; line-height: 1.9; }
    .ex-tbl { width: 100%; border-collapse: collapse; }
    .ex-tbl th, .ex-tbl td { border: 1px solid #111; padding: 9px 10px; font-size: 14.5px; }
    .ex-tbl th { background: #F0F0F0; font-weight: 900; font-size: 13.5px; }
    .ex-tbl .c { text-align: center; width: 62px; }
    .ex-tbl .m { text-align: center; width: 40px; }
    .ex-tbl-wrap { margin-bottom: 16px; }
    .ex-lines { margin-bottom: 16px; }
    .ex-lines .ln { border-bottom: 1px dotted #9AA0A6; height: 30px; }
    .ex-key { width: 100%; border-collapse: collapse; }
    .ex-key td, .ex-key th { border: 1px solid #111; padding: 8px 10px; font-size: 14px; }
    .ex-key th { background: #F0F0F0; font-weight: 900; font-size: 13px; }
    .ex-key .m { text-align: center; width: 46px; font-weight: 900; }
    `;

    const TF_HEAD  = '<tr><th class="m">م</th><th>العبارة</th>'
                   + '<th class="c">صح</th><th class="c">خطأ</th></tr>';
    const KEY_HEAD = '<tr><th class="m">م</th><th>الإجابة</th></tr>';

    /* ------------------------------------------------------------------
       بناء الكتل: كل كتلة وحدة لا تُشقّ. السؤال مع خياراته، والسؤال
       المقالي مع سطور إجابته — فلا يبقى السؤال في صفحة وإجابته في أخرى.
       ------------------------------------------------------------------ */
    function groupByType(questions) {
        const order = [];
        const map = new Map();
        questions.forEach((q) => {
            const t = SECTION_TITLE[q.type] ? q.type : 'essay';
            if (!map.has(t)) { map.set(t, []); order.push(t); }
            map.get(t).push(q);
        });
        return order.map((t) => ({ type: t, items: map.get(t) }));
    }

    function lines(n) {
        return `<div class="ex-lines">${'<div class="ln"></div>'.repeat(n)}</div>`;
    }

    function buildBlocks(exam, opts) {
        const blocks = [];
        const groups = groupByType(exam.questions || []);

        groups.forEach((g, gi) => {
            const secNo = gi + 1;
            /* ورقة العمل بلا درجات: صفرٌ يعني «لا تطبع درجة» لا «صفر درجة». */
            const total = g.items.reduce((s, q) => s + pts(q), 0);
            blocks.push({ kind: 'sec', sec: secNo, html:
                `<div class="ex-sec">السؤال ${ORDINALS[gi] || ar(secNo)}: ${titleOf(g.type)}`
                + (total ? `<span class="g">(${marks(total)})</span>` : '') + '</div>' });

            /* درجة السؤال بجانبه تفيد حين تختلف داخل القسم، أما قسمٌ
               بسؤالٍ واحد فرأسه قاله سلفاً — فلا يُكتب مرّتين. */
            const perQ = g.items.length > 1;

            g.items.forEach((q, i) => {
                const n = ar(i + 1);
                if (g.type === 'tf') {
                    blocks.push({ kind: 'row', sec: secNo, head: TF_HEAD, tcls: 'ex-tbl', html:
                        `<tr><td class="m">${n}</td><td>${escapeHtml(q.text)}</td>`
                        + `<td class="c">&nbsp;</td><td class="c">&nbsp;</td></tr>` });
                    return;
                }
                if (g.type === 'mcq') {
                    blocks.push({ kind: 'q', sec: secNo, html:
                        `<div class="ex-q"><span class="n">${n}-</span>`
                        + `<span class="t">${escapeHtml(q.text)}</span></div>`
                        + `<ol class="ex-opts">${(q.options || []).map((o, k) =>
                            `<li>☐ ${LETTERS[k] || ''}) ${escapeHtml(o)}</li>`).join('')}</ol>` });
                    return;
                }
                if (g.type === 'fill') {
                    /* الفراغ إن لم يكتبه المعلم — ورقةٌ بلا فراغٍ لا يُجاب عليها. */
                    const t = String(q.text || '');
                    const withBlank = /\.{4,}|…|_{3,}/.test(t) ? t : t + ' ...............';
                    blocks.push({ kind: 'q', sec: secNo, html:
                        `<div class="ex-q" style="margin-bottom:14px;"><span class="n">${n}-</span>`
                        + `<span class="t">${escapeHtml(withBlank)}</span></div>` });
                    return;
                }
                /* مقالي / مطابقة: سؤالٌ ومساحة كتابة، كتلةً واحدة. */
                blocks.push({ kind: 'q', sec: secNo, html:
                    `<div class="ex-q"><span class="n">${n}-</span>`
                    + `<span class="t">${escapeHtml(q.text).replace(/\n/g, '<br>')}</span>`
                    + (perQ && pts(q) > 0 ? `<span class="m">(${marks(pts(q))})</span>` : '')
                    + '</div>' + lines(opts.answerLines || 4) });
            });
        });
        return blocks;
    }

    /* نموذج الإجابة: صفوفٌ لا جدولاً واحداً، فينقسم على الصفحات كما
       ينقسم جدول صح/خطأ بدل أن يقفز بأكمله إلى صفحةٍ جديدة. */
    function buildKeyBlocks(exam) {
        const groups = groupByType(exam.questions || []);
        const out = [{ kind: 'sec', sec: 0, html:
            '<div class="ex-sec">نموذج الإجابة<span class="g">للمعلّم</span></div>' }];
        groups.forEach((g, gi) => {
            const secNo = gi + 1;
            out.push({ kind: 'q', sec: secNo, html:
                `<div class="ex-q" style="margin-top:10px;"><span class="t" style="font-weight:900;">`
                + `السؤال ${ORDINALS[gi] || ar(secNo)}: ${titleOf(g.type)}</span></div>` });
            g.items.forEach((q, i) => {
                out.push({ kind: 'row', sec: secNo, head: KEY_HEAD, tcls: 'ex-key', html:
                    `<tr><td class="m">${ar(i + 1)}</td><td>${escapeHtml(answerText(q))}</td></tr>` });
            });
        });
        return out;
    }

    function answerText(q) {
        if (q.type === 'mcq') {
            const i = (q.options || []).indexOf(q.answer);
            return i >= 0 ? `${LETTERS[i]}) ${q.answer}` : (q.answer || '—');
        }
        if (q.type === 'essay' || q.type === 'match') return q.answer || 'يُصحَّح تقديرياً';
        return q.answer || '—';
    }

    /* ------------------------------------------------------------------
       الترويسة
       ------------------------------------------------------------------ */
    function headerHtml(ctx) {
        const { exam, cls, teacher } = ctx;
        const p = global.PrintPrefs || {};
        const s = exam.settings || {};
        const total = (exam.questions || []).reduce((sum, q) => sum + pts(q), 0);

        const right = [
            'المملكة العربية السعودية',
            'وزارة التعليم',
            escapeHtml(p.educationDept || teacher?.education_dept || ''),
            escapeHtml(teacher?.school_name || 'المدرسة')
        ].filter(Boolean).join('<br>');

        const left = [
            cls?.subject ? `المادة: ${escapeHtml(cls.subject)}` : '',
            cls?.grade ? `الصف: ${escapeHtml(cls.grade)}${cls.section ? ' / ' + escapeHtml(cls.section) : ''}` : '',
            s.include_teacher && teacher?.name ? `المعلم: ${escapeHtml(teacher.name)}` : '',
            s.include_date ? `التاريخ: ${new Date().toLocaleDateString('ar-SA')}` : '',
            s.include_grade !== false && total ? `الدرجة: ${ar(total)}` : ''
        ].filter(Boolean).join('<br>');

        const logo = p.logoDataUrl
            ? `<img class="ex-logo" src="${p.logoDataUrl}" alt="">`
            : '<div class="ex-logo-ph"></div>';

        const term = p.academicYear ? ` — ${escapeHtml(p.academicYear)}` : '';

        /* خانة الدرجة تسقط مع الدرجات: ورقة العمل لا تُصحَّح بدرجة،
           فصندوقٌ فارغ اسمه «الدرجة» يُربك الطالب ووليّه. */
        const withGrade = s.include_grade !== false && total > 0;
        const info = (s.include_name !== false) ? `
            <table class="ex-info"><tr>
                <td style="width:${withGrade ? 58 : 70}%;">اسم الطالب: ....................................................</td>
                <td>${withGrade ? 'رقم الجلوس: ..................' : 'الصف: ..................'}</td>
                ${withGrade ? '<td style="width:15%; text-align:center;">الدرجة<br>&nbsp;</td>' : ''}
            </tr></table>` : '';

        /* تعليمات المعلم إن كتبها (ورقة العمل)، وإلّا فالنصّ المعتاد. */
        const noteText = ctx.instructions
            || (s.include_instructions
                ? 'اقرأ كل سؤالٍ بعناية ثم أجب في المكان المخصّص، ولا تترك سؤالاً دون إجابة.'
                : '');
        const note = noteText
            ? `<p class="ex-note"><strong>التعليمات:</strong> ${escapeHtml(noteText)}</p>`
            : '';

        /* المعلم قد يُطفئ الترويسة الرسمية (ورقةٌ داخلية، أو ورق مطبوعٌ
           عليه ترويسة المدرسة سلفاً) — عندها يبقى العنوان وحده. */
        const official = s.include_school === false ? '' : `
            <div class="ex-head">
                <div class="side">${right}</div>
                ${logo}
                <div class="side l">${left}</div>
            </div>
            <hr class="ex-rule"><hr class="ex-rule2">`;

        return `${official}
            <h1 class="ex-title">${escapeHtml(exam.title || 'اختبار')}${term}</h1>
            ${info}${note}`;
    }

    /* ------------------------------------------------------------------
       القياس والرصّ في صفحات A4 حقيقية.
       ------------------------------------------------------------------ */
    const FOOT_SPACE = 34;      // ما يحجزه رقم الصفحة أسفل الورقة
    const TBL_MARGIN = 16;      // ex-tbl-wrap

    function makePage() {
        const box = document.createElement('div');
        box.className = 'ex-pg';
        box.style.cssText = [
            `width:${P().W}px`, `height:${P().H}px`, 'box-sizing:border-box',
            `padding:${P().MY}px ${P().MX}px`, 'background:#fff',
            'overflow:hidden', 'position:relative'
        ].join(';');
        return box;
    }

    function paginate(blocks, stageEl, headHtml, secName) {
        /* المسطرة: عنصرٌ مستقلّ بعرض المحتوى الحقيقي. القياس بالإلحاق
           الفعلي أدقّ من حساب الأنماط، لأنه يشمل الالتفاف وانهيار
           الهوامش. ولا تُقاس داخل صفحةٍ حيّة: overflow:hidden فيها يبتلع
           الفائض بصمت فيمرّ الخطأ إلى الورق. */
        const ruler = document.createElement('div');
        ruler.style.cssText =
            `position:absolute; left:-30000px; top:0; width:${P().CONTENT_W}px; visibility:hidden;`;
        ruler.className = 'ex-pg';
        stageEl.appendChild(ruler);

        const measure = (html, tcls) => {
            ruler.innerHTML = tcls ? `<table class="${tcls}">${html}</table>` : html;
            const h = ruler.offsetHeight;
            ruler.innerHTML = '';
            return h;
        };

        /* رؤوس الجداول تُقاس مرّةً واحدة لكل رأس: القياس يُجبر المتصفّح
           على إعادة التخطيط، وهو أغلى ما في الرصّ. */
        const headCache = new Map();
        const headH = (b) => {
            const k = b.tcls + '|' + b.head;
            if (!headCache.has(k)) headCache.set(k, measure(b.head, b.tcls) + TBL_MARGIN);
            return headCache.get(k);
        };

        const CONTENT_H = P().CONTENT_H - FOOT_SPACE;
        const hHead   = measure(headHtml);
        const hCont   = measure('<div class="ex-cont">تابع: السؤال الأول</div>');

        const pages = [];
        let page = null, used = 0, avail = 0;

        /* سطر «تابع» محجوزٌ في كل صفحةٍ بعد الأولى وإن لم يُرسم: حجز سطرٍ
           قد يفيض عنه أرخص من فيضٍ يقصّ سؤالاً. */
        const openPage = () => {
            page = [];
            pages.push(page);
            const first = pages.length === 1;
            avail = CONTENT_H - (first ? hHead : 0);
            used  = first ? 0 : hCont;
        };

        const heightOf = (b, onFreshPage) => {
            if (b.kind !== 'row') return measure(b.html);
            /* أوّل صفٍّ من جدولٍ يحمل معه كلفة رأسه. والمقياس هو الكتلة
               التي تسبقه مباشرةً لا وجود رأسٍ مثله في الصفحة: عنوانٌ
               يتخلّل الصفوف يفتح جدولاً ثانياً برأسٍ ثانٍ عند الرسم،
               فوجب أن يُحسب مثله في الرصّ وإلّا فاض الفارق على الورقة. */
            const prev = page[page.length - 1];
            const firstRowHere = onFreshPage
                || !(prev && prev.kind === 'row' && prev.head === b.head);
            return measure(b.html, b.tcls) + (firstRowHere ? headH(b) : 0);
        };

        openPage();
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i], nx = blocks[i + 1];

            let need = heightOf(b, false);
            /* عنوان القسم لا يُترك وحيداً في ذيل الصفحة: يُقاس معه أوّل ما
               يليه، فإن لم يسعا معاً انتقلا معاً. */
            if (b.kind === 'sec' && nx) need += heightOf(nx, true);

            if (used + need > avail && page.length) openPage();

            const own = heightOf(b, false);   // قبل الدفع، وإلّا رأى الصفّ نفسه
            page.push(b);
            used += own;
        }
        ruler.remove();

        /* الرسم: صفوف الجدول المتجاورة في صفحةٍ واحدة تُلَمّ في جدولٍ
           واحد ويُعاد فوقها رأسه — فلا صفوف يتيمة بلا عناوين أعمدة. */
        return pages.map((blocksOfPage, i) => {
            const el = makePage();
            let body = '';

            const head = blocksOfPage[0];
            const prev = pages[i - 1];
            if (i > 0 && head && head.kind !== 'sec' && prev && prev.length
                && prev[prev.length - 1].sec === head.sec && secName[head.sec]) {
                body += `<div class="ex-cont">تابع: ${secName[head.sec]}</div>`;
            }

            let k = 0;
            while (k < blocksOfPage.length) {
                const b = blocksOfPage[k];
                if (b.kind === 'row') {
                    let rows = '';
                    while (k < blocksOfPage.length && blocksOfPage[k].kind === 'row'
                           && blocksOfPage[k].head === b.head) {
                        rows += blocksOfPage[k].html; k++;
                    }
                    body += `<div class="ex-tbl-wrap"><table class="${b.tcls}">${b.head}${rows}</table></div>`;
                } else {
                    body += b.html; k++;
                }
            }

            el.innerHTML = (i === 0 ? headHtml : '')
                + `<div class="ex-body">${body}</div>`
                + `<div class="ex-foot" data-foot></div>`;
            stageEl.appendChild(el);
            return el;
        });
    }

    function secNamesOf(exam) {
        const out = {};
        groupByType(exam.questions || []).forEach((g, gi) => {
            out[gi + 1] = `السؤال ${ORDINALS[gi] || ar(gi + 1)}`;
        });
        return out;
    }

    /* ------------------------------------------------------------------
       التصدير
       ------------------------------------------------------------------ */
    async function savePdf(ctx, opts) {
        opts = opts || {};
        const toast = (m, t, d) => global.TeacherApp && global.TeacherApp.toast
            && global.TeacherApp.toast(m, t, d);
        const { exam } = ctx;

        if (!exam || !(exam.questions || []).length) {
            toast('لا أسئلة في هذا الاختبار.', 'warning');
            return;
        }

        let stage = null;
        try {
            toast('جارٍ تجهيز الورقة…', 'info', 4000);
            stage = await global.PdfCore.createStage();

            const css = document.createElement('style');
            css.textContent = SHEET_CSS;
            stage.el.appendChild(css);

            const head = headerHtml(ctx);
            const names = secNamesOf(exam);
            const pages = paginate(buildBlocks(exam, opts), stage.el, head, names);

            /* نموذج الإجابة يبدأ صفحةً جديدة بترويسته الخاصة — يُطبع
               للمعلم لا للطالب، فلا يجوز أن يشارك ورقةَ الأسئلة. */
            let keyPages = [];
            if (opts.includeAnswers) {
                const keyHead = `<h1 class="ex-title">نموذج الإجابة — ${escapeHtml(exam.title || '')}</h1>`;
                keyPages = paginate(buildKeyBlocks(exam), stage.el, keyHead, names);
            }

            const all = pages.concat(keyPages);
            all.forEach((el, i) => {
                el.querySelector('[data-foot]').textContent =
                    `صفحة ${ar(i + 1)} من ${ar(all.length)}`;
            });

            await global.PdfCore.settle(stage.el);
            const blob = await global.PdfCore.renderPdf(all);
            const how = await global.PdfCore.deliverPdf(blob, buildFileName(ctx));
            if (how === 'downloaded') toast('تم حفظ الورقة ✅ افتح الملف للطباعة', 'success', 4000);
        } catch (err) {
            console.warn('[print-exam] savePdf failed:', err);
            toast('تعذّر إنشاء الملف. حاول مرة أخرى.', 'error', 4000);
        } finally {
            if (stage) stage.destroy();
        }
    }

    function buildFileName(ctx) {
        const { exam, cls } = ctx;
        const bits = [exam.title || 'اختبار'];
        if (cls?.grade) bits.push(cls.grade + (cls.section ? '-' + cls.section : ''));
        bits.push(global.PdfCore.todayISO());
        return bits.join('_');
    }

    const preloadPdfEngine = () => global.PdfCore.preloadPdfEngine();

    global.PrintExam = { savePdf, preloadPdfEngine };

    /* ------------------------------------------------------------------
       ورقة العمل: نفس المحرّك، ونفس الترويسة، بلا درجاتٍ ولا نموذج إجابة.
       ------------------------------------------------------------------ */
    async function saveWorksheetPdf(ctx, opts) {
        const sheet = ctx.sheet || {};
        /* أسئلةٌ كأسئلة الاختبار، بلا درجات. والأوراق المحفوظة بالنمط
           القديم (تمارين نصّية) تُحوَّل هنا أيضاً — قد تُطبع من القائمة
           بلا أن تمرّ بالمحرّر. */
        const questions = (sheet.questions && sheet.questions.length)
            ? sheet.questions
            : global.QuestionEditor.fromExercises(sheet.exercises);

        const exam = {
            title: sheet.title || 'ورقة عمل',
            settings: { include_name: true, include_grade: false, include_teacher: true,
                        include_instructions: false },
            questions: questions.map((q) => Object.assign({}, q, { points: 0 }))
        };
        return savePdf({ exam, cls: ctx.cls, teacher: ctx.teacher, instructions: sheet.instructions },
            Object.assign({ answerLines: 3 }, opts));
    }

    global.PrintWorksheet = { savePdf: saveWorksheetPdf, preloadPdfEngine };
})(window);
