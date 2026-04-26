# تطبيق المعلم الذكي

تطبيق ويب للمعلمين السعوديين: تتبع الطلاب، توليد المحتوى بالذكاء الاصطناعي، وبناء ملف الإنجاز.

## التقنية

- HTML / CSS / JavaScript خام (بدون frameworks)
- [Supabase](https://supabase.com) — قاعدة البيانات والمصادقة
- [Anthropic Claude](https://anthropic.com) — توليد المحتوى التعليمي
- [GitHub Pages](https://pages.github.com) — الاستضافة

## التشغيل محلياً

```bash
cd teacher_app
python3 -m http.server 8000
```

ثم افتح <http://localhost:8000>.

## النشر

النشر تلقائي على GitHub Pages عند كل push للفرع `main` (انظر `.github/workflows/deploy.yml`).
