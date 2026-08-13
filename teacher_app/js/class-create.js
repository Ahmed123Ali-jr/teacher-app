/* ==========================================================================
   class-create.js — إنشاء الفصل: مصدرُ حقيقةٍ واحد.

   كان الإنشاء مدفوناً داخل نافذةٍ في `dashboard.js`، وصار يُنادى من ثلاثة
   أماكن: النافذة، ومحرّر خانة الجدول، واستيراد الجدول. فلو نُسخ ثلاثاً
   لاختلفت الحقول بينها — لونٌ هنا وعدّاد طلابٍ هناك — واكتُشف الفرق
   متأخّراً حين يظهر فصلٌ ناقصٌ في شاشةٍ دون أخرى.

   وفيه أيضاً ما يحتاجه الاستيراد: **قراءة اسم الصف كما كتبه الجدول**
   («أول ثانوي» · «١ ثانوي» · «الصف الأول الثانوي») وردُّه إلى صيغة
   التطبيق. فالمقارنة النصّية وحدها كانت تُنشئ فصولاً مكرّرة.
   ========================================================================== */

(function (global) {
    'use strict';

    const GRADES = {
        primary:      ['الصف الأول الابتدائي','الصف الثاني الابتدائي','الصف الثالث الابتدائي',
                       'الصف الرابع الابتدائي','الصف الخامس الابتدائي','الصف السادس الابتدائي'],
        intermediate: ['الصف الأول المتوسط','الصف الثاني المتوسط','الصف الثالث المتوسط'],
        secondary:    ['الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي']
    };
    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
    const SECTIONS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

    /* بقرار المستخدم (٢٠٢٦-٠٨-٠٤): لونٌ واحد موحّد لكل الفصول. */
    const DEFAULT_COLOR = '#ECEAE3';

    /* ------------------------------------------------------------------
       قراءة ما كتبه الجدول
       ------------------------------------------------------------------ */

    const ORDINALS = [
        ['الأول', 'اول', '١', '1'],
        ['الثاني', 'ثاني', '٢', '2'],
        ['الثالث', 'ثالث', '٣', '3'],
        ['الرابع', 'رابع', '٤', '4'],
        ['الخامس', 'خامس', '٥', '5'],
        ['السادس', 'سادس', '٦', '6']
    ];

    /** يزيل التشكيل والألف المهموزة والتاء المربوطة فتستوي الكتابات. */
    function fold(s) {
        return String(s || '')
            .replace(/[ً-ْـ]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function stageOf(text) {
        const t = fold(text);
        if (/ثانوي/.test(t)) return 'secondary';
        if (/متوسط/.test(t)) return 'intermediate';
        if (/ابتدائي/.test(t)) return 'primary';
        return null;
    }

    /** رقم الصف من نصّه: «١» و«1» و«أول» و«الأول» سواء. -1 إن لم يُعرف. */
    function ordinalIndex(text) {
        const t = fold(text);
        for (let i = 0; i < ORDINALS.length; i++) {
            const hit = ORDINALS[i].some((w) =>
                new RegExp('(^|[\\s/\\-])' + fold(w) + '($|[\\s/\\-])').test(t));
            if (hit) return i;
        }
        return -1;
    }

    /**
     * يردّ اسم الصف إلى صيغة التطبيق.
     *
     * والمرحلة لا تُكتب في الجداول غالباً — المدرسة كلّها مرحلةٌ واحدة،
     * فيُكتب «١/٣» لا «الأول المتوسط / ٣». وكان اشتراطُها يُسقط الجدول
     * كلّه بلا أن يدري المعلّم لماذا. فصارت تُؤخذ من النصّ إن كُتبت، وإلا
     * من `fallbackStage` (فصولُ المعلّم أو مرحلة مدرسته)، وإلا رُدّ الصفُّ
     * بلا مرحلةٍ ليُسأل عنها مرّةً واحدة.
     *
     * @returns {{stage:string|null, index:number, grade:string|null}|null}
     */
    function parseGrade(text, fallbackStage) {
        const idx = ordinalIndex(text);
        if (idx < 0) return null;
        const stage = stageOf(text) || fallbackStage || null;
        if (!stage) return { stage: null, index: idx, grade: null };
        const list = GRADES[stage];
        if (idx >= list.length) return null;   /* «الخامس الثانوي» لا وجود له */
        return { stage, index: idx, grade: list[idx] };
    }

    /** الصف بمرحلةٍ تُعطى لاحقاً — بعد أن يختارها المعلّم. */
    function gradeAt(stage, index) {
        const list = GRADES[stage];
        return (list && index >= 0 && index < list.length) ? list[index] : null;
    }

    /** «١/٣» في حقلٍ واحد: يُشقّ إلى صفٍّ وشعبة حين تغيب الشعبة. */
    function splitLabel(grade, section) {
        const g = String(grade || '').trim();
        if (section && String(section).trim()) return { grade: g, section: String(section).trim() };
        const m = g.match(/^\s*([^\s/\-]+)\s*[/\-]\s*([^\s/\-]+)\s*$/);
        return m ? { grade: m[1], section: m[2] } : { grade: g, section: '' };
    }

    /* أرقام الشعب تُكتب هندية أو عربية — تُوحَّد فلا تصير «٣» و«3» شعبتين. */
    const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
    const toArDigits = (s) => String(s).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

    /** يُطبّع الشعبة: «شعبة أ» و«ه» و«A» و«3» كلّها تُردّ إلى صيغةٍ واحدة. */
    function parseSection(text) {
        let t = toArDigits(fold(text)).replace(/^شعبه\s*/, '').trim();
        if (!t) return '';
        const map = { 'ه': 'هـ', 'a': 'أ', 'b': 'ب', 'c': 'ج', 'd': 'د' };
        const low = t.toLowerCase();
        if (map[low]) return map[low];
        const found = SECTIONS.find((s) => fold(s) === t);
        return found || t.slice(0, 12);
    }

    /* الجدول يكتب «رياضيات» والتطبيق يحفظ «الرياضيات» — فأداةُ التعريف
       وحدها كانت تُنشئ فصلاً ثانياً للفصل نفسه. */
    const foldSubject = (s) => fold(s).replace(/^ال/, '');

    /** يردّ المادة المقروءة إلى اسمها في التطبيق إن كانت هي. */
    function normalizeSubject(raw, list) {
        const r = foldSubject(raw);
        if (!r) return '';
        const hit = (list || []).find((s) => foldSubject(s) === r);
        return hit || String(raw || '').trim();
    }

    /** «الأول الثانوي / أ» أو «الأول الثانوي» حين لا شعبة — بلا شرطةٍ يتيمة. */
    function label(grade, section) {
        const g = String(grade || '').replace(/^\s*الصف\s+/, '').trim();
        const s = String(section || '').trim();
        return s ? g + ' / ' + s : g;
    }

    /** هل هذا الفصل موجودٌ عند المعلّم فعلاً؟ (بلا حساسيةٍ للكتابة) */
    function findExisting(classes, grade, section, subject) {
        const g = fold(grade), s = fold(section), j = foldSubject(subject);
        return (classes || []).find((c) =>
            fold(c.grade) === g && fold(c.section) === s &&
            (!j || foldSubject(c.subject) === j)) || null;
    }

    /* ------------------------------------------------------------------
       الإنشاء
       ------------------------------------------------------------------ */

    /**
     * ينشئ فصلاً واحداً ويعيد صفَّه كاملاً بهُويّته.
     * @param {object} spec — { teacher_id, stage, grade, section, subject }
     */
    async function create(spec) {
        const grade   = String(spec.grade || '').trim();
        /* الشعبة اختيارية: كثيرٌ من المدارس فصلٌ واحدٌ لكل صف، فجداولها
           تكتب «ثاني ثانوي» بلا شعبة. واشتراطُها كان يُسقط جدولهم كلّه. */
        const section = String(spec.section || '').trim();
        const subject = String(spec.subject || '').trim();
        if (!spec.teacher_id) throw new Error('لا معلّم.');
        if (!grade || !subject) throw new Error('الصف والمادة مطلوبان.');

        const stage = spec.stage || stageOf(grade) || 'primary';
        const id = await global.TeacherDB.add('classes', {
            teacher_id: spec.teacher_id,
            stage, grade, section, subject,
            color: DEFAULT_COLOR,
            student_count: 0,
            created_at: new Date().toISOString()
        });
        return { id, teacher_id: spec.teacher_id, stage, grade, section, subject,
                 color: DEFAULT_COLOR, student_count: 0 };
    }

    global.ClassCreate = {
        GRADES, STAGE_LABELS, SECTIONS, DEFAULT_COLOR,
        fold, foldSubject, stageOf, ordinalIndex, parseGrade, gradeAt,
        splitLabel, parseSection, normalizeSubject, findExisting, create, label
    };
})(window);
