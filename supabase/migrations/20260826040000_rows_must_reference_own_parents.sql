-- ==========================================================================
-- الصفُّ لا يُعلَّق إلّا بأبٍ يملكه صاحبُه
-- ==========================================================================
-- سياساتُ الأمان كانت تسأل سؤالاً واحداً: «هل `teacher_id` هو أنت؟»
-- ولا تسأل: «وهذا الفصلُ فصلُك؟ وهذا الطالبُ طالبُك؟»
--
-- فكان معلّمٌ يستطيع أن يُدرج صفَّ حضورٍ **باسمه هو** لطالبِ معلّمٍ آخر.
-- ولا يقرأ به شيئاً ولا يغيّر — لكنّ القيدَ `unique (student_id, date)`
-- **مشتركٌ بين المعلّمين**، فيحتلّ الخانة.
--
-- وقيس الأثرُ حرفياً باختبار حسابين (٢٦ أغسطس ٢٠٢٦):
--     duplicate key value violates unique constraint
--     "attendance_student_id_date_key"
-- فصار صاحبُ الطالب **يعجز عن تحضيره ذلك اليوم**، ولا يرى الصفَّ المانع
-- (سياسةُ القراءة تُخفيه عنه) ولا يستطيع حذفه. عطلٌ دائمٌ برسالةٍ لا يفهمها
-- ولا حيلةَ له فيها.
--
-- ولا مدخلَ إليه اليوم: يحتاج معرّفَ الطالب، وثبت في الاختبار نفسِه أنّ
-- معرّفاً واحداً لا يُقرأ من حسابٍ إلى حساب. لكنّ النسخةَ الاحتياطية تحمل
-- المعرّفات، فمن أعطى نسختَه لأحدٍ أعطاه المفتاح.
--
-- ── الجداولُ الثلاثة، ولماذا هي وحدها ──
-- القيدُ المشتركُ بين المعلّمين هو مصدرُ الضرر، وهو في ثلاثة لا غير:
--     attendance    unique (student_id, date)
--     participation unique (student_id, date)
--     evaluations   unique (column_id, student_id, date)
-- وما عداها لا قيدَ مشتركاً فيه: صفٌّ يشير إلى فصل غيره يجلس في حساب
-- كاتبه لا يراه أحدٌ ولا يمنع أحداً. فلا يُوسَّع الشرطُ إلى ما لا ضررَ فيه:
-- كلُّ سياسةٍ تُشدَّد فرصةُ ردِّ إدخالٍ مشروع.
--
-- ── لماذا لا تكسر شيئاً ──
-- • **الاستعادةُ تُدرج الآباءَ قبل الأبناء**: ترتيبُ `TABLE` في
--   database.js هو فصول ← طلاب ← حضور ← مشاركة. فحين يصل صفُّ الحضور
--   يكون طالبُه قد أُدرج ومُلِك. (وفي نسخة معلّمٍ آخر تُبدَّل المعرّفاتُ
--   كلُّها بخريطةٍ واحدة، فتبقى الروابطُ متّسقة.)
-- • **`evaluations` و`evaluation_columns` لا يكتب فيهما التطبيقُ إطلاقاً**
--   — ليسا في `TABLE` أصلاً؛ التقييماتُ تسكن `participation.values`.
--   فتشديدُهما بلا أثرٍ على شاشةٍ واحدة.
-- • والدوالُّ `security invoker`: تقرأ بصلاحيّات المنادي، فتُطبَّق عليها
--   سياساتُ القراءة كذلك — طبقتا تحقّقٍ لا واحدة. ولا تكشف شيئاً: جوابُها
--   `true`/`false` لا بيانات.
-- • ولا تُعرقل `postgres` ولا مفتاحَ الخدمة: السياساتُ لا تُقيّم لهما أصلاً.
--
-- ── الرجوع ──
-- تُعاد السياساتُ الستّ إلى شرطها الأوّل (`teacher_id = auth.uid()` وحده)
-- كما في 20260426072956_initial_schema.sql.
-- ==========================================================================

/* «أهذا الفصلُ فصلي؟» — والعدمُ يمرّ: `class_id` يقبل الفراغ في جداول. */
create or replace function public.owns_class(cid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
    select cid is null or exists (
        select 1 from public.classes c
         where c.id = cid and c.teacher_id = (select auth.uid())
    )
$$;

create or replace function public.owns_student(sid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
    select sid is null or exists (
        select 1 from public.students s
         where s.id = sid and s.teacher_id = (select auth.uid())
    )
$$;

create or replace function public.owns_eval_column(kid uuid)
returns boolean
language sql
stable
set search_path = public
as $$
    select kid is null or exists (
        select 1 from public.evaluation_columns k
         where k.id = kid and k.teacher_id = (select auth.uid())
    )
$$;

-- ── الحضور ──
drop policy if exists "attendance_owner_insert" on public.attendance;
create policy "attendance_owner_insert" on public.attendance
    for insert with check (
        teacher_id = (select auth.uid())
        and public.owns_class(class_id)
        and public.owns_student(student_id)
    );

drop policy if exists "attendance_owner_update" on public.attendance;
create policy "attendance_owner_update" on public.attendance
    for update using (teacher_id = (select auth.uid()))
    with check (
        teacher_id = (select auth.uid())
        and public.owns_class(class_id)
        and public.owns_student(student_id)
    );

-- ── المشاركة ──
drop policy if exists "participation_owner_insert" on public.participation;
create policy "participation_owner_insert" on public.participation
    for insert with check (
        teacher_id = (select auth.uid())
        and public.owns_class(class_id)
        and public.owns_student(student_id)
    );

drop policy if exists "participation_owner_update" on public.participation;
create policy "participation_owner_update" on public.participation
    for update using (teacher_id = (select auth.uid()))
    with check (
        teacher_id = (select auth.uid())
        and public.owns_class(class_id)
        and public.owns_student(student_id)
    );

-- ── التقييمات ──
drop policy if exists "evaluations_owner_insert" on public.evaluations;
create policy "evaluations_owner_insert" on public.evaluations
    for insert with check (
        teacher_id = (select auth.uid())
        and public.owns_eval_column(column_id)
        and public.owns_student(student_id)
    );

drop policy if exists "evaluations_owner_update" on public.evaluations;
create policy "evaluations_owner_update" on public.evaluations
    for update using (teacher_id = (select auth.uid()))
    with check (
        teacher_id = (select auth.uid())
        and public.owns_eval_column(column_id)
        and public.owns_student(student_id)
    );
