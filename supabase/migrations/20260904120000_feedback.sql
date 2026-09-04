-- ==========================================================================
-- ملاحظاتُ المعلّمين — صندوقُ بريدٍ في اتّجاهٍ واحد
-- ==========================================================================
-- شاشةُ «ملاحظاتكم» حلّت محلّ «الإعدادات» في قائمة الثلاث نقاط (٤ سبتمبر
-- ٢٠٢٦)، وهذا جدولُها.
--
-- ── ثلاثةُ قرارات ──
--
-- ١) **يكتب ولا يقرأ.** للمعلّم `insert` وحدَه: لا `select` ولا `update`
--    ولا `delete`. فلا يرى ملاحظاتِ غيره — ولا ملاحظاتِه هو. وهذا مقصود:
--    لو مُنح `select` على صفوفه لصار الجدولُ سطحاً يُستعلم عنه، ولا فائدة
--    له فيه؛ والشاشةُ تقول له «وصلَتنا» فورَ نجاح الإدخال.
--
-- ٢) **`teacher_id` يُفرض من الجلسة لا من العميل.** الشرطُ في
--    `with check` يقارنه بـ`auth.uid()` — فلا يستطيع معلّمٌ أن ينسب
--    ملاحظةً إلى غيره. والقيدُ `on delete set null` يُبقي الملاحظةَ
--    لو حُذف الحساب: نصُّها يفيدنا وصاحبُه لم يعد موجوداً.
--
-- ٣) **سقفٌ في قاعدة البيانات لا في الواجهة.** عشرُ ملاحظاتٍ في الساعة
--    للحساب الواحد. من عطّل الجافاسكربت يبقى محكوماً، والرقمُ واسعٌ على
--    معلّمٍ حقيقيّ (من كتب عشراً في ساعةٍ لم يعد يكتب ملاحظات).
--
-- ولا فهرسَ على `teacher_id`: الجدولُ يُقرأ من لوحة سوبابيس بالعين، لا
-- بطلبٍ في مسارٍ ساخن — والفهرسُ ثمنٌ في كل إدخالٍ بلا مقابل.
-- ==========================================================================

create table if not exists public.feedback (
    id          uuid primary key default gen_random_uuid(),
    teacher_id  uuid references auth.users(id) on delete set null,
    kind        text not null check (kind in ('idea', 'bug', 'ask', 'thanks')),
    body        text not null check (char_length(body) between 5 and 1200),
    app_version text check (char_length(app_version) <= 40),
    agent       text check (char_length(agent) <= 300),
    created_at  timestamptz not null default now()
);

comment on table public.feedback is
    'ملاحظاتُ المعلّمين من شاشة «ملاحظاتكم». يكتب المعلّمُ ولا يقرأ.';

alter table public.feedback enable row level security;

-- والسقفُ حارسٌ لا سياسة: الدالّةُ تُستدعى داخل `with check` فتُحسب قبل
-- الإدخال. و`security definer` لأنّ المعلّم لا يملك `select` على الجدول.
create or replace function public.feedback_under_limit()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
    select count(*) < 10
      from public.feedback
     where teacher_id = (select auth.uid())
       and created_at > now() - interval '1 hour';
$$;

revoke execute on function public.feedback_under_limit() from public, anon;
grant  execute on function public.feedback_under_limit() to authenticated;

drop policy if exists "feedback_self_insert" on public.feedback;
create policy "feedback_self_insert" on public.feedback
    for insert to authenticated
    with check (
        teacher_id = (select auth.uid())
        and public.feedback_under_limit()
    );

revoke all    on public.feedback from anon, authenticated;
grant  insert on public.feedback to authenticated;
