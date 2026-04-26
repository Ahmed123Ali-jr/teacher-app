-- Per-class custom evaluation columns + extra fields the views may attach.
alter table public.classes
    add column if not exists eval_columns jsonb,
    add column if not exists student_count int default 0;
