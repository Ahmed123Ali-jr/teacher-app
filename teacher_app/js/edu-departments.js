/* ==========================================================================
   edu-departments.js — الإدارات العامة للتعليم في السعودية.

   ستَّ عشرةَ إدارة. وهذا العددُ صحيحٌ اليوم لا بالأمس: كانت سبعاً
   وأربعين، ثم ألغى قرارُ الهيكلة إحدى وثلاثين إدارةً ومئةً وثمانيةً
   وثلاثين مكتباً تعليميّاً، ونُفِّذ على أربع مراحلَ انتهت آخرَ ٢٠٢٥.
   والباقيةُ هي هذه: ثلاثَ عشرةَ على المناطق، ومعها جدةُ والطائفُ
   والأحساءُ لكِبَرها.

   ── تحذيرٌ لمن يأتي بعدُ ──
   صفحةُ الإدارات في موقع الوزارة **ما زالت تعرض السبعَ والأربعين**
   بروابط مواقعها. لا تُبنَ عليها القائمةُ: هي أرشيفٌ لم يُحدَّث، لا
   حالٌ قائمة. جُرِّب هذا وأُخطئ فيه — أُدخلت السبعُ والأربعون ثم رُدَّت.
     https://moe.gov.sa/edu-depts.aspx        (عربيّة — قديمة العدد)
     https://www.moe.gov.sa/edu-depts_EN.aspx (إنجليزيّة — قديمة العدد)

   أمّا **الإملاءُ الإنجليزيّ** فيؤخذ من الصفحتين نفسِهما وهو صحيح: هي
   تكتب أسماءَها بيدها، والعددُ وحدَه ما قدُم فيها. وحيث خالفت الشائعَ
   تُتَّبع هي. والمدينةُ استثناء: صفحتُها تكتبها «Medina» ونطاقُ موقعها
   «Madinah» — وأُخذت «Madinah» بطلب المستخدم، وهي الأكثر في مطبوعات
   المملكة.

   المعلم يختار إدارته بضغطة واحدة — لا يكتب حرفاً، فيبقى الاسم موحّداً في
   كل المطبوعات ولا يختلف إملاؤه بين معلّم وآخر.
   ========================================================================== */

(function (global) {
    'use strict';

    /* المنطقة مرافقة لكل إدارة لا خطوةً قبلها: بستّ عشرة إدارة تكفي ضغطة
       واحدة، والمنطقة تُشتقّ منها لترويسة المطبوعات. */
    const DEPTS = [
        { name: 'الرياض',          region: 'الرياض',          en: 'Riyadh' },
        { name: 'مكة المكرمة',     region: 'مكة المكرمة',     en: 'Makkah Al-Mukarramah' },
        { name: 'جدة',             region: 'مكة المكرمة',     en: 'Jeddah' },
        { name: 'الطائف',          region: 'مكة المكرمة',     en: 'Taif' },
        { name: 'المدينة المنورة', region: 'المدينة المنورة', en: 'Madinah' },
        { name: 'القصيم',          region: 'القصيم',          en: 'Qassim' },
        { name: 'الشرقية',         region: 'الشرقية',         en: 'the Eastern Region' },
        { name: 'الأحساء',         region: 'الشرقية',         en: 'Al-Ahsa' },
        { name: 'عسير',            region: 'عسير',            en: 'Asir' },
        { name: 'تبوك',            region: 'تبوك',            en: 'Tabuk' },
        { name: 'حائل',            region: 'حائل',            en: 'Hail' },
        { name: 'الحدود الشمالية', region: 'الحدود الشمالية', en: 'the Northern Borders' },
        { name: 'جازان',           region: 'جازان',           en: 'Jazan' },
        { name: 'نجران',           region: 'نجران',           en: 'Najran' },
        { name: 'الباحة',          region: 'الباحة',          en: 'Al Baha' },
        { name: 'الجوف',           region: 'الجوف',           en: 'Al-Jawf' }
    ];

    /** الاسم كما يُكتب في المطبوعات: «إدارة تعليم عسير». */
    function fullName(dept) {
        return dept ? 'إدارة تعليم ' + dept : '';
    }

    /** الاسمُ الإنجليزيّ للمطبوعات الإنجليزيّة — وإلّا فالعربيُّ كما هو،
        فاسمٌ لا نعرفه يُكتب كما كتبه المعلّم لا يُترجَم بالتخمين.

        والصيغةُ «Education Department of X» موحّدةٌ على الجميع بطلبه —
        والوزارةُ نفسُها تخالف بين إداراتها: «General Administration of
        Education in X Region» للمناطق، و«Education Department in X
        Governorate» لأكثر المحافظات، و«X Governorate Education
        Department» لأربعٍ منها. فالمأخوذُ عنها الاسمُ لا القالب. */
    function enName(dept) {
        const hit = DEPTS.find((d) => d.name === bareName(dept));
        return hit && hit.en ? 'Education Department of ' + hit.en : String(dept || '');
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
