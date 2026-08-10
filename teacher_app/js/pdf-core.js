/* ==========================================================================
   pdf-core.js — محرّك تصدير PDF المشترك.

   استُخلص من print-students.js بعد أن ثبت في السجل، ليخدم ملف الإنجاز
   أيضاً. الفرق الجوهري بينهما ليس في التصدير بل في تقسيم الصفحات:

     السجل      جدول منتظم  → عدد صفوف ثابت لكل صفحة (يبقى في مكانه)
     ملف الإنجاز كتل متباينة → قياس فعلي ورصّ (paginate هنا)

   ولماذا نُقسّم بأنفسنا أصلاً: window.print() هو من يقسّم اليوم، وهو
   خامد داخل WKWebView (كابستور لا يطبّق printFrame delegate) — ولا
   WKWebView.createPDF يقسّم صفحات. فالمُرقِّم شرط لكلا المسارين.
   ========================================================================== */

(function (global) {
    'use strict';

    /* A4 عمودي عند 96dpi، وهوامش @page في print.css (18mm 15mm). */
    const MM   = 96 / 25.4;
    const PAGE = {
        W:  Math.round(210 * MM),        // 794
        H:  Math.round(297 * MM),        // 1123
        MX: Math.round(15 * MM),         // 57  هامش جانبي
        MY: Math.round(18 * MM),         // 68  هامش علوي/سفلي
        MM_W: 210, MM_H: 297
    };
    PAGE.CONTENT_W = PAGE.W - 2 * PAGE.MX;   // 680
    PAGE.CONTENT_H = PAGE.H - 2 * PAGE.MY;   // 987

    /* مستضافة محلياً لا من CDN: معالج الخدمة يتخطّى الطلبات الخارجية
       عمداً، فكانت كل عمليات التصدير تموت بلا إنترنت — وهذا واقعي داخل
       مبنى مدرسة. ولازم أيضاً للنسخة المغلَّفة على آبل ستور. */
    const VENDOR = 'vendor/';
    const CDN = {
        html2canvas: VENDOR + 'html2canvas.min.js',
        jspdf:       VENDOR + 'jspdf.umd.min.js'
    };
    const PDFJS = {
        main:   VENDOR + 'pdf.min.js',
        worker: VENDOR + 'pdf.worker.min.js'
    };

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.onload  = () => resolve();
            s.onerror = () => reject(new Error('تعذّر تحميل مكوّن PDF'));
            document.head.appendChild(s);
        });
    }

    let _enginePromise = null;
    /** يُستدعى عند فتح نافذة الطباعة لا عند الضغط، حتى لا تضيع إيماءة
     *  المستخدم في iOS أثناء تحميل المكتبتين. */
    function preloadPdfEngine() {
        if (!_enginePromise) {
            _enginePromise = Promise.all([loadScript(CDN.html2canvas), loadScript(CDN.jspdf)])
                .catch((e) => { _enginePromise = null; throw e; });
        }
        return _enginePromise;
    }

    let _pdfJsPromise = null;
    /** pdf.js لعرض الملفات المرفوعة. كانت هذه الدالة منسوخة حرفياً في
     *  ثلاثة ملفات — نسخة واحدة هنا تخدمها كلها. */
    function ensurePdfJs() {
        if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
        if (_pdfJsPromise) return _pdfJsPromise;
        _pdfJsPromise = loadScript(PDFJS.main)
            .then(() => {
                if (!global.pdfjsLib) throw new Error('تعذّر تحميل مكتبة عرض PDF.');
                global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS.worker;
                return global.pdfjsLib;
            })
            .catch(() => { _pdfJsPromise = null; throw new Error('تعذّر تحميل مكتبة عرض PDF.'); });
        return _pdfJsPromise;
    }

    /** print.css كلّه داخل كتل @media print، فلا يسري على الشاشة. نعيد
     *  كتابته ليسري أثناء القياس والالتقاط. */
    async function printCssForScreen() {
        const link = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .find((l) => l.href.includes('print.css'));
        if (!link) return null;
        const css = await (await fetch(link.href)).text();
        const el = document.createElement('style');
        el.textContent = css.replace(/@media\s+print\s*\{/g, '@media all {');
        return el;
    }

    function ensurePrintRoot() {
        let el = document.getElementById('print-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'print-root';
            document.body.appendChild(el);
        }
        return el;
    }

    function sanitizeFileName(s) {
        return String(s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
             + '-' + String(d.getDate()).padStart(2, '0');
    }

    /* ------------------------------------------------------------------
       المسرح: عنصر خارج الشاشة بعرض الورقة الحقيقي، يحمل تنسيق الطباعة.
       نضيف is-printing بعد حقن التنسيق لأن القاعدة
       `body.is-printing > #app { display:none }` تصير عندها فعّالة على
       الشاشة — فيختفي التطبيق بدل أن يظهر مشوّهاً أثناء الالتقاط.
       ------------------------------------------------------------------ */
    async function createStage() {
        const stage = document.createElement('div');
        stage.setAttribute('style',
            `position:fixed; top:0; left:-20000px; width:${PAGE.W}px; background:#fff; z-index:-1;`);
        const cssEl = await printCssForScreen();
        if (cssEl) stage.appendChild(cssEl);
        document.body.appendChild(stage);

        /* applyLandscape في السجل يترك <style id="print-orientation"> خلفه.
           لو بقي، طُبع ملف الإنجاز بالعرض. */
        document.getElementById('print-orientation')?.remove();

        return {
            el: stage,
            destroy() { stage.remove(); }
        };
    }

    /** بلا هذا يُقاس <img> بلا ارتفاع مصرّح صفراً، فتمرّ الكتلة كأنها
     *  تناسب الصفحة ثم تُقصّ في الالتقاط بلا خطأ ولا تحذير. */
    async function settle(rootEl) {
        try { await document.fonts.ready; } catch (e) { /* متصفح قديم */ }
        const imgs = Array.from(rootEl.querySelectorAll('img'));
        await Promise.all(imgs.map((img) => {
            if (img.complete && img.naturalWidth > 0) return null;
            return (img.decode ? img.decode() : Promise.resolve())
                .catch(() => new Promise((r) => {
                    img.addEventListener('load',  r, { once: true });
                    img.addEventListener('error', r, { once: true });
                    setTimeout(r, 4000);
                }));
        }));
    }

    /* ------------------------------------------------------------------
       المُرقِّم: يصنّف الأبناء المباشرين لـ.print-doc ثم يرصّهم.

         break     فاصل صريح — يُغلق الصفحة الحالية
         framed    صفحة كاملة بإطارها (غلاف/فهرس/شهادة/فاصل قسم) — بلا حشو
         padded    صفحة كاملة بلا قواعد خاصة (مرفقات) — تحتاج حشو الهوامش
         splittable كتلة قد تتجاوز الصفحة فتُقسَّم عند أبنائها المباشرين
         atomic    كل ما عداها — تُرصّ ولا تُقسَّم

       ملاحظة: القياس يتم داخل صندوق حقيقي بـoverflow:visible، لا
       overflow:hidden كما في splitPages — الإخفاء يبتلع الفائض بصمت.
       ------------------------------------------------------------------ */
    const FRAMED = /(^|\s)(cover-page|toc-page|cert-card|section-divider)(\s|$)/;
    const PADDED = /(^|\s)portfolio-attachment(\s|$)/;
    const SPLITTABLE = /(^|\s)report-article(\s|$)/;

    function classify(el) {
        const c = ' ' + (el.className || '').toString() + ' ';
        if (/(^|\s)page-break(\s|$)/.test(c)) return 'break';
        if (FRAMED.test(c))     return 'framed';
        if (PADDED.test(c))     return 'padded';
        if (SPLITTABLE.test(c)) return 'splittable';
        return 'atomic';
    }

    function makePageBox(kind) {
        const box = document.createElement('div');
        const pad = kind === 'framed' ? '0' : `${PAGE.MY}px ${PAGE.MX}px`;
        box.className = 'pdfcore-page';
        box.style.cssText = [
            `width:${PAGE.W}px`, `height:${PAGE.H}px`,
            'box-sizing:border-box', `padding:${pad}`,
            'background:#fff', 'overflow:visible', 'position:relative'
        ].join(';');
        return box;
    }

    /**
     * يرصّ مستنداً في صفحات بمقاس A4.
     * @param {HTMLElement} docEl  عنصر .print-doc (سيُستهلك)
     * @param {HTMLElement} stageEl المسرح الذي يُقاس داخله
     * @returns {{pages: HTMLElement[], warnings: string[], pageOf: Map<string,number>}}
     */
    function paginate(docEl, stageEl) {
        const blocks = Array.from(docEl.children);
        const pages = [];
        const warnings = [];
        const pageOf = new Map();     // id → رقم الصفحة (1-based)

        let box = null, inner = null, used = 0;

        /* القياس في صندوق مستقل بعرض المحتوى نفسه: لو قِسنا داخل صفحة
           حيّة تلوّثت النتيجة بانهيار الهوامش مع ما سبقها، ولوجب أن تكون
           هناك صفحة مفتوحة أصلاً — وهي ليست كذلك بعد كل فاصل. */
        const ruler = document.createElement('div');
        ruler.style.cssText =
            `position:absolute; left:-30000px; top:0; width:${PAGE.CONTENT_W}px; visibility:hidden;`;
        stageEl.appendChild(ruler);

        const openPage = (kind) => {
            box = makePageBox(kind);
            inner = document.createElement('div');
            box.appendChild(inner);
            stageEl.appendChild(box);
            used = 0;
            pages.push(box);
        };
        const closePage = () => { box = null; inner = null; used = 0; };

        const capacity = (kind) => kind === 'framed' ? PAGE.H : PAGE.CONTENT_H;

        /* يقيس بالإلحاق الفعلي: أدقّ من حساب الأنماط، لأنه يشمل انهيار
           الهوامش وتأثير الأشقّاء. */
        const measure = (el) => {
            inner.appendChild(el);
            const h = inner.scrollHeight;
            return h;
        };

        const place = (el, kind) => {
            if (!box) openPage(kind === 'framed' ? 'framed' : 'flow');
            const before = used;
            const after = measure(el);
            if (after <= capacity(kind === 'framed' ? 'framed' : 'flow') || before === 0) {
                used = after;
                return true;
            }
            inner.removeChild(el);      // لا يناسب — صفحة جديدة
            return false;
        };

        for (const block of blocks) {
            const kind = classify(block);

            if (kind === 'break') { closePage(); continue; }

            /* صفحة مفردة: تُغلق ما قبلها وما بعدها */
            if (kind === 'framed' || kind === 'padded') {
                closePage();
                openPage(kind === 'framed' ? 'framed' : 'flow');
                inner.appendChild(block);
                const h = inner.scrollHeight;
                const cap = capacity(kind === 'framed' ? 'framed' : 'flow');
                if (h > cap) fitOrWarn(block, inner, h, cap, warnings);
                recordIds(block, pages.length, pageOf);
                closePage();
                continue;
            }

            if (kind === 'splittable') {
                for (const part of splitBlock(block, ruler, capacity('flow'))) {
                    if (!place(part, 'flow')) { openPage('flow'); place(part, 'flow'); }
                    recordIds(part, pages.length, pageOf);
                }
                continue;
            }

            /* atomic */
            if (!place(block, 'flow')) {
                openPage('flow');
                if (!place(block, 'flow')) {
                    const h = inner.scrollHeight;
                    fitOrWarn(block, inner, h, capacity('flow'), warnings);
                    used = capacity('flow');
                }
            }
            recordIds(block, pages.length, pageOf);
        }

        ruler.remove();
        return { pages, warnings, pageOf };
    }

    /** كتلة أطول من صفحة رغم أنها ذرّية: نُصغّرها قليلاً بدل قصّها،
     *  ونسجّل تحذيراً — الصمت هنا هو ما ينتج «قسماً يدخل على قسم». */
    function fitOrWarn(el, inner, h, cap, warnings) {
        const k = cap / h;
        if (k >= 0.80) {
            el.style.transformOrigin = 'top center';
            el.style.transform = `scale(${k.toFixed(4)})`;
            warnings.push(`صُغِّرت كتلة (${(el.className || 'بلا صنف')}) بنسبة ${Math.round(k * 100)}%`);
        } else {
            warnings.push(`كتلة أطول من صفحة ولا يمكن تصغيرها: ${(el.className || 'بلا صنف')}`);
        }
    }

    /** يقسّم .report-article عند أبنائها المباشرين، مع تكرار العنوان.
     *  يُقاس في المسطرة لا في صفحة حيّة. يرجّع مصفوفة عناصر جاهزة للرصّ. */
    function splitBlock(block, ruler, cap) {
        ruler.appendChild(block);
        const whole = block.getBoundingClientRect().height;
        ruler.removeChild(block);
        if (whole <= cap) return [block];

        const heading = block.querySelector('h3');
        const kids = Array.from(block.children);
        const out = [];
        let shell = block.cloneNode(false);
        let count = 0;

        const newShell = () => {
            const sh = block.cloneNode(false);
            if (heading) {
                const cont = heading.cloneNode(true);
                cont.textContent = heading.textContent + ' (تابع)';
                sh.appendChild(cont);
            }
            return sh;
        };

        ruler.appendChild(shell);
        for (const kid of kids) {
            shell.appendChild(kid);
            if (shell.getBoundingClientRect().height > cap && count > 0) {
                shell.removeChild(kid);
                ruler.removeChild(shell);
                out.push(shell);
                shell = newShell();
                ruler.appendChild(shell);
                shell.appendChild(kid);
                count = 1;
            } else {
                count++;
            }
        }
        ruler.removeChild(shell);
        if (shell.children.length) out.push(shell);
        return out;
    }

    function recordIds(el, pageNo, pageOf) {
        if (el.id) pageOf.set(el.id, pageNo);
        el.querySelectorAll?.('[id]').forEach((n) => {
            if (!pageOf.has(n.id)) pageOf.set(n.id, pageNo);
        });
    }

    /* ------------------------------------------------------------------
       الالتقاط والتسليم
       ------------------------------------------------------------------ */

    /** يلتقط الصفحات صورةً صورةً ويحرّر كل واحدة فور استخدامها — ذروة
     *  الذاكرة على الآيفون هي ما يُسقط التبويب في المستندات الطويلة. */
    async function renderPdf(pages, { onProgress } = {}) {
        await preloadPdfEngine();
        const { jsPDF } = global.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const canvas = await global.html2canvas(page, {
                scale: 1.5, backgroundColor: '#ffffff', logging: false, useCORS: true,
                width: PAGE.W, height: PAGE.H, windowWidth: PAGE.W, windowHeight: PAGE.H
            });
            const img = canvas.toDataURL('image/jpeg', 0.85);
            if (i > 0) pdf.addPage('a4', 'portrait');
            pdf.addImage(img, 'JPEG', 0, 0, PAGE.MM_W, PAGE.MM_H);

            canvas.width = canvas.height = 0;
            page.querySelectorAll('img').forEach((im) => { im.src = ''; });
            page.remove();

            if (onProgress) onProgress(i + 1, pages.length);
            await new Promise((r) => setTimeout(r, 0));   // نفَس للواجهة
        }
        return pdf.output('blob');
    }

    /**
     * يسلّم الملف للمعلم. القيمة الراجعة حقيقية لا مفترضة، حتى لا يظهر
     * توست نجاح بعد إلغاء ورقة المشاركة.
     * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
     */
    async function deliverPdf(blob, fileName) {
        const name = sanitizeFileName(fileName) + '.pdf';
        const file = new File([blob], name, { type: 'application/pdf' });

        if (global.navigator.canShare && global.navigator.canShare({ files: [file] })) {
            try {
                await global.navigator.share({ files: [file], title: name });
                return 'shared';
            } catch (err) {
                if (err && err.name === 'AbortError') return 'cancelled';
                /* غير ذلك: ننزّله */
            }
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return 'downloaded';
    }

    global.PdfCore = {
        PAGE, CDN, PDFJS,
        loadScript, preloadPdfEngine, ensurePdfJs, printCssForScreen, ensurePrintRoot,
        sanitizeFileName, todayISO,
        createStage, settle, paginate, renderPdf, deliverPdf
    };
})(window);
