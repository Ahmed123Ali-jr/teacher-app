# دليل إزالة الكتب عند طلب أصحاب الحقوق

عند ورود إشعار من وزارة التعليم أو ناشر يطلب إزالة كتاب معيّن، اتبع الخطوات.

## ١. حدّد الكتاب

افتح Supabase SQL Editor:
https://supabase.com/dashboard/project/rbsfpsmolxldmwcclhlc/sql

ابحث عن الكتاب بالاسم:

```sql
select id, teacher_id, title, type, class_id, filename, created_at
from public.books
where title ilike '%رياضيات الصف السادس%'
  and coalesce(is_taken_down, false) = false;
```

## ٢. أنزل الكتاب

استخدم الـid الذي ظهر في النتائج:

```sql
update public.books
   set is_taken_down     = true,
       taken_down_at     = now(),
       taken_down_reason = 'طلب من وزارة التعليم — رسالة بتاريخ 2026-XX-XX'
 where id = '<book-id-here>';
```

النتيجة الفورية:
- الكتاب يختفي تلقائياً من قائمة المعلم (سياسة RLS)
- ما يعود يظهر في توليد الاختبارات
- البيانات تبقى في قاعدة البيانات للسجل القانوني

## ٣. إزالة كل النسخ لنفس العنوان (إذا متعدد المعلمين)

```sql
update public.books
   set is_taken_down     = true,
       taken_down_at     = now(),
       taken_down_reason = 'طلب من <اسم الجهة>'
 where title = '<اسم الكتاب>'
   and coalesce(is_taken_down, false) = false;
```

## ٤. إعادة كتاب أُنزل بالخطأ

```sql
update public.books
   set is_taken_down     = false,
       taken_down_at     = null,
       taken_down_reason = null
 where id = '<book-id-here>';
```

## ٥. أرشيف الإنزالات

لمراجعة كل ما أُنزل:

```sql
select id, title, taken_down_at, taken_down_reason
from public.books
where is_taken_down = true
order by taken_down_at desc;
```

## ملاحظات قانونية

- الرد على طلب الإزالة خلال **٢٤ ساعة** يحمي التطبيق من المسؤولية
- احتفظ بالمراسلات مع الجهة الطالبة كدليل
- لا تحذف الصف من الجدول — حافظ على السجل لو احتجت إثبات الامتثال
