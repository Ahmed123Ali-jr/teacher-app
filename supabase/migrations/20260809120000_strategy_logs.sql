-- ---------------------------------------------------------------------
-- سجلّ تطبيق استراتيجيات التدريس.
--
-- جدول `strategies` القائم مخصَّص لتقارير مولَّدة بالذكاء الاصطناعي
-- ({title, content jsonb, prompt}) ولا يصلح لتسجيل «طبّقتُ هذه
-- الاستراتيجية في هذا الفصل بهذا التاريخ ومعها شواهد». فلها جدولها.
--
-- strategy_key: مفتاح ثابت من كتالوج التطبيق (لا نصّ حرّ) فيبقى العدّ
-- والتقرير صحيحين مهما تغيّرت صياغة الاسم لاحقاً.
-- evidence: مسارات الصور في مخزن `evidence` — لا الصور نفسها.
-- ---------------------------------------------------------------------

create table if not exists public.strategy_logs (
    id           uuid primary key default gen_random_uuid(),
    teacher_id   uuid not null references public.teachers(id) on delete cascade,
    class_id     uuid          references public.classes(id)  on delete cascade,
    strategy_key text not null,
    date         date not null,
    note         text,
    evidence     jsonb not null default '[]'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists strategy_logs_teacher_idx on public.strategy_logs(teacher_id, date desc);
create index if not exists strategy_logs_class_idx   on public.strategy_logs(class_id);
create index if not exists strategy_logs_key_idx     on public.strategy_logs(teacher_id, strategy_key);

alter table public.strategy_logs enable row level security;

drop policy if exists "strategy_logs_own" on public.strategy_logs;
create policy "strategy_logs_own" on public.strategy_logs
    for all
    using      (teacher_id = auth.uid())
    with check (teacher_id = auth.uid());

-- ---------------------------------------------------------------------
-- مخزن شواهد التطبيق: صور يرفعها المعلم لإثبات تنفيذ الاستراتيجية.
-- خاص لا عام، وكل معلّم في مجلد باسم معرّفه.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880 /* 5 MB */,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidence_owner_read"   on storage.objects;
drop policy if exists "evidence_owner_insert" on storage.objects;
drop policy if exists "evidence_owner_delete" on storage.objects;

create policy "evidence_owner_read" on storage.objects
    for select using (
        bucket_id = 'evidence'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "evidence_owner_insert" on storage.objects
    for insert with check (
        bucket_id = 'evidence'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "evidence_owner_delete" on storage.objects
    for delete using (
        bucket_id = 'evidence'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
