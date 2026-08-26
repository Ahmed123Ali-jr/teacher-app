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

كل إنزال يُسجَّل تلقائياً في جدول منفصل لحظةَ وقوعه — **لا يراه المعلّم ولا
يكتب فيه ولا يحذف منه**، وليس فيه مفتاح أجنبي إلى `books` ولا إلى
`teachers`، فيبقى بعد زوال الكتاب أو الحساب:

```sql
select title, filename, reason, taken_down_at,
       book_deleted_at, deleted_by, teacher_id
from public.takedown_log
order by logged_at desc;
```

- `book_deleted_at` فارغ ← الكتاب ما زال في الجدول منزَّلاً
- `book_deleted_at` مملوء ← حُذف صفُّه بعد الإنزال، و`deleted_by` يقول من
  حذفه (`authenticated` = المعلّم من التطبيق · `postgres` = أنت من اللوحة)

والكتب المنزَّلة الحاليّة تُرى كذلك بالاستعلام القديم:

```sql
select id, title, taken_down_at, taken_down_reason
from public.books
where is_taken_down = true
order by taken_down_at desc;
```

## ملاحظات قانونية

- الرد على طلب الإزالة خلال **٢٤ ساعة** يحمي التطبيق من المسؤولية
- احتفظ بالمراسلات مع الجهة الطالبة كدليل
- **لا تحتاج أن تحذر من ضياع السجل**: المعلّم لا يستطيع إرجاع كتاب أُنزل
  (مُشغِّل `books_preserve_takedown`)، وإن حذف صفَّه بقي أثرُ الإنزال في
  `takedown_log` موسوماً بوقت الحذف ومن نفّذه
