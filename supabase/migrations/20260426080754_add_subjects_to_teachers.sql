-- Add subjects array (the app supports multiple subjects per teacher)
alter table public.teachers
    add column if not exists subjects jsonb not null default '[]'::jsonb;
