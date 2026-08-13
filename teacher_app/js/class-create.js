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

    /**
     * يردّ اسم الصف إلى صيغة التطبيق.
     * @returns {{stage:string, grade:string}|null}
     */
    function parseGrade(text) {
        const stage = stageOf(text);
        if (!stage) return null;
        const t = fold(text);
        const max = GRADES[stage].length;
        for (let i = 0; i < max; i++) {
            const hit = ORDINALS[i].some((w) => new RegExp('(^|\\s|/)' + fold(w) + '($|\\s|/)').test(t));
            if (hit) return { stage, grade: GRADES[stage][i] };
        }
        return null;
    }

    /** يُطبّع الشعبة: «شعبة أ» و«ه» و«A» كلّها تصير «أ» متى أمكن. */
    function parseSection(text) {
        let t = fold(text).replace(/^شعبه\s*/, '').trim();
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
        const section = String(spec.section || '').trim();
        const subject = String(spec.subject || '').trim();
        if (!spec.teacher_id) throw new Error('لا معلّم.');
        if (!grade || !section || !subject) throw new Error('الصف والشعبة والمادة مطلوبة.');

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
        fold, foldSubject, stageOf, parseGrade, parseSection,
        normalizeSubject, findExisting, create
    };
})(window);
