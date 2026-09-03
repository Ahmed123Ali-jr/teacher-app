/* ==========================================================================
   views/portfolio-strategies.js — قسم استراتيجيات التدريس في ملف الإنجاز.

   لا يُنشئ شيئاً ولا يولّد نصاً: يعرض ما سجّله المعلّم فعلاً من صفحة الفصل
   (الفصل ← الاستراتيجيات) مجموعاً حسب الاستراتيجية. التسجيل يبقى في مكان
   واحد فلا يفترق العدّ بين الشاشتين، وملف الإنجاز يبقى سجلّ عمل حقيقي
   بشواهده — لا تقريراً مكتوباً عن عمل لم يوثَّق.
   ========================================================================== */

(function (global) {
    'use strict';

    const FAMILY_LABEL = {
        coop: 'التعلّم التعاوني', think: 'التفكير والاستقصاء',
        active: 'التعلّم النشط', tech: 'التقنية والتقويم'
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const p = String(iso).split('-');
        return p.length === 3 ? `${+p[2]}/${+p[1]}` : iso;
    }

    function timesWord(n) {
        if (n === 1) return 'مرة';
        if (n === 2) return 'مرتان';
        if (n <= 10) return n + ' مرات';
        return n + ' مرة';
    }

    async function render(body, ctx) {
        const rows = ctx.strategies || [];

        if (!rows.length) {
            body.innerHTML = `
                <p class="text-muted" style="line-height:1.9">
                    لا توجد استراتيجيات مسجَّلة بعد.
                    تُسجَّل من صفحة الفصل ← تبويب <b>الاستراتيجيات</b>: تختار الاستراتيجية،
                    وتضغط «طبّقتها»، وترفع شواهد التنفيذ — وتظهر هنا تلقائياً.
                </p>
                <a href="#/classes" class="btn btn-secondary" style="margin-top:12px">${Icons.svg('books')} اذهب إلى الفصول</a>
            `;
            return;
        }

        const totalLogs = rows.reduce((n, r) => n + r.times, 0);
        const totalEvid = rows.reduce((n, r) => n + r.evidence.length, 0);

        body.innerHTML = `
            <p class="pstg-sum">
                <b>${rows.length}</b> استراتيجية ·
                <b>${totalLogs}</b> تطبيق ·
                <b>${totalEvid}</b> شاهد
            </p>
            <div class="pstg-list">${rows.map(cardHtml).join('')}</div>
            <p class="text-muted" style="font-size:12px; margin-top:14px; line-height:1.9">
                التسجيل يتم من صفحة الفصل ← الاستراتيجيات، وما تسجّله يظهر هنا وفي الطباعة.
            </p>
        `;

        loadThumbs(body, rows);
    }

    /* «التعلّم التعاوني» اسم استراتيجية واسم عائلة معاً — فلا نكرّره سطرين. */
    function famChip(r) {
        const lbl = FAMILY_LABEL[r.family];
        if (!lbl || lbl === r.name) return '';
        return `<span>${Icons.svg('tag')} ${esc(lbl)}</span>`;
    }

    function cardHtml(r) {
        const first = r.dates[0], last = r.dates[r.dates.length - 1];
        const span = !first ? '' : (first === last ? fmtDate(first) : `${fmtDate(first)} — ${fmtDate(last)}`);
        return `
            <article class="pstg-card">
                <div class="pstg-head">
                    <h4>${esc(r.name)}</h4>
                    <span class="pstg-times">${timesWord(r.times)}</span>
                </div>
                <div class="pstg-meta">
                    ${famChip(r)}
                    ${span ? `<span>${Icons.svg('calendar')} ${esc(span)}</span>` : ''}
                    ${r.classes.length ? `<span>${Icons.svg('books')} ${esc(r.classes.join('، '))}</span>` : ''}
                    <span>${Icons.svg('clip')} ${r.evidence.length} شاهد</span>
                </div>
                ${r.notes.length ? `
                    <ul class="pstg-notes">
                        ${r.notes.slice(0, 3).map((n) => `
                            <li><span>${esc(fmtDate(n.date))}</span> ${esc(n.text)}</li>
                        `).join('')}
                        ${r.notes.length > 3 ? `<li class="more">و${r.notes.length - 3} ملاحظة أخرى</li>` : ''}
                    </ul>` : ''}
                ${r.evidence.length ? `<div class="pstg-thumbs" data-ev="${esc(r.key)}"></div>` : ''}
            </article>
        `;
    }

    /* روابط الشواهد مؤقّتة وتُطلب دفعة واحدة لكل الاستراتيجيات، فلا نُثقل
       الشاشة بطلب لكل صورة. فشل التوقيع لا يكسر القسم — تختفي المصغّرات فقط. */
    async function loadThumbs(body, rows) {
        const paths = rows.flatMap((r) => r.evidence.slice(0, 6));
        if (!paths.length || !global.SB) return;
        let signed = [];
        try {
            const { data, error } = await global.SB.storage
                .from('evidence').createSignedUrls(paths, 3600);
            if (error) throw error;
            signed = data || [];
        } catch (e) {
            console.warn('[PortfolioStrategies] signing failed:', e);
            return;
        }
        const urlOf = new Map(signed.map((s) => [s.path, s.signedUrl]));
        for (const r of rows) {
            const box = body.querySelector(`[data-ev="${CSS.escape(r.key)}"]`);
            if (!box) continue;
            box.innerHTML = r.evidence.slice(0, 6).map((p) => {
                const u = urlOf.get(p);
                return u ? `<img src="${esc(u)}" alt="" loading="lazy">` : '';
            }).join('');
        }
    }

    global.PortfolioStrategies = { render };
})(window);
