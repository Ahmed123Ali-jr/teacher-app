-- The app code sends `day`, `topic`, `updated_at` but the original schedule
-- table used `day_of_week`, `notes`, and had no updated_at column — so every
-- schedule insert silently failed with "column does not exist". Align the
-- schema with the JS shape.

alter table public.schedule rename column day_of_week to day;
alter table public.schedule rename column notes        to topic;

alter table public.schedule
    add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.schedule;
create trigger set_updated_at before update on public.schedule
    for each row execute function public.set_updated_at();
