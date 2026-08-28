/* ==========================================================================
   roster-text.js — أسماءُ الطلاب من طبقة نصّ الـPDF، بلا ذكاءٍ اصطناعيّ.
   ==========================================================================
   كشوفُ «نور» وأمثالُها تُصدَّر PDF فيه النصُّ مكتوبٌ رقميّاً لا صورةً
   ممسوحة. وكان التطبيقُ يرسم كلَّ صفحةٍ صورةً ويرسلها للنموذج ليقرأها
   بعينه — ونحن نملك الحروفَ نفسَها. فهذه تقرؤها مباشرةً: بلا حصّةٍ من
   الذكاء، وبلا أن يخرج كشفُ أسماء الطلاب من الجهاز.

   ── لكنّ الطبقةَ لا يُوثق بها على علّاتها ──
   قِيست ثلاثةُ خطوطٍ يوم ٢٨ أغسطس ٢٠٢٦ فأعطت ثلاثةَ سلوكيّات:
   · Plex وArial: الحروفُ بأشكالها المتّصلة حرفاً حرفاً (ﻋ ﺒ ﺪ) — يُصلحها
     `NFKC` إصلاحاً تامّاً.
   · Geeza Pro: الكلماتُ كاملةٌ **والرِّباطاتُ معكوسة** — «عبدالله» تصير
     «عبداهلل» و«المدرسة» تصير «املدرسة». ولا سبيلَ لإصلاحها بأمان: عكسُ
     التبديل يُفسد كلماتٍ صحيحةً مثل «أمل» و«عمل».

   فلا تُسلَّم أسماءٌ إلّا إن اجتازت بوّاباتٍ كلَّها. وإلّا فالمسارُ القديم
   كما هو — والمعلّمُ لا يرى فرقاً إلّا أنّها نجحت مجّاناً حين تنجح.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ── التطبيع ──
       `NFKC` يردّ أشكالَ العرض (U+FE70–FEFF) إلى حروفها، ويفكّ «ﻻ» إلى
       «لا» و«ﷲ» إلى «الله». وعلاماتُ الاتّجاه تُحذف: لا تُرى ولا تُطبع،
       وتفسد المقارنةَ والحفظ. والتطويلُ (ـ) زينةٌ لا حرف. */
    const BIDI = /[‎‏‪-‮⁦-⁩؜]/g;
    function norm(s) {
        return String(s || '')
            .normalize('NFKC')
            .replace(BIDI, '')
            .replace(/ـ/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ── قناصةُ الرِّباط المعكوس ──
       هذه صورُ كلماتٍ شائعةٍ في كشوف المدارس بعد أن يُعكس رباطُها، وليست
       كلماتٍ عربيّةً في ذاتها — فوجودُ واحدةٍ منها حكمٌ بأنّ الطبقة معطوبة.
       وليست برهاناً على السلامة عند غيابها، ولذلك لا تقف وحدَها: معها
       بوّابةُ العدد المطبوع وبوّاباتُ الشكل أدناه. */
    const CORRUPT = [
        'اهلل',      /* الله */
        'اململ',     /* المملـ */
        'املدرس',    /* المدرسـ */
        'امليال',    /* الميلاد */
        'املتوسط',   /* المتوسط */
        'االبتدائ',  /* الابتدائي */
        'الثانو ي',
        'املرحل',    /* المرحلة */
        'الطالبـ'
    ];
    const looksCorrupt = (t) => CORRUPT.some((c) => t.indexOf(c) !== -1);

    /* ── بوّابةُ أشكال العرض ──
       بعضُ المنتِجين يكتبون في الطبقة **رسومَ** الحروف (U+FE70–FEFF) لا
       الحروفَ نفسَها، حرفاً حرفاً وبترتيبٍ بصريٍّ من اليسار. و`NFKC`
       يردّها حروفاً، لكنّ **الترتيبَ يبقى غيرَ موثوق**: قِيس فخرجت
       «القحطاني» «القحطاين» و«ياسر» «يارس» — حرفان مقلوبان في آخر الكلمة
       لا تكشفهما قنّاصةُ الرِّباط ولا يراهما المعلّمُ في قائمةٍ طويلة.
       فما جاء برسوم العرض يُردّ كلُّه، ويُقرأ بالذكاء كما كان. */
    const PRESENTATION = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;

    /* ── ما ليس اسماً ──
       الاسمُ لا يحمل رقماً ولا رمزاً، وهو كلمتان فأكثر. وهذه ترفض صفوفَ
       الترويسة والمجاميع دون أن ترفض اسماً حقيقيّاً. */
    const AR = /[ء-ي]/;
    function looksLikeName(t) {
        if (!t || t.length < 5 || t.length > 80) return false;
        if (/[0-9٠-٩]/.test(t)) return false;
        if (/[<>@#$%^&*_=+\\|/]/.test(t)) return false;
        if (!AR.test(t)) return false;
        return t.split(' ').filter(Boolean).length >= 2;
    }

    /* رأسُ عمود الاسم كما يُكتب في الكشوف. */
    const NAME_HEAD = /^(اسم\s*(الطالب|الطالبة|الطلاب|الطالبات)?|الاسم)\s*$/;
    /* «عدد الطلاب: ٢٥» — شاهدٌ مستقلٌّ على العدد، إن طُبع. */
    const COUNT_RE = /عدد\s*(الطلاب|الطالبات|الطالب|الطالبة)\s*:?\s*([0-9٠-٩]+)/;

    const toEnDigits = (s) => s.replace(/[٠-٩]/g,
        (d) => String(d.charCodeAt(0) - 0x0660));

    /* ── من عناصر الصفحة إلى صفوفٍ وخلايا ──
       العناصرُ تأتي مبعثرةً بمواضعها. تُجمع في صفوفٍ بتقارب `y`، ثمّ في
       خلايا بتقارب `x` — والترتيبُ من اليمين لليسار، فهو ترتيبُ القراءة
       المنطقيّ في العربيّة. */
    function rowsOf(items) {
        const live = items
            .filter((it) => it.str && it.str.trim())
            .map((it) => ({
                s: it.str,
                x: it.transform[4],
                y: it.transform[5],
                w: it.width || 0,
                h: it.height || Math.abs(it.transform[3]) || 10
            }));
        if (!live.length) return [];

        const tol = Math.max(2, live.reduce((a, b) => a + b.h, 0) / live.length * 0.45);
        live.sort((a, b) => b.y - a.y);

        const rows = [];
        let cur = null;
        for (const it of live) {
            if (!cur || Math.abs(cur.y - it.y) > tol) {
                cur = { y: it.y, items: [] };
                rows.push(cur);
            }
            cur.items.push(it);
        }

        return rows.map((r) => {
            r.items.sort((a, b) => b.x - a.x);          /* يمينٌ ← يسار */
            const cells = [];
            let cell = null;
            for (const it of r.items) {
                const gap = cell ? (cell.left - (it.x + it.w)) : Infinity;
                /* فرجةٌ تفوق حرفين تعني عموداً جديداً لا مسافة. */
                if (!cell || gap > it.h * 1.6) {
                    cell = { text: it.s, right: it.x + it.w, left: it.x, h: it.h };
                    cells.push(cell);
                } else {
                    cell.text += (gap > it.h * 0.18 ? ' ' : '') + it.s;
                    cell.left = it.x;
                }
            }
            cells.forEach((c) => { c.text = norm(c.text); c.mid = (c.left + c.right) / 2; });
            return { y: r.y, cells: cells.filter((c) => c.text) };
        }).filter((r) => r.cells.length);
    }

    /**
     * يقرأ أسماءَ الطلاب من طبقة نصّ الملفّ.
     * @returns {Promise<{ok:true,names:string[],pages:number}|{ok:false,why:string}>}
     *          `why` سببٌ للسجلّ لا رسالةٌ للمعلّم — الفشلُ هنا يعني
     *          «جرِّب الذكاء»، لا «قل له إنّ شيئاً أخفق».
     */
    async function fromPdf(file) {
        let doc = null;
        try {
            const pdfjs = await global.PdfCore.ensurePdfJs();
            const buf = await file.arrayBuffer();
            doc = await pdfjs.getDocument(global.PdfCore.docOptions({ data: buf })).promise;

            const names = [];
            let printedCount = null;
            let sawHeader = false;
            let rawHasForms = false;
            let allText = '';

            for (let p = 1; p <= doc.numPages; p++) {
                const page = await doc.getPage(p);
                const tc = await page.getTextContent();
                if (rawHasForms === false) {
                    rawHasForms = PRESENTATION.test(tc.items.map((i) => i.str).join(''));
                }
                const rows = rowsOf(tc.items);
                page.cleanup();
                if (!rows.length) continue;

                rows.forEach((r) => { allText += ' ' + r.cells.map((c) => c.text).join(' '); });

                /* العددُ المطبوع — من أيّ صفحةٍ ورد. */
                if (printedCount === null) {
                    const m = COUNT_RE.exec(norm(allText));
                    if (m) printedCount = parseInt(toEnDigits(m[2]), 10);
                }

                /* رأسُ عمود الاسم يحدّد المدى؛ وبلا رأسٍ لا تُخمَّن الأعمدة. */
                let band = null;
                for (const r of rows) {
                    const i = r.cells.findIndex((c) => NAME_HEAD.test(c.text));
                    if (i < 0) continue;
                    /* حدُّ العمود من جارَيه لا من عرض الرأس: الرأسُ كلمةٌ
                       قصيرةٌ موسّطة، وخلايا الأسماء أعرضُ منه فتقع خارجَه.
                       قِيس: رأسٌ ‎287–334‎ وأسماءٌ تمتدّ إلى ‎414‎ — فسقط ثلثا
                       الكشف. والخلايا مرتّبةٌ يميناً ← يساراً، فجارُ اليمين
                       قبلَه في المصفوفة. */
                    const right = r.cells[i - 1];
                    const left  = r.cells[i + 1];
                    band = {
                        lo: left  ? left.right  : -Infinity,
                        hi: right ? right.left  :  Infinity,
                        y: r.y
                    };
                    sawHeader = true;
                    break;
                }
                if (!band) continue;

                for (const r of rows) {
                    if (r.y >= band.y) continue;                  /* ما فوق الرأس ترويسة */
                    const cell = r.cells.find((c) => c.mid >= band.lo && c.mid <= band.hi);
                    if (cell && looksLikeName(cell.text)) names.push(cell.text);
                }
            }

            /* ══ البوّابات — كلُّها تُجتاز أو لا تُسلَّم أسماء ══ */
            if (rawHasForms) return { ok: false, why: 'presentation-forms' };
            if (!sawHeader) return { ok: false, why: 'no-name-header' };
            if (names.length < 3) return { ok: false, why: 'too-few:' + names.length };
            if (looksCorrupt(norm(allText))) return { ok: false, why: 'ligature-corrupt' };
            if (names.some(looksCorrupt)) return { ok: false, why: 'ligature-corrupt-name' };
            if (printedCount !== null && printedCount !== names.length) {
                return { ok: false, why: 'count-mismatch:' + names.length + '/' + printedCount };
            }
            /* تكرارُ اسمٍ بحاله يعني أنّ العمودَ ليس عمودَ أسماء (جنسيّةٌ
               مثلاً: «سعودي» في كلّ صفّ). */
            if (new Set(names).size < names.length * 0.9) {
                return { ok: false, why: 'not-unique' };
            }

            return { ok: true, names, pages: doc.numPages };
        } catch (e) {
            return { ok: false, why: 'error:' + (e && e.message || e) };
        } finally {
            if (doc) { try { await doc.destroy(); } catch (e) { /* لا شيء */ } }
        }
    }

    global.RosterText = { fromPdf, norm, looksLikeName, looksCorrupt, rowsOf };
})(window);
