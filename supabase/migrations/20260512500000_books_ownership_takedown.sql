-- Add columns to record the teacher's ownership confirmation and to
-- support takedown of copyrighted material by request.
alter table public.books
    add column if not exists ownership_confirmed_at timestamptz,
    add column if not exists is_taken_down          boolean not null default false,
    add column if not exists taken_down_at          timestamptz,
    add column if not exists taken_down_reason      text;

-- Hide taken-down books from teacher queries via RLS.
drop policy if exists "books_owner_select" on public.books;
create policy "books_owner_select" on public.books
    for select using (
        teacher_id = (select auth.uid())
        and coalesce(is_taken_down, false) = false
    );
