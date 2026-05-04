-- Region (إدارة التعليم) shown on the portfolio cover and ID card.
alter table public.teachers
    add column if not exists region text;
