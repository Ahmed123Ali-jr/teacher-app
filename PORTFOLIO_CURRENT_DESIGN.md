# تقرير التصميم الحالي لملف الإنجاز (Portfolio)

> هذا التقرير وصف فني محايد للحالة الحالية لشاشة "ملف الإنجاز" في تطبيق المعلم الذكي،
> الهدف منه: تقييم خارجي وتطوير التصميم. **لا يحتوي اقتراحات تطويرية** — توصيف فقط.

---

## ١. نظرة عامة على ملف الإنجاز

### الملفات المسؤولة عن التصميم

| النوع | المسار | الوصف |
|---|---|---|
| JS رئيسي | `teacher_app/js/views/portfolio.js` | الواجهة الرئيسية + ٧ من ١٠ أقسام |
| JS تابع | `teacher_app/js/views/portfolio-strategies.js` | قسم استراتيجيات التدريس (يستدعى من الرئيسي) |
| JS تابع | `teacher_app/js/views/portfolio-initiatives.js` | قسم المبادرات |
| JS طباعة | `teacher_app/js/print-exam.js` و `teacher_app/js/print-portfolio.js` | بناء وثيقة الطباعة كاملة |
| CSS رئيسي | `teacher_app/css/views.css` (الأسطر ~١٦٨٠ – ١٨٥٥ و ٢٢٣٠+ للجوال) | تنسيق ملف الإنجاز |
| CSS طباعة | `teacher_app/css/print.css` (مرتبط بـ `media="print"`) | تنسيق وثيقة الطباعة |
| نقاط التصميم | `teacher_app/css/main.css` (الأسطر ٦–٨٠) | متغيرات الألوان/الخطوط/المسافات |
| HTML | `teacher_app/index.html` (السطر `<section id="view-portfolio" hidden>`) | حاوية فارغة تُحقن فيها الواجهة من JS |

### عدد الأقسام الموجودة فعلياً

**عشرة أقسام ثابتة** + **عدد لا محدود من الأقسام المخصصة** يضيفها المعلم بنفسه.

الأقسام الثابتة (مُعرّفة في مصفوفة `SECTIONS` في `portfolio.js:34`):

```js
const SECTIONS = [
    { key: 'personal',    title: 'البيانات الشخصية',       icon: '👤', auto: false },
    { key: 'certificates',title: 'الشهادات والرخصة المهنية', icon: '🏆', auto: false },
    { key: 'mission',     title: 'الرسالة والرؤية',        icon: '🎯', auto: false },
    { key: 'schedules',   title: 'الجداول وتوزيع المنهج',   icon: '📅', auto: false },
    { key: 'exams',       title: 'الاختبارات',             icon: '📝', auto: true },
    { key: 'worksheets',  title: 'أوراق العمل',            icon: '📄', auto: true },
    { key: 'homework',    title: 'الواجبات',               icon: '📚', auto: true },
    { key: 'strategies',  title: 'استراتيجيات التدريس',     icon: '🎯', auto: false, star: true },
    { key: 'initiatives', title: 'المبادرات',              icon: '🌟', auto: false, star: true },
    { key: 'extras',      title: 'صور ومرفقات إضافية',     icon: '📎', auto: false }
];
```

### بنية التصفح بين الأقسام

**Accordion (طي/فتح عمودي).** كل قسم زر واحد، الضغط عليه يفتح القسم ويغلق غيره.
الحالة محفوظة في متغيّر `state.openSection` داخل المغلّف الوظيفي (IIFE)، وتُعاد بناء
الواجهة كلها عند كل تبديل (`render()` يُستدعى من جديد).

```js
const state = { openSection: 'personal' };  // الافتراضي: البيانات الشخصية مفتوحة

container.querySelectorAll('[data-section-toggle]').forEach((header) => {
    header.addEventListener('click', async () => {
        const key = header.dataset.sectionToggle;
        state.openSection = state.openSection === key ? null : key;
        await render(container);
    });
});
```

### شكل الواجهة الرئيسية

ترتيب العناصر من أعلى لأسفل:

1. **شريط رأسي**: زر "← الرئيسية" + عنوان "📁 ملف الإنجاز" + زر "🖨️ طباعة الملف كاملاً".
2. **بطاقة المعلم** (`portfolio-header`): صورة شخصية دائرية + اسم المعلم + المدرسة والمواد +
   شريط إحصاءات (📝 ٣ اختبار · 📄 ٢ ورقة · 📚 ١ واجب · 🎯 ٢ استراتيجية · 🌟 ١ مبادرة).
3. **قائمة الأقسام العشرة** (`portfolio-sections`): كل قسم بطاقة accordion فيها أيقونة + عنوان
   + شارة عدد + شارة "تلقائي" أو "⭐ مميزة" + سهم.
4. **قائمة الأقسام المخصصة** (إن وُجدت): نفس شكل الـaccordion.
5. **زر "+ إضافة قسم جديد"** يميناً تحت القائمة.

العرض الأقصى للحاوية: `max-width: 980px`.

---

## ٢. تفاصيل كل قسم

### القسم ١ — البيانات الشخصية

| الخاصية | القيمة |
|---|---|
| `key` | `personal` |
| الملف | `portfolio.js`، الدالة `renderPersonal()` |
| الكلاسات | `info-table-compact` |
| شكل العرض | جدول بصفّين (وصف ⇽ قيمة) |
| المعلومات | ٩ حقول: الاسم، التخصص، المؤهل، سنوات الخبرة، المدرسة، السجل المدني، الجوال، البريد، المواد |
| Empty State | علامة "—" رمادية في الخلية إن كان الحقل فارغاً |
| زر إضافة | لا يوجد — البيانات تُدار من شاشة "بياناتي" المنفصلة |

ملاحظة: مصدر البيانات هو سجل المعلم في جدول `teachers`، والقيم القديمة من `portfolio.personal`
تُستخدم كـfallback فقط.

### القسم ٢ — الشهادات والرخصة المهنية

| الخاصية | القيمة |
|---|---|
| `key` | `certificates` |
| الملف | `portfolio.js`، يُدار عبر `renderFileList()` العامة |
| الكلاسات | `file-list`, `file-card`, `file-icon`, `file-body`, `file-name`, `file-meta`, `file-actions` |
| شكل العرض | قائمة عمودية من البطاقات الأفقية |
| المعلومات في كل بطاقة | الأيقونة 🏆 + الاسم + التصنيف (Badge) + التاريخ + حجم الملف |
| Empty State | فقرة نصية: "لا توجد شهادات بعد." |
| زر الإضافة | `+ إضافة شهادة` في أعلى القسم — يفتح modal للنموذج |
| الإجراءات في كل بطاقة | ⬇️ تنزيل (إن وُجد ملف) · ✏️ تعديل · 🗑️ حذف |

نموذج الإضافة (modal) يحتوي: اسم * + النوع/التصنيف + التاريخ + ملف (PDF أو صورة، اختياري) +
ملاحظات. حد الحجم: **١٥MB للصور، ٣٠MB للمستندات**.

### القسم ٣ — الرسالة والرؤية

| الخاصية | القيمة |
|---|---|
| `key` | `mission` |
| الملف | `portfolio.js`، الدالة `renderMission()` |
| الكلاسات | `field`, `label`, `textarea` (نموذج عادي) |
| شكل العرض | ثلاثة حقول textarea: الرسالة، الرؤية، الأهداف المهنية |
| Empty State | الحقول فارغة + placeholder ("رسالتي التربوية...") |
| زر الإضافة | `✨ توليد بالذكاء الاصطناعي` فوق + `💾 حفظ` تحت الحقول |

التوليد بالذكاء الاصطناعي يفتح modal ثاني يطلب: قيم، تركيز، سنوات خبرة، مراحل، ملاحظات →
يُولّد ثم يملأ الحقول. الحفظ يخزن `mission`/`vision`/`goals` على `portfolio`.

### القسم ٤ — الجداول وتوزيع المنهج

| الخاصية | القيمة |
|---|---|
| `key` | `schedules` |
| الملف | `portfolio.js`، الدالة `renderSchedules()` |
| الكلاسات | `students-table`, `table-wrapper` لجدول الفصول + `file-list` للمرفقات |
| شكل العرض | جدول الفصول التلقائي + قائمة ملفات يدوية تحته |
| المعلومات | ملخص فصول المعلم (المرحلة، الصف، الشعبة، المادة، عدد الطلاب) — تلقائي من جدول `classes` |
| Empty State | "لم تُضف فصولاً بعد..." + قائمة الملفات الفارغة "لا توجد ملفات بعد." |
| زر الإضافة | `+ إضافة ملف` (لرفع الجدول الأسبوعي وتوزيع المنهج) |

### القسمان ٥ و ٦ و ٧ — الاختبارات / أوراق العمل / الواجبات (تلقائية)

| الخاصية | القيمة |
|---|---|
| `key` | `exams`, `worksheets`, `homework` |
| الملف | `portfolio.js`، الدالة `renderAutoList()` |
| الكلاسات | `auto-list`, `auto-item` |
| شكل العرض | قائمة عناصر بسيطة (عنوان + تفاصيل + تاريخ) |
| Empty State | "لا يوجد بعد — ستظهر هنا تلقائياً بمجرّد إنشائها من شاشة الفصل." |
| زر الإضافة | **لا يوجد** — تُملأ تلقائياً من شاشة الفصل |

في رأس القسم تظهر شارة "تلقائي" زرقاء.

### القسم ٨ — استراتيجيات التدريس ⭐ (مميزة، AI)

| الخاصية | القيمة |
|---|---|
| `key` | `strategies` |
| الملف | `portfolio-strategies.js` (مستقل) |
| الكلاسات | `portfolio-card`, `portfolio-card-header`, `portfolio-card-meta`, `badge` |
| شكل العرض | بطاقات `portfolio-card` عمودية |
| المعلومات في كل بطاقة | الاسم + 📅 تاريخ + 📚 الفصل + 📖 الدرس + 🖼️ عدد الصور + شارة "✓ تقرير جاهز" أو "بلا تقرير" |
| Empty State | "لا توجد استراتيجيات بعد. أضف أول استراتيجية طبّقتها مع صور التنفيذ وسيصنع الذكاء الاصطناعي تقريراً احترافياً." |
| زر الإضافة | `+ إضافة استراتيجية` |
| الإجراءات | 👁️ عرض · ✏️ تعديل · 🗑️ حذف |

نموذج الإضافة من خطوتين:
- **الخطوة ١**: الاسم، التاريخ، الفصل، الدرس، وصف، صور (حتى ٥) → زر "✨ توليد التقرير".
- **الخطوة ٢**: تعديل التقرير المُولَّد (مقدمة، وصف، خطوات، أثر، توصيات) → "💾 حفظ في الملف".

### القسم ٩ — المبادرات ⭐ (مميزة، AI)

| الخاصية | القيمة |
|---|---|
| `key` | `initiatives` |
| الملف | `portfolio-initiatives.js` (مستقل) |
| الكلاسات | نفس استراتيجيات التدريس |
| شكل العرض | بطاقات `portfolio-card` |
| المعلومات في كل بطاقة | الاسم + 📅 تاريخ + 🎯 فئة مستهدفة + 👥 عدد المستفيدين + 🖼️ عدد الصور + شارة "✓ تقرير" |
| Empty State | "لا توجد مبادرات بعد. أضف مبادرتك التربوية وسيصنع الذكاء الاصطناعي تقريراً احترافياً لها." |
| زر الإضافة | `+ إضافة مبادرة` |

نموذج مماثل للاستراتيجيات بحقول مختلفة: الفئة المستهدفة، عدد المستفيدين، أهداف، تنفيذ،
نتائج، أثر.

### القسم ١٠ — صور ومرفقات إضافية

| الخاصية | القيمة |
|---|---|
| `key` | `extras` |
| الملف | `portfolio.js`، يستخدم `renderFileList()` |
| الكلاسات | نفس الشهادات (`file-card` etc.) |
| شكل العرض | قائمة بطاقات ملفات أفقية، الأيقونة 📎 |
| Empty State | "لا توجد ملفات بعد." |
| زر الإضافة | `+ إضافة ملف` |

### الأقسام المخصصة (Custom Sections)

| الخاصية | القيمة |
|---|---|
| `key` | `custom_<id>` (تُولَّد عشوائياً) |
| التخزين | `portfolio.custom_sections: [{ id, name, icon, items: [...] }]` |
| الملف | `portfolio.js`، الدوال `customSectionHeader()`, `renderCustomSection()`, `openCustomSectionForm()`, `openCustomItemForm()` |
| شكل العرض | accordion كباقي الأقسام، داخله قائمة ملفات + أزرار "إعادة تسمية" و"حذف القسم" |
| الإضافة | زر `+ إضافة قسم جديد` خارج قائمة الأقسام، يطلب اسم وإيموجي اختياري |

---

## ٣. تصميم البطاقات والعناصر

### بطاقة الشهادة / الملف العام (`.file-card`)

CSS كامل من `views.css:1805`:

```css
.file-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);          /* 12px */
    padding: var(--space-3) var(--space-4);
    background: var(--surface);    /* #FFFFFF */
    border: 1px solid var(--border);  /* #E2E8F0 */
    border-radius: var(--radius-md);   /* 12px */
}
.file-icon { font-size: 28px; line-height: 1; flex-shrink: 0; }
.file-body { flex: 1; min-width: 0; }
.file-name { font-weight: var(--fw-medium); }
.file-meta {
    font-size: var(--fs-sm);       /* 14px */
    color: var(--text-muted);      /* #64748B */
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    align-items: center;
    margin-top: var(--space-1);
}
.file-actions { display: flex; gap: var(--space-1); flex-shrink: 0; }
```

HTML المُولَّد لشهادة:

```html
<div class="file-card">
    <div class="file-icon">🏆</div>
    <div class="file-body">
        <div class="file-name">رخصة المعلم</div>
        <div class="file-meta">
            <span class="badge badge-muted">رخصة</span>
            <span>📅 ١ ينا ٢٠٢٤</span>
            <span>2.3 MB</span>
        </div>
    </div>
    <div class="file-actions">
        <button class="btn btn-ghost btn-sm" data-file-download="0">⬇️</button>
        <button class="btn btn-ghost btn-sm" data-file-edit="0">✏️</button>
        <button class="btn btn-ghost btn-sm" data-file-del="0">🗑️</button>
    </div>
</div>
```

### بطاقة الاستراتيجية / المبادرة (`.portfolio-card`)

CSS من `views.css:1773`:

```css
.portfolio-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-4);             /* 16px */
    margin-bottom: var(--space-3);
}
.portfolio-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
}
.portfolio-card-header h4 { margin: 0; }
.portfolio-card-meta {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--fs-sm);
    color: var(--text-muted);
    align-items: center;
}
```

HTML لاستراتيجية:

```html
<article class="portfolio-card">
    <div class="portfolio-card-header">
        <h4>التعلم التعاوني</h4>
        <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" data-strat-view="abc">👁️</button>
            <button class="btn btn-ghost btn-sm" data-strat-edit="abc">✏️</button>
            <button class="btn btn-ghost btn-sm" data-strat-del="abc">🗑️</button>
        </div>
    </div>
    <div class="portfolio-card-meta">
        <span>📅 ١٥ مار ٢٠٢٥</span>
        <span>📚 الثاني / ب — رياضيات</span>
        <span>📖 المعادلات</span>
        <span>🖼️ ٣ صور</span>
        <span class="badge badge-success">✓ تقرير جاهز</span>
    </div>
</article>
```

### عرض الصور المرفوعة (في معاينة الاستراتيجية/المبادرة)

CSS من `views.css:1842`:

```css
.image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-2);
}
.image-grid img {
    width: 100%;
    height: 140px;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
}
```

شبكة مرنة متجاوبة (مربعات ١٤٠ بكسل، تتمدّد لملء المساحة).

### عرض ملفات الـ PDF (في الواجهة)

في الواجهة الرئيسية، ملف PDF يُعرض في `.file-card` كأي ملف آخر — أيقونة 📎/🏆 + اسم +
حجم + أزرار. **لا توجد معاينة مرئية للـPDF في الواجهة.** المعاينة تظهر فقط في الطباعة
(انظر القسم ٥).

### عرض رأس القسم (Accordion)

```css
.portfolio-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    transition: box-shadow var(--dur-fast) var(--ease);
}
.portfolio-section.is-open {
    box-shadow: var(--shadow);
    border-color: var(--primary-light);   /* تظهر الحدود زرقاء عند الفتح */
}
.portfolio-section-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: transparent;
    border: 0;
    cursor: pointer;
    text-align: right;
    font-family: inherit;
    font-size: var(--fs-body);
    transition: background var(--dur-fast) var(--ease);
}
.portfolio-section-header:hover { background: var(--surface-alt); }
.portfolio-icon { font-size: 22px; }
.portfolio-title { font-weight: var(--fw-bold); font-size: var(--fs-lg); flex: 1; }
.portfolio-chev { margin-right: auto; font-size: 14px; color: var(--text-muted); }
.portfolio-section.is-open .portfolio-chev { color: var(--primary); }
.portfolio-section-body {
    padding: var(--space-5) var(--space-5) var(--space-6);
    border-top: 1px solid var(--border);
    background: var(--surface-alt);     /* خلفية رمادية فاتحة جداً */
}
```

HTML رأس قسم:

```html
<div class="portfolio-section is-open">
    <button class="portfolio-section-header" data-section-toggle="certificates">
        <span class="portfolio-icon">🏆</span>
        <span class="portfolio-title">الشهادات والرخصة المهنية</span>
        <span class="badge badge-muted">3</span>
        <span class="portfolio-chev">▼</span>
    </button>
    <div class="portfolio-section-body" data-section-body="certificates"></div>
</div>
```

### بطاقة المعلم في رأس الصفحة (`.portfolio-header`)

```css
.portfolio-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
}
.portfolio-avatar {
    width: 72px; height: 72px;
    border-radius: var(--radius-full);
    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
    color: var(--text-inverse);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
    font-weight: var(--fw-bold);
    flex-shrink: 0;
}
.portfolio-stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: var(--fs-sm);
    margin-top: var(--space-2);
    color: var(--text-muted);
}
```

---

## ٤. الألوان والخطوط الحالية

### الألوان (من `main.css:6`)

| المتغيّر | القيمة | الاستخدام |
|---|---|---|
| `--primary` | `#1E40AF` (أزرق غامق) | عناوين الأقسام، الأزرار، السهم المفتوح |
| `--primary-light` | `#3B82F6` | تدرج الصورة الشخصية، حدود الـaccordion المفتوح |
| `--primary-dark` | `#1E3A8A` | غير مستخدم في الـportfolio مباشرة |
| `--accent` | `#0EA5E9` | غير مستخدم في الـportfolio |
| `--success` | `#10B981` (أخضر) | شارة "✓ تقرير جاهز" |
| `--warning` | `#F59E0B` (برتقالي) | شارة "بلا تقرير" + رسالة الملف الفاسد |
| `--danger` | `#EF4444` | غير مستخدم بشكل بارز |
| `--bg` | `#F8FAFC` | خلفية الشاشة |
| `--surface` | `#FFFFFF` | البطاقات والأقسام |
| `--surface-alt` | `#F1F5F9` | خلفية جسم القسم المفتوح |
| `--text` | `#0F172A` | النص الأساسي |
| `--text-muted` | `#64748B` | البيانات الثانوية والتواريخ |
| `--border` | `#E2E8F0` | حدود البطاقات والأقسام |
| `--border-strong` | `#CBD5E1` | حدود الجداول |

### الخطوط

- العائلة: **Tajawal** (محمّل من Google Fonts)، الأوزان: 400 / 500 / 700 / 900.
- الاتجاه: RTL على مستوى المستند (`<html dir="rtl">`).
- مقاييس الحجم:

| المتغيّر | الحجم | الاستخدام |
|---|---|---|
| `--fs-display` | 32px | غير مستخدم في الواجهة (للطباعة فقط) |
| `--fs-h1` | 24px | "📁 ملف الإنجاز" |
| `--fs-h2` | 20px | غير مستخدم بشكل بارز |
| `--fs-lg` | 18px | عناوين الأقسام (`.portfolio-title`) |
| `--fs-body` | 16px | نصوص رؤوس الأقسام والمحتوى |
| `--fs-sm` | 14px | البيانات الوصفية (تواريخ، أحجام) |
| `--fs-xs` | 12px | غير مستخدم في الـportfolio |

### المسافات (`--space-*`)

سلم خطي: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px.
- المسافة بين الأقسام: `--space-2` = 8px.
- داخل القسم (padding البدن): `--space-5` = 20px.
- بين البطاقات: `--space-3` = 12px.

### الـRadii والـShadows

```css
--radius-sm:  8px;   /* الصور في الشبكة */
--radius-md: 12px;   /* البطاقات والأقسام */
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;  /* الصورة الشخصية */

--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);   /* القسم عند hover */
--shadow:    0 4px 6px rgba(0, 0, 0, 0.07);   /* القسم المفتوح */
--shadow-md: 0 10px 15px rgba(0, 0, 0, 0.10);
--shadow-lg: 0 20px 25px rgba(0, 0, 0, 0.10);
```

### الحركة

```css
--ease: cubic-bezier(0.4, 0, 0.2, 1);
--dur-fast: 150ms;     /* hover, تغيير الخلفية */
--dur-base: 250ms;
--dur-slow: 400ms;
```

---

## ٥. الطباعة (Print)

### الملف المسؤول

`teacher_app/js/print-portfolio.js` (~370 سطراً)، يُصدِّر `window.PrintPortfolio.print(ctx)`.
الـCSS الخاص بالطباعة في `teacher_app/css/print.css` (مرتبط بـ`media="print"` في `index.html`).

### آلية الطباعة

عند الضغط على "🖨️ طباعة الملف كاملاً":

1. تُجمع البيانات (المعلم، البورتفوليو، الفصول، الاستراتيجيات...) من حالة الواجهة.
2. تُنشأ Object URLs لصور الاستراتيجيات والمبادرات.
3. تُحوّل المرفقات (الصور والـPDFs) إلى صور inline:
   - الصور: `FileReader → dataURL`.
   - PDFs: تُحمَّل **مكتبة PDF.js من CDN ديناميكياً**، وكل صفحة تُرسم على `<canvas>` ثم تُحوَّل
     إلى JPEG بـ 85٪ جودة.
4. يُبنى HTML كامل في عنصر `#print-root` يُضاف لجسم المستند.
5. تُضاف `body.is-printing` فتُخفي شاشة التطبيق وتُظهر `#print-root` فقط.
6. يُستدعى `window.print()`.
7. عند `afterprint`: تُنزع الفئة، وتُحرَّر الـObject URLs.

### بنية وثيقة الطباعة (بالترتيب)

| ١ | الغلاف (Cover) | شعار/أيقونة 🎓 + "ملف الإنجاز المهني" + اسم المعلم + المدرسة + المواد + السنة الدراسية + التاريخ + اسم المدير |
| ٢ | الفهرس (TOC) | قائمة مرقّمة لكل الأقسام مع أعداد العناصر |
| ٣ | البيانات الشخصية | جدول `info-table` |
| ٤ | الشهادات | جدول الميتاداتا + كل شهادة كصفحة كاملة (صورة/PDF) |
| ٥ | الرسالة والرؤية | فقرات نصية |
| ٦ | الجداول وتوزيع المنهج | جدول الفصول + الملفات |
| ٧ | الاختبارات | جدول العنوان/التفاصيل/التاريخ |
| ٨ | أوراق العمل | نفس الشكل |
| ٩ | الواجبات | نفس الشكل |
| ١٠ | استراتيجيات التدريس | لكل استراتيجية: عنوان + ميتا + أقسام التقرير + شبكة الصور |
| ١١ | المبادرات | نفس الشكل |
| ١٢ | صور ومرفقات إضافية | كباقي الملفات |
| ١٣+ | الأقسام المخصصة | كباقي الملفات |

### فواصل الصفحات

- بين كل قسم: `<div class="page-break"></div>` يصدر `page-break-after: always`.
- كل مرفق (صورة أو صفحة PDF) في **صفحة طباعة منفصلة** عبر:
  ```css
  page-break-before: always;
  page-break-after:  always;
  page-break-inside: avoid;
  ```
- حد ارتفاع الصورة الواحدة: `max-height: 220mm` (مع عنوان) أو `230mm` (بدون عنوان)،
  `max-width: 175mm`. منطقة محتوى A4 = 180×261mm بعد الهوامش.

### تنسيق الغلاف والفهرس

من `print.css:310`:

```css
.portfolio-cover {
    text-align: center;
    padding-top: 50mm;
    min-height: 250mm;
}
.cover-title {
    font-size: 32pt;
    color: #1E40AF;
}
.cover-meta {
    font-size: 13pt;
    line-height: 2.2;
}
.toc {
    font-size: 13pt;
    line-height: 2.2;
    padding-right: 10mm;
}
.portfolio-section-heading {
    display: flex;
    align-items: center;
    gap: 6mm;
    border-bottom: 2px solid #1E40AF;
    padding-bottom: 4mm;
    margin-bottom: 8mm;
}
.portfolio-section-heading .section-number {
    width: 14mm;
    height: 14mm;
    border-radius: 50%;
    background: #1E40AF;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 16pt;
}
```

### إعدادات الصفحة

```css
@page {
    size: A4;
    margin: 18mm 15mm;
}
```

---

## ٦. ميزات إضافية موجودة

### توليد بالذكاء الاصطناعي

- **الرسالة والرؤية**: نموذج يجمع قيم/تركيز/خبرة/مراحل ثم يولّد ٣ نصوص (رسالة، رؤية، أهداف).
- **استراتيجيات التدريس**: يستلم اسم/تاريخ/فصل/درس/وصف/عدد صور ويرجع تقريراً من ٥ أقسام
  (مقدمة، وصف، خطوات، أثر، توصيات).
- **المبادرات**: مماثل، يرجع تقريراً من ٥ أقسام (مقدمة، أهداف، تنفيذ، نتائج، أثر).

كل توليد يُمرّر تعديلاً يدوياً قبل الحفظ النهائي (نموذج خطوتين).

### رفع الملفات

- يدعم **PDF + كل أنواع الصور** عبر `accept=".pdf,image/*"`.
- الحدود: ١٥MB للصور، ٣٠MB للمستندات.
- التخزين: يُحوَّل الملف إلى base64 (Data URL) داخل عمود `data` JSONB في جدول `portfolio` على
  Supabase. هذا يعني أن البورتفوليو كامل ملف JSON واحد، و**لا يُستخدم Supabase Storage**
  حالياً.

### الترتيب / البحث / الفلترة

- **الترتيب**: الاستراتيجيات والمبادرات تُرتَّب من الأحدث للأقدم (`(b.date || '').localeCompare(a.date)`).
- **البحث**: لا يوجد.
- **الفلترة**: لا توجد.
- **القوائم التلقائية** (اختبارات/أوراق عمل/واجبات): تُرتَّب من الأحدث للأقدم بـ`created_at`.

### التصدير

- **الطباعة الكاملة** عبر `window.print()` (يصدر PDF عبر مربع الحوار). لا يوجد تصدير
  مباشر إلى ملف PDF.
- **النسخ الاحتياطي العام للتطبيق**: `TeacherDB.exportAll()` و `importAll()` يدعمان
  البورتفوليو ضمن مخزن `portfolio`، لكنه **مع الملفات** (لأنها base64 الآن).

### العرض المنفصل

- لكل استراتيجية/مبادرة modal "عرض" (👁️) يُظهر التقرير كاملاً بصور التنفيذ في شبكة.
- الشهادات والملفات: زر تنزيل (⬇️) يُحفظ الـBlob للجهاز عبر `URL.createObjectURL`.

---

## ٧. المشاكل والقيود الحالية

> ملاحظات تقنية لاحظتها أثناء قراءة الكود — للسياق فقط.

### القيود الجوهرية

١. **حجم البورتفوليو محدود**: كل المرفقات تُخزَّن base64 داخل صف JSONB واحد. ٢-٣ ملفات PDF
   ثقيلة قد تتجاوز حدود طلب PostgREST. الحل الجذري: استخدام Supabase Storage. **لم يُطبَّق**.

٢. **الملفات القديمة تالفة**: قبل الإصلاح بتاريخ commit `d41335e`، كانت `JSON.stringify(Blob)`
   تنتج `{}`، فالملفات المرفوعة قبل ذلك التاريخ ضاعت محتوياتها (تبقى الميتاداتا فقط). الواجهة
   الحالية تُظهر رسالة "تعذّر عرض المحتوى — يُرجى إعادة رفعه" في الطباعة، لكن الواجهة الرئيسية
   لا تتنبّه لهذا.

٣. **زمن الطباعة طويل**: PDF.js تُحمَّل من CDN عند أول طباعة + كل صفحة PDF تُرسم على canvas. مع
   ١٠ ملفات PDF متوسطة (٥ صفحات لكل ملف) قد تستغرق ١٠+ ثوانٍ.

٤. **لا توجد معاينة في الواجهة**: المعلم لا يستطيع رؤية محتوى PDF أو الصورة قبل الطباعة.
   فقط أيقونة + اسم.

٥. **الصور في الاستراتيجيات/المبادرات تُحمَّل كـBlobs مباشرة** (ليس base64) — مما يعني أنها
   لا تُحفظ على السيرفر بشكل دائم. التحقق المطلوب: هل `TeacherDB.put('strategies', row)` يحوّلها؟
   حسب المراجعة الحالية: لا — يحفظ المصفوفة كما هي، فالـBlobs تنفقد بنفس آلية المشكلة الأصلية.

### قيود واجهة المستخدم

٦. **لا يوجد drag-and-drop** لرفع الملفات.
٧. **لا يمكن إعادة ترتيب** الأقسام أو الشهادات يدوياً.
٨. **شارة العدد في رأس القسم لا تتحدث فوراً** بعد إضافة عنصر — تتطلب re-render كامل للعداد.
٩. **التعديل المباشر inline** غير متاح للأقسام التلقائية والشهادات — كل تعديل يفتح modal.
١٠. **الأقسام المخصصة ليس لها أيقونة افتراضية** إن لم يُدخلها المعلم — تظهر بأيقونة 📂 fallback.
١١. **ميتاداتا الملف تظهر مرتين في الطباعة**: مرة في الجدول، ومرة كعنوان فوق الصورة المضمَّنة.

### قيود الطباعة

١٢. **بعض المتصفحات (Safari خصوصاً)** قد لا تطبّق `page-break-before: always` بدقة عند العناصر
    داخل flex containers.
١٣. **PDF.js يستخدم CDN خارجي** — في حالة عدم توفر إنترنت لا تعمل ميزة طباعة الـPDFs.
١٤. **لا يوجد رأس/تذييل صفحة موحّد** عبر الصفحات (أرقام الصفحات، اسم المعلم).

### قيود متعلقة بالـAI

١٥. **التوليد يحتاج اتصال إنترنت** — لا توجد حالة "غير متصل" واضحة.
١٦. **لا يمكن إعادة استخدام تقرير مولّد** كقالب لاستراتيجية مشابهة.
١٧. **لا يوجد تحكم في طول التقرير** أو لغته.

---

## ٨. أمثلة من الكود

### أ. مثال HTML لشهادة معروضة في الواجهة

من `portfolio.js:407` (دالة `fileCard`):

```js
return `
    <div class="file-card">
        <div class="file-icon">${icon}</div>
        <div class="file-body">
            <div class="file-name">${escapeHtml(item.name)}</div>
            <div class="file-meta">
                ${item.type ? `<span class="badge badge-muted">${escapeHtml(item.type)}</span>` : ''}
                ${item.date ? `<span>📅 ${formatDate(item.date)}</span>` : ''}
                ${item.file ? `<span>${formatSize(item.file.size)}</span>` : ''}
            </div>
        </div>
        <div class="file-actions">
            ${item.file ? `<button class="btn btn-ghost btn-sm" data-file-download="${i}">⬇️</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-file-edit="${i}">✏️</button>
            <button class="btn btn-ghost btn-sm" data-file-del="${i}">🗑️</button>
        </div>
    </div>
`;
```

### ب. مثال HTML لاستراتيجية معروضة

من `portfolio-strategies.js:64` (دالة `card`):

```js
return `
    <article class="portfolio-card">
        <div class="portfolio-card-header">
            <h4>${escapeHtml(s.name)}</h4>
            <div class="flex gap-2">
                <button class="btn btn-ghost btn-sm" data-strat-view="${s.id}" title="عرض التقرير">👁️</button>
                <button class="btn btn-ghost btn-sm" data-strat-edit="${s.id}" title="تعديل">✏️</button>
                <button class="btn btn-ghost btn-sm" data-strat-del="${s.id}" title="حذف">🗑️</button>
            </div>
        </div>
        <div class="portfolio-card-meta">
            <span>📅 ${formatDate(s.date)}</span>
            ${s.class_label ? `<span>📚 ${escapeHtml(s.class_label)}</span>` : ''}
            ${s.lesson ? `<span>📖 ${escapeHtml(s.lesson)}</span>` : ''}
            ${imgs ? `<span>🖼️ ${imgs} صور</span>` : ''}
            ${s.report ? '<span class="badge badge-success">✓ تقرير جاهز</span>' : '<span class="badge badge-warning">بلا تقرير</span>'}
        </div>
    </article>
`;
```

### ج. CSS كامل للبطاقة العامة المستخدمة في الـportfolio

```css
.portfolio-card {
    background: var(--surface);              /* #FFFFFF */
    border: 1px solid var(--border);          /* #E2E8F0 */
    border-radius: var(--radius-md);          /* 12px */
    padding: var(--space-4);                  /* 16px */
    margin-bottom: var(--space-3);            /* 12px */
}
.portfolio-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
}
.portfolio-card-header h4 { margin: 0; }    /* h4 ⇽ 18px / Tajawal 700 */
.portfolio-card-meta {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--fs-sm);                 /* 14px */
    color: var(--text-muted);                /* #64748B */
    align-items: center;
}
```

ملاحظة: لا توجد ظلال ولا hover effects على `.portfolio-card` نفسها — فقط على `.portfolio-section`
الحاوية.

### د. مثال لطريقة عرض القسم (header + content) كاملاً

من `portfolio.js:174` (دالة `sectionHeader`):

```js
function sectionHeader(section, counts, open) {
    const count = counts[section.key] ?? '';
    const badge = count !== '' ?
        `<span class="badge ${section.auto ? 'badge-info' : 'badge-muted'}">${count}</span>` : '';
    return `
        <div class="portfolio-section ${open ? 'is-open' : ''}">
            <button class="portfolio-section-header" data-section-toggle="${section.key}">
                <span class="portfolio-icon">${section.icon}</span>
                <span class="portfolio-title">${section.title}</span>
                ${section.star ? '<span class="badge badge-warning">⭐ مميزة</span>' : ''}
                ${section.auto ? '<span class="badge badge-info">تلقائي</span>' : ''}
                ${badge}
                <span class="portfolio-chev">${open ? '▼' : '◀'}</span>
            </button>
            <div class="portfolio-section-body" data-section-body="${section.key}" ${open ? '' : 'hidden'}></div>
        </div>
    `;
}
```

والمنطق الذي يُحقن المحتوى بعد البناء (`portfolio.js:146`):

```js
if (state.openSection) {
    const body = container.querySelector(`[data-section-body="${state.openSection}"]`);
    if (body) {
        await renderSectionBody(
            state.openSection, body, {
                teacher, portfolio, classes,
                exams: examsAll, worksheets: worksheetsAll, homework: homeworkAll,
                strategies, initiatives,
                refresh: () => render(container)
            }
        );
    }
}
```

والـdispatcher الذي يربط `key` القسم بدالة العرض (`portfolio.js:194`):

```js
async function renderSectionBody(key, body, ctx) {
    if (key && key.startsWith('custom_')) {
        const id = key.slice('custom_'.length);
        const sec = (ctx.portfolio.custom_sections || []).find((s) => s.id === id);
        if (sec) return renderCustomSection(body, ctx, sec);
        return;
    }
    switch (key) {
        case 'personal':    return renderPersonal(body, ctx);
        case 'certificates':return renderFileList(body, ctx, 'certificates', 'شهادة', '🏆');
        case 'mission':     return renderMission(body, ctx);
        case 'schedules':   return renderSchedules(body, ctx);
        case 'exams':       return renderAutoList(body, ctx.exams, 'exam');
        case 'worksheets':  return renderAutoList(body, ctx.worksheets, 'worksheet');
        case 'homework':    return renderAutoList(body, ctx.homework, 'homework');
        case 'strategies':  return global.PortfolioStrategies.render(body, ctx);
        case 'initiatives': return global.PortfolioInitiatives.render(body, ctx);
        case 'extras':      return renderFileList(body, ctx, 'extras', 'ملف', '📎');
    }
}
```

---

## ملاحظة ختامية

التقرير محايد ووصفي. التطبيق يستخدم vanilla JavaScript (لا React/Vue) مع IIFE pattern،
والـCSS يعتمد على CSS custom properties (متغيّرات) بدون preprocessor. بنية الملفات تفصل
بين العرض (views) والطباعة (print) والتصميم (design tokens)، مما يسهّل التطوير المستقل
لأي طبقة دون التأثير على الباقي.

تاريخ التقرير: ٢٠٢٦-٠٥-٠٣
