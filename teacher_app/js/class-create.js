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

    /* ── أسماءٌ إنجليزيّةٌ للمطبوعات الإنجليزيّة ──
       الصفُّ يُكتب رقماً ومرحلةً («5 Primary») لا ترجمةً حرفيّةً للعدد
       الترتيبيّ — أوجزُ وأوضحُ لمن يقرأ الورقة. ويأتي بعد كلمة «Class»
       في الترويسة فلا يحمل الكلمةَ في نفسه. وما ليس في القائمة يبقى
       عربيّاً كما هو. */
    const EN_STAGE = { primary: 'Primary', intermediate: 'Intermediate', secondary: 'Secondary' };
    const EN_SECTION = { 'أ': 'A', 'ب': 'B', 'ج': 'C', 'د': 'D',
                         'هـ': 'E', 'و': 'F', 'ز': 'G', 'ح': 'H' };

    function enGrade(grade) {
        const g = String(grade || '').trim();
        for (const st of Object.keys(GRADES)) {
            const i = GRADES[st].indexOf(g);
            if (i >= 0) return (i + 1) + ' ' + EN_STAGE[st];
        }
        return g;
    }
    const enSection = (sec) => EN_SECTION[String(sec || '').trim()] || String(sec || '');
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

    /**
     * «١/٣» أو «أول ثانوي/أ» في حقلٍ واحد: يُشقّ إلى صفٍّ وشعبة.
     *
     * يُشقّ على **آخر** فاصل لا أوّله، والذيلُ وحده يصير شعبةً — فالصف
     * قد يحمل مسافةً («أول ثانوي») والشعبة لا تحملها أبداً. وكان الشقّ
     * يشترط خلوّ الطرفين من المسافات، فتضيع شعبة «أول ثانوي/أ» صامتةً
     * ويخرج المعلّم بفصلٍ بلا شعبة — قِيس: ١٣٪ في حالة الشعب بالحروف.
     */
    function splitLabel(grade, section) {
        const g = String(grade || '').trim();
        if (section && String(section).trim()) return { grade: g, section: String(section).trim() };
        const m = g.match(/^(.+?)\s*[/\-]\s*([^\s/\-]{1,6})$/);
        /* ويبقى ما قبل الفاصل صفّاً معروفاً، وإلا فالفاصل جزءٌ من الاسم. */
        return (m && m[1].trim()) ? { grade: m[1].trim(), section: m[2] } : { grade: g, section: '' };
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

    /* ------------------------------------------------------------------
       الكشفُ المشترك — فصلٌ واحدٌ بمادّتين

       المعلّمُ يدرّس «الأول المتوسط / أ» علوماً واجتماعيات، فيُدخل الكشفَ
       نفسَه مرّتين ويُصحّح كلَّ اسمٍ مرّتين. والحلُّ أن يقرآ الكشفَ نفسَه
       (`roster_id`)، ولكن **لا يُطبَّق صامتاً**: يُعرض ويُؤكَّد، ويسمّي
       العددَ — فالعددُ هو الذي يكشف المطابقةَ الخاطئة قبل أن تقع.
       ------------------------------------------------------------------ */

    /** كشفُ الفصل: فراغُه يعني «كشفي كشفي». (نظيرُ `TeacherDB.rosterOf`.) */
    const rosterIdOf = (c) => (c && (c.roster_id || c.id)) || null;

    /**
     * الفصلُ الذي يُرجَّح أن يشارك `created` كشفَه.
     *
     * الشرطُ: **المرحلةُ والصفُّ والشعبةُ تتطابق والمادّةُ تختلف**. والشعبةُ
     * جزءٌ من المفتاح — «٦/أ علوم» لا يطابق «٦/ب اجتماعيات»؛ ولكن
     * «٦ بلا شعبة» يطابق «٦ بلا شعبة» فكلاهما فراغٌ مقصود.
     *
     * ولا يُقترح فصلٌ فارغ: كشفٌ لا أسماءَ فيه لا يُشارَك، والسؤالُ عنه
     * إزعاجٌ بلا مقابل. فالعدُّ من مسؤوليّة المنادي.
     *
     * @param {object[]} classes  فصولُ المعلّم في هذا الفصل الدراسيّ
     * @param {object}   created  الفصلُ المُنشأ حديثاً
     * @returns {object[]} المرشّحون — أوّلُهم أولاهم
     */
    function rosterCandidates(classes, created) {
        if (!created) return [];
        const g = fold(created.grade), sec = fold(created.section),
              j = foldSubject(created.subject),
              rid = rosterIdOf(created);
        return (classes || []).filter((c) =>
            c && c.id !== created.id
            && fold(c.grade) === g && fold(c.section) === sec
            && foldSubject(c.subject) !== j
            /* ومن يشاركه الكشفَ أصلاً ليس مرشّحاً — هو هو. */
            && rosterIdOf(c) !== rid);
    }

    const AR = (n) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

    /* ولا يُعاد السؤالُ على من قال «لا» ──
       الموضعُ صار لحظةَ الإضافة، وهي تتكرّر. فلو سُئل في كلِّ مرّةٍ لصار
       السؤالُ مضايقةً، ولضغط «نعم» ليسكته — وهو أسوأُ ما يقع لسؤالٍ
       جوابُه يغيّر بيانات. فتُحفظ «لا» ولا تُعاد. */
    const DECLINED = 'roster_declined';

    async function declinedIds(db) {
        try {
            const v = await db.Settings.get(DECLINED);
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }

    async function rememberDecline(db, classId) {
        try {
            const list = await declinedIds(db);
            if (list.indexOf(classId) >= 0) return;
            await db.Settings.set(DECLINED, list.concat(classId));
        } catch (e) { /* السؤالُ يُعاد، ولا شيءَ يُكسر */ }
    }

    /**
     * يسأل المعلّمَ إن كان هذا الفصل يشارك كشفَ فصلٍ قائم، ويربطُهما إن
     * قال نعم.
     *
     * ── ومتى يُنادى: **حين يهمّ بإضافة الطلاب**، لا حين يُنشئ الفصل ──
     * كان يُسأل عند الإنشاء، فيأتيه السؤالُ وهو لم يفكّر في الأسماء بعد.
     * وموضعُه الصحيحُ لحظةَ الحاجة: يفتح الفصلَ الثاني ويضغط «إضافة
     * طالب» — فيُقال له إنّ الأسماءَ عنده أصلاً قبل أن يكتبها ثانيةً.
     * (طلبُه، ٧ سبتمبر ٢٠٢٦.)
     *
     * @param {object} cls — صفُّ الفصل المفتوح
     * @returns {Promise<boolean>} هل رُبط؟ (فإن رُبط فلا حاجةَ لشاشة الإضافة)
     */
    async function offerSharedRoster(cls) {
        const db = global.TeacherDB;
        if (!db || !cls || !cls.id) return false;

        /* كشفُه فيه أسماءُ فعلاً: لا يُقترح دمجٌ على كشفٍ قائم — الربطُ
           يجمع الكشفين ولا يفصلهما، فيُعرض على الفارغ وحدَه. */
        try { if ((await db.studentsOf(cls.id)).length) return false; }
        catch (e) { return false; }

        if ((await declinedIds(db)).indexOf(cls.id) >= 0) return false;

        let classes = [];
        try { classes = await db.getAll('classes'); } catch (e) { return false; }
        classes = classes.filter((c) => c.teacher_id === cls.teacher_id);

        const cands = rosterCandidates(classes, cls);
        if (!cands.length) return false;

        /* العددُ يُقرأ من الكشف لا من `student_count` — العدّادُ قد يتخلّف،
           والرقمُ المعروضُ هو الذي يُبنى عليه القرار فلا يُؤخذ من مذكّرة. */
        let best = null;
        for (const c of cands) {
            let n = 0;
            try { n = (await db.studentsOf(c.id)).length; } catch (e) { continue; }
            if (n > 0 && (!best || n > best.n)) best = { cls: c, n };
        }
        if (!best) return false;   /* كلُّهم فارغون: لا كشفَ يُشارَك */

        const name = label(best.cls.grade, best.cls.section)
                   + (best.cls.subject ? ' — ' + best.cls.subject : '');
        const ok = await global.TeacherApp.confirm({
            title:   'نفس الطلاب؟',
            message: 'عندك «' + name + '» فيه ' + AR(best.n) + ' من الطلاب. '
                   + 'إن كانوا هم أنفسهم فلا تكتبهم مرّةً ثانية — اربط '
                   + 'الكشفين: أيُّ اسمٍ تضيفه أو تصحّحه في أحدهما يظهر في '
                   + 'الآخر. والحضورُ والدرجاتُ تبقى منفصلةً لكلّ مادّة.',
            ok:     'نعم، الكشف نفسه',
            cancel: 'لا، أكتبهم بنفسي'
        });
        if (!ok) { await rememberDecline(db, cls.id); return false; }

        try {
            const row = await db.get('classes', cls.id);
            if (!row) return false;
            row.roster_id = rosterIdOf(best.cls);
            await db.put('classes', row);
            cls.roster_id = row.roster_id;
            await db.syncRosterCounts(cls.id);
        } catch (e) {
            console.error('[ClassCreate] تعذّر ربط الكشف:', e);
            global.TeacherApp.toast('تعذّر ربط الكشفين — الفصل أُضيف بكشفٍ خاصّ به.',
                                    'error', 6000);
            return false;
        }
        global.TeacherApp.toast('رُبط الكشفان — ' + AR(best.n) + ' من الطلاب.',
                                'success', 3000);
        return true;
    }

    global.ClassCreate = {
        GRADES, STAGE_LABELS, SECTIONS, DEFAULT_COLOR,
        fold, foldSubject, stageOf, ordinalIndex, parseGrade, gradeAt,
        splitLabel, parseSection, normalizeSubject, findExisting, create, label,
        enGrade, enSection,
        rosterCandidates, offerSharedRoster
    };
})(window);
