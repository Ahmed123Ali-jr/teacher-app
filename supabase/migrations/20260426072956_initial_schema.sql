-- =====================================================================
-- Teacher App — Initial Schema
-- =====================================================================
-- All tables are owned by a teacher (auth.uid()).
-- Row-Level Security ensures each teacher only sees their own data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) teachers (profile linked to auth.users)
-- ---------------------------------------------------------------------
create table public.teachers (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    school text,
    subject text,
    phone text,
    photo_url text,
    message text,
    vision text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) classes
-- ---------------------------------------------------------------------
create table public.classes (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    stage text not null check (stage in ('primary','intermediate','secondary')),
    grade text not null,
    section text not null,
    subject text not null,
    color text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index on public.classes(teacher_id);

-- ---------------------------------------------------------------------
-- 3) students
-- ---------------------------------------------------------------------
create table public.students (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid not null references public.classes(id) on delete cascade,
    name text not null,
    national_id text,
    phone text,
    notes text,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index on public.students(class_id);
create index on public.students(teacher_id);

-- ---------------------------------------------------------------------
-- 4) attendance
-- ---------------------------------------------------------------------
create table public.attendance (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid not null references public.classes(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    date date not null,
    status text not null check (status in ('present','absent','late','excused')),
    note text,
    created_at timestamptz not null default now(),
    unique (student_id, date)
);
create index on public.attendance(class_id, date);
create index on public.attendance(teacher_id);

-- ---------------------------------------------------------------------
-- 5) evaluation_columns (custom grading columns per class)
-- ---------------------------------------------------------------------
create table public.evaluation_columns (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid not null references public.classes(id) on delete cascade,
    label text not null,
    type text not null,
    max_value numeric,
    sort_order int not null default 0,
    created_at timestamptz not null default now()
);
create index on public.evaluation_columns(class_id);

-- ---------------------------------------------------------------------
-- 6) evaluations (values per student/column)
-- ---------------------------------------------------------------------
create table public.evaluations (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    column_id uuid not null references public.evaluation_columns(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    value text,
    date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (column_id, student_id, date)
);
create index on public.evaluations(student_id);
create index on public.evaluations(column_id);

-- ---------------------------------------------------------------------
-- 7) participation
-- ---------------------------------------------------------------------
create table public.participation (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid not null references public.classes(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    date date not null,
    count int not null default 1,
    note text,
    created_at timestamptz not null default now()
);
create index on public.participation(student_id, date);

-- ---------------------------------------------------------------------
-- 8) exams (AI-generated)
-- ---------------------------------------------------------------------
create table public.exams (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    subject text,
    grade text,
    content jsonb,
    prompt text,
    created_at timestamptz not null default now()
);
create index on public.exams(teacher_id);

-- ---------------------------------------------------------------------
-- 9) worksheets (AI-generated)
-- ---------------------------------------------------------------------
create table public.worksheets (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    subject text,
    grade text,
    content jsonb,
    prompt text,
    created_at timestamptz not null default now()
);
create index on public.worksheets(teacher_id);

-- ---------------------------------------------------------------------
-- 10) strategies (AI-generated teaching strategies)
-- ---------------------------------------------------------------------
create table public.strategies (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    title text not null,
    content jsonb,
    prompt text,
    created_at timestamptz not null default now()
);
create index on public.strategies(teacher_id);

-- ---------------------------------------------------------------------
-- 11) initiatives (AI-generated)
-- ---------------------------------------------------------------------
create table public.initiatives (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    title text not null,
    content jsonb,
    prompt text,
    created_at timestamptz not null default now()
);
create index on public.initiatives(teacher_id);

-- ---------------------------------------------------------------------
-- 12) missions (admin tasks - AI-generated)
-- ---------------------------------------------------------------------
create table public.missions (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    title text not null,
    content jsonb,
    prompt text,
    created_at timestamptz not null default now()
);
create index on public.missions(teacher_id);

-- ---------------------------------------------------------------------
-- 13) books (textbooks uploaded — file in Storage)
-- ---------------------------------------------------------------------
create table public.books (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    storage_path text,
    size_bytes bigint,
    mime_type text,
    created_at timestamptz not null default now()
);
create index on public.books(teacher_id);

-- ---------------------------------------------------------------------
-- 14) curricula (curriculum distribution)
-- ---------------------------------------------------------------------
create table public.curricula (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid references public.classes(id) on delete set null,
    title text not null,
    storage_path text,
    size_bytes bigint,
    mime_type text,
    parsed_content jsonb,
    created_at timestamptz not null default now()
);
create index on public.curricula(teacher_id);

-- ---------------------------------------------------------------------
-- 15) schedule (weekly timetable)
-- ---------------------------------------------------------------------
create table public.schedule (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    class_id uuid references public.classes(id) on delete cascade,
    day_of_week int not null check (day_of_week between 0 and 6),
    period int not null,
    start_time time,
    end_time time,
    notes text,
    created_at timestamptz not null default now()
);
create index on public.schedule(teacher_id, day_of_week);

-- ---------------------------------------------------------------------
-- 16) reminders
-- ---------------------------------------------------------------------
create table public.reminders (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    text text not null,
    date date,
    time time,
    done boolean not null default false,
    priority text not null default 'normal',
    created_at timestamptz not null default now()
);
create index on public.reminders(teacher_id, date);

-- ---------------------------------------------------------------------
-- 17) portfolio_files
-- ---------------------------------------------------------------------
create table public.portfolio_files (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    category text,
    title text,
    storage_path text,
    size_bytes bigint,
    mime_type text,
    created_at timestamptz not null default now()
);
create index on public.portfolio_files(teacher_id);

-- ---------------------------------------------------------------------
-- 18) app_settings (key-value per teacher)
-- ---------------------------------------------------------------------
create table public.app_settings (
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    key text not null,
    value jsonb,
    updated_at timestamptz not null default now(),
    primary key (teacher_id, key)
);

-- ---------------------------------------------------------------------
-- 19) ai_usage (track Anthropic API consumption per teacher)
-- ---------------------------------------------------------------------
create table public.ai_usage (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teachers(id) on delete cascade,
    kind text,
    input_tokens int,
    output_tokens int,
    cost_usd numeric(10, 6),
    model text,
    created_at timestamptz not null default now()
);
create index on public.ai_usage(teacher_id, created_at);

-- =====================================================================
-- updated_at trigger function
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger set_updated_at before update on public.teachers
    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.classes
    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.students
    for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.evaluations
    for each row execute function public.set_updated_at();

-- =====================================================================
-- Auto-create teacher row when a new auth user signs up
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.teachers (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =====================================================================
-- Row-Level Security
-- =====================================================================

alter table public.teachers           enable row level security;
alter table public.classes            enable row level security;
alter table public.students           enable row level security;
alter table public.attendance         enable row level security;
alter table public.evaluation_columns enable row level security;
alter table public.evaluations        enable row level security;
alter table public.participation      enable row level security;
alter table public.exams              enable row level security;
alter table public.worksheets         enable row level security;
alter table public.strategies         enable row level security;
alter table public.initiatives        enable row level security;
alter table public.missions           enable row level security;
alter table public.books              enable row level security;
alter table public.curricula          enable row level security;
alter table public.schedule           enable row level security;
alter table public.reminders          enable row level security;
alter table public.portfolio_files    enable row level security;
alter table public.app_settings       enable row level security;
alter table public.ai_usage           enable row level security;

-- teachers: a user can only access their own profile (id = auth.uid())
create policy "teachers_self_select" on public.teachers
    for select using (id = (select auth.uid()));
create policy "teachers_self_insert" on public.teachers
    for insert with check (id = (select auth.uid()));
create policy "teachers_self_update" on public.teachers
    for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "teachers_self_delete" on public.teachers
    for delete using (id = (select auth.uid()));

-- All other tables: teacher_id = auth.uid()
do $$
declare
    t text;
    tables text[] := array[
        'classes','students','attendance','evaluation_columns','evaluations',
        'participation','exams','worksheets','strategies','initiatives',
        'missions','books','curricula','schedule','reminders','portfolio_files',
        'app_settings','ai_usage'
    ];
begin
    foreach t in array tables loop
        execute format(
            'create policy %I on public.%I for select using (teacher_id = (select auth.uid()))',
            t || '_owner_select', t
        );
        execute format(
            'create policy %I on public.%I for insert with check (teacher_id = (select auth.uid()))',
            t || '_owner_insert', t
        );
        execute format(
            'create policy %I on public.%I for update using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()))',
            t || '_owner_update', t
        );
        execute format(
            'create policy %I on public.%I for delete using (teacher_id = (select auth.uid()))',
            t || '_owner_delete', t
        );
    end loop;
end $$;
