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
    const arNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* ══ لغةُ الورقة ══
       مادّةُ الفصل تقرّر، لا خيارٌ يُنسى: معلّمُ الإنجليزيّة ورقتُه إنجليزيّةٌ
       كلُّها — عناوينُها وجداولُها وحروفُ خياراتها وأرقامُها واتّجاهُها.
       والخيارُ الوحيد لغةُ الترويسة، لأنّ عُرفَ المدارس فيها يختلف.

       واللغةُ متغيّرٌ في الوحدة لا وسيطٌ يُمرَّر في اثنتي عشرة دالّة —
       والطباعةُ لا تتوازى: ورقةٌ واحدةٌ تُبنى في كلّ مرّة. */
    const AR = {
        rtl: true,
        num: arNum,
        letters: ['أ', 'ب', 'ج', 'د', 'هـ', 'و'],
        abjad:   ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل'],
        /* «درجة واحدة» لا «١ درجة» — ورقةٌ يقرؤها مشرف، والتصريفُ يختلف. */
        marks: (n) => !n ? '' : n === 1 ? 'درجة واحدة' : n === 2 ? 'درجتان'
                    : n <= 10 ? arNum(n) + ' درجات' : arNum(n) + ' درجة',
        ordinals: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع'],
        qLabel: (i, L) => 'السؤال ' + (L.ordinals[i] || arNum(i + 1)),
        sections: {
            mcq:   'اختر الإجابة الصحيحة فيما يأتي:',
            tf:    'ضع علامة (✓) أمام العبارة الصحيحة و(✗) أمام العبارة الخاطئة:',
            fill:  'أكمل الفراغ بما يناسبه:',
            essay: 'أجب عمّا يأتي:',
            match: 'صل العمود (أ) بما يناسبه من العمود (ب):'
        },
        num_h: 'م', letterCol: 'م', stmt: 'العبارة', answer: 'الإجابة',
        qNum: (n) => n + '-',
        keyHead: (t) => 'نموذج الإجابة — ' + t,
        qAndOpts: 'السؤال وخياراته', colA: 'العمود (أ)', colB: 'العمود (ب)',
        studentName: 'اسم الطالب', seatNo: 'رقم الجلوس', klass: 'الصف', mark: 'الدرجة',
        dots: '....................................................', dotsShort: '..................',
        notesLabel: 'التعليمات',
        instructions: 'اقرأ كل سؤالٍ بعناية ثم أجب في المكان المخصّص، ولا تترك سؤالاً دون إجابة.',
        keyTitle: 'نموذج الإجابة', forTeacher: 'للمعلّم', cont: 'تابع: ',
        page: (a, b) => 'صفحة ' + arNum(a) + ' من ' + arNum(b),
        essayFallback: 'يُصحَّح تقديرياً',
        kingdom: 'المملكة العربية السعودية', ministry: 'وزارة التعليم', school: 'المدرسة',
        subject: 'المادة', grade: 'الصف', teacherL: 'المعلم', date: 'التاريخ', total: 'الدرجة',
        /* عنوانان افتراضيّان: ما يُطبع حين لا يسمّي المعلّم ورقتَه،
           وما يُسمّى به الملفُّ المحفوظ. */
        worksheet: 'ورقة عمل', fileFallback: 'اختبار'
    };

    const EN = {
        rtl: false,
        num: (n) => String(n),
        letters: ['A', 'B', 'C', 'D', 'E', 'F'],
        abjad:   ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
        marks: (n) => !n ? '' : n === 1 ? '1 mark' : n + ' marks',
        ordinals: [],
        qLabel: (i) => 'Question ' + (i + 1),
        sections: {
            mcq:   'Choose the correct answer:',
            tf:    'Put (✓) for the correct statement and (✗) for the incorrect one:',
            fill:  'Complete the following:',
            essay: 'Answer the following:',
            match: 'Match column (A) with the suitable item from column (B):'
        },
        num_h: 'No.', letterCol: 'Letter', stmt: 'Statement', answer: 'Answer',
        qNum: (n) => n + '.',
        keyHead: (t) => t,
        qAndOpts: 'Question and choices', colA: 'Column (A)', colB: 'Column (B)',
        studentName: 'Student Name', seatNo: 'Seat No.', klass: 'Class', mark: 'Mark',
        dots: '....................................................', dotsShort: '..................',
        notesLabel: 'Instructions',
        instructions: 'Read each question carefully and answer in the space provided. '
                    + 'Do not leave any question unanswered.',
        keyTitle: 'Answer Key', forTeacher: 'For the teacher', cont: 'cont.: ',
        page: (a, b) => 'Page ' + a + ' of ' + b,
        essayFallback: 'Marked at the teacher\u2019s discretion',
        kingdom: 'Kingdom of Saudi Arabia', ministry: 'Ministry of Education', school: 'School',
        subject: 'Subject', grade: 'Class', teacherL: 'Teacher', date: 'Date', total: 'Total',
        worksheet: 'Worksheet', fileFallback: 'Exam'
    };

    let L = AR;
    /* «اللغة الإنجليزية» هو الاسمُ في قائمة المواد، والباقي احتياطٌ لمن
       كتب مادّته بيده. */
    /* ── نصٌّ عربيٌّ في ورقةٍ إنجليزيّة ──
       اسمُ المعلّم واسمُ المدرسةِ يبقيان عربيّين: أعلامٌ لا تُترجَم. لكنّ
       سطراً واحداً فيه اتّجاهان يُقسَم عند حدّهما، ومحرّكُ الرسم يقيس كلَّ
       قسمٍ ثمّ يرسمه وحدَه — فإن وقع القسمُ داخل كلمةٍ عربيّةٍ خرجت حروفُها
       مفكّكةً أو في غير موضعها. جُرّب في متصفّح المكتب فلم ينكسر، وانكسر
       في جهاز المستخدم: المحرّكاتُ تختلف في موضع القسم، فلا يُبنى على أنّ
       أحدَها لا يقسم.

       والعلاجُ ألّا نترك القسمَ للمحرّك: يُغلَّف كلُّ عربيٍّ في عنصرٍ يحمل
       اتّجاهه، فيصير قسماً قائماً برأسه لا يُقسَّم. وفي الورقة العربيّة لا
       يفعل شيئاً — لا يُغيَّر ما اعتُمد. */
    const HAS_AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
    function esc(v) {
        const t = escapeHtml(v);
        return (L === EN && HAS_AR.test(String(v == null ? '' : v)))
            ? '<span dir="rtl">' + t + '</span>' : t;
    }

    const isEnglish = (subject) => /إنجليزي|انجليزي|english/i.test(String(subject || ''));

    /* ما يكتبه المعلّمُ عربيّاً وله مقابلٌ إنجليزيٌّ معروف: الإدارةُ والمادّةُ
       والصفُّ والشعبة. قوائمُها الأربعُ مغلقةٌ ومعدودة، فالترجمةُ جدولٌ
       يُراجَع لا تخميناً يُطلق؛ وما ليس في جدوله يبقى كما كتبه المعلّم.
       ولا تُترجم أسماءُ المدارس ولا أسماءُ المعلّمين: أعلامٌ لا مصطلحات. */
    const tDept    = (H, v) => (H === EN && global.EduDepts)   ? global.EduDepts.enName(v)     : v;
    const tSubject = (H, v) => (H === EN && global.Subjects)   ? global.Subjects.en(v)         : v;
    const tGrade   = (H, v) => (H === EN && global.ClassCreate) ? global.ClassCreate.enGrade(v)   : v;
    const tSection = (H, v) => (H === EN && global.ClassCreate) ? global.ClassCreate.enSection(v) : v;
    const ar = (n) => L.num(n);

    const marks = (n) => L.marks(n);

    /* درجةٌ غير مذكورة تعني «واحدة» في الاختبار، أما ورقة العمل فتمرّر
       صفراً صريحاً — فالفرق بين «لم تُذكر» و«لا درجة» فرقٌ حقيقي. */
    const pts = (q) => (q.points == null ? 1 : q.points);


    /* نصوصُ الترويسات مصدرُها محرّرُ الأسئلة، لا نسخةٌ هنا: المحرّرُ يَعِد
       المعلّمَ أن ما يراه على الشاشة هو ما يُطبع، ونسختان من النصّ تنقضان
       الوعدَ بأوّل تعديلٍ في إحداهما. والبديلُ احتياطٌ لو استُدعيت الطباعةُ
       قبل تحميل المحرّر. */
    /* العربيّةُ مصدرُها محرّرُ الأسئلة لا نسخةٌ هنا — ما يراه المعلّم على
       الشاشة هو ما يُطبع. والإنجليزيّةُ لا محرّرَ لها، فنصوصُها أعلاه. */
    const sectionTitles = () => (L === AR
        ? ((global.QuestionEditor && global.QuestionEditor.SECTION_TITLE) || AR.sections)
        : L.sections);
    /* أسئلة غير معروفة النوع تُعامل معاملة المقالي: مساحة كتابة. */
    const titleOf = (t) => { const S = sectionTitles(); return S[t] || S.essay; };

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
    /* يُقاس بالعرض ويُترك ارتفاعُه: نسبةُ الشعار ‎1.32:1‎، ومربّعُ ‎78×78‎
       كان يهبط به إلى ‎59px‎ ارتفاعاً فيصغر عمّا يليق بترويسةٍ رسميّة. */
    .ex-logo { width: 96px; height: auto; object-fit: contain; }
    .ex-logo-ph { width: 96px; height: 73px; }
    .ex-rule  { border: 0; border-top: 2px solid #111; margin: 10px 0 0; }
    .ex-rule2 { border: 0; border-top: 1px solid #111; margin: 2px 0 14px; }
    .ex-title { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 14px !important; }
    .ex-info { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .ex-info td { border: 1px solid #111; padding: 9px 10px; font-size: 14px; font-weight: 700; }
    /* خانةُ الدرجة موسَّطةٌ في اللغتين — و«important» لسبب الملاحظة أسفلَه. */
    .ex-info .mk { text-align: center !important; }
    .ex-note { font-size: 13px; line-height: 1.9; margin-bottom: 14px !important; }
    .ex-sec {
        display: flex; align-items: baseline; gap: 8px;
        font-size: 15.5px; font-weight: 700; margin: 18px 0 10px;
        border-bottom: 1.5px solid #111; padding-bottom: 5px;
    }
    .ex-sec .g { margin-inline-start: auto; font-size: 13px; font-weight: 700; }
    .ex-cont {
        font-size: 13px; font-weight: 700; color: #555;
        margin: 0 0 10px; padding-bottom: 4px; border-bottom: 1px dashed #BBB;
    }
    .ex-q { display: flex; gap: 8px; margin-bottom: 6px; align-items: baseline; }
    .ex-q .n { font-weight: 700; font-size: 15px; line-height: 1.9; }
    .ex-q .t { font-size: 15px; line-height: 1.9; }
    .ex-q .m { margin-inline-start: auto; font-size: 12.5px; color: #555; white-space: nowrap; }
    .ex-tbl { width: 100%; border-collapse: collapse; }
    .ex-tbl th, .ex-tbl td { border: 1px solid #111; padding: 9px 10px; font-size: 14.5px; }
    .ex-tbl th { background: #F0F0F0; font-weight: 700; font-size: 13.5px; }
    .ex-tbl .c { text-align: center; width: 62px; }
    .ex-tbl .m { text-align: center; width: 40px; }
    /* جدولُ الاختيار من متعدد: السؤالُ سطرٌ يمتدّ، وخياراتُه تحته خلايا.
       وتثبيتُ التخطيط ليس تجميلاً: الرصُّ يقيس الصفَّ وحدَه خارج جدوله،
       فلو وُزّعت الأعمدةُ بالمحتوى لاختلف عرضُها بين القياس والرسم وفاض
       الجدولُ على الورقة. وبه صار الفرقُ واحدَ بكسل ثابتاً — حدَّ الجدول
       المنهار. */
    .ex-mcq { table-layout: fixed; }
    .ex-mcq .q { font-weight: 700; }
    .ex-mcq .o { font-size: 14px; }
    .ex-mcq td { overflow-wrap: anywhere; }
    /* ══ حرفُ الخيار في شريطٍ موصولٍ بالخانة ══
       كان «أ) نصّ الخيار» — حرفاً وقوساً في مجرى النصّ. فطلبه المعلّم في
       مربّعٍ (٤ سبتمبر ٢٠٢٦)، ثمّ ردّ المربّعَ المنفصلَ: **«لا يكون مربّعاً
       لحاله، يوصل ضلعٌ واحدٌ داخل المربّع الأساسيّ»**، ثمّ اختار الشريطَ
       الكامل: **«ج، لكن نفس الخيار د الخطُّ متّصل»**.

       ── و«متّصل» هي كلُّ المسألة ──
       الخانةُ ترتفع بأطول خيارٍ في الصفّ، و«span» داخلها لا يرث ذلك
       الارتفاع — فكان الشريطُ يبلغ الحدَّين في الخيار الطويل وحدَه ويقف
       قصيراً في إخوته. والعلاجُ «height: 1px» على الخانة: قيمةٌ تُحلّ بها
       «height: 100%» على الارتفاع الفعليّ لا على «تلقائيّ»، وهي حيلةُ
       الجداول المعروفة — ولا تُقصّر الخانة، فمحتواها أطولُ من بكسل.

       ولا موضعَ مُطلَق: «html2canvas» يلتقط ما رُسم، والمرقِّمُ يقيس الصفَّ
       **خارج جدوله** — وطبقةٌ مُطلَقةٌ في خانةٍ مقيسةٍ وحدَها مخاطرةٌ بلا
       مقابل، والانسيابُ يُعطي الشكلَ نفسَه.

       والنصُّ يبدأ من جهة البداية لا موسَّطاً: نصٌّ موسَّطٌ بجانب شريطٍ
       ثابتٍ يبدو منزلقاً، وفي العربيّة هو مبتدئٌ أصلاً. */
    .ex-mcq td.o { padding: 0; height: 1px; }
    /* والزيادةُ بكسلٌ والإزاحةُ نصفُه: الجدولُ ذو حدٍّ منهار، فحدُّ الخانة
       الواحد مشترَكٌ بين جارتين ويقع نصفُه داخلَ كلٍّ منهما — فيبدأ صندوقُ
       المحتوى على بُعد ‎0.5px‎ من الخطّ ويقف قبله بمثلها، فيبقى الشريطُ
       قصيراً عن الضلعين بشعرة. وبهذه الزيادة يبلغهما ويلامسهما تماماً. */
    .ex-mcq .ow  {
        display: flex; align-items: stretch;
        height: calc(100% + 1px); margin-block: -0.5px;
        min-height: 38px;
    }
    /* ‎22px‎ لا ‎28‎: بطلبه — «يكون عرضه أصغر». والحرفُ الواحد يسعها،
       والباقي يعود إلى نصّ الخيار. */
    .ex-mcq .obx {
        flex: none; width: 22px;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 13px;
        border-inline-end: 1px solid #111;
    }
    .ex-mcq .otx { flex: 1; padding: 9px 10px; text-align: start; }
    /* ورقةٌ إنجليزيّة: الاتّجاهُ من اليسار، فتنقلب الجداولُ والترويسةُ معاً
       بلا قاعدةٍ لكلّ عنصر. والخاناتُ الموسَّطةُ تبقى موسَّطة. */
    .ex-ltr { direction: ltr; text-align: left; }
    /* الترويسةُ وحدَها تبقى على ترتيبها العربيّ: «المملكة العربية السعودية»
       جهةَ اليمين كما في كلّ ورقةٍ رسميّة — بطلبه. والنصُّ داخلها إنجليزيٌّ
       من اليسار، فالاتّجاهُ يُعاد لكلّ جهةٍ على حدة. */
    .ex-ltr .ex-head { direction: rtl; }
    .ex-ltr .ex-head .side   { direction: ltr; text-align: right; }
    .ex-ltr .ex-head .side.l { direction: ltr; text-align: left; }
    .ex-ltr .ex-title { text-align: center; }
    /* «important» ليست ترفاً هنا: تنسيقُ الطباعة العامّ يُحقن في مسرح
       التصدير محصوراً بمعرّفه، وفيه «th, td { text-align: right }» —
       ومعرّفٌ يغلب كلَّ صنفٍ في هذا الملف. والعربيّةُ أخفت ذلك لأنّ اليمين
       صوابُها، فلم ينكشف إلّا يوم صارت الورقةُ إنجليزيّة. */
    .ex-ltr .ex-tbl th, .ex-ltr .ex-tbl td,
    .ex-ltr .ex-key  th, .ex-ltr .ex-key  td,
    .ex-ltr .ex-info td { text-align: left !important; }
    .ex-ltr .ex-tbl .c, .ex-ltr .ex-tbl .m, .ex-ltr .ex-key .m,
    .ex-ltr .ex-info .mk { text-align: center !important; }
    /* و«.ex-mcq .o» سقطت من قائمة التوسيط: نصُّها صار في «.otx» يبدأ من
       جهة البداية، والخانةُ نفسُها لم يعد فيها نصٌّ يُوسَّط. */
    .ex-tbl-wrap { margin-bottom: 16px; }
    .ex-lines { margin-bottom: 16px; }
    .ex-lines .ln { border-bottom: 1px dotted #9AA0A6; height: 30px; }
    .ex-key { width: 100%; border-collapse: collapse; }
    .ex-key td, .ex-key th { border: 1px solid #111; padding: 8px 10px; font-size: 14px; }
    .ex-key th { background: #F0F0F0; font-weight: 700; font-size: 13px; }
    .ex-key .m { text-align: center; width: 46px; font-weight: 700; }
    `;

    /* خانةٌ واحدةٌ لا خانتان: الطالبُ يرسم فيها ✓ أو ✗ كما يقول رأسُ القسم،
       بدل أن يعلّم في إحدى خانتين. والعبارةُ تكسب عرضَ العمود المحذوف. */
    const TF_HEAD  = () => `<tr><th class="m">${L.num_h}</th><th>${L.stmt}</th>`
                         + `<th class="c">${L.answer}</th></tr>`;
    const KEY_HEAD = () => `<tr><th class="m">${L.num_h}</th><th>${L.answer}</th></tr>`;

    /* رأسُ الاختيار من متعدد يتبع عددَ الخيارات، وهو أكثرُ ما في القسم لا
       ما في السؤال: رأسٌ واحدٌ يسع الجميع فتبقى صفوفُ القسم جدولاً واحداً.
       (الرصُّ يفتح جدولاً جديداً كلّما اختلف الرأس.)

       و`colgroup` يثبّت عمودَ الترقيم: رأسُ الجدول خليّةٌ ممتدّةٌ لا تقول
       للتخطيط المثبَّت شيئاً عن أعرض الأعمدة تحتها، فبلا هذا يقتسم
       الخمسةُ العرضَ بالتساوي ويصير عمودُ «م» بعرض عمودِ خيار. */
    const MCQ_HEAD = (cols) => '<colgroup><col style="width:40px">'
        + '<col>'.repeat(cols) + '</colgroup>'
        + `<tr><th class="m">${L.num_h}</th><th colspan="${cols}">${L.qAndOpts}</th></tr>`;

    const optCount = (items) => {
        let n = 0;
        items.forEach((q) => { n = Math.max(n, (q.options || []).length); });
        return Math.min(Math.max(n, 2), L.letters.length);
    };

    /* خيارٌ تركه المعلّم فارغاً يبقى خانةً فارغة بحرفها — لا يُطوى العمود،
       فموضعُه محجوزٌ وترتيبُ الحروف لا يختلّ. */
    const optCells = (q, cols) => {
        const o = q.options || [];
        let out = '';
        for (let k = 0; k < cols; k++) {
            const t = esc(o[k] || '');
            out += `<td class="o"><span class="ow">`
                 + `<span class="obx">${L.letters[k]}</span>`
                 + `<span class="otx">${t || '&nbsp;'}</span></span></td>`;
        }
        return out;
    };
    /* العمودُ الرابع حروفٌ لا أرقام — «م» تحتمل الحرف في العربيّة،
       و«No.» لا تحتمله في الإنجليزيّة. */
    const MATCH_HEAD = () => `<tr><th class="m">${L.num_h}</th><th>${L.colA}</th>`
                           + `<th class="c">${L.answer}</th>`
                           + `<th class="m">${L.letterCol}</th><th>${L.colB}</th></tr>`;

    /* ------------------------------------------------------------------
       المطابقة: العمود (ب) مخلوطٌ، وإلّا صار الجواب ١-أ ٢-ب بلا تفكير.

       والخلطُ ثابتٌ لا عشوائيّ: بذرتُه من معرّفات الفقرات ونصوصها، فالورقة
       الواحدة تخرج بالترتيب نفسِه كلّما طُبعت — ولولا ذلك لخالف نموذجُ
       الإجابة الورقةَ التي بيد الطالب.
       ------------------------------------------------------------------ */
    function shuffleB(items) {
        let seed = 2166136261;
        items.forEach((q) => {
            const str = String(q.id || '') + '|' + String(q.text || '');
            for (let i = 0; i < str.length; i += 1) {
                seed = ((seed ^ str.charCodeAt(i)) * 16777619) >>> 0;
            }
        });
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

        const out = items.map((q, i) => ({ from: i, text: String(q.answer || '') }));
        for (let i = out.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rnd() * (i + 1));
            const t = out[i]; out[i] = out[j]; out[j] = t;
        }
        /* خلطٌ أعاد الترتيبَ نفسَه لا يخلط شيئاً — تُدار القائمةُ خطوةً. */
        if (out.length > 1 && out.every((x, i) => x.from === i)) out.push(out.shift());
        return out;
    }
    /* حروفُ العمود (ب) على ترتيب أبجد، لا على ترتيب الهجاء: هي ترقيمٌ
       لا تهجئة. وحروفُ الخيارات أقصرُ منها — أربعةٌ لا تكفي عموداً قد يبلغ
       عشراً. ويُقرآن من `L` وقتَ النداء لا وقتَ التحميل، فاللغةُ تُضبط عند
       بدء الطباعة. */
    const bLetter = (k) => L.abjad[k] || ar(k + 1);

    /* موضعُ مقابلِ الفقرة i في العمود المخلوط — أي حرفُها في نموذج الإجابة. */
    const letterFor = (bCol, i) => {
        const k = bCol.findIndex((x) => x.from === i);
        return k < 0 ? '' : bLetter(k);
    };

    /* ------------------------------------------------------------------
       بناء الكتل: كل كتلة وحدة لا تُشقّ. السؤال مع خياراته، والسؤال
       المقالي مع سطور إجابته — فلا يبقى السؤال في صفحة وإجابته في أخرى.
       ------------------------------------------------------------------ */
    function groupByType(questions) {
        const order = [];
        const map = new Map();
        questions.forEach((q) => {
            const t = sectionTitles()[q.type] ? q.type : 'essay';
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
                `<div class="ex-sec">${L.qLabel(gi, L)}: ${titleOf(g.type)}`
                + (total ? `<span class="g">(${marks(total)})</span>` : '') + '</div>' });

            /* درجة السؤال بجانبه تفيد حين تختلف داخل القسم، أما قسمٌ
               بسؤالٍ واحد فرأسه قاله سلفاً — فلا يُكتب مرّتين. */
            const perQ = g.items.length > 1;
            const bCol = g.type === 'match' ? shuffleB(g.items) : null;
            const cols = g.type === 'mcq' ? optCount(g.items) : 0;

            g.items.forEach((q, i) => {
                const n = ar(i + 1);
                if (g.type === 'match') {
                    blocks.push({ kind: 'row', sec: secNo, head: MATCH_HEAD(), tcls: 'ex-tbl', html:
                        `<tr><td class="m">${n}</td><td>${esc(q.text)}</td>`
                        + '<td class="c">&nbsp;</td>'
                        + `<td class="m">${bLetter(i)}</td>`
                        + `<td>${esc(bCol[i].text)}</td></tr>` });
                    return;
                }
                if (g.type === 'tf') {
                    blocks.push({ kind: 'row', sec: secNo, head: TF_HEAD(), tcls: 'ex-tbl', html:
                        `<tr><td class="m">${n}</td><td>${esc(q.text)}</td>`
                        + '<td class="c">&nbsp;</td></tr>' });
                    return;
                }
                if (g.type === 'mcq') {
                    /* صفّان في كتلةٍ واحدة عمداً: السؤالُ وخياراتُه لا
                       يفترقان على صفحتين، و`rowspan` على خانة الترقيم
                       ينكسر لو افترقا. */
                    blocks.push({ kind: 'row', sec: secNo, head: MCQ_HEAD(cols), tcls: 'ex-tbl ex-mcq', html:
                        `<tr><td class="m" rowspan="2">${n}</td>`
                        + `<td class="q" colspan="${cols}">${esc(q.text)}</td></tr>`
                        + `<tr>${optCells(q, cols)}</tr>` });
                    return;
                }
                if (g.type === 'fill') {
                    /* الفراغ إن لم يكتبه المعلم — ورقةٌ بلا فراغٍ لا يُجاب عليها. */
                    const t = String(q.text || '');
                    const withBlank = /\.{4,}|…|_{3,}/.test(t) ? t : t + ' ...............';
                    blocks.push({ kind: 'q', sec: secNo, html:
                        `<div class="ex-q" style="margin-bottom:14px;"><span class="n">${L.qNum(n)}</span>`
                        + `<span class="t">${esc(withBlank)}</span></div>` });
                    return;
                }
                /* مقالي: سؤالٌ ومساحة كتابة، كتلةً واحدة. */
                blocks.push({ kind: 'q', sec: secNo, html:
                    `<div class="ex-q"><span class="n">${L.qNum(n)}</span>`
                    + `<span class="t">${esc(q.text).replace(/\n/g, '<br>')}</span>`
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
            `<div class="ex-sec">${L.keyTitle}<span class="g">${L.forTeacher}</span></div>` }];
        groups.forEach((g, gi) => {
            const secNo = gi + 1;
            out.push({ kind: 'q', sec: secNo, html:
                `<div class="ex-q" style="margin-top:10px;"><span class="t" style="font-weight: 700;">`
                + `${L.qLabel(gi, L)}: ${titleOf(g.type)}</span></div>` });
            /* الخلطُ يُعاد بالبذرة نفسِها، فالحرفُ هنا هو الحرفُ هناك. */
            const bCol = g.type === 'match' ? shuffleB(g.items) : null;
            g.items.forEach((q, i) => {
                const ans = g.type === 'match'
                    ? `${letterFor(bCol, i)}) ${String(q.answer || '')}`
                    : answerText(q);
                out.push({ kind: 'row', sec: secNo, head: KEY_HEAD(), tcls: 'ex-key', html:
                    `<tr><td class="m">${ar(i + 1)}</td><td>${esc(ans)}</td></tr>` });
            });
        });
        return out;
    }

    function answerText(q) {
        if (q.type === 'mcq') {
            const i = (q.options || []).indexOf(q.answer);
            return i >= 0 ? `${L.letters[i]}) ${q.answer}` : (q.answer || '—');
        }
        if (q.type === 'essay') return q.answer || L.essayFallback;
        /* «صح/خطأ» يختارهما المعلّم بأزرارٍ عربيّةٍ في المحرّر — وواجهتُه
           عربيّةٌ على كلّ حال. أمّا الورقةُ الإنجليزيّةُ فتقولها بلغتها. */
        if (q.type === 'tf' && L === EN) {
            if (q.answer === 'صح')  return 'True';
            if (q.answer === 'خطأ') return 'False';
        }
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

        /* لغةُ الترويسة وحدَها خيارٌ: عُرفُ المدارس فيها يختلف — بعضُها
           يُبقي الترويسةَ الوزاريّةَ عربيّةً ولو كانت الورقةُ إنجليزيّة.
           وما عداها يتبع لغةَ المادّة بلا سؤال. */
        const H = s.header_ar ? AR : L;

        const right = [
            H.kingdom,
            H.ministry,
            esc(tDept(H, p.educationDept || teacher?.education_dept || '')),
            esc(teacher?.school_name || H.school)
        ].filter(Boolean).join('<br>');

        const left = [
            cls?.subject ? `${H.subject}: ${esc(tSubject(H, cls.subject))}` : '',
            cls?.grade ? `${H.grade}: ${esc(tGrade(H, cls.grade))}`
                + `${cls.section ? ' / ' + esc(tSection(H, cls.section)) : ''}` : '',
            s.include_teacher && teacher?.name ? `${H.teacherL}: ${esc(teacher.name)}` : '',
            /* تاريخٌ يكتبه المعلّم، لا تاريخُ اليوم: الاختبارُ يُعدّ قبل
               موعده. وفراغُه نقاطٌ تُملأ بالقلم لا يومُ الطباعة. */
            s.include_date
                ? `${H.date}: ${String(s.exam_date || '').trim()
                    ? esc(String(s.exam_date).trim()) : '................'}`
                : '',
            s.include_grade !== false && total ? `${H.total}: ${H.num(total)}` : ''
        ].filter(Boolean).join('<br>');

        /* ══ شعارُ الوزارة، لا شعارُ المدرسة ══
           قرارُه (٤ سبتمبر ٢٠٢٦) بعد أن عُرضت عليه ثلاثةُ أشكال:
           **«نعتمد شعار الوزارة فقط»**. وكانت الخانةُ تحمل شعارَ المدرسة
           الذي يرفعه المعلّم — ومن لم يرفع (وهم الأكثر) طبع ورقتَه وفي
           وسط ترويستها فراغٌ مربّعٌ ‎78×78‎.

           وشعارُ المدرسة لم يسقط من التطبيق: ملفُّ الإنجاز ما زال يطبعه
           (`print-portfolio.js`)، ورفعُه في الإعدادات كما هو.

           والبديلُ خانةٌ فارغةٌ لا انهيار: لو غاب `moe-logo.js` بقيت
           الترويسةُ على ثلاثة أعمدةٍ ولم تنزلق. */
        const logo = global.MoeLogo
            ? `<img class="ex-logo" src="${global.MoeLogo}" alt="وزارة التعليم">`
            : '<div class="ex-logo-ph"></div>';

        const term = p.academicYear ? ` — ${esc(p.academicYear)}` : '';

        /* خانة الدرجة تسقط مع الدرجات: ورقة العمل لا تُصحَّح بدرجة،
           فصندوقٌ فارغ اسمه «الدرجة» يُربك الطالب ووليّه. */
        const withGrade = s.include_grade !== false && total > 0;
        const info = (s.include_name !== false) ? `
            <table class="ex-info"><tr>
                <td style="width:${withGrade ? 58 : 70}%;">${L.studentName}: ${L.dots}</td>
                <td>${withGrade ? L.seatNo + ': ' + L.dotsShort : L.klass + ': ' + L.dotsShort}</td>
                ${withGrade ? `<td class="mk" style="width:15%;">${L.mark}<br>&nbsp;</td>` : ''}
            </tr></table>` : '';

        /* تعليمات المعلم إن كتبها (ورقة العمل)، وإلّا فالنصّ المعتاد. */
        const noteText = ctx.instructions
            || (s.include_instructions
                ? L.instructions
                : '');
        const note = noteText
            ? `<p class="ex-note"><strong>${L.notesLabel}:</strong> ${esc(noteText)}</p>`
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
            <h1 class="ex-title">${esc(exam.title || 'اختبار')}${term}</h1>
            ${info}${note}`;
    }

    /* ------------------------------------------------------------------
       القياس والرصّ في صفحات A4 حقيقية.
       ------------------------------------------------------------------ */
    const FOOT_SPACE = 34;      // ما يحجزه رقم الصفحة أسفل الورقة
    const TBL_MARGIN = 16;      // ex-tbl-wrap

    function makePage() {
        const box = document.createElement('div');
        box.className = 'ex-pg' + (L.rtl ? '' : ' ex-ltr');
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
        /* المسطرةُ تحمل صنفَ الاتّجاه نفسَه: قياسُ سطرٍ من اليمين يخالف
           قياسَه من اليسار، فبلا هذا يُرصّ بمقاسٍ غير مقاسِ ما يُرسم. */
        ruler.className = 'ex-pg' + (L.rtl ? '' : ' ex-ltr');
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
        const hCont   = measure(`<div class="ex-cont">${L.cont}${L.qLabel(0, L)}</div>`);

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
                body += `<div class="ex-cont">${L.cont}${secName[head.sec]}</div>`;
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
            out[gi + 1] = L.qLabel(gi, L);
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
        /* اللغةُ تُقرَّر هنا لا في مئة موضع: مادّةُ الفصل تقرّرها. */
        L = isEnglish(ctx.cls && ctx.cls.subject) ? EN : AR;

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
                /* العنوانُ لا يكرّر «نموذج الإجابة» مع الشريط تحته: في
                   الإنجليزيّة يكتفي بعنوان الاختبار. */
                const keyHead = `<h1 class="ex-title">${esc(L.keyHead(exam.title || ''))}</h1>`;
                keyPages = paginate(buildKeyBlocks(exam), stage.el, keyHead, names);
            }

            const all = pages.concat(keyPages);
            all.forEach((el, i) => {
                el.querySelector('[data-foot]').textContent =
                    L.page(ar(i + 1), ar(all.length));
            });

            await global.PdfCore.settle(stage.el);
            const blob = await global.PdfCore.renderPdf(all);
            const how = await global.PdfCore.deliverPdf(blob, buildFileName(ctx));
            if (how === 'downloaded') toast('تم حفظ الورقة افتح الملف للطباعة', 'success', 4000);
        } catch (err) {
            console.warn('[print-exam] savePdf failed:', err);
            toast('تعذّر إنشاء الملف. حاول مرة أخرى.', 'error', 4000);
        } finally {
            if (stage) stage.destroy();
        }
    }

    /* اسمُ الملفّ يتبع لغةَ الورقة كذلك: معلّمُ الإنجليزيّة يبحث عن ملفّه
       بين ملفّاته، فلا يليق أن يكون داخلُه إنجليزيّاً واسمُه عربيّاً.
       و`L` مضبوطةٌ قبل هذا — تُقرَّر في أوّل `savePdf`. */
    function buildFileName(ctx) {
        const { exam, cls } = ctx;
        const bits = [exam.title || L.fileFallback];
        if (cls?.grade) bits.push(tGrade(L, cls.grade)
            + (cls.section ? '-' + tSection(L, cls.section) : ''));
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

        /* التاريخُ يكتبه المعلّم كما في الاختبار — وإن تركه فارغاً وهو
           يريده، خرجت نقاطٌ يملؤها بالقلم. ولا سطرَ تاريخٍ أصلاً لورقةٍ
           لم يُطلب لها. */
        const when = String(sheet.settings?.sheet_date || '').trim();
        /* العنوانُ الافتراضيّ يُقرَّر هنا لا في `savePdf`: هناك يُبنى الاسمُ
           بعد أن تُضبط اللغة، وهنا قبلَها — فتُسأل المادّةُ مرّةً ثانية. */
        const W = isEnglish(ctx.cls && ctx.cls.subject) ? EN : AR;
        const exam = {
            title: sheet.title || W.worksheet,
            settings: { include_name: true, include_grade: false, include_teacher: true,
                        include_instructions: false,
                        include_date: !!(sheet.settings && sheet.settings.sheet_date !== undefined),
                        exam_date: when },
            questions: questions.map((q) => Object.assign({}, q, { points: 0 }))
        };
        return savePdf({ exam, cls: ctx.cls, teacher: ctx.teacher, instructions: sheet.instructions },
            Object.assign({ answerLines: 3 }, opts));
    }

    global.PrintWorksheet = { savePdf: saveWorksheetPdf, preloadPdfEngine };
})(window);
