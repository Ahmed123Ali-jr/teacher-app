/* ==========================================================================
   pdf-text.js — قراءةُ طبقة نصّ الـPDF على الجهاز، بلا ذكاءٍ ولا كلفة.

   ── لماذا وُجد هذا الملفّ ──
   جدولُ المدرسة ملفٌّ واحدٌ فيه صفحةٌ لكلّ معلّم — تسعَ عشرةَ صفحةً في
   ملفّ المستخدم. وكان الاستيراد يرسلها **كلَّها** إلى النموذج مرّتين:
   مرّةً ليسأله «أيُّ هؤلاء أنت؟» ومرّةً ليقرأ صفحته. فيُدفع ثمنُ ثمانٍ
   وثلاثين صفحةً لتُقرأ واحدة.

   وقِيس على فاتورته (٣٠ أغسطس ٢٠٢٦، أوبس ٥): النداءُ الأوّل وحدَه
   **‎٣٠٬١٥٠‎ توكناً** ليعود بـ‎٢٤٤‎ — أي ‎٤٤٪‎ من ثمن قراءة الجدول،
   أُنفقت لمعرفة اسمٍ مكتوبٍ في رأس الصفحة.

   وأكثرُ جداول المدارس تُصدَّر من الحاسب، فتحمل **طبقةَ نصّ**: الاسمُ
   فيها حروفٌ تُقرأ لا بكسلاتٌ تُخمَّن. فيُقرأ هنا، على الجهاز، مجّاناً.

   ── وحرفان يفسدان كلَّ قراءةٍ إن أُهملا ──
   • **الأشكالُ التقديميّة** (U+FE70..U+FEFF): كثيرٌ من المولّدات تكتب
     الحرفَ بشكله الموصول لا بأصله. تبدو صحيحةً في العين وتخيب في كلّ
     مقارنة. و`normalize('NFKC')` تردّها — دالّةٌ في المتصفّح لا مكتبة.
   • **الترتيبُ البصريّ**: بعضُها يخزّن ما يُرسم لا ما يُقرأ، فتخرج
     «الأحد» هكذا: «دحلأا».

   ولا يُكشف القلبُ بأسماء الأيّام وحدَها — جُرّب فسقط في كشوف الطلاب،
   إذ ليس فيها يومٌ أصلاً، فخرجت الأسماءُ معكوسةً كلُّها (صفرٌ من ٢٥،
   قِيس ٣٠ أغسطس). فالميزانُ بنيةُ العربيّة نفسِها: التاءُ المربوطة
   والألفُ المقصورة لا تقعان إلّا آخِرَ الكلمة، و«ال» التعريف تصير «لا»
   في آخرها إذا قُلبت.

   قِيس على أربعة ملفّاتٍ مولَّدةٍ بطبقة نصّ حقيقيّة، بالاتّجاهين:
   اسمُ المعلّم في رأس الصفحة ‎٥/٥‎، والأسماء ‎٢٥/٢٥‎.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ── طيُّ الحرف ── */

    /** يردّ الأشكالَ الموصولة إلى أصولها ويحذف التطويل. */
    const deshape = (s) => String(s == null ? '' : s).normalize('NFKC').replace(/\u0640/g, '');

    const revStr = (s) => Array.from(s).reverse().join('');

    /** طيٌّ للمقارنة: همزاتٌ وتاءٌ مربوطةٌ وألفٌ مقصورةٌ وتشكيل. */
    const fold = (s) => deshape(s)
        .replace(/[\u0623\u0625\u0622\u0671]/g, 'ا')
        .replace(/\u0649/g, 'ي')
        .replace(/\u0629/g, 'ه')
        .replace(/[\u064B-\u0652]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const latin = (s) => String(s == null ? '' : s)
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

    /* ── الأيّام: شاهدٌ على الاتّجاه، وعمادُ الشبكة ── */

    /* بحدودِ كلمةٍ و«ال» اختياريّة: من الجداول ما يكتب «أحد» مجرّدة.
       والحدُّ لازم — بدونه تُطابَق «احد» داخلَ «واحد» فيُظنّ اليومُ حيث
       لا يوم. */
    const DAY_RE = [
        /(^|[\s:،.\-\/])(ال)?احد($|[\s:،.\-\/])/,
        /(^|[\s:،.\-\/])(ال)?اثنين($|[\s:،.\-\/])/,
        /(^|[\s:،.\-\/])(ال)?ثلاثاء($|[\s:،.\-\/])/,
        /(^|[\s:،.\-\/])(ال)?اربعاء($|[\s:،.\-\/])/,
        /(^|[\s:،.\-\/])(ال)?خميس($|[\s:،.\-\/])/
    ];
    function dayIndex(t) {
        const f = ' ' + fold(t) + ' ';
        for (let i = 0; i < DAY_RE.length; i++) if (DAY_RE[i].test(f)) return i;
        return -1;
    }

    /* ── الاستخراج ── */

    /** خياراتُ **قراءةٍ** لا رسم.
     *  `PdfCore.docOptions` مضبوطةٌ لرسم العربيّة: `disableFontFace` تجعل
     *  pdf.js تبني حدودَ كلّ حرفٍ بنفسها، و`useSystemFonts:false` تدفعها
     *  إلى **جلب ملفّات خطوطٍ من الشبكة** لكلّ خطٍّ غيرِ مضمَّن. ونحن لا
     *  نرسم شيئاً. وcMap يبقى: بدونه تُقرأ رموزُ الخطوط ذاتِ المعرّفات
     *  خطأً فتخرج حروفاً مبهمة. */
    function textOptions(extra) {
        const abs = (p) => new URL(p, global.location.href).href;
        return Object.assign({
            cMapUrl: abs('vendor/cmaps/'),
            cMapPacked: true,
            standardFontDataUrl: abs('vendor/standard_fonts/')
        }, extra || {});
    }

    /** قطعُ نصِّ صفحةٍ واحدة بإحداثيّاتها (أصلُ الصفحة أعلى اليسار). */
    async function pageItems(pdfjs, doc, n) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = [];
        tc.items.forEach((it) => {
            const raw = String(it.str || '');
            if (!raw.trim()) return;
            const t = pdfjs.Util.transform(vp.transform, it.transform);
            const h = Math.abs(t[3]) || it.height || 10;
            items.push({
                raw: raw, x: t[4], y: t[5], w: it.width || 0, h: h,
                cx: t[4] + (it.width || 0) / 2, cy: t[5] - h / 2
            });
        });
        page.cleanup();
        return { n: n, items: items, w: vp.width, h: vp.height };
    }

    /** يقرّر اتّجاهَ الحروف من بنية العربيّة، ويطبّق القرارَ على القطع. */
    function orient(pages) {
        let up = 0, down = 0;
        pages.forEach((p) => p.items.forEach((it) => {
            const s = deshape(it.raw);
            if (dayIndex(s) >= 0)         up   += 5;   /* شاهدٌ قاطعٌ حين يوجد */
            if (dayIndex(revStr(s)) >= 0) down += 5;
            s.split(/\s+/).forEach((w0) => {
                const w = w0.replace(/[\u064B-\u0652]/g, '');
                if (w.length < 2) return;
                if (/[\u0629\u0649]$/.test(w)) up++;
                if (/^[\u0629\u0649]/.test(w)) down++;
                if (/^ال/.test(w))  up++;
                if (/لا$/.test(w))  down++;
            });
        }));
        const flip = down > up;
        pages.forEach((p) => p.items.forEach((it) => {
            const s = deshape(it.raw);
            it.t = flip ? revStr(s) : s;
        }));
        return { flip: flip, up: up, down: down };
    }

    /** يجمع القطعَ أسطراً بمواضعها — وترتيبُ القطع في الملفّ ليس ترتيبَ
     *  القراءة: مولّدٌ يكتب عموداً عموداً وآخرُ يقفز. */
    function toLines(items) {
        if (!items.length) return [];
        const hs = items.map((i) => i.h).sort((a, b) => a - b);
        const med = hs[Math.floor(hs.length / 2)] || 10;
        const tol = Math.max(3, med * 0.6);
        const sorted = items.slice().sort((a, b) => a.cy - b.cy);
        const lines = [];
        let cur = [sorted[0]];
        for (let i = 1; i < sorted.length; i++) {
            if (Math.abs(sorted[i].cy - cur[cur.length - 1].cy) <= tol) cur.push(sorted[i]);
            else { lines.push(cur); cur = [sorted[i]]; }
        }
        lines.push(cur);
        return lines.map((l) => l.sort((a, b) => b.cx - a.cx));   /* من اليمين */
    }

    /* ── صاحبُ الصفحة ── */

    const TITLES = ['جدول المعلم', 'جدول المعلمه', 'جدول حصص المعلم',
                    'جدول حصص المعلمه', 'اسم المعلم', 'اسم المعلمه',
                    'المعلم', 'المعلمه'];

    /** يقرأ اسمَ المعلّم من عنوان الصفحة، أو `null`.
     *  والسطرُ يُجمع أوّلاً: العنوانُ قد يكون قطعتين — «جدول المعلم» في
     *  قطعةٍ والاسمُ في التي تليها. */
    function teacherOf(page) {
        const lines = toLines(page.items);
        for (const ln of lines) {
            const txt = ln.map((i) => i.t).join(' ').replace(/\s+/g, ' ').trim();
            const f = fold(txt);
            for (const key of TITLES) {
                const at = f.indexOf(key);
                if (at < 0) continue;
                let name = txt.slice(at + key.length).replace(/^[\s:\-\/\u060C]+/, '').trim();
                name = name.split(/\s{3,}/)[0].trim();
                if (name.length >= 3) return name;
            }
        }
        return null;
    }

    /* ── مطابقةُ الاسم ──
       اسمُ الحساب ليس اسمَ الورقة: يسجّل «أحمد العسيري» ويُطبع «أحمد علي
       محمد العسيري». فالمطابقةُ بالكلمات المشتركة لا بالتساوي.
       وتُطرح كلماتُ الوصل — «بن» و«عبد» و«ال» — فهي في كلّ اسمٍ تقريباً
       فتُطابِق الغرباء. */
    const STOP = ['بن', 'بنت', 'ابن', 'عبد', 'ال', 'أبو', 'ابو', 'ام', 'المعلم', 'المعلمه'];

    function nameTokens(s) {
        return fold(s).split(/\s+/).filter((w) => w.length > 1 && STOP.indexOf(w) < 0);
    }

    /** عددُ الكلمات المشتركة بين اسمَين بعد الطيّ. */
    function nameHits(a, b) {
        const x = nameTokens(a), y = nameTokens(b);
        if (!x.length || !y.length) return 0;
        return x.filter((w) => y.indexOf(w) >= 0).length;
    }

    /* ── الواجهة ── */

    /**
     * يمسح طبقةَ نصّ الملفّ على الجهاز.
     * @returns {Promise<{hasText:boolean,total:number,withText:number,
     *                    pages:Array<{n:number,teacher:string|null,items:number}>,
     *                    teachers:Array<{n:number,name:string}>}>}
     *          و`hasText=false` للمسح الضوئيّ — فيبقى الذكاءُ سبيلَه الوحيد.
     */
    async function scan(file) {
        const isPdf = (file.type === 'application/pdf') || /\.pdf$/i.test(file.name || '');
        const none = { hasText: false, total: 0, withText: 0, pages: [], teachers: [] };
        if (!isPdf) return none;

        let doc = null;
        try {
            const pdfjs = await global.PdfCore.ensurePdfJs();
            const buf = await file.arrayBuffer();
            doc = await pdfjs.getDocument(textOptions({ data: buf })).promise;

            const raw = [];
            for (let i = 1; i <= doc.numPages; i++) raw.push(await pageItems(pdfjs, doc, i));
            orient(raw);

            const pages = raw.map((p) => ({
                n: p.n, items: p.items.length,
                teacher: p.items.length >= 5 ? teacherOf(p) : null
            }));
            const withText = pages.filter((p) => p.items >= 5).length;
            return {
                hasText: withText > 0,
                total: raw.length,
                withText: withText,
                pages: pages,
                teachers: pages.filter((p) => p.teacher).map((p) => ({ n: p.n, name: p.teacher }))
            };
        } catch (e) {
            /* **لا يُفسد المسحُ استيراداً أبداً**: ملفٌّ معطوبٌ أو مكتبةٌ لم
               تُحمَّل يعني أن نمضي في المسار القديم، لا أن يقف المعلّم. */
            console.warn('[PdfText] تعذّر مسحُ طبقة النصّ:', e && e.message);
            return none;
        } finally {
            if (doc) { try { await doc.destroy(); } catch (e) { /* لا شيء */ } }
        }
    }

    /**
     * أيُّ صفحةٍ صفحةُ هذا المعلّم؟
     * @param {Array<{n:number,name:string}>} teachers  ما وجده `scan`
     * @param {string} accountName  اسمُه في حسابه
     * @returns {{n:number,name:string}|null}  ولا يُبَتّ إلّا بيقين:
     *   كلمتان مشتركتان فأكثر، وصفحةٌ واحدةٌ لا غير تبلغ ذلك. وما دونه
     *   يُسأل عنه المعلّم — والسؤالُ مجّانيٌّ إذ الأسماءُ بين أيدينا.
     */
    function pickPage(teachers, accountName) {
        if (!Array.isArray(teachers) || !teachers.length) return null;
        if (teachers.length === 1) return teachers[0];
        if (!accountName) return null;
        const scored = teachers.map((t) => ({ t: t, hits: nameHits(accountName, t.name) }));
        const best = scored.filter((s) => s.hits >= 2).sort((a, b) => b.hits - a.hits);
        if (!best.length) return null;
        if (best.length > 1 && best[1].hits === best[0].hits) return null;   /* تعادلٌ: يُسأل */
        return best[0].t;
    }

    global.PdfText = {
        scan, pickPage, nameHits, nameTokens,
        deshape, fold, latin, revStr, dayIndex, toLines, orient, pageItems,
        teacherOf, textOptions
    };
})(window);
