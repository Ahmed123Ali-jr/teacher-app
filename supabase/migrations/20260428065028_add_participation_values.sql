-- Per-day evaluation values map (column_id → value) lives on the
-- participation row. The class register UI puts every custom column
-- (stars, /10, check/x, etc.) into this jsonb so a single row holds
-- all of a student's evaluations for a given date.
alter table public.participation
    add column if not exists values jsonb not null default '{}'::jsonb,
    add column if not exists updated_at timestamptz not null default now();

-- One row per (student, date) — required by the upsert logic.
alter table public.participation
    drop constraint if exists participation_student_date_unique;
alter table public.participation
    add  constraint participation_student_date_unique unique (student_id, date);

drop trigger if exists set_updated_at on public.participation;
create trigger set_updated_at before update on public.participation
    for each row execute function public.set_updated_at();
