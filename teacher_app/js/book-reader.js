/* ==========================================================================
   book-reader.js — قارئ الكتب داخل التطبيق.

   كان المعلّم لا يملك إلا زرّ «تحميل» يُخرجه من التطبيق إلى تطبيقٍ آخر.
   هذا يفتح الكتاب في مكانه.

   التصميم المعتمد (ج): تمريرٌ مستمر وشريط مصغّرات أسفل الشاشة — لأن
   كتاب المنهج ثلاثمئة صفحة، والعمل اليومي عليه تنقّلٌ لا قراءةٌ متّصلة،
   والمصغّرات تُري المعلّم أين هو وأين يذهب بلا حفظ أرقام.

   وقاعدتان تحكمان البناء:
   • الصفحات تُرسم عند اقترابها لا كلّها دفعةً واحدة — رسم ثلاثمئة صفحة
     يُسقط التبويب في ثوانٍ، وذاكرة الآيفون هي أول ما ينهار.
   • الكتاب يُقرأ من نسخة الجهاز أولاً، فيعمل القارئ بلا إنترنت. ولا
     يُطلب من المخزن البعيد إلا إذا رُفع الكتاب من جهازٍ آخر.
   ========================================================================== */

(function (global) {
    'use strict';

    const ar = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    /* دقّة الرسم: شاشة الآيفون ثلاثية الكثافة، لكن الرسم عندها يضاعف
       الذاكرة تسع مرّات بلا مكسبٍ يُرى. اثنان حدٌّ كافٍ. */
    const DPR = Math.min(global.devicePixelRatio || 1, 2);
    const THUMB_W = 46;

    let state = null;

    /* ------------------------------------------------------------------
       مصدر الملف
       ------------------------------------------------------------------ */
    async function loadData(book) {
        const local = await global.TeacherDB.BookFiles.get(book.id);
        if (local) return local.arrayBuffer();

        /* كان هنا جلبٌ من مخزن `books` للكتب المرفوعة من جهازٍ آخر. وأُقفل
           المخزنُ ثمّ حُذف (٢٦ أغسطس ٢٠٢٦): الكتبُ محليّةٌ منذ ١٢ مايو، فلم
           يبقَ فيه إلّا كتبٌ من التصميم القديم، وقرّر المستخدم إزالتها.
           فلا يُطلب من الخادم شيء، ورسالةُ الأسفل تقول للمعلّم الصواب. */
        if (book.file instanceof Blob) return book.file.arrayBuffer();   // صفوف قديمة
        throw new Error('الملف غير محفوظ على هذا الجهاز. افتح الكتاب من الجهاز الذي رُفع منه، أو أعد رفعه.');
    }

    /* ------------------------------------------------------------------
       الواجهة
       ------------------------------------------------------------------ */
    function shell(title) {
        const el = document.createElement('div');
        el.className = 'br-root';
        el.innerHTML = `
            <div class="br-top">
                <button type="button" class="br-x" data-close aria-label="إغلاق">✕</button>
                <span class="br-nm">${esc(title)}</span>
                <button type="button" class="br-go" data-jump>اذهب</button>
            </div>
            <div class="br-scroll" data-scroll></div>
            <div class="br-thumbs" data-thumbs></div>
            <div class="br-jump" data-jumpbox>
                <div class="br-jump-box">
                    <h4>اذهب إلى صفحة</h4>
                    <input type="number" inputmode="numeric" data-jump-n>
                    <div class="br-jump-row">
                        <button type="button" class="no" data-jump-no>إلغاء</button>
                        <button type="button" class="go" data-jump-go>اذهب</button>
                    </div>
                </div>
            </div>
            <div class="br-msg" data-msg>جارٍ فتح الكتاب…</div>`;
        return el;
    }

    async function renderPage(canvas, pageNo, cssWidth) {
        const page = await state.doc.getPage(pageNo);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (cssWidth / base.width) * DPR });
        canvas.width  = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width  = cssWidth + 'px';
        canvas.style.height = Math.floor(vp.height / DPR) + 'px';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }

    async function build() {
        const { root, doc } = state;
        const scroll = root.querySelector('[data-scroll]');
        const thumbs = root.querySelector('[data-thumbs]');
        const width  = Math.min(scroll.clientWidth - 20, 900);

        /* نسبة الصفحة الأولى تكفي لحجز مكان البقيّة: صفحات الكتاب الواحد
           متساوية عملياً، والحجز يمنع قفز التمرير تحت الإصبع. */
        const first = await doc.getPage(1);
        const v1 = first.getViewport({ scale: 1 });
        const ratio = v1.height / v1.width;
        const placeholderH = Math.floor(width * ratio);

        const frag = document.createDocumentFragment();
        const tfrag = document.createDocumentFragment();
        for (let i = 1; i <= doc.numPages; i++) {
            const c = document.createElement('canvas');
            c.className = 'br-pg';
            c.dataset.p = i;
            c.style.width  = width + 'px';
            c.style.height = placeholderH + 'px';
            frag.appendChild(c);

            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'br-th';
            b.dataset.p = i;
            b.innerHTML = `<canvas></canvas><span class="n">${ar(i)}</span>`;
            tfrag.appendChild(b);
        }
        scroll.appendChild(frag);
        thumbs.appendChild(tfrag);

        root.querySelector('[data-msg]').remove();

        const marks = Array.from(thumbs.children);
        const pages = Array.from(scroll.children);

        /* الرسم بحسابٍ صريح لا بـIntersectionObserver: المراقب لا يُطلق
           حين لا تُرسم الصفحة (تبويب في الخلفية، أو webview مخفيّ)، فتبقى
           الصفحات بيضاء بلا سببٍ ظاهر. والحساب هنا مضمونٌ في كل بيئة. */
        const AHEAD = 2, BEHIND = 1;
        const drawWindow = (n) => {
            for (let i = n - BEHIND; i <= n + AHEAD; i++) {
                if (i < 1 || i > pages.length) continue;
                const c = pages[i - 1];
                if (c.dataset.done) continue;
                c.dataset.done = '1';
                renderPage(c, i, width)
                    .catch((err) => { c.dataset.done = ''; console.warn('[reader] page failed:', err); });
            }
        };

        const sync = () => {
            const mid = scroll.scrollTop + scroll.clientHeight / 2;
            let n = 1;
            for (let i = 0; i < pages.length; i++) { if (pages[i].offsetTop <= mid) n = i + 1; }
            drawWindow(n);
            if (n === state.page) return;
            state.page = n;
            marks.forEach((m, i) => m.classList.toggle('on', i === n - 1));
            const on = marks[n - 1];
            if (on) thumbs.scrollTo({ left: on.offsetLeft - thumbs.clientWidth / 2 + THUMB_W / 2, behavior: 'smooth' });
        };
        scroll.addEventListener('scroll', sync, { passive: true });

        const goTo = (n) => {
            if (!(n >= 1 && n <= doc.numPages)) return;
            drawWindow(n);   // ارسم الوجهة قبل الوصول إليها
            scroll.scrollTo({ top: pages[n - 1].offsetTop - 8, behavior: 'smooth' });
        };
        thumbs.addEventListener('click', (e) => {
            const b = e.target.closest('.br-th');
            if (b) goTo(Number(b.dataset.p));
        });

        /* المصغّرات تُرسم بالتتابع بعد الصفحة الأولى، وبتنفّسٍ بين كل
           واحدة — وإلّا جمّدت مئاتُ الرسمات الواجهةَ لحظة الفتح. */
        (async () => {
            for (let i = 1; i <= doc.numPages; i++) {
                if (state.closed) return;
                try { await renderPage(marks[i - 1].querySelector('canvas'), i, THUMB_W); }
                catch (e) { /* مصغّرة واحدة لا توقف البقيّة */ }
                await new Promise((r) => setTimeout(r, 0));
            }
        })();

        /* لوحة القفز */
        const box = root.querySelector('[data-jumpbox]');
        const inp = root.querySelector('[data-jump-n]');
        inp.min = 1; inp.max = doc.numPages;
        inp.placeholder = `١ – ${ar(doc.numPages)}`;
        root.querySelector('[data-jump]').addEventListener('click', () => {
            box.classList.add('open'); inp.value = ''; inp.focus();
        });
        root.querySelector('[data-jump-no]').addEventListener('click', () => box.classList.remove('open'));
        root.querySelector('[data-jump-go]').addEventListener('click', () => {
            goTo(Number(inp.value));
            box.classList.remove('open');
        });

        sync();
        marks[0]?.classList.add('on');
    }

    /* ------------------------------------------------------------------
       الفتح والإغلاق
       ------------------------------------------------------------------ */
    async function open(book) {
        if (state) close();

        const root = shell(book.title || 'كتاب');
        document.body.appendChild(root);
        document.body.classList.add('br-open');
        state = { root, doc: null, page: 0, closed: false };

        const onClose = () => close();
        root.querySelector('[data-close]').addEventListener('click', onClose);
        /* زرّ الرجوع في الجوال يُغلق القارئ لا يُخرج من الفصل. */
        history.pushState({ br: 1 }, '');
        state.pop = () => close(true);
        global.addEventListener('popstate', state.pop);

        try {
            const lib  = await global.PdfCore.ensurePdfJs();
            const data = await loadData(book);
            state.doc  = await lib.getDocument(global.PdfCore.docOptions({ data })).promise;
            if (state.closed) return;
            await build();
        } catch (err) {
            console.warn('[reader] open failed:', err);
            const msg = root.querySelector('[data-msg]');
            if (msg) {
                msg.innerHTML = '<div>' + esc(err.message || 'تعذّر فتح الكتاب.')
                    + '<br><button type="button" class="br-retry" data-close>إغلاق</button></div>';
                msg.querySelector('[data-close]').addEventListener('click', onClose);
            }
        }
    }

    function close(fromPop) {
        if (!state) return;
        state.closed = true;
        /* تحرير اللوحات صراحةً: ذاكرة الـcanvas لا يجمعها الجامع فوراً،
           وكتابٌ كبير يترك عشرات الميجابايت معلّقة. */
        state.root.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; });
        try { state.doc && state.doc.destroy(); } catch (e) { /* لا شيء */ }
        global.removeEventListener('popstate', state.pop);
        state.root.remove();
        document.body.classList.remove('br-open');
        const wasOpen = !fromPop;
        state = null;
        if (wasOpen && history.state && history.state.br) history.back();
    }

    global.BookReader = { open, close };
})(window);
