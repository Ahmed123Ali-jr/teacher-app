/* ==========================================================================
   edu-departments.js — الإدارات العامة للتعليم في السعودية.

   ستّ عشرة إدارة: ثلاث عشرة على المناطق، ومعها جدة والطائف والأحساء
   لأنها إدارات عامة مستقلّة لا مكاتب تابعة. القائمة من المستخدم نفسه.

   المعلم يختار إدارته بضغطة واحدة — لا يكتب حرفاً، فيبقى الاسم موحّداً في
   كل المطبوعات ولا يختلف إملاؤه بين معلّم وآخر.
   ========================================================================== */

(function (global) {
    'use strict';

    /* المنطقة مرافقة لكل إدارة لا خطوةً قبلها: بستّ عشرة إدارة تكفي ضغطة
       واحدة، والمنطقة تُشتقّ منها لترويسة المطبوعات. */
    const DEPTS = [
        { name: 'الرياض',            region: 'الرياض' , en: 'Riyadh' },
        { name: 'مكة المكرمة',       region: 'مكة المكرمة' , en: 'Makkah' },
        { name: 'جدة',               region: 'مكة المكرمة' , en: 'Jeddah' },
        { name: 'الطائف',            region: 'مكة المكرمة' , en: 'Taif' },
        { name: 'المدينة المنورة',   region: 'المدينة المنورة' , en: 'Madinah' },
        { name: 'القصيم',            region: 'القصيم' , en: 'Qassim' },
        { name: 'الشرقية',           region: 'الشرقية' , en: 'Eastern Province' },
        { name: 'الأحساء',           region: 'الشرقية' , en: 'Al-Ahsa' },
        { name: 'عسير',              region: 'عسير' , en: 'Asir' },
        { name: 'تبوك',              region: 'تبوك' , en: 'Tabuk' },
        { name: 'حائل',              region: 'حائل' , en: 'Hail' },
        { name: 'الحدود الشمالية',   region: 'الحدود الشمالية' , en: 'Northern Borders' },
        { name: 'جازان',             region: 'جازان' , en: 'Jazan' },
        { name: 'نجران',             region: 'نجران' , en: 'Najran' },
        { name: 'الباحة',            region: 'الباحة' , en: 'Al-Bahah' },
        { name: 'الجوف',             region: 'الجوف', en: 'Al-Jouf' }
    ];

    /** الاسم كما يُكتب في المطبوعات: «إدارة تعليم عسير». */
    function fullName(dept) {
        return dept ? 'إدارة تعليم ' + dept : '';
    }

    /** الاسمُ الإنجليزيّ للمطبوعات الإنجليزيّة — وإلّا فالعربيُّ كما هو،
        فاسمٌ لا نعرفه يُكتب كما كتبه المعلّم لا يُترجَم بالتخمين. */
    function enName(dept) {
        const hit = DEPTS.find((d) => d.name === bareName(dept));
        return hit && hit.en ? hit.en + ' Education Department' : String(dept || '');
    }

    /** الجزء المجرّد من اسم محفوظ: «إدارة تعليم عسير» → «عسير». */
    function bareName(dept) {
        return String(dept || '').replace(/^\s*إدارة تعليم\s+/, '').trim();
    }

    function all() { return DEPTS.slice(); }

    /** المنطقة التي تتبعها إدارة — تُملأ تلقائياً فلا يكتبها المعلم. */
    function regionOf(dept) {
        const hit = DEPTS.find((d) => d.name === bareName(dept));
        return hit ? hit.region : null;
    }

    global.EduDepts = { all, regionOf, fullName, bareName, enName };
})(window);
