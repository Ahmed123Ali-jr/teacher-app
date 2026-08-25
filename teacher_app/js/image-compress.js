/**
 * ضغطُ الصور قبل الحفظ
 * =====================================================================
 * المعلّم يصوّر شهادته بجوّاله أو يأخذ لقطةَ شاشة، فتصل صورةٌ من خمسة إلى
 * خمسةَ عشرَ ميجابايت. وكانت تُحفظ **كما هي**، ثمّ تُرمَّز نصّاً (base64)
 * فتنتفخ ثلثاً آخر، ثمّ تُرفع وتُنزَّل مع صفّ ملفّ الإنجاز كلَّ مرّة.
 *
 * وقياسٌ على قاعدة المشروع (٢٦ أغسطس ٢٠٢٦): **ثلاثُ صورٍ PNG = ١٧ ميجابايت**
 * في صفِّ معلّمٍ واحد — و٩٦٪ من حجم الجدول كلِّه صورٌ لا مستندات.
 *
 * فتُعاد الصورةُ هنا إلى مقاسٍ يكفي الطباعةَ ولا يزيد: ٢٠٠٠ بكسل لأطول
 * ضلع (أعلى من دقّة A4 عند ١٧٠ نقطة/بوصة)، وJPEG بجودة ٠٫٨٢. فتنزل
 * الصورةُ من ~٥٫٧ ميجابايت إلى ~٣٠٠ كيلوبايت — عشرون ضعفاً — بلا فرقٍ
 * يُرى في الورق.
 *
 * ── قواعدُ لا تُخالف ──
 * • **لا يُفسد شيئاً أبداً.** كلُّ خطأٍ يُبتلع ويُعاد الملفُّ الأصليّ كما
 *   هو. ضغطُ صورةٍ ليس سبباً كافياً ليخسر المعلّم شهادته.
 * • **لا يكبّر ولا يُنقص جودةً بلا مقابل.** إن لم يوفّر عُشرَ الحجم على
 *   الأقلّ، يُعاد الأصل.
 * • **لا يمسّ ما ليس صورةً** — PDF يمرّ كما هو.
 * • **ولا يمسّ GIF** — إعادةُ ترميزه تقتل حركتَه.
 * • **ودورانُ الجوّال محفوظ**: صورةُ الآيفون تحمل اتّجاهها في EXIF، ورسمُها
 *   على canvas بلا مراعاته يقلبها على جنبها. فيُطلب الاتّجاه من الصورة
 *   صراحةً، وللمتصفّحات التي لا تعرف هذا الخيار مسارٌ ثانٍ عبر <img>
 *   (وهو يراعي الاتّجاه من تلقائه في متصفّحات اليوم).
 * =====================================================================
 */
(function (global) {
    'use strict';

    /** أطولُ ضلعٍ بعد التصغير. A4 عند ١٧٠ نقطة/بوصة ≈ ١٩٨٠ بكسل. */
    const MAX_EDGE = 2000;

    /** جودةُ JPEG — ٠٫٨٢ حدُّ ما لا يُرى فرقُه في نصٍّ ممسوح. */
    const QUALITY = 0.82;

    /** أقلُّ توفيرٍ يستحقّ استبدالَ الأصل. */
    const MIN_GAIN = 0.10;

    /** ما دون هذا لا يستحقّ عناءً أصلاً. */
    const SKIP_UNDER = 300 * 1024;

    const isImage = (f) => !!f && typeof f.type === 'string' && f.type.startsWith('image/');
    const isGif   = (f) => !!f && f.type === 'image/gif';

    /** يفكّ الصورةَ إلى شيءٍ يُرسم — مع مراعاة اتّجاه EXIF ما أمكن. */
    async function decode(file) {
        if (typeof global.createImageBitmap === 'function') {
            try {
                return await global.createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (e) {
                try { return await global.createImageBitmap(file); } catch (e2) { /* إلى <img> */ }
            }
        }
        return await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر فكُّ الصورة')); };
            img.src = url;
        });
    }

    const widthOf  = (src) => src.width  || src.naturalWidth  || 0;
    const heightOf = (src) => src.height || src.naturalHeight || 0;

    function toBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
            else resolve(null);
        });
    }

    /** الاسمُ بعد تحويل الصيغة: صورة.png ← صورة.jpg */
    function jpegName(name) {
        const base = String(name || 'صورة').replace(/\.[^.]+$/, '');
        return base + '.jpg';
    }

    /**
     * يُصغّر الصورةَ ويُعيد ترميزها JPEG.
     * @param {File|Blob} file
     * @returns {Promise<File|Blob>} الملفُّ المضغوط، **أو الأصلُ نفسُه**
     *          إن لم يكن صورةً، أو فشل الضغط، أو لم يوفّر شيئاً يُذكر.
     */
    async function compress(file) {
        try {
            if (!isImage(file) || isGif(file)) return file;
            if (file.size <= SKIP_UNDER) return file;

            const src = await decode(file);
            const w0  = widthOf(src);
            const h0  = heightOf(src);
            if (!w0 || !h0) return file;

            /* لا تكبير: الصورةُ الصغيرة تبقى بمقاسها، وتُعاد ترميزاً فقط
               إن كان ذلك يوفّر (PNG كبيرٌ بأبعادٍ صغيرة مثلاً). */
            const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
            const w = Math.max(1, Math.round(w0 * scale));
            const h = Math.max(1, Math.round(h0 * scale));

            const canvas = document.createElement('canvas');
            canvas.width  = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return file;

            /* JPEG بلا شفافية: ما كان شفّافاً يصير أسودَ إن لم يُملأ.
               والأبيضُ هو المتوقَّع في مستندٍ ممسوح. */
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src, 0, 0, w, h);

            if (src.close) { try { src.close(); } catch (e) { /* لا يضرّ */ } }

            const blob = await toBlob(canvas, 'image/jpeg', QUALITY);
            canvas.width = canvas.height = 0;   /* تحريرُ الذاكرة على الجوّال */

            if (!blob || !blob.size) return file;
            if (blob.size > file.size * (1 - MIN_GAIN)) return file;   /* لا مقابل */

            const name = jpegName(file.name);
            try {
                return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
            } catch (e) {
                /* متصفّحاتٌ قديمة لا تبني File — الـBlob يكفي، ونُلحق الاسم. */
                try { blob.name = name; } catch (e2) { /* للقراءة فقط أحياناً */ }
                return blob;
            }
        } catch (e) {
            console.warn('[ImageCompress] تعذّر الضغط، يُحفظ الأصل:', e && e.message);
            return file;
        }
    }

    global.ImageCompress = { compress, MAX_EDGE, QUALITY };
})(window);
