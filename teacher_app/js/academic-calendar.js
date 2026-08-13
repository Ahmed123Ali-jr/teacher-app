/* ==========================================================================
   academic-calendar.js — التقويم الدراسي: البيانات ومنطقها.

   للسعودية تقويمان دراسيان لا واحد: أربع إدارات لها تقويمها (مكة
   المكرمة · جدة · الطائف · المدينة المنورة)، وبقيّة الإدارات تقويمٌ آخر.

   والمعلّم لا يُسأل أيّهما: إدارة تعليمه محفوظةٌ منذ التهيئة
   (`education_dept`، حقلٌ مطلوب لا يمرّ الإعداد بدونه). وله أن يبدّله
   من صفحة التقويم إن كانت مدرسته تتبع الآخر، ويُحفظ اختياره في
   `academic_calendar`.

   ⚠️ التواريخ أدناه **مبدئية** حتى يرسل المعلّم صورتَي التقويمين
   الرسميّتين. علامة `provisional` تُظهر تنبيهاً في البطاقة، وتُرفع
   حين تُدخَل التواريخ الحقيقية — ولا يُغيَّر معها سطرٌ واحد من المنطق.

   لماذا وحدة مستقلّة: البيانات تتغيّر كل عام، والعرض لا. فصلُهما يجعل
   التحديث السنوي تعديلاً في مكانٍ واحد لا مطاردةً في ملف الواجهة.
   ========================================================================== */

(function (global) {
    'use strict';

    const D = (y, m, d) => new Date(y, m - 1, d);

    /* الإدارات الأربع بأسمائها صريحةً لا اشتقاقاً من المنطقة: المدينة
       المنورة منطقةٌ مستقلّة، فاشتقاق القاعدة من «منطقة مكة» يُسقطها. */
    const EARLY_DEPTS = ['مكة المكرمة', 'جدة', 'الطائف', 'المدينة المنورة'];

    const CALENDARS = {
        early: {
            key: 'early',
            label: 'تقويم مكة وجدة والطائف والمدينة',
            year: '١٤٤٨هـ',
            provisional: true,
            start: D(2026, 8, 9),
            terms: [
                { n: 1, name: 'الأول',  weeks: 13 },
                { n: 2, name: 'الثاني', weeks: 12 },
                { n: 3, name: 'الثالث', weeks: 11 }
            ],
            holidays: [
                { name: 'اليوم الوطني',             from: D(2026, 9, 23),  to: D(2026, 9, 23)  },
                { name: 'إجازة مطوّلة',             from: D(2026, 10, 19), to: D(2026, 10, 20) },
                { name: 'إجازة نهاية الفصل الأول',  from: D(2026, 11, 2),  to: D(2026, 11, 12) },
                { name: 'إجازة مطوّلة',             from: D(2026, 12, 21), to: D(2026, 12, 22) },
                { name: 'إجازة نهاية الفصل الثاني', from: D(2027, 2, 1),   to: D(2027, 2, 11)  },
                { name: 'إجازة عيد الفطر',          from: D(2027, 3, 8),   to: D(2027, 3, 19)  }
            ]
        },
        standard: {
            key: 'standard',
            label: 'تقويم بقيّة المناطق',
            year: '١٤٤٨هـ',
            provisional: true,
            start: D(2026, 8, 2),
            terms: [
                { n: 1, name: 'الأول',  weeks: 13 },
                { n: 2, name: 'الثاني', weeks: 12 },
                { n: 3, name: 'الثالث', weeks: 11 }
            ],
            holidays: [
                { name: 'اليوم الوطني',             from: D(2026, 9, 23),  to: D(2026, 9, 23)  },
                { name: 'إجازة مطوّلة',             from: D(2026, 10, 12), to: D(2026, 10, 13) },
                { name: 'إجازة نهاية الفصل الأول',  from: D(2026, 10, 26), to: D(2026, 11, 5)  },
                { name: 'إجازة مطوّلة',             from: D(2026, 12, 14), to: D(2026, 12, 15) },
                { name: 'إجازة نهاية الفصل الثاني', from: D(2027, 1, 25),  to: D(2027, 2, 4)   },
                { name: 'إجازة عيد الفطر',          from: D(2027, 3, 8),   to: D(2027, 3, 19)  }
            ]
        }
    };

    const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
                      'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر',
                      'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر',
                      'السادس عشر', 'السابع عشر', 'الثامن عشر'];

    /** ترتيب الأسبوع نصّاً، وإن تجاوز القائمة رجع رقمه. */
    function ordinal(n) {
        return ORDINALS[n] || ('رقم ' + arDigits(n));
    }

    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* التاريخ الهجري من المتصفّح بتقويم أم القرى — لا مكتبة ولا جدول
       تحويل يشيخ بعد عام. وإن عجز المتصفّح رجعنا فارغاً بدل أن نكسر. */
    let _hijri = null;
    function hijri(date) {
        try {
            if (!_hijri) {
                _hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
                    { day: 'numeric', month: 'long' });
            }
            return _hijri.format(date);
        } catch (e) { return ''; }
    }

    const GREG_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                         'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const gregorian = (d) => arDigits(d.getDate()) + ' ' + GREG_MONTHS[d.getMonth()];

    /* ------------------------------------------------------------------
       الاختيار
       ------------------------------------------------------------------ */

    /** يجرّد «إدارة تعليم جدة» → «جدة»، فالحقل قد يُحفظ بأيّ الصيغتين. */
    function bare(dept) {
        if (global.EduDepts && global.EduDepts.bareName) return global.EduDepts.bareName(dept);
        return String(dept || '').replace(/^\s*إدارة تعليم\s+/, '').trim();
    }

    /** التقويم الافتراضي لإدارة تعليم. */
    function defaultKeyFor(dept) {
        return EARLY_DEPTS.indexOf(bare(dept)) >= 0 ? 'early' : 'standard';
    }

    /** التقويم المطبَّق: اختيار المعلّم إن وُجد، وإلّا افتراض إدارته. */
    function resolve(dept, override) {
        const key = (override && CALENDARS[override]) ? override : defaultKeyFor(dept);
        return CALENDARS[key];
    }

    /* ------------------------------------------------------------------
       البناء: السنة أسابيعَ موصوفة
       ------------------------------------------------------------------ */

    /** يوم بلا وقت — المقارنة بين التواريخ تفسد بالساعات. */
    const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

    function holidayOn(cal, date) {
        const t = dayOnly(date).getTime();
        return cal.holidays.find((h) => t >= dayOnly(h.from).getTime()
                                     && t <= dayOnly(h.to).getTime()) || null;
    }

    /**
     * يبني أسابيع السنة من تقويم.
     * @returns {Array<{n,term,k,from,to,days,offs,holName,allOff}>}
     */
    function buildWeeks(cal) {
        const weeks = [];
        let n = 0;
        cal.terms.forEach((t) => {
            for (let i = 0; i < t.weeks; i++) {
                n += 1;
                const from = new Date(cal.start);
                from.setDate(cal.start.getDate() + (n - 1) * 7);
                const days = DAY_NAMES.map((name, k) => {
                    const d = new Date(from);
                    d.setDate(from.getDate() + k);
                    return { name, date: d, hol: holidayOn(cal, d) };
                });
                const offs = days.filter((d) => d.hol);
                weeks.push({
                    n, term: t.n, k: i + 1,
                    from, to: days[4].date, days, offs,
                    holName: offs.length ? offs[0].hol.name : null,
                    allOff: offs.length === DAY_NAMES.length
                });
            }
        });
        return weeks;
    }

    /**
     * حالة اليوم داخل التقويم: أين نحن، وما الإجازة القادمة.
     * `today` معطًى ليُختبر بلا انتظار مرور الزمن.
     */
    function state(cal, today) {
        const weeks = buildWeeks(cal);
        const t = dayOnly(today || new Date()).getTime();

        /* الأسبوع الحالي يمتدّ إلى نهاية السبت: الجمعة والسبت ليسا في
           الشبكة، ولو قُطعا لظهر المعلّم يومَي العطلة خارج السنة. */
        let current = null;
        for (const w of weeks) {
            const from = dayOnly(w.from).getTime();
            const to   = dayOnly(w.to).getTime() + 2 * 864e5;
            if (t >= from && t <= to) { current = w; break; }
        }
        const before = t < dayOnly(weeks[0].from).getTime();
        const after  = t > dayOnly(weeks[weeks.length - 1].to).getTime() + 2 * 864e5;
        if (!current) current = before ? weeks[0] : weeks[weeks.length - 1];

        let nextOff = null;
        for (const w of weeks) {
            for (const d of w.days) {
                if (d.hol && dayOnly(d.date).getTime() > t) { nextOff = d; break; }
            }
            if (nextOff) break;
        }
        const daysToOff = nextOff
            ? Math.round((dayOnly(nextOff.date).getTime() - t) / 864e5) : 0;

        return { cal, weeks, current, nextOff, daysToOff, before, after };
    }

    global.AcademicCalendar = {
        CALENDARS, EARLY_DEPTS, DAY_NAMES,
        defaultKeyFor, resolve, buildWeeks, state,
        ordinal, arDigits, hijri, gregorian
    };
})(window);
