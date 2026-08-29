/* ==========================================================================
   print-reports.js — تصديرُ التقرير PDF، بتصميم الشاشة نفسِه.

   طلبَه المعلّم صراحةً: «صفحة الطباعة تكون بنفس التصميم حق العرض
   الأساسي». فالصدرُ الكحليُّ صدرٌ كحليّ، والأشرطةُ أشرطة، وبطاقةُ الفصل
   بطاقة — لا جدولٌ رماديٌّ يشبه ورقةً أخرى.

   ── ولماذا PdfCore لا window.print ──
   النداءُ خامدٌ داخل WKWebView، فكان زرُّ الطباعة في هذه الشاشة لا يفعل
   شيئاً على iOS منذ كُتب. والهدفُ آبل ستور. راجع `pdf-core.js`.

   ── ولماذا تنسيقٌ خاصٌّ بها لا `views.css` ──
   المسرحُ يُحقن فيه `print.css` محصوراً بمعرّفه، ومعرّفٌ يغلب كلَّ صنف.
   فتنسيقُ الورقة يُكتب هنا كاملاً بألوانٍ صريحة: التصديرُ لا يتبع مظهرَ
   الشاشة (أبيضَ كان أو داكناً) — الورقةُ بيضاء دائماً.
   ========================================================================== */

(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }
    const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const pct = (n, of) => (of ? Math.round(n / of * 100) : 0);

    /* ألوانٌ صريحةٌ لا متغيّرات: المسرحُ خارج شجرة المظهر، ومتغيّرٌ لا
       يُحلّ يخرج أسودَ صامتاً. وهي ألوانُ التطبيق نفسُها. */
    const INK   = '#12333B';   /* الكحلي — var(--primary) */
    const TEXT  = '#1B2430';
    const MUTED = '#6B6B68';
    const LINE  = '#E4E4E0';
    const BEIGE = '#EFEDE6';

    /* ── لماذا صنفان لا واحد ──
       `PdfCore` ينقل الكتلَ من مستندنا إلى صفحاتٍ يبنيها هو، ولا يحمل
       صنفَنا إليها. فما كان محصوراً بـ«rpp» يسقط أثناء الترقيم: يعود
       الوسمُ إلى هوامشه الافتراضيّة وتُقاس الكتلةُ بغير ارتفاعها، فتُدفع
       صفحةً كاملةً بلا سبب. فيُضاف صنفُ صفحته ليستوي القياسُ والرسم.
       والتنسيقُ لا يتسرّب: لكلّ تصديرٍ مسرحُه، وفيه نمطُه وحدَه. */
    const S  = '.rpp, .pdfcore-page';
    const SD = (sel) => '.rpp ' + sel + ', .pdfcore-page ' + sel;

    const CSS = `
    ${S} { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
           color: ${TEXT}; direction: rtl; }
    ${SD('*')} { box-sizing: border-box; }
    ${SD('h1')}, ${SD('h3')}, ${SD('p')} { margin: 0; }

    .rpp-head { display: flex; align-items: flex-start; gap: 12px;
                border-bottom: 2px solid ${INK}; padding-bottom: 10px; margin-bottom: 4px; }
    .rpp-head .tx { flex: 1; min-width: 0; }
    .rpp-head h1 { font-size: 19px; font-weight: 700; color: ${INK}; }
    .rpp-head .sub { font-size: 12px; font-weight: 700; color: ${MUTED}; margin-top: 3px; }
    .rpp-head .dt { font-size: 11.5px; font-weight: 700; color: ${MUTED}; white-space: nowrap; }

    .rpp-hero { background: ${INK}; border-radius: 18px; padding: 20px 18px;
                color: #fff; margin-top: 16px; }
    .rpp-hero .k { font-size: 12px; font-weight: 700; opacity: .82; }
    .rpp-hero .v { font-size: 52px; font-weight: 700; line-height: 1.05; margin-top: 2px; }
    .rpp-hero .s { font-size: 12px; opacity: .86; margin-top: 4px; }
    .rpp-hero .row { display: flex; gap: 8px; margin-top: 16px;
                     border-top: 1px solid rgba(255,255,255,.22); padding-top: 14px; }
    .rpp-hero .row > div { flex: 1; text-align: center; }
    .rpp-hero .row .n { font-size: 19px; font-weight: 700; }
    .rpp-hero .row .c { font-size: 10.5px; opacity: .82; margin-top: 1px; }

    /* الوسمُ مع الصنف عمداً: قاعدةُ الإعادة أعلاه تذكر الوسمَ فتكون أخصَّ
       من الصنف وحدَه، فكان صفرُها يمحو هامشَ العناوين — تلتصق بما فوقها
       وما تحتها في الورقة وحدَها، والشاشةُ سليمةٌ إذ لا إعادةَ تزاحمها.
       (بلاغُ المعلّم ٢٩ أغسطس ٢٠٢٦.)

       والفصلُ عن القسم الذي فوقه حشوٌ في الكتلة لا هامشٌ في العنوان:
       الهامشُ ينهار خارج كتلته فتُقاس ناقصةً عمّا تُرسم، فيظنّ المرقّمُ
       أنّها تسع فتفيض، أو يدفعها كاملةً إلى صفحةٍ تالية ويترك بياضاً.
       والحشوُ لا ينهار فيُقاس كما يُرى.
       ولا شَرَطاتٍ مائلةً في هذا التعليق: هو داخل قالبٍ نصّيّ. */
    .rpp-sec { padding-top: 20px; }
    ${SD('h3.rpp-h')} { font-size: 13px; font-weight: 700; color: ${MUTED};
                        margin: 0 2px 8px; }

    .rpp-card { background: #fff; border: 1.5px solid ${LINE}; border-radius: 16px;
                padding: 13px 12px; }

    .rpp-meter { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
    .rpp-meter:last-child { margin-bottom: 0; }
    .rpp-meter .lb { font-size: 12.5px; font-weight: 700; color: ${TEXT}; width: 66px; flex: none; }
    .rpp-meter .tr { flex: 1; height: 10px; border-radius: 6px; background: ${BEIGE}; overflow: hidden; }
    .rpp-meter .tr i { display: block; height: 100%; border-radius: 6px; }
    .rpp-meter .vn { font-size: 12px; font-weight: 700; color: ${MUTED};
                     width: 80px; text-align: left; flex: none; }

    .rpp-row { display: flex; align-items: center; gap: 9px;
               padding: 8px 2px; border-bottom: 1px solid ${LINE}; }
    .rpp-row:last-child { border-bottom: 0; }
    .rpp-row .rk { width: 20px; flex: none; font-size: 12.5px; font-weight: 700;
                   color: ${MUTED}; text-align: center; }
    .rpp-row .nm { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: ${TEXT}; }
    .rpp-row .mt { font-size: 10.5px; font-weight: 700; color: ${MUTED}; flex: none; }
    .rpp-row .pc { font-size: 13.5px; font-weight: 700; flex: none; }

    .rpp-cls { border: 1.5px solid ${LINE}; border-radius: 14px;
               padding: 11px 12px; margin-bottom: 10px; }
    .rpp-cls:last-child { margin-bottom: 0; }
    .rpp-cls .top { display: flex; align-items: baseline; gap: 8px; }
    .rpp-cls .top .t { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: ${TEXT}; }
    .rpp-cls .top .r { font-size: 15px; font-weight: 700; color: ${INK}; }
    .rpp-cls .sub { font-size: 11px; font-weight: 700; color: ${MUTED}; margin-top: 2px; }
    .rpp-cls .mini { height: 7px; border-radius: 5px; margin-top: 8px;
                     background: ${BEIGE}; overflow: hidden; }
    .rpp-cls .mini i { display: block; height: 100%; border-radius: 5px; background: ${INK}; }
    .rpp-cls .facts { display: flex; gap: 14px; margin-top: 8px; }
    .rpp-cls .facts span { font-size: 11px; font-weight: 700; color: ${MUTED}; }
    .rpp-cls .facts b { color: ${TEXT}; }

    .rpp-foot { position: absolute; bottom: 26px; inset-inline: 57px;
                text-align: center; font-size: 11px; color: ${MUTED};
                border-top: 1px solid ${LINE}; padding-top: 6px; }
    `;

    const ATT = [
        { k: 'present', l: 'حاضر',   c: '#10B981' },
        { k: 'late',    l: 'متأخر',  c: '#F59E0B' },
        { k: 'excused', l: 'مستأذن', c: '#3B82F6' },
        { k: 'absent',  l: 'غائب',   c: '#EF4444' }
    ];
    const PROD = [
        { k: 'exams', l: 'اختبارات' }, { k: 'worksheets', l: 'أوراق عمل' },
        { k: 'homework', l: 'واجبات' }, { k: 'strategies', l: 'استراتيجيات' },
        { k: 'initiatives', l: 'مبادرات' }
    ];

    /* بدالّة التطبيق نفسِها كما في الشاشة — فلا يختلف المطبوعُ عنها. */
    const clsName = (c) => esc(global.ClassCreate
        ? global.ClassCreate.label(c.grade, c.section)
        : String(c.grade || '') + ' / ' + String(c.section || ''));

    function meters(items) {
        const max = Math.max(1, ...items.map((x) => x.v));
        return items.map((x) => `
            <div class="rpp-meter">
                <span class="lb">${x.l}</span>
                <span class="tr"><i style="width:${x.v / max * 100}%;background:${x.c || INK}"></i></span>
                <span class="vn">${x.t}</span>
            </div>`).join('');
    }

    function rows(list, tone, rank) {
        return list.map((s, i) => {
            const isLow = tone === 'low';
            const shown = rank ? Math.round(s.score) : (isLow ? 100 - s.rate : s.rate);
            const color = rank ? INK : (isLow ? '#EF4444' : '#10B981');
            const meta = rank ? ''
                : (isLow ? ar(s.attended.absent || 0) + ' غياب'
                         : ar((s.attended.present || 0) + (s.attended.late || 0)) + ' حضور');
            return `
                <div class="rpp-row">
                    ${rank ? `<span class="rk">${['١','٢','٣','٤','٥'][i]}</span>` : ''}
                    <span class="nm">${esc(s.student.name)}</span>
                    <span class="mt">${clsName(s.cls)}${meta ? ' · ' + meta : ''}</span>
                    <span class="pc" style="color:${color}">${ar(shown)}%</span>
                </div>`;
        }).join('');
    }

    /** كتلٌ متتاليةٌ يرقّمها `PdfCore.paginate` — كلُّ كتلةٍ لا تنكسر. */
    function buildDoc(ctx) {
        const { teacher, data } = ctx;
        const t = data.totals;
        const d = global.ReportsView.derive(data);
        const considered = t.attendance.present + t.attendance.late + t.attendance.absent;

        const dept = (global.EduDepts && teacher.education_dept)
            ? esc(teacher.education_dept) : '';
        const today = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
            { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

        const out = [];
        out.push(`
            <div class="rpp-head">
                <div class="tx">
                    <h1>تقرير المعلّم</h1>
                    <div class="sub">${esc(teacher.name || '')}${
                        teacher.school_name ? ' · ' + esc(teacher.school_name) : ''}${
                        dept ? ' · ' + dept : ''}</div>
                </div>
                <div class="dt">${esc(today)}</div>
            </div>`);

        out.push(`
            <div class="rpp-hero">
                <div class="k">نسبة الحضور العامة</div>
                <div class="v">${t.attendanceRate == null ? '—' : ar(t.attendanceRate) + '%'}</div>
                <div class="s">${considered
                    ? 'من ' + ar(considered) + ' حالة حضورٍ مرصودة'
                    : 'لم يُرصد حضورٌ بعد'}</div>
                <div class="row">
                    <div><div class="n">${ar(t.classes)}</div><div class="c">فصول</div></div>
                    <div><div class="n">${ar(t.students)}</div><div class="c">طلاب</div></div>
                    <div><div class="n">${ar(t.exams + t.worksheets + t.homework)}</div>
                         <div class="c">محتوى</div></div>
                </div>
            </div>`);

        const sec = (title, inner) =>
            `<div class="rpp-sec"><h3 class="rpp-h">${title}</h3>${inner}</div>`;

        if (t.attTotal) {
            out.push(sec('تفصيل الحضور', `<div class="rpp-card">${meters(ATT.map((g) => ({
                l: g.l, c: g.c, v: t.attendance[g.k],
                t: ar(t.attendance[g.k]) + ' · ' + ar(pct(t.attendance[g.k], t.attTotal)) + '%'
            })))}</div>`));
        }
        if (d.top.length)  out.push(sec('الأعلى التزاماً بالحضور', `<div class="rpp-card">${rows(d.top, 'top')}</div>`));
        if (d.low.length)  out.push(sec('أكثر الطلاب تغيّباً',      `<div class="rpp-card">${rows(d.low, 'low')}</div>`));
        if (d.best.length) out.push(sec('المتميّزون في التقييم',    `<div class="rpp-card">${rows(d.best, 'best', true)}</div>`));

        const prod = PROD.map((p) => ({ l: p.l, v: t[p.k], t: ar(t[p.k]) }));
        if (prod.some((x) => x.v)) {
            out.push(sec('إنتاجي', `<div class="rpp-card">${meters(prod)}</div>`));
        }

        /* الفصولُ كتلةً كتلة: بطاقةُ فصلٍ لا تُقصّ بين صفحتين. */
        if (data.perClass.length) {
            out.push(`<div class="rpp-sec"><h3 class="rpp-h">تفصيل لكل فصل</h3></div>`);
            data.perClass.forEach((p) => {
                const c = p.att.present + p.att.absent + p.att.late;
                const rate = c === 0 ? null : Math.round((p.att.present + p.att.late) / c * 100);
                out.push(`
                    <div class="rpp-cls">
                        <div class="top">
                            <span class="t">${clsName(p.cls)}</span>
                            <span class="r">${rate == null ? '—' : ar(rate) + '%'}</span>
                        </div>
                        <div class="sub">${esc(p.cls.subject || '')}
                            · ${ar(p.students.length)} ${p.students.length === 1 ? 'طالب' : 'طالباً'}</div>
                        <div class="mini"><i style="width:${rate == null ? 0 : rate}%"></i></div>
                        <div class="facts">
                            <span>اختبارات <b>${ar(p.examsCount)}</b></span>
                            <span>أوراق <b>${ar(p.worksheetsCount)}</b></span>
                            <span>واجبات <b>${ar(p.homeworkCount)}</b></span>
                        </div>
                    </div>`);
            });
        }
        return out.join('');
    }

    async function savePdf(ctx) {
        const toast = (m, t, d) => global.TeacherApp && global.TeacherApp.toast
            && global.TeacherApp.toast(m, t, d);
        let stage = null;
        try {
            toast('جارٍ تجهيز التقرير…', 'info', 4000);
            stage = await global.PdfCore.createStage();

            const css = document.createElement('style');
            css.textContent = CSS;
            stage.el.appendChild(css);

            const doc = document.createElement('div');
            doc.className = 'rpp';
            doc.innerHTML = buildDoc(ctx);
            stage.el.appendChild(doc);

            /* الاستقرارُ قبل الترقيم لا بعده: الخطُّ العربيُّ يُحمَّل
               متأخّراً، فالقياسُ قبله يقيس خطَّ الاحتياط — تُقاس الكتلةُ
               بغير ارتفاعها فتُدفع صفحةً كاملةً بلا سبب، أو تفيض. */
            await global.PdfCore.settle(stage.el);

            const { pages } = global.PdfCore.paginate(doc, stage.el);
            doc.remove();

            pages.forEach((el, i) => {
                el.classList.add('rpp');
                const f = document.createElement('div');
                f.className = 'rpp-foot';
                f.textContent = 'صفحة ' + ar(i + 1) + ' من ' + ar(pages.length);
                el.appendChild(f);
            });

            /* ومرّةً ثانيةً بعد الترقيم: الصفحاتُ عناصرُ جديدةٌ في المسرح. */
            await global.PdfCore.settle(stage.el);
            const blob = await global.PdfCore.renderPdf(pages);
            const how = await global.PdfCore.deliverPdf(blob,
                'تقرير_' + global.PdfCore.todayISO());
            if (how === 'downloaded') toast('تم حفظ التقرير ✅', 'success', 4000);
        } catch (err) {
            console.warn('[print-reports] savePdf failed:', err);
            toast('تعذّر إنشاء الملف. حاول مرة أخرى.', 'error', 4000);
        } finally {
            if (stage) stage.destroy();
        }
    }

    const preloadPdfEngine = () => global.PdfCore.preloadPdfEngine();

    global.PrintReports = { savePdf, preloadPdfEngine, buildDoc, CSS };
})(window);
