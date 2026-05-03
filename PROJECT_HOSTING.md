# تقرير الاستضافة والنشر — مشروع تطبيق المعلم الذكي

> تقرير وصفي للحالة الراهنة للنشر، التزامن، ومسارات العمل.
> تاريخ التقرير: ٢٠٢٦-٠٥-٠٣

---

## ١. حالة Git المحلية

### `git status`

```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	PORTFOLIO_CURRENT_DESIGN.md

nothing added to commit but untracked files present (use "git add" to track)
```

ملاحظة: الفرع `main` متزامن تماماً مع `origin/main`. الملف الوحيد غير المُتتبَّع هو
`PORTFOLIO_CURRENT_DESIGN.md` (تقرير التصميم الذي أنشئ في جلسة سابقة).

### `git log --oneline -20`

```
2393ce8 Portfolio print: visible placeholder for broken/legacy attachments
e6f827a Portfolio certificates form: same upload feedback as custom sections
4bc0db7 Portfolio file upload: visible feedback + raised size caps
57e977f Portfolio print: shrink attachment images to fit A4 reliably
ac10c9b Portfolio print: full-page wrappers for attachments
8c35474 Portfolio print: keep PDF page on single printed page
d41335e Portfolio: persist file blobs as base64 in Supabase
692259d Portfolio print: embed images and PDF pages inline
c95615f Portfolio: unlimited custom user-named sections
bd9df50 Column manager: read max from DOM on save
64b9f44 Profile: single Save button + add missing teacher columns
90775bd Add Service Worker for instant updates + offline support
d841563 class.js: commit /10 inputs on every keystroke, not just 'change'
9bd813e class.js: serialise register writes to fix data loss race
daa3f24 Disable browser cache for index.html so deploys take effect on first reload
47d364c Fix bulk student add: drop unknown 'photo' column, include teacher_id
f28fae4 Fix register: evaluations and attendance no longer wipe each other
1a2d217 Initial commit — Saudi teacher app with Supabase backend
```

١٨ commit إجمالاً، أحدثها `2393ce8`. كلهم على فرع `main` خط مستقيم بدون merges.

### `git branch -a`

```
* main
  remotes/origin/main
```

فرع وحيد محلياً (`main`) ومثيله البعيد (`origin/main`). **لا يوجد أي فرع آخر** —
محلي أو بعيد.

### `git remote -v`

```
origin	https://github.com/Ahmed123Ali-jr/teacher-app.git (fetch)
origin	https://github.com/Ahmed123Ali-jr/teacher-app.git (push)
```

### `git config --get remote.origin.url`

```
https://github.com/Ahmed123Ali-jr/teacher-app.git
```

---

## ٢. معلومات الـRepository على GitHub

### معلومات أساسية (من `gh repo view --json ...`)

| الحقل | القيمة |
|---|---|
| الاسم | `teacher-app` |
| المالك | `Ahmed123Ali-jr` |
| الرابط | https://github.com/Ahmed123Ali-jr/teacher-app |
| الوصف | "تطبيق المعلم الذكي — Saudi teacher app (Supabase + GitHub Pages)" |
| الفرع الافتراضي | `main` |
| الرؤية | **PUBLIC** (عام، يقدر أي شخص يطّلع على الكود) |
| تاريخ الإنشاء | 2026-04-26 |
| آخر push | 2026-05-03 18:56 UTC |
| Homepage URL | فارغ (غير مُعيَّن) |

### Pull Requests

`gh pr list --state all --limit 10` رجّع نتيجة فارغة → **لا يوجد أي PR** على المستودع
(لا مفتوحة ولا مغلقة). كل التغييرات تُدفع مباشرة على `main`.

### آخر Deployments (٥ نتائج)

| SHA | تاريخ الإنشاء | البيئة |
|---|---|---|
| `2393ce8` | 2026-05-03T18:56Z | github-pages |
| `e6f827a` | 2026-05-03T18:45Z | github-pages |
| `4bc0db7` | 2026-05-03T09:19Z | github-pages |
| `57e977f` | 2026-05-03T07:48Z | github-pages |
| `ac10c9b` | 2026-05-03T07:41Z | github-pages |

كلها بيئة `github-pages`. مُنفَّذة عبر `GitHub Actions`. **لا توجد بيئات أخرى** (مثل
`production`, `staging`, `preview`).

### آخر Workflow Runs

```
completed  success  Portfolio print: visible placeholder for broken/legacy attachments  22s  2026-05-03T18:56Z
completed  success  Portfolio certificates form: same upload feedback as custom sections 20s  2026-05-03T18:45Z
completed  success  Portfolio file upload: visible feedback + raised size caps          19s  2026-05-03T09:19Z
completed  success  Portfolio print: shrink attachment images to fit A4 reliably        17s  2026-05-03T07:48Z
completed  success  Portfolio print: full-page wrappers for attachments                 14s  2026-05-03T07:41Z
```

كل عمليات النشر الأخيرة **ناجحة**. الزمن: ١٤–٢٢ ثانية. أي فشل سابق يظهر هنا — لم تظهر أي
حالة `failure` في آخر ٥ runs.

### إعدادات GitHub Pages (من `gh api repos/.../pages`)

```json
{
    "url": ".../pages",
    "status": null,
    "cname": null,
    "custom_404": false,
    "html_url": "https://ahmed123ali-jr.github.io/teacher-app/",
    "build_type": "workflow",
    "source": { "branch": "main", "path": "/" },
    "public": true,
    "https_enforced": true
}
```

- **رابط الموقع المباشر**: https://ahmed123ali-jr.github.io/teacher-app/
- **HTTPS مُفعَّل إجبارياً** (`https_enforced: true`)
- **بدون نطاق مخصّص** (`cname: null`)
- **بدون صفحة 404 مخصّصة** (`custom_404: false`)
- **النشر عبر workflow** (`build_type: workflow`) — وليس عبر النشر المدمج التلقائي
  لـPages من المجلد. هذا يعني أن `deploy.yml` هو المصدر الوحيد للنشر.

---

## ٣. خدمات الاستضافة (Hosting)

### نتائج البحث

| الملف/المجلد | موجود؟ |
|---|---|
| `netlify.toml` | ❌ لا |
| `netlify.json` | ❌ لا |
| `vercel.json` | ❌ لا |
| `.vercel/` | ❌ لا |
| `.netlify/` | ❌ لا |
| `wrangler.toml` (Cloudflare) | ❌ لا |
| `_redirects` | ❌ لا |
| `_headers` | ❌ لا |
| `firebase.json` | ❌ لا |
| `.github/workflows/` | ✅ موجود — ملف واحد: `deploy.yml` |

**لا يوجد إلا GitHub Actions كأداة نشر**. لم تُستخدم أي خدمة استضافة بديلة (Netlify،
Vercel، Cloudflare Pages، Firebase Hosting) في أي وقت.

### محتوى `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Stamp build id into service worker
        run: sed -i "s/__BUILD_ID__/${GITHUB_SHA}/g" teacher_app/sw.js

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: teacher_app

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

### ملخّص الـworkflow

| الحقل | القيمة |
|---|---|
| المشغّلات | push على `main` + يدوي (`workflow_dispatch`) |
| الصلاحيات | قراءة المحتوى، كتابة الـPages، token الـID |
| التزامن | مجموعة `pages` — أي push جديد يُلغي الـrun السابق إن كان لم ينتهِ |
| الـrunner | `ubuntu-latest` |
| المسار المنشور | المجلد `teacher_app/` فقط (وليس جذر الـrepo) |
| خطوة فريدة | تحديث `__BUILD_ID__` داخل `sw.js` لـcommit SHA — يجبر المتصفحات على إنزال service worker جديد بعد كل deploy |

---

## ٤. ملفات إضافية مهمة

### `package.json`

❌ **غير موجود**. المشروع لا يستخدم Node/npm. التطبيق HTML/CSS/JS خام يخدم مباشرة.

### `.gitignore`

```gitignore
# macOS
.DS_Store
.AppleDouble
.LSOverride

# Editors
.vscode/
.idea/
*.swp
*.swo

# Node
node_modules/

# Local env / secrets
.env
.env.local
*.local
.claude/settings.local.json

# Backups & archives
*.zip
*.tar.gz
*.bak

# Logs
*.log

# Supabase CLI runtime
supabase/.temp/
supabase/.branches/
```

### `README.md`

```markdown
# تطبيق المعلم الذكي

تطبيق ويب للمعلمين السعوديين: تتبع الطلاب، توليد المحتوى بالذكاء الاصطناعي، وبناء ملف الإنجاز.

## التقنية

- HTML / CSS / JavaScript خام (بدون frameworks)
- Supabase — قاعدة البيانات والمصادقة
- Anthropic Claude — توليد المحتوى التعليمي
- GitHub Pages — الاستضافة

## التشغيل محلياً

cd teacher_app
python3 -m http.server 8000

ثم افتح http://localhost:8000.

## النشر

النشر تلقائي على GitHub Pages عند كل push للفرع main (انظر .github/workflows/deploy.yml).
```

### `.env.example`

❌ **غير موجود**. لا يوجد ملف نموذج للمتغيّرات البيئية.

ملاحظة: يبدو أن المفاتيح والأسرار يُتعامل معها بطريقتين:
1. **Supabase publishable key**: مكتوب صراحة في `teacher_app/js/supabase-client.js` (آمن
   للعرض، لا يحتوي صلاحيات إدارية).
2. **Anthropic API key**: لا يبدو أنه مدمج في الكود — يستوجب التحقق إن كان عبر Supabase
   Edge Function أو client-side.

---

## ٥. التحليل والاستنتاج

### ١) خدمة الاستضافة المُستخدَمة

**GitHub Pages** — مُؤكَّد من:
- ملف workflow `deploy.yml` يستخدم `actions/deploy-pages@v4`
- استجابة `gh api repos/.../pages` ترجع تكوين Pages فعّال
- لا توجد أي ملفات تكوين لخدمات بديلة

### ٢) الفرع المنشور

**`main`** — الفرع الوحيد الموجود محلياً وعن بُعد. كل push على `main` ينشر تلقائياً.

### ٣) النشر تلقائي أم يدوي؟

**تلقائي بالكامل** — `on: push: branches: [main]`. كل commit يُدفع على `main` يطلق الـ
workflow. **+ نشر يدوي مُتاح أيضاً** عبر `workflow_dispatch` لو احتيج.

### ٤) رابط الموقع المباشر

**https://ahmed123ali-jr.github.io/teacher-app/** (مُؤكَّد من `gh api .../pages`).
- HTTPS مُفعَّل إجبارياً
- لا يوجد custom domain

### ٥) Staging Environment

❌ **غير موجود**. كل التغييرات تذهب مباشرة لبيئة الإنتاج (`github-pages`). لا يوجد:
- فرع `staging` أو `develop`
- preview deployments على PRs (لا توجد PRs أصلاً)
- بيئة منفصلة على Netlify/Vercel

---

## ٦. توصيات للنسخ الاحتياطي والتطوير الآمن

### النسخ الاحتياطي

١. **GitHub نفسه نسخة احتياطية كاملة** — كل الكود محفوظ على `origin/main`.
٢. **النسخة المحلية** على `~/Desktop/teacher` نسخة ثانية متزامنة.
٣. **قاعدة البيانات (Supabase)** — منفصلة تماماً عن الـrepo. تحتاج نسخ احتياطي مستقل
   عبر Supabase dashboard أو `supabase db dump`.
٤. **migrations/** — موجودة في `supabase/migrations/` ضمن الـrepo، تُنشئ سكيمة قاعدة
   البيانات من الصفر. هذه نسخة احتياطية للسكيمة (لكن ليس للبيانات).
٥. **بيانات المستخدمين الحقيقية** غير محفوظة في الـrepo (محفوظة فقط على Supabase).
   يُوصى بجدولة نسخ احتياطية دورية (يومياً/أسبوعياً) من Supabase.

### التطوير الآمن (تجنّب التأثير على الموقع المباشر)

الوضع الحالي **يخلط بين التطوير والإنتاج** لأن:
- فرع وحيد (`main`)
- نشر تلقائي عند كل push
- لا staging

التجارب الآمنة تتطلّب أحد المسارين:

**المسار "أ" — استخدام branches (الأبسط)**:
1. عند بدء أي تجربة: `git checkout -b experiment/feature-name`
2. اعمل تعديلاتك واختبرها محلياً (`python3 -m http.server` داخل `teacher_app/`)
3. لو نجحت: `git checkout main && git merge experiment/feature-name && git push`
4. لو فشلت: `git branch -D experiment/feature-name` (حذف بدون أثر)

كذا، الـpush على `main` فقط هو الذي ينشر، وأي push على فروع أخرى **لا** يطلق الـworkflow
(مُحدَّد في `on: push: branches: [main]`).

**المسار "ب" — staging environment (أمتن للمشاريع الكبيرة)**:
- إنشاء فرع `staging`
- إضافة workflow ثانٍ ينشر `staging` على Netlify أو على رابط Pages بديل
- العمل دائماً على `staging` ثم merge لـ`main` بعد الاختبار

للحجم الحالي للمشروع (مستخدم رئيسي واحد على ما يبدو، تجارب فردية)، **المسار "أ" كافٍ
ومناسب**.

### استخدام Pull Requests

حالياً لا توجد أي PR. ميّزة الـPRs المهمّة في فريق فردي:
- **رؤية الـdiff قبل الدفع للإنتاج**
- **تشغيل تلقائي للـCI** (لو أُضيفت اختبارات لاحقاً)
- **توثيق التغييرات** بعنوان ووصف منفصل عن commit message
- **سهولة العودة (revert)** لو حدث خطأ

طريقة سريعة للاستفادة منها بدون تعقيد:
```bash
git checkout -b fix/something
# تعديلات...
git push -u origin fix/something
gh pr create --fill
gh pr merge --squash    # أو merge من واجهة GitHub بعد المراجعة
```

---

## ٧. أسئلة لتأكيد فهمي للوضع

١. **استخدام الموقع الفعلي**: هل في معلمين يستخدمون
   https://ahmed123ali-jr.github.io/teacher-app/ بشكل يومي حالياً؟ ولا أنت تختبره وحدك؟
   هذا يحدد مدى خطورة كل deploy.

٢. **بيانات حقيقية أم تجريبية**: المعلمون اللي يسجّلون دخول وبياناتهم الموجودة في Supabase —
   هل هي بيانات حقيقية لطلابهم/فصولهم، أم تجريبية تُحذَف لاحقاً؟

٣. **النسخ الاحتياطي لـSupabase**: هل تأخذ نسخ دورية من قاعدة البيانات (`supabase db
   dump` أو من الـdashboard)؟ ولا تعتمد على Supabase وحده؟

٤. **مفتاح Anthropic API**: وين يُحفَظ ويُستخدم؟
   - في الـclient مباشرة (مكشوف لكل مستخدم) — خطر أمني
   - في Supabase Edge Function (آمن)
   - في proxy خارجي
   - أم ميزة الـAI ما تُستخدم في الإنتاج بعد؟

٥. **الفروع**: هل ترتاح بفكرة العمل على فروع تجريبية ثم merge؟ ولا تفضّل البقاء على
   `main` مباشرة (مع وعي أن أي push ينشر فوراً)؟

٦. **النطاق المخصّص (Custom Domain)**: هل في خطة لاستخدام نطاق سعودي خاص (مثل
   `teacher.sa`) بدل `github.io`، أو الرابط الحالي يكفي؟

٧. **الاختبارات الآلية**: لا توجد حالياً. هل هذا مقصود (تطبيق صغير، اختبار يدوي يكفي) أم
   شيء تبي تضيفه لاحقاً؟

٨. **PWA / الخدمة في الخلفية**: Service Worker مفعّل (`teacher_app/sw.js`). هل تنوي
   تحويل التطبيق إلى Progressive Web App قابل للتثبيت على شاشة الجوال؟

---

## ملخّص تنفيذي

| العنصر | الحالة |
|---|---|
| **خدمة الاستضافة** | GitHub Pages |
| **رابط الموقع** | https://ahmed123ali-jr.github.io/teacher-app/ |
| **الفرع المنشور** | `main` |
| **آلية النشر** | تلقائية عبر GitHub Actions عند كل push |
| **مدة الـbuild** | ١٤–٢٢ ثانية |
| **الـStaging** | لا يوجد |
| **الفروع** | فرع واحد (`main`) محلياً وعن بُعد |
| **الـPRs** | صفر — كل التغييرات مباشرة على `main` |
| **الرؤية** | عام (Public) — الكود مفتوح |
| **HTTPS** | إجباري |
| **Custom Domain** | لا |
| **Service Worker** | مفعّل (يُحدَّث عند كل deploy عبر BUILD_ID stamping) |
| **package.json** | لا يوجد (لا يستخدم npm) |
| **.env.example** | لا يوجد |
| **آخر deploy ناجح** | `2393ce8` — 2026-05-03 18:56 UTC |

البنية بسيطة ومباشرة: مستودع واحد، فرع واحد، نشر تلقائي. مناسب لتطبيق فردي صغير في
طور التطوير، ويحتاج تطوّراً تدريجياً (فروع، PRs، نسخ احتياطية للبيانات) كلما زاد عدد
المستخدمين الفعليين.
