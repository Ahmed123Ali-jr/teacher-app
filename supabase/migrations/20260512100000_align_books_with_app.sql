-- The books table was originally designed for Supabase Storage (storage_path,
-- size_bytes, mime_type). The app actually stores books inline (base64) with
-- richer metadata. Add the columns the JS layer needs.

alter table public.books
    add column if not exists type        text,
    add column if not exists context     text,
    add column if not exists filename    text,
    add column if not exists file_data   text,     -- base64 data URL of the PDF
    add column if not exists file_type   text,
    add column if not exists updated_at  timestamptz not null default now();

drop trigger if exists set_updated_at on public.books;
create trigger set_updated_at before update on public.books
    for each row execute function public.set_updated_at();
