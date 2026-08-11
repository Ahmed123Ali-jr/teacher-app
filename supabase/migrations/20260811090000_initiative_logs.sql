-- ---------------------------------------------------------------------
-- سجلّ تنفيذ المبادرات المدرسية.
--
-- جدول `initiatives` القائم مخصَّص لتقارير مولَّدة بالذكاء الاصطناعي
-- ({title, content jsonb, prompt}) ولا يصلح لتسجيل «نفّذتُ هذه المبادرة
-- في هذا التاريخ ومعها شواهد». فلها جدولها — كما فُعل مع strategy_logs.
--
-- initiative_key: مفتاح ثابت من كتالوج التطبيق، أو '__custom__' لمبادرة
--   يكتبها المعلّم بنفسه. المفتاح لا النصّ، فيبقى العدّ والتقرير صحيحين
--   مهما تغيّرت صياغة الاسم لاحقاً.
-- custom_name: اسم المبادرة حين تكون مخصَّصة — يُهمَل فيما عداها.
-- evidence: مسارات الصور في مخزن `evidence` — لا الصور نفسها. المخزن
--   نفسه المستعمل لشواهد الاستراتيجيات، فلا حاجة لمخزن ثانٍ.
-- ---------------------------------------------------------------------

create table if not exists public.initiative_logs (
    id             uuid primary key default gen_random_uuid(),
    teacher_id     uuid not null references public.teachers(id) on delete cascade,
    initiative_key text not null,
    custom_name    text,
    date           date not null,
    note           text,
    beneficiaries  integer,
    evidence       jsonb not null default '[]'::jsonb,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create index if not exists initiative_logs_teacher_idx on public.initiative_logs(teacher_id, date desc);
create index if not exists initiative_logs_key_idx     on public.initiative_logs(teacher_id, initiative_key);

alter table public.initiative_logs enable row level security;

drop policy if exists "initiative_logs_own" on public.initiative_logs;
create policy "initiative_logs_own" on public.initiative_logs
    for all
    using      (teacher_id = auth.uid())
    with check (teacher_id = auth.uid());
