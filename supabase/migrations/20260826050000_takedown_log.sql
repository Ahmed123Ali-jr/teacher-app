-- ==========================================================================
-- سجلُّ الإنزالات — أثرٌ لا يملك المعلّم محوَه
-- ==========================================================================
-- حين يصل طلبُ إزالةٍ من الوزارة أو ناشر، يُنزَل الكتاب من اللوحة
-- (`is_taken_down = true`) ومعه سببُه وتاريخه. وأُغلق اليوم بابُ **إرجاعه**
-- بمُشغِّل `books_preserve_takedown` (20260826000100).
--
-- **وبقي بابُ الحذف مفتوحاً**: المعلّم يستطيع حذف صفِّ الكتاب كلَّه فيزول
-- معه أثرُ الإنزال — سببُه وتاريخُه والورقةُ التي تُثبت أنّك استجبت. ومنعُ
-- الحذف كان سيكسر شيئين: حذفُ الفصل يتتالى إلى كتبه، وحذفُ الحساب (شرطُ
-- آبل) يتتالى إلى كلّ شيء — فأيُّ رفضٍ هنا يُفشل العمليّتين.
--
-- فالسجلُّ يُنقل إلى **جدولٍ آخر لا يملكه المعلّم ولا يراه**. يُكتب لحظةَ
-- الإنزال، فيبقى ولو زال الكتابُ بعده بيومٍ أو بسنة.
--
-- ══ ولماذا بلا مفاتيح أجنبيّة ══
-- `book_id` و`teacher_id` **مجرّدُ معرّفَين، بلا `references`** — عن قصدٍ
-- تامّ. فمفتاحٌ أجنبيٌّ إلى `books` أو `teachers` يعني أنّ حذفَ الكتاب أو
-- الحساب يجرّ السجلَّ معه (`on delete cascade`) أو يمنع الحذف — وكلاهما
-- يُبطل الغرض. السجلُّ يبقى **بعد** زوال ما يصفه، وهذا تعريفُه.
--
-- ══ ومن يقرؤه ══
-- RLS مفعَّلٌ **بلا سياسةٍ واحدة**، والصلاحياتُ مسحوبةٌ من `anon`
-- و`authenticated`. فلا معلّمٌ يقرأ ولا يكتب ولا يحذف — ولا يعلم بوجوده.
-- وأنت تقرؤه من لوحة التحكّم (`postgres`) أو بمفتاح الخدمة، وهما خارج RLS.
-- وهو سجلُّك أنت للامتثال، لا بيانات المعلّم.
--
-- ══ والمُشغِّلان لا يُفشلان شيئاً ══
-- كلاهما يبتلع أخطاءه. مُشغِّلٌ يرمي على `books` يعني تعطُّلَ حذف الفصل
-- وحذفِ الحساب — وقد وقع هذا اليوم مرّةً في `delete_own_account`. فالسجلُّ
-- **أفضلُ جهد**: إن تعذّر تُكتب رسالةُ تحذيرٍ ويمضي كلُّ شيء.
--
-- ── الرجوع ──
--   drop trigger  if exists books_log_takedown on public.books;
--   drop trigger  if exists books_log_takedown_delete on public.books;
--   drop function if exists public.log_book_takedown();
--   drop function if exists public.log_book_takedown_delete();
--   drop table    if exists public.takedown_log;
-- ==========================================================================

create table if not exists public.takedown_log (
    id              uuid primary key default gen_random_uuid(),
    -- معرّفان لا مفتاحان أجنبيّان — انظر أعلاه
    book_id         uuid not null,
    teacher_id      uuid,
    -- صورةٌ ممّا كان، فلا يضيع الوصفُ بضياع الصفّ
    title           text,
    filename        text,
    class_id        uuid,
    -- سببُ الإنزال وتاريخُه كما كُتبا لحظتَها
    reason          text,
    taken_down_at   timestamptz,
    logged_at       timestamptz not null default now(),
    -- يُملأ إن حُذف صفُّ الكتاب بعد إنزاله — ومَن حذفه
    book_deleted_at timestamptz,
    deleted_by      text
);

create index if not exists takedown_log_book_idx    on public.takedown_log(book_id);
create index if not exists takedown_log_teacher_idx on public.takedown_log(teacher_id);
create index if not exists takedown_log_time_idx    on public.takedown_log(logged_at desc);

comment on table public.takedown_log is
    'سجلُّ إنزال الكتب — لصاحب المشروع لا للمعلّم. بلا مفاتيح أجنبيّة كي يبقى بعد زوال الكتاب أو الحساب.';

-- لا أحد من الواجهة: لا قراءةً ولا كتابةً ولا علماً بوجوده.
alter table public.takedown_log enable row level security;
revoke all on public.takedown_log from anon, authenticated;

-- ==========================================================================
-- ١) لحظةُ الإنزال: يُكتب السجلّ
-- ==========================================================================
create or replace function public.log_book_takedown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if coalesce(new.is_taken_down, false) = true
           and coalesce(old.is_taken_down, false) = false then
            insert into public.takedown_log
                   (book_id, teacher_id, title, filename, class_id, reason, taken_down_at)
            values (new.id, new.teacher_id, new.title, new.filename, new.class_id,
                    new.taken_down_reason, coalesce(new.taken_down_at, now()));
        end if;
    exception when others then
        /* السجلُّ أفضلُ جهد: لا يُفشل إنزالاً ولا حفظاً. */
        raise warning '[takedown_log] تعذّر تسجيلُ إنزال الكتاب % : %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists books_log_takedown on public.books;
create trigger books_log_takedown
    after update on public.books
    for each row execute function public.log_book_takedown();

-- ==========================================================================
-- ٢) وإن حُذف صفُّ كتابٍ مُنزَل: يُوسم السجلُّ ولا يُمسّ
-- ==========================================================================
-- لا يُنشأ سجلٌّ لكتابٍ لم يُنزل قطّ — حذفُ المعلّم كتابَه شأنُه، ولا
-- يُراقَب. إنّما يُوسم سجلٌّ قائمٌ بأنّ الصفَّ الذي يصفه لم يعد موجوداً.
create or replace function public.log_book_takedown_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        update public.takedown_log
           set book_deleted_at = now(),
               deleted_by      = current_user
         where book_id = old.id
           and book_deleted_at is null;
    exception when others then
        raise warning '[takedown_log] تعذّر وسمُ حذف الكتاب % : %', old.id, sqlerrm;
    end;
    return old;
end;
$$;

drop trigger if exists books_log_takedown_delete on public.books;
create trigger books_log_takedown_delete
    after delete on public.books
    for each row execute function public.log_book_takedown_delete();

-- ==========================================================================
-- ٣) ما أُنزل قبل اليوم يُنقل إلى السجلّ — مرّةً واحدة
-- ==========================================================================
insert into public.takedown_log
       (book_id, teacher_id, title, filename, class_id, reason, taken_down_at)
select b.id, b.teacher_id, b.title, b.filename, b.class_id,
       b.taken_down_reason, coalesce(b.taken_down_at, now())
  from public.books b
 where coalesce(b.is_taken_down, false) = true
   and not exists (select 1 from public.takedown_log l where l.book_id = b.id);
