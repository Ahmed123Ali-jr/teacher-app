-- مواءمة جدول التذكيرات مع ما يرسله التطبيق فعلاً.
--
-- الجدول أُنشئ بعمود `text` إلزامي، بينما التطبيق يرسل `title` ومعه `type`
-- و`class_id` و`notes` و`updated_at`. فكان كل إدراج يفشل برسالة
-- "Could not find the 'title' column of 'reminders'" ولا يُحفظ أي تذكير
-- إطلاقاً — صفحة «تذكيراتي» وعدّاداتها في الرئيسية وشاشة «إنجاز» فارغة دوماً.
--
--   title      : نص التذكير كما يكتبه المعلم (بديل `text` القديم)
--   type       : تصنيف التذكير (اختبار / اجتماع / تسليم …)
--   class_id   : الفصل المرتبط إن وُجد — يبقى null للتذكيرات العامة
--   notes      : ملاحظات إضافية اختيارية
--   updated_at : وقت آخر تعديل

alter table public.reminders
    add column if not exists title      text,
    add column if not exists type       text,
    add column if not exists class_id   uuid references public.classes(id) on delete set null,
    add column if not exists notes      text,
    add column if not exists updated_at timestamptz not null default now();

-- الصفوف القديمة كتبت نصّها في `text` — ننقله إلى `title` كي لا يضيع.
update public.reminders
   set title = text
 where title is null;

-- `text` لم يعد يرسله التطبيق: نرفع عنه إلزام NOT NULL بدل حذفه حتى لا
-- تضيع بيانات قديمة، ونملؤه من `title` تلقائياً لأي صف جديد.
alter table public.reminders
    alter column text drop not null;

create or replace function public.reminders_sync_text()
returns trigger
language plpgsql
as $$
begin
    if new.text is null then
        new.text := new.title;
    end if;
    if new.title is null then
        new.title := new.text;
    end if;
    return new;
end;
$$;

drop trigger if exists reminders_sync_text on public.reminders;
create trigger reminders_sync_text
    before insert or update on public.reminders
    for each row execute function public.reminders_sync_text();

create index if not exists reminders_class_id_idx on public.reminders(class_id);
