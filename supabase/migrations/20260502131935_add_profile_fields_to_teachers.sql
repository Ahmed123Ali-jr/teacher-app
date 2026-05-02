-- Profile screen edits these fields; add the missing columns so saves
-- don't fail with `column does not exist` from PostgREST.
alter table public.teachers
    add column if not exists email             text,
    add column if not exists specialization    text,
    add column if not exists qualification     text,
    add column if not exists experience_years  int,
    add column if not exists civil_id          text;
