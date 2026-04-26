-- =====================================================================
-- assignments (homework) — used by class-homework view
-- =====================================================================
create table public.assignments (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid not null references public.classes(id) on delete cascade,
    title text not null,
    description text,
    due_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index on public.assignments(class_id);
create index on public.assignments(teacher_id);

alter table public.assignments enable row level security;
create policy "assignments_owner_select" on public.assignments
    for select using (teacher_id = (select auth.uid()));
create policy "assignments_owner_insert" on public.assignments
    for insert with check (teacher_id = (select auth.uid()));
create policy "assignments_owner_update" on public.assignments
    for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy "assignments_owner_delete" on public.assignments
    for delete using (teacher_id = (select auth.uid()));

create trigger set_updated_at before update on public.assignments
    for each row execute function public.set_updated_at();

-- =====================================================================
-- portfolio (one row per teacher; all sections in jsonb)
-- =====================================================================
create table public.portfolio (
    teacher_id uuid primary key references public.teachers(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.portfolio enable row level security;
create policy "portfolio_owner_select" on public.portfolio
    for select using (teacher_id = (select auth.uid()));
create policy "portfolio_owner_insert" on public.portfolio
    for insert with check (teacher_id = (select auth.uid()));
create policy "portfolio_owner_update" on public.portfolio
    for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy "portfolio_owner_delete" on public.portfolio
    for delete using (teacher_id = (select auth.uid()));
