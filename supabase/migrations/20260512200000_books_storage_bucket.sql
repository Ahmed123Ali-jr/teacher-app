-- Create a private Storage bucket for book PDFs so we can hold large files
-- (up to ~150 MB) without inflating the JSON row. Each teacher's files live
-- under a folder named after their auth.uid().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 157286400 /* 150 MB */, array['application/pdf'])
on conflict (id) do update set
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- RLS: a teacher reads/writes only files whose path starts with their uid.
drop policy if exists "books_owner_read"   on storage.objects;
drop policy if exists "books_owner_insert" on storage.objects;
drop policy if exists "books_owner_update" on storage.objects;
drop policy if exists "books_owner_delete" on storage.objects;

create policy "books_owner_read"   on storage.objects
    for select using (
        bucket_id = 'books'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "books_owner_insert" on storage.objects
    for insert with check (
        bucket_id = 'books'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "books_owner_update" on storage.objects
    for update using (
        bucket_id = 'books'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "books_owner_delete" on storage.objects
    for delete using (
        bucket_id = 'books'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
