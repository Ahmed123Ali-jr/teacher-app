/**
 * view-loader.js — تحميلُ شاشةٍ عند الحاجة إليها لا عند فتح التطبيق.
 *
 * ── لماذا ──
 * كان الإقلاعُ ينزّل اثنين وخمسين ملفّاً (ميجابايت) قبل أن يرى المعلّم شيئاً،
 * وهو لا يفتح إلا شاشةً واحدة. فبقيت في الإقلاع شاشاتُ البداية وحدها،
 * وما عداها يُنزَّل حين يُطلب — ومرّةً واحدةً في الجلسة.
 *
 * ── مصدرُ النسخة واحدٌ لا اثنان ──
 * الوسومُ باقيةٌ في `index.html` بنوعٍ لا يعرفه المتصفّح
 * (`type="text/lazy-view"`) فلا يُنزّلها، ويقرأ منها المُحمِّلُ المسار
 * ورقمَ النسخة. فمن رفع رقماً هناك رفعه هنا بلا أن يدري — ولو كُتبت
 * الأرقامُ في هذا الملفّ لافترقت النسختان يوماً وما دُري لماذا.
 *
 * ── الاعتماد المتبادل ──
 * الشاشاتُ تنادي بعضها: الرئيسيةُ تقرأ حصّتَك القادمة من شاشة الجدول،
 * وصفحةُ الفصل تفتح تبويباتها. فلكلِّ شاشةٍ قائمةُ ما تحتاجه، وتُحمَّل
 * معها. والدوائرُ فيها محسوبة (الرئيسيةُ ↔ الفصول) فلا تدور الحلقة.
 */
(function (global) {
    'use strict';

    /* ما تحتاجه كلُّ شاشةٍ من شاشاتٍ أخرى — بأسماء ملفّاتها. */
    const NEEDS = {
        /* تبويباتُ الفصل تُنادى من داخله، فتأتي معه. وسجلُّ الطلاب داخله
           لا ملفَّ له. */
        'class':       ['class-exams', 'class-worksheets', 'class-homework',
                        'class-books', 'class-curriculum', 'class-strategies'],
        'portfolio':   ['portfolio-strategies', 'portfolio-initiatives'],
        /* «المبادرات» شاشةٌ في الموجّه بلا ملفٍّ خاص: تُرسم بمكوّن الإنجاز. */
        'initiatives': ['portfolio-initiatives'],
        'reports':     [],
        'help':        [],
        'shortcuts':   [],
        'student':     []
    };

    const _loaded  = Object.create(null);   // اسم الملفّ → true
    const _loading = Object.create(null);   // اسم الملفّ → وعد

    /** يقرأ وسمَ الشاشة المؤجَّلة من الصفحة — فيه المسار ورقم النسخة. */
    function tagOf(name) {
        return document.querySelector('script[type="text/lazy-view"][data-view="' + name + '"]');
    }

    function loadOne(name) {
        if (_loaded[name]) return Promise.resolve();
        if (_loading[name]) return _loading[name];

        const tag = tagOf(name);
        if (!tag) { _loaded[name] = true; return Promise.resolve(); }   // ليست مؤجَّلة أصلاً

        _loading[name] = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = tag.dataset.src;
            s.onload  = () => { _loaded[name] = true; resolve(); };
            s.onerror = () => reject(new Error('تعذّر تحميل شاشة: ' + name));
            document.head.appendChild(s);
        }).finally(() => { delete _loading[name]; });

        return _loading[name];
    }

    /** يحمّل شاشةً وما تحتاجه — مرّةً واحدة. */
    async function ensure(name) {
        const seen = Object.create(null);
        const list = [];
        (function walk(n) {
            if (seen[n]) return;
            seen[n] = true;
            list.push(n);
            (NEEDS[n] || []).forEach(walk);
        })(name);

        await Promise.all(list.map(loadOne));
    }

    global.ViewLoader = { ensure };
})(window);
