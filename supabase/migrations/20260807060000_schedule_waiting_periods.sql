-- حصص الانتظار في الجدول الأسبوعي.
-- التطبيق يرسل هذه الحقول مع كل صف جدول، وبدون الأعمدة يفشل الإدراج
-- بصمت ("column does not exist") فلا تُضاف الحصة إطلاقاً.
--
--   wait_kind : 'perm'  → حصة انتظار دائمة تتكرر كل أسبوع
--               'today' → لهذا اليوم فقط، يحذفها التطبيق في اليوم التالي
--   wait_date : تاريخ إنشاء حصة الانتظار المؤقتة (YYYY-MM-DD)
--   sub_class : اسم الفصل الذي يُسند للمعلم في حصة الانتظار اليوم.
--               يُخزَّن نصاً لا معرّفاً لأنه قد يكون فصلاً لا يدرّسه المعلم
--               ولا يوجد في جدول classes.
--   sub_date  : تاريخ الإسناد (YYYY-MM-DD) — يُمسح الإسناد في اليوم التالي.

alter table public.schedule
    add column if not exists wait_kind text,
    add column if not exists wait_date date,
    add column if not exists sub_class text,
    add column if not exists sub_date  date;

alter table public.schedule
    drop constraint if exists schedule_wait_kind_check;

alter table public.schedule
    add constraint schedule_wait_kind_check
    check (wait_kind is null or wait_kind in ('perm', 'today'));
