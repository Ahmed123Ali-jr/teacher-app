/* ==========================================================================
   academic-calendar.js — التقويم الدراسي: البيانات ومنطقها.

   المصدر: تقويما وزارة التعليم للعام ١٤٤٨/١٤٤٩هـ كما أرسلهما المعلّم
   (إعداد أ. أحمد الغامدي). تقويمان لا واحد:

     • مكة المكرمة · المدينة المنورة · جدة · الطائف  →  ١٨ أسبوعاً
     • بقيّة الإدارات                                 →  ١٩ أسبوعاً

   والمعلّم لا يُسأل أيّهما: إدارة تعليمه محفوظةٌ منذ التهيئة
   (`education_dept`). وله تبديله من صفحة التقويم، ويُحفظ في
   `academic_calendar`.

   ── لماذا التواريخ صريحةٌ أسبوعاً أسبوعاً ──
   الأسابيع ليست متتاليةً بسبعة أيام: إجازة الخريف تفصل بين أسبوعين
   (ينتهي الثاني عشر في ١٩ نوفمبر ويبدأ الثالث عشر في ٢٩ منه). فحسابُ
   «البداية + سبعة» كان سيزيح كلّ ما بعد الإجازة أسبوعاً كاملاً. ولذلك
   يُخزَّن تاريخ بداية كل أسبوع كما هو في الورقة — يُقارَن بها سطراً
   بسطر، ولا يعتمد على قاعدةٍ قد تنكسر.

   ── ما ينقص ──
   الصورتان للفصل الدراسي الأول وحده. الفصلان الثاني والثالث ينتظران
   تقويمَيهما؛ وحتى يصلا لا يُعرض إلا ما نعرفه — ولا يُخترع تاريخ.
   ========================================================================== */

(function (global) {
    'use strict';

    const D = (y, m, d) => new Date(y, m - 1, d);

    /* الإدارات الأربع صريحةً لا اشتقاقاً من المنطقة: المدينة المنورة
       منطقةٌ مستقلّة، فاشتقاق القاعدة من «منطقة مكة» يُسقطها. */
    const EARLY_DEPTS = ['مكة المكرمة', 'جدة', 'الطائف', 'المدينة المنورة'];

    /* الإجازتان الفاصلتان واحدةٌ في التقويمين — تُكتب مرّةً وتُشار إليها. */
    const AUTUMN = { name: 'إجازة الخريف',        from: D(2026, 11, 20), to: D(2026, 11, 28) };
    const MIDYEAR = { name: 'إجازة منتصف العام',  from: D(2027, 1, 8),   to: D(2027, 1, 16)  };
    /* اليوم الوطني يقع داخل أسبوع دراسة، فهو إجازة يومَين لا فاصلاً. */
    const NATIONAL = { name: 'اليوم الوطني',      from: D(2026, 9, 23),  to: D(2026, 9, 24)  };

    const wk = (y, m, d) => ({ t: 'week', from: D(y, m, d) });
    const exam = (y, m, d) => ({ t: 'week', from: D(y, m, d), exam: true });
    const span = (o) => Object.assign({ t: 'span' }, o);

    const CALENDARS = {
        early: {
            key: 'early',
            label: 'تقويم مكة والمدينة وجدة والطائف',
            year: '١٤٤٨/١٤٤٩هـ',
            holidays: [NATIONAL],
            stats: { weeks: 18, days: 88, offDays: 20 },
            terms: [{
                n: 1, name: 'الأول',
                segments: [
                    span({ name: 'عودة المعلمين والمعلمات', from: D(2026, 8, 23), to: D(2026, 8, 27), work: true }),
                    wk(2026, 8, 30), wk(2026, 9, 6),  wk(2026, 9, 13), wk(2026, 9, 20),
                    wk(2026, 9, 27), wk(2026, 10, 4), wk(2026, 10, 11), wk(2026, 10, 18),
                    wk(2026, 10, 25), wk(2026, 11, 1), wk(2026, 11, 8), wk(2026, 11, 15),
                    span(AUTUMN),
                    wk(2026, 11, 29), wk(2026, 12, 6), wk(2026, 12, 13), wk(2026, 12, 20),
                    wk(2026, 12, 27), exam(2027, 1, 3),
                    span(MIDYEAR)
                ]
            }]
        },
        standard: {
            key: 'standard',
            label: 'تقويم بقيّة المناطق',
            year: '١٤٤٨/١٤٤٩هـ',
            holidays: [NATIONAL],
            stats: { weeks: 19, days: 93, offDays: 20 },
            terms: [{
                n: 1, name: 'الأول',
                segments: [
                    span({ name: 'عودة المعلمين والمعلمات', from: D(2026, 8, 16), to: D(2026, 8, 20), work: true }),
                    wk(2026, 8, 23), wk(2026, 8, 30), wk(2026, 9, 6),  wk(2026, 9, 13),
                    wk(2026, 9, 20), wk(2026, 9, 27), wk(2026, 10, 4), wk(2026, 10, 11),
                    wk(2026, 10, 18), wk(2026, 10, 25), wk(2026, 11, 1), wk(2026, 11, 8),
                    wk(2026, 11, 15),
                    span(AUTUMN),
                    wk(2026, 11, 29), wk(2026, 12, 6), wk(2026, 12, 13), wk(2026, 12, 20),
                    wk(2026, 12, 27), exam(2027, 1, 3),
                    span(MIDYEAR)
                ]
            }]
        }
    };

    const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
    const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس',
                      'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر',
                      'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر',
                      'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];

    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const ordinal = (n) => ORDINALS[n] || arDigits(n);

    /* الهجري من المتصفّح بتقويم أم القرى — لا مكتبة ولا جدول تحويل يشيخ. */
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
    function bare(dept) {
        if (global.EduDepts && global.EduDepts.bareName) return global.EduDepts.bareName(dept);
        return String(dept || '').replace(/^\s*إدارة تعليم\s+/, '').trim();
    }
    function defaultKeyFor(dept) {
        return EARLY_DEPTS.indexOf(bare(dept)) >= 0 ? 'early' : 'standard';
    }
    function resolve(dept, override) {
        const key = (override && CALENDARS[override]) ? override : defaultKeyFor(dept);
        return CALENDARS[key];
    }

    /* ------------------------------------------------------------------
       البناء
       ------------------------------------------------------------------ */
    const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const ts = (d) => dayOnly(d).getTime();

    function holidayOn(cal, date) {
        const t = ts(date);
        return cal.holidays.find((h) => t >= ts(h.from) && t <= ts(h.to)) || null;
    }

    /**
     * يحوّل مقاطع الفصل إلى عناصر معروضة، مرقّماً الأسابيع وحدها.
     * @returns {Array} عناصر: {kind:'week'|'span', ...}
     */
    function buildTerm(cal, term) {
        const items = [];
        let k = 0;
        term.segments.forEach((seg) => {
            if (seg.t === 'span') {
                items.push({
                    kind: 'span', term: term.n,
                    name: seg.name, from: seg.from, to: seg.to, work: !!seg.work,
                    days: Math.round((ts(seg.to) - ts(seg.from)) / 864e5) + 1
                });
                return;
            }
            k += 1;
            const days = DAY_NAMES.map((name, i) => {
                const d = new Date(seg.from);
                d.setDate(seg.from.getDate() + i);
                return { name, date: d, hol: holidayOn(cal, d) };
            });
            const offs = days.filter((d) => d.hol);
            items.push({
                kind: 'week', term: term.n, k,
                from: seg.from, to: days[4].date, days, offs,
                exam: !!seg.exam,
                holName: offs.length ? offs[0].hol.name : null,
                allOff: offs.length === DAY_NAMES.length
            });
        });
        return items;
    }

    function buildAll(cal) {
        return cal.terms.reduce((acc, t) => acc.concat(buildTerm(cal, t)), []);
    }

    /**
     * حالة اليوم: أين نحن، وما الإجازة القادمة.
     * `today` معطًى ليُختبر بلا انتظار مرور الزمن.
     */
    function state(cal, today) {
        const items = buildAll(cal);
        const weeks = items.filter((i) => i.kind === 'week');
        const t = ts(today || new Date());

        /* الأسبوع يمتدّ إلى نهاية السبت: الجمعة والسبت ليسا في الشبكة،
           ولو قُطعا لظهر المعلّم يومَي العطلة خارج السنة. */
        let current = null, inSpan = null;
        for (const it of items) {
            if (it.kind === 'week') {
                if (t >= ts(it.from) && t <= ts(it.to) + 2 * 864e5) { current = it; break; }
            } else if (t >= ts(it.from) && t <= ts(it.to)) {
                inSpan = it; break;
            }
        }

        const first = items[0], last = items[items.length - 1];
        const before = t < ts(first.from);
        const after  = t > ts(last.to);
        if (!current) current = before ? weeks[0] : (inSpan ? nextWeekAfter(items, inSpan) : weeks[weeks.length - 1]);

        /* أقرب انقطاعٍ قادم: يومُ إجازة داخل أسبوع، أو مقطعُ إجازة. */
        let nextOff = null;
        for (const it of items) {
            if (it.kind === 'week') {
                for (const d of it.days) {
                    if (d.hol && ts(d.date) > t) {
                        nextOff = { name: d.hol.name, date: d.date, dayName: d.name };
                        break;
                    }
                }
            } else if (!it.work && ts(it.from) > t) {
                nextOff = { name: it.name, date: it.from, dayName: null, span: it };
            }
            if (nextOff) break;
        }
        const daysToOff = nextOff ? Math.round((ts(nextOff.date) - t) / 864e5) : 0;

        /* قبل بداية العام، أهمّ ما يسأل عنه المعلّم: متى أعود؟ فنحسب
           أوّل يوم دوام — وهو عودة المعلمين إن وُجدت، وإلّا أوّل أسبوع. */
        const firstWork = items.find((i) => i.kind === 'span' ? i.work : true);
        const daysToStart = firstWork ? Math.round((ts(firstWork.from) - t) / 864e5) : 0;

        return { cal, items, weeks, current, inSpan, nextOff, daysToOff,
                 before, after, firstWork, daysToStart };
    }

    function nextWeekAfter(items, span) {
        const i = items.indexOf(span);
        for (let j = i + 1; j < items.length; j++) if (items[j].kind === 'week') return items[j];
        return items.filter((x) => x.kind === 'week').pop();
    }

    global.AcademicCalendar = {
        CALENDARS, EARLY_DEPTS, DAY_NAMES,
        defaultKeyFor, resolve, buildTerm, buildAll, state,
        ordinal, arDigits, hijri, gregorian
    };
})(window);
