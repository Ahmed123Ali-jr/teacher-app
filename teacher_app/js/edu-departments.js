/* ==========================================================================
   edu-departments.js — الإدارات العامة للتعليم في السعودية.

   سبعٌ وأربعون إدارة: ثلاثَ عشرةَ على المناطق، وأربعٌ وثلاثون على
   المحافظات. القائمةُ كلُّها من وزارة التعليم نفسها — صفحةُ الإدارات
   العربيّةُ والإنجليزيّةُ معاً، ورابطُ كلِّ إدارةٍ هو ما قرن الاسمَ باسمه:

     https://moe.gov.sa/edu-depts.aspx        (العربيّة)
     https://www.moe.gov.sa/edu-depts_EN.aspx (الإنجليزيّة)

   فالإملاءُ الإنجليزيُّ ليس نقلاً من عندنا ولا تخميناً — هو ما تكتبه
   الوزارةُ عن نفسها. وحيث خالفت الوزارةُ الشائعَ تُتَّبع الوزارةُ لا
   الشائع: «Al-Muznib» لا Al-Mithnab. والمدينةُ وحدَها استثناء: صفحةُ
   الوزارة الإنجليزيّةُ تكتبها «Medina» ونطاقُ موقعها يكتبها «Madinah»،
   فأُخذت «Madinah» — وهي الأكثر في مطبوعات المملكة.

   المعلم يختار إدارته بضغطة واحدة — لا يكتب حرفاً، فيبقى الاسم موحّداً في
   كل المطبوعات ولا يختلف إملاؤه بين معلّم وآخر.
   ========================================================================== */

(function (global) {
    'use strict';

    /* المنطقة مرافقة لكل إدارة لا خطوةً قبلها: القائمة مرتّبةٌ بالمناطق،
       كلُّ منطقةٍ يليها ما تحتها من إدارات المحافظات، فتُدرَك بالنظر ولا
       تحتاج خطوةً ثانية. والمنطقة تُشتقّ من الإدارة لترويسة المطبوعات. */
    const DEPTS = [
        { name: 'الرياض',                region: 'الرياض',          en: 'Riyadh' },
        { name: 'الخرج',                 region: 'الرياض',          en: 'Al-Kharj' },
        { name: 'الدوادمي',              region: 'الرياض',          en: 'Al-Dawadmi' },
        { name: 'المجمعة',               region: 'الرياض',          en: "Al Majma'ah" },
        { name: 'القويعية',              region: 'الرياض',          en: "Al-Quway'iyah" },
        { name: 'وادي الدواسر',          region: 'الرياض',          en: 'Wadi Ad-Dawasir' },
        { name: 'الأفلاج',               region: 'الرياض',          en: 'Al-Aflaj' },
        { name: 'الزلفي',                region: 'الرياض',          en: 'Zulfi' },
        { name: 'شقراء',                 region: 'الرياض',          en: 'Shaqra' },
        { name: 'عفيف',                  region: 'الرياض',          en: 'Afif' },
        { name: 'الغاط',                 region: 'الرياض',          en: 'Al Ghat' },
        { name: 'حوطة بني تميم والحريق', region: 'الرياض',          en: 'Hawtah Bani Tamim and Al-Hariq' },
        { name: 'مكة المكرمة',           region: 'مكة المكرمة',     en: 'Makkah Al-Mukarramah' },
        { name: 'جدة',                   region: 'مكة المكرمة',     en: 'Jeddah' },
        { name: 'الطائف',                region: 'مكة المكرمة',     en: 'Taif' },
        { name: 'القنفذة',               region: 'مكة المكرمة',     en: 'Al Qunfudhah' },
        { name: 'الليث',                 region: 'مكة المكرمة',     en: 'Al-Laith' },
        { name: 'المدينة المنورة',       region: 'المدينة المنورة', en: 'Madinah' },
        { name: 'ينبع',                  region: 'المدينة المنورة', en: 'Yanbu' },
        { name: 'العلا',                 region: 'المدينة المنورة', en: 'Al-Ula' },
        { name: 'مهد الذهب',             region: 'المدينة المنورة', en: 'Mahd Adh Dhahab' },
        { name: 'القصيم',                region: 'القصيم',          en: 'Qassim' },
        { name: 'عنيزة',                 region: 'القصيم',          en: 'Unaizah' },
        { name: 'الرس',                  region: 'القصيم',          en: 'Al-Rass' },
        { name: 'البكيرية',              region: 'القصيم',          en: 'Al-Bukayriyah' },
        { name: 'المذنب',                region: 'القصيم',          en: 'Al-Muznib' },
        { name: 'الشرقية',               region: 'الشرقية',         en: 'the Eastern Region' },
        { name: 'الأحساء',               region: 'الشرقية',         en: 'Al-Ahsa' },
        { name: 'حفر الباطن',            region: 'الشرقية',         en: 'Hafar Al-Batin' },
        { name: 'عسير',                  region: 'عسير',            en: 'Asir' },
        { name: 'بيشة',                  region: 'عسير',            en: 'Bisha' },
        { name: 'محايل عسير',            region: 'عسير',            en: 'Muhayil Asir' },
        { name: 'رجال ألمع',             region: 'عسير',            en: 'Rijal Almaa' },
        { name: 'سراة عبيدة',            region: 'عسير',            en: 'Sarat Abidah' },
        { name: 'النماص',                region: 'عسير',            en: 'Namas' },
        { name: 'ظهران الجنوب',          region: 'عسير',            en: 'Dhahran Al Janoub' },
        { name: 'تبوك',                  region: 'تبوك',            en: 'Tabuk' },
        { name: 'حائل',                  region: 'حائل',            en: 'Hail' },
        { name: 'الحدود الشمالية',       region: 'الحدود الشمالية', en: 'the Northern Borders' },
        { name: 'جازان',                 region: 'جازان',           en: 'Jazan' },
        { name: 'صبيا',                  region: 'جازان',           en: 'Sabya' },
        { name: 'نجران',                 region: 'نجران',           en: 'Najran' },
        { name: 'شرورة',                 region: 'نجران',           en: 'Sharurah' },
        { name: 'الباحة',                region: 'الباحة',          en: 'Al Baha' },
        { name: 'المخواة',               region: 'الباحة',          en: 'Al-Makhwah' },
        { name: 'الجوف',                 region: 'الجوف',           en: 'Al-Jawf' },
        { name: 'القريات',               region: 'الجوف',           en: 'Al-Qurayyat' }
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
