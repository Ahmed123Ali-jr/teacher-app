/* ==========================================================================
   views/calendar-card.js — بطاقة التقويم الدراسي أسفل الجدول الأسبوعي.

   مطويّة كبطاقة التذكيرات: سطرٌ يقول أين أنت ومتى الإجازة القادمة،
   وتنفتح على الفصل كلّه في شاشةٍ واحدة بلا تمرير — لأن المعلّم يفتح
   التقويم ليعرف لا ليقرأ.

   وكل خليّة تحمل معلومتها بلا كلمات: رقم الأسبوع، وخمس نقاطٍ هي أيامه،
   الغامقة منها إجازة. والتفصيل يظهر لأسبوعٍ واحد: الملموس أو أسبوعك.

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

    /* حالة الواجهة تعيش هنا لا في القاعدة: انطواء البطاقة والفصل
       المعروض تفضيلاتُ لحظة، لا بيانات تستحقّ رحلةً للخادم. */
    const ui = { open: false, term: null, sel: null, swap: false };

    /* ------------------------------------------------------------------
       الرسم
       ------------------------------------------------------------------ */

    function arc(st) {
        const ar = AC().arDigits;
        const t = st.cal.terms[st.current.term - 1];
        const R = 22, C = 2 * Math.PI * R;
        const pct = Math.max(0, Math.min(1, st.current.k / t.weeks));
        return `
            <span class="ac-arc">
                <svg viewBox="0 0 54 54" aria-hidden="true">
                    <circle cx="27" cy="27" r="${R}" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="5"/>
                    <circle cx="27" cy="27" r="${R}" fill="none" stroke="#C9A961" stroke-width="5"
                            stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/>
                </svg>
                <span class="mid">${ar(st.current.k)}</span>
            </span>`;
    }

    function band(st) {
        const ar = AC().arDigits;
        const t = st.cal.terms[st.current.term - 1];
        return `
            <div class="ac-band">
                ${arc(st)}
                <span class="ac-band-tx">
                    <span class="ord">الأسبوع ${AC().ordinal(st.current.k)}</span>
                    <span class="sub">الفصل ${esc(t.name)} · ${ar(st.current.k)} من ${ar(t.weeks)} أسبوعاً</span>
                </span>
                ${st.nextOff ? `
                    <span class="ac-cd">
                        <b>${ar(st.daysToOff)}</b>
                        <span>${st.daysToOff === 2 ? 'يومان' : 'يوماً'} على<br>${esc(st.nextOff.hol.name)}</span>
                    </span>` : ''}
            </div>`;
    }

    function tabs(st) {
        const ar = AC().arDigits;
        return `<div class="ac-terms">
            ${st.cal.terms.map((t) => `
                <button type="button" data-ac-term="${t.n}" class="${ui.term === t.n ? 'on' : ''}">
                    الفصل ${esc(t.name)}<small>${ar(t.weeks)} أسبوعاً</small>
                </button>`).join('')}
        </div>`;
    }

    function grid(st) {
        const ar = AC().arDigits;
        const list = st.weeks.filter((w) => w.term === ui.term);
        return `<div class="ac-grid">
            ${list.map((w) => {
                const cls = [
                    w.n < st.current.n ? 'past' : '',
                    w.offs.length ? 'hol' : '',
                    w.n === st.current.n ? 'now' : '',
                    w.n === ui.sel ? 'sel' : ''
                ].filter(Boolean).join(' ');
                const label = 'الأسبوع ' + AC().ordinal(w.k)
                    + (w.offs.length ? ' — فيه إجازة' : '');
                return `
                    <button type="button" class="ac-cell ${cls}" data-ac-week="${w.n}"
                            aria-label="${esc(label)}">
                        <span class="n">${ar(w.k)}</span>
                        <span class="dd">${w.days.map((d) =>
                            `<i class="${d.hol ? 'off' : ''}"></i>`).join('')}</span>
                    </button>`;
            }).join('')}
        </div>`;
    }

    function detail(st) {
        const w = st.weeks.find((x) => x.n === ui.sel) || st.current;
        const isNow = w.n === st.current.n;
        const hj = AC().hijri, gr = AC().gregorian;
        return `
            <div class="ac-det ${isNow ? 'is-now' : ''} ${w.offs.length ? 'is-hol' : ''}">
                <div class="ac-det-h">
                    <span class="t">الأسبوع ${AC().ordinal(w.k)}</span>
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
        if (st.before) return 'لم يبدأ العام الدراسي بعد';
        if (st.after)  return 'انتهى العام الدراسي';
        return `الأسبوع ${AC().ordinal(st.current.k)}`
            + (st.nextOff ? ` · <b>${esc(st.nextOff.hol.name)}</b> بعد ${dayWord(st.daysToOff)}` : '');
    }

    /**
     * يبني البطاقة كاملةً.
     * @param {object} ctx — { dept, override }
     * @returns {string} HTML
     */
    function html(ctx) {
        if (!AC()) return '';
        const st = AC().state(AC().resolve(ctx.dept, ctx.override), ctx.today);

        /* أوّل رسمة: الفصل الحالي والأسبوع الحالي — بلا أن يختار شيئاً. */
        if (ui.term === null) ui.term = st.current.term;
        if (ui.sel === null)  ui.sel  = st.current.n;
        /* الفصل المعروض قد يختفي إن بُدّل التقويم — نعيده إلى الحالي. */
        if (!st.cal.terms.some((t) => t.n === ui.term)) ui.term = st.current.term;
        if (!st.weeks.some((w) => w.n === ui.sel)) ui.sel = st.current.n;

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
                ${ui.open ? `
                    <div class="ac-badges">
                        <button type="button" class="ac-which ${ctx.override ? 'manual' : ''}" data-ac-swap>
                            ${esc(st.cal.label)}
                        </button>
                        ${st.cal.provisional
                            ? '<span class="ac-prov">تواريخ مبدئية</span>' : ''}
                    </div>
                    ${ui.swap ? swapPanel(ctx, st) : ''}
                    ${band(st)}
                    ${tabs(st)}
                    ${grid(st)}
                    ${detail(st)}
                ` : ''}
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
            const swapBtn = e.target.closest('[data-ac-swap]');
            if (swapBtn) { ui.swap = !ui.swap; return redraw(); }

            const pick = e.target.closest('[data-ac-cal]');
            if (pick) {
                const key = pick.dataset.acCal;
                /* اختيارٌ يوافق الافتراضي ليس تجاوزاً — يُمسح ليتبع
                   إدارته لو نُقل إلى إدارةٍ أخرى لاحقاً. */
                const next = (key === AC().defaultKeyFor(ctx.dept)) ? null : key;
                ui.swap = false;
                ui.term = null; ui.sel = null;
                return onChange(next);
            }

            const week = e.target.closest('[data-ac-week]');
            if (week) { ui.sel = Number(week.dataset.acWeek); return redraw(); }

            const term = e.target.closest('[data-ac-term]');
            if (term) { ui.term = Number(term.dataset.acTerm); return redraw(); }

            if (e.target.closest('[data-ac-toggle]')) { ui.open = !ui.open; return redraw(); }
        });
    }

    global.CalendarCard = { html, bind, ui };
})(window);
