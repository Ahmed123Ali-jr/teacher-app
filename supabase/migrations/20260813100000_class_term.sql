-- ==========================================================================
-- الفصل الدراسي: عمودٌ واحد على جدولين، لا وسمٌ على اثني عشر.
--
-- المعلّم حين ينتقل إلى الفصل الثاني لا يريد بياناتٍ موسومة، يريد فصولاً
-- جديدة: أسماء طلابه معه، وسجلّات المتابعة والملاحظات نظيفة.
--
-- فبدل إضافة `term` إلى الحضور والتقييمات والمشاركة والاختبارات وأوراق
-- العمل والمنهج والواجبات وسجلّ الاستراتيجيات — وهي كلّها معلّقةٌ بـ
-- `class_id` — يُنشأ صفُّ فصلٍ **جديد** للفصل الثاني، فتبقى بيانات الفصل
-- الأول معلّقةً بصفّها القديم محفوظةً، ويبدأ الجديد فارغاً بلا أن يُمسّ
-- أيٌّ من تلك الجداول ولا استعلامٍ واحدٍ يسألها.
--
-- والجدول المدرسي وحده يحتاج عموده الخاص: صفوف الانتظار لا `class_id`
-- لها، فلا يكفي أن تُشتقّ من الفصل.
--
-- الافتراضي 1 — فكلّ ما هو قائمٌ اليوم هو الفصل الأول، بلا هجرة بيانات.
-- ==========================================================================

alter table public.classes  add column if not exists term smallint not null default 1;
alter table public.schedule add column if not exists term smallint not null default 1;

-- `add constraint if not exists` غير مدعوم، فيُسأل الكتالوج.
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'classes_term_range') then
        alter table public.classes
            add constraint classes_term_range check (term between 1 and 3);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'schedule_term_range') then
        alter table public.schedule
            add constraint schedule_term_range check (term between 1 and 3);
    end if;
end $$;

create index if not exists classes_teacher_term_idx  on public.classes  (teacher_id, term);
create index if not exists schedule_teacher_term_idx on public.schedule (teacher_id, term);

-- ── ملء ما مضى ──
-- الافتراضي 1 يكذب على معلّمٍ اختار «الفصل الثاني» في التهيئة: فصوله
-- ستُوسم بالأول بينما هو في الثاني، فيفتح التطبيق ولا يجد فصلاً واحداً.
-- فالصواب أن يُسأل ما قاله هو عن نفسه: كلُّ ما بناه حتى اليوم هو من
-- فصله الذي يعمل فيه، أياً كان.
with says as (
    select teacher_id,
           case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int
                when jsonb_typeof(value) = 'string' then nullif(value #>> '{}', '') :: int
                else null end as term
    from public.app_settings
    where key = 'academic_term'
)
update public.classes c set term = s.term
from says s
where s.teacher_id = c.teacher_id and s.term between 1 and 3 and c.term = 1;

with says as (
    select teacher_id,
           case when jsonb_typeof(value) = 'number' then (value #>> '{}')::int
                when jsonb_typeof(value) = 'string' then nullif(value #>> '{}', '') :: int
                else null end as term
    from public.app_settings
    where key = 'academic_term'
)
update public.schedule h set term = s.term
from says s
where s.teacher_id = h.teacher_id and s.term between 1 and 3 and h.term = 1;
