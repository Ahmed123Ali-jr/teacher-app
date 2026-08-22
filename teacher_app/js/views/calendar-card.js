/* ==========================================================================
   views/calendar-card.js — بطاقة التقويم الدراسي أسفل الجدول الأسبوعي.

   مطويّة كبطاقة التذكيرات: سطرٌ يقول أين أنت ومتى الانقطاع القادم،
   وتنفتح على الفصل كلّه في شاشةٍ واحدة — لأن المعلّم يفتح التقويم
   ليعرف لا ليقرأ.

   كل خليّة تحمل معلومتها بلا كلمات: رقم الأسبوع، وخمس نقاطٍ هي أيامه،
   الغامقة منها إجازة. والفواصل (عودة المعلمين · إجازة الخريف · منتصف
   العام) شرائطُ عريضة في تسلسلها — لأن إجازة الخريف تقع بين أسبوعين لا
   داخل أحدهما، فلو عُرضت الأسابيع وحدها لاختفت وهي أطول انقطاع.

   البيانات في academic-calendar.js — هذا الملف عرضٌ لا مصدرُ حقيقة.
   ========================================================================== */

(function (global) {
    'use strict';

    const AC = () => global.AcademicCalendar;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function dayWord(n) {
        const ar = AC().arDigits;
        if (n === 1) return 'يوم واحد';
        if (n === 2) return 'يومان';
        if (n <= 10) return ar(n) + ' أيام';
        return ar(n) + ' يوماً';
    }

    /* حالة الواجهة لحظيّة: انطواء البطاقة والفصل المعروض تفضيلاتُ عرض،
       لا بيانات تستحقّ رحلةً للخادم. */
    const ui = { open: false, term: null, sel: null, swap: false };

    const weeksOfTerm = (st, n) => st.weeks.filter((w) => w.term === n);

    /* متزامنٌ لا داخل requestAnimationFrame: الرسم إسنادُ innerHTML،
       فالعنصر الجديد موجودٌ فور عودته وقياسه يُجبر التخطيط. وrAF لا
       يُطلق حين لا تُرسم الصفحة — وهو ما أوقعنا في قارئ الكتب. */
    function scrollToCard(root) {
        const card = root.querySelector('.ac-card');
        if (!card) return;
        const head = parseInt(
            getComputedStyle(document.documentElement).getPropertyValue('--header-height'), 10) || 64;
        const top = Math.max(0, card.getBoundingClientRect().top + global.scrollY - head - 10);
        const before = global.scrollY;
        try { global.scrollTo({ top, behavior: 'smooth' }); }
        catch (e) { global.scrollTo(0, top); }

        /* شبكة أمان: لو لم يتحرّك شيء بعد ثلث ثانية — متصفّحٌ لا يدعم
           الانسياب، أو استُهلك الاستدعاء — ننتقل قفزاً. أن يصل المعلّم
           إلى بطاقته دون حركةٍ ناعمة خيرٌ من ألّا يصل. */
        global.setTimeout(() => {
            if (Math.abs(global.scrollY - before) < 4 && Math.abs(top - before) > 8) {
                global.scrollTo(0, top);
            }
        }, 350);
    }

    /** يُعيد البطاقة إلى حالتها الأولى — تُستدعى عند فتح شاشة الجدول من
     *  جديد، فلا يجدها المعلّم مفتوحةً من زيارةٍ سابقة. */
    function reset() {
        ui.open = false; ui.term = null; ui.sel = null; ui.swap = false;
    }

    /* ------------------------------------------------------------------
       الرسم
       ------------------------------------------------------------------ */

    function band(st) {
        const ar = AC().arDigits;
        const total = weeksOfTerm(st, st.current.term).length;
        const term = st.cal.terms.find((t) => t.n === st.current.term);
        const R = 22, C = 2 * Math.PI * R;
        /* والقوسُ يقيس ما مضى: أسبوعٌ لم يبدأ لا يُحتسب. */
        const done = st.gap ? st.current.k - 1 : st.current.k;
        const pct = Math.max(0, Math.min(1, done / total));

        /* حين نكون داخل إجازة، الصدق أن نقولها لا أن نُظهر أسبوعاً
           لم يبدأ بعد كأنه جارٍ. */
        let headline, sub;
        if (st.inSpan) {
            headline = esc(st.inSpan.name);
            sub = st.nextWeek
                ? `تنتهي ${esc(AC().gregorian(st.inSpan.to))} · بعدها الأسبوع ${AC().ordinal(st.nextWeek.k)}`
                : `تنتهي ${esc(AC().gregorian(st.inSpan.to))} · وبها ينتهي الفصل ${esc(term.name)}`;
        } else if (st.before) {
            headline = st.firstWork ? esc(st.firstWork.name || 'بداية الدراسة') : 'قبل بداية العام';
            sub = st.firstWork
                ? `${esc(AC().gregorian(st.firstWork.from))} · بعد ${dayWord(st.daysToStart)}`
                : `الفصل ${esc(term.name)}`;
        } else if (st.after) {
            /* بين انتهاء آخر فصلٍ نعرفه ووصول تقويم ما بعده نافذةٌ واقعة
               لا محالة. والصمت فيها أصدق من عرض الأسبوع الأخير كأنه جارٍ. */
            headline = `انتهى الفصل ${esc(term.name)}`;
            sub = 'تقويم الفصل التالي لم يُضف بعد';
        } else if (st.gap) {
            /* الجمعةُ والسبتُ قبل أوّل أسبوع: الأسبوعُ لم يبدأ، فيُقال
               متى يبدأ لا أنّه جارٍ. */
            headline = 'الأسبوع ' + AC().ordinal(st.current.k);
            sub = `يبدأ ${esc(AC().gregorian(st.current.from))}`
                + (st.daysToWeek > 0 ? ` · بعد ${dayWord(st.daysToWeek)}` : '');
        } else {
            headline = 'الأسبوع ' + AC().ordinal(st.current.k);
            sub = `الفصل ${esc(term.name)} · ${ar(st.current.k)} من ${ar(total)} أسبوعاً`;
        }

        return `
            <div class="ac-band">
                <span class="ac-arc">
                    <svg viewBox="0 0 54 54" aria-hidden="true">
                        <circle cx="27" cy="27" r="${R}" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="5"/>
                        <circle cx="27" cy="27" r="${R}" fill="none" stroke="#C9A961" stroke-width="5"
                                stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/>
                    </svg>
                    <span class="mid">${ar(st.current.k)}</span>
                </span>
                <span class="ac-band-tx">
                    <span class="ord">${headline}</span>
                    <span class="sub">${sub}</span>
                </span>
                ${st.nextOff ? `
                    <span class="ac-cd">
                        <b>${ar(st.daysToOff)}</b>
                        <span>${st.daysToOff === 2 ? 'يومان' : 'يوماً'} على<br>${esc(st.nextOff.name)}</span>
                    </span>` : ''}
            </div>`;
    }

    /* شريط الفصول يظهر حين يكون هناك أكثر من فصل — وزرٌّ وحيد لا معنى له. */
    function tabs(st) {
        if (st.cal.terms.length < 2) return '';
        const ar = AC().arDigits;
        return `<div class="ac-terms">
            ${st.cal.terms.map((t) => `
                <button type="button" data-ac-term="${t.n}" class="${ui.term === t.n ? 'on' : ''}">
                    الفصل ${esc(t.name)}<small>${ar(weeksOfTerm(st, t.n).length)} أسبوعاً</small>
                </button>`).join('')}
        </div>`;
    }

    function grid(st) {
        const ar = AC().arDigits;
        /* بعد انتهاء الفصل مضى كلّ ما فيه — وإلّا بقي أسبوعُه الأخير
           بلا صفةٍ: لا ماضياً ولا جارياً. */
        const curIdx = st.after ? st.items.length
                                : st.items.indexOf(st.inSpan || st.current);

        return `<div class="ac-grid">
            ${st.items.filter((i) => i.term === ui.term).map((it) => {
                const idx = st.items.indexOf(it);
                if (it.kind === 'span') {
                    const cls = [it.work ? 'work' : '', idx < curIdx ? 'past' : '',
                                 it === st.inSpan ? 'now' : ''].filter(Boolean).join(' ');
                    return `
                        <div class="ac-span ${cls}">
                            <span class="nm">${esc(it.name)}</span>
                            <span class="rg">${esc(AC().gregorian(it.from))} — ${esc(AC().gregorian(it.to))}</span>
                        </div>`;
                }
                const cls = [
                    idx < curIdx ? 'past' : '',
                    it.offs.length ? 'hol' : '',
                    it === st.current && !st.inSpan && !st.before && !st.after && !st.gap ? 'now' : '',
                    it.k === ui.sel ? 'sel' : '',
                    it.exam ? 'exam' : ''
                ].filter(Boolean).join(' ');
                const label = 'الأسبوع ' + AC().ordinal(it.k)
                    + (it.exam ? ' — أسبوع اختبارات' : '')
                    + (it.offs.length ? ' — فيه إجازة' : '');
                return `
                    <button type="button" class="ac-cell ${cls}" data-ac-week="${it.k}"
                            aria-label="${esc(label)}">
                        <span class="n">${ar(it.k)}</span>
                        <span class="dd">${it.days.map((d) =>
                            `<i class="${d.hol ? 'off' : ''}"></i>`).join('')}</span>
                    </button>`;
            }).join('')}
        </div>`;
    }

    function detail(st) {
        const w = st.weeks.find((x) => x.term === ui.term && x.k === ui.sel) || st.current;
        const isNow = (w === st.current) && !st.inSpan && !st.before && !st.after && !st.gap;
        const hj = AC().hijri, gr = AC().gregorian;
        return `
            <div class="ac-det ${isNow ? 'is-now' : ''} ${w.offs.length ? 'is-hol' : ''}">
                <div class="ac-det-h">
                    <span class="t">الأسبوع ${AC().ordinal(w.k)}</span>
                    ${w.exam ? '<span class="tag exam">اختبارات</span>' : ''}
                    ${isNow ? '<span class="tag">أنت هنا</span>' : ''}
                </div>
                <div class="ac-det-d">
                    <span><i>هـ</i>${esc(hj(w.from))} — ${esc(hj(w.to))}</span>
                    <span><i>م</i>${esc(gr(w.from))} — ${esc(gr(w.to))}</span>
                </div>
                <div class="ac-det-days">
                    ${w.days.map((d) =>
                        `<span class="ac-dy ${d.hol ? 'off' : ''}">${esc(d.name)}</span>`).join('')}
                </div>
                ${w.offs.length ? `
                    <div class="ac-det-note">
                        ${esc(w.holName)} —
                        ${w.allOff ? 'الأسبوع كاملاً'
                                   : dayWord(w.offs.length) + ': ' + w.offs.map((d) => esc(d.name)).join(' و')}
                    </div>` : ''}
            </div>`;
    }

    function swapPanel(ctx, st) {
        const C = AC().CALENDARS;
        const def = AC().defaultKeyFor(ctx.dept);
        return `<div class="ac-swap">
            <span class="hint">
                تقويمك يُختار من إدارة تعليمك${ctx.dept ? ' (' + esc(ctx.dept) + ')' : ''}.
                بدّله إن كانت مدرستك تتبع الآخر.
            </span>
            ${[C.early, C.standard].map((c) => `
                <button type="button" data-ac-cal="${c.key}" class="${st.cal.key === c.key ? 'on' : ''}">
                    <span class="tick">${st.cal.key === c.key ? '✓' : ''}</span>
                    <span class="lb">
                        <b>${esc(c.label)}</b>
                        <span>${c.key === def ? 'الافتراضي لإدارتك' : 'خلاف الافتراضي'}</span>
                    </span>
                </button>`).join('')}
        </div>`;
    }

    function summary(st) {
        const tail = st.nextOff
            ? ` · <b>${esc(st.nextOff.name)}</b> بعد ${dayWord(st.daysToOff)}` : '';
        if (st.inSpan) return esc(st.inSpan.name) + ` حتى ${esc(AC().gregorian(st.inSpan.to))}`;
        if (st.before) {
            return st.daysToStart > 0
                ? `${esc(st.firstWork.name || 'بداية الدراسة')} بعد ${dayWord(st.daysToStart)}`
                : 'يبدأ العام قريباً';
        }
        if (st.after)  return 'انتهى الفصل الدراسي الأول';
        if (st.gap) {
            return `الأسبوع ${AC().ordinal(st.current.k)} يبدأ `
                + (st.daysToWeek > 0 ? `بعد ${dayWord(st.daysToWeek)}` : 'غداً');
        }
        return `الأسبوع ${AC().ordinal(st.current.k)}` + tail;
    }

    /**
     * يبني البطاقة كاملةً.
     * @param {object} ctx — { dept, override, today }
     * @returns {string} HTML
     */
    function html(ctx) {
        if (!AC()) return '';
        const st = AC().state(AC().resolve(ctx.dept, ctx.override), ctx.today);

        /* أوّل رسمة: فصل المعلّم وأسبوعه — بلا أن يختار شيئاً. */
        if (ui.term === null) ui.term = st.current.term;
        if (ui.sel === null)  ui.sel  = st.current.k;
        /* بعد تبديل التقويم قد يختفي الفصل أو الأسبوع المختار. */
        if (!st.cal.terms.some((t) => t.n === ui.term)) ui.term = st.current.term;
        if (!st.weeks.some((w) => w.term === ui.term && w.k === ui.sel)) {
            ui.sel = (ui.term === st.current.term) ? st.current.k : 1;
        }

        return `
            <section class="ac-card ${ui.open ? 'open' : ''}" aria-label="التقويم الدراسي">
                <button type="button" class="ac-top" data-ac-toggle
                        aria-expanded="${ui.open ? 'true' : 'false'}">
                    <span class="ac-ic">🗓️</span>
                    <span class="ac-tx">
                        <span class="nm">التقويم الدراسي ${esc(st.cal.year)}</span>
                        <span class="sub">${summary(st)}</span>
                    </span>
                    <span class="ac-chev" aria-hidden="true"></span>
                </button>
                <div class="ac-body">
                    <div class="ac-badges">
                        <button type="button" class="ac-which ${ctx.override ? 'manual' : ''}" data-ac-swap>
                            ${esc(st.cal.label)}
                        </button>
                    </div>
                    ${ui.swap ? swapPanel(ctx, st) : ''}
                    ${band(st)}
                    ${tabs(st)}
                    ${grid(st)}
                    ${detail(st)}
                    <p class="ac-foot">
                        <span>${AC().arDigits(st.cal.stats.weeks)} أسبوع دراسة</span>
                        <span>${AC().arDigits(st.cal.stats.days)} يوم دراسة</span>
                        <span>${AC().arDigits(st.cal.stats.offDays)} يوم إجازة</span>
                    </p>
                </div>
            </section>`;
    }

    /**
     * يربط البطاقة. `onChange` يُستدعى حين يبدّل المعلّم التقويم، ليحفظ
     * المستدعي الاختيار ويعيد الرسم — فلا تعرف البطاقة شيئاً عن التخزين.
     */
    function bind(root, ctx, redraw, onChange) {
        const card = root.querySelector('.ac-card');
        if (!card) return;

        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-ac-swap]')) { ui.swap = !ui.swap; return redraw(); }

            const pick = e.target.closest('[data-ac-cal]');
            if (pick) {
                const key = pick.dataset.acCal;
                /* اختيارٌ يوافق الافتراضي ليس تجاوزاً — يُمسح ليتبع
                   إدارته لو نُقل إلى إدارةٍ أخرى لاحقاً. */
                const next = (key === AC().defaultKeyFor(ctx.dept)) ? null : key;
                ui.swap = false; ui.term = null; ui.sel = null;
                return onChange(next);
            }

            const week = e.target.closest('[data-ac-week]');
            if (week) { ui.sel = Number(week.dataset.acWeek); return redraw(); }

            const term = e.target.closest('[data-ac-term]');
            if (term) { ui.term = Number(term.dataset.acTerm); ui.sel = 1; return redraw(); }

            if (e.target.closest('[data-ac-toggle]')) {
                /* قلبُ صنفٍ لا إعادة رسم: الارتفاع ينتقل بـCSS فينكمش
                   الطول تدريجياً وتتبعه الشاشة بلا قفزة. وإعادة الرسم
                   كانت تُلغي العنصر فتضيع الحركة. */
                ui.open = !ui.open;
                card.classList.toggle('open', ui.open);
                const btn = card.querySelector('[data-ac-toggle]');
                if (btn) btn.setAttribute('aria-expanded', ui.open ? 'true' : 'false');
                /* عند الفتح ننزل بالشاشة إليها: المعلّم ضغط ليرى لا
                   ليسحب. ورأس البطاقة لا يتحرّك بالتمدّد، فالقياس الآن
                   صحيحٌ رغم أن الحركة لم تنته. */
                if (ui.open) scrollToCard(root);
                return;
            }
        });
    }

    global.CalendarCard = { html, bind, reset, ui };
})(window);
