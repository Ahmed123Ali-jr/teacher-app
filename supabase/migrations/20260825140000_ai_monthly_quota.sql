-- ==========================================================================
-- حصّةٌ شهريّةٌ لاستيراد الجداول والأسماء
-- ==========================================================================
-- البروكسي كان يقبل **أيّ جلسةٍ صالحة** ولا يعدّ شيئاً: لا حدَّ لعدد
-- الاستيرادات، ولا سقفَ للإنفاق. والعدّادُ الموجود في `ai-service.js` يسكن
-- جهازَ المعلّم نفسِه — للعرض لا للحماية، ومن أراد تجاوزَه لم يُرسله أصلاً.
--
-- **والحدُّ شهريٌّ لا يوميّ عن قصد.** الاستيرادُ دفعةٌ واحدةٌ يوم يجهّز
-- المعلّم فصولَه ثمّ صمتٌ شهوراً: صاحبُ عشرة فصولٍ يرفع عشرة كشوفٍ وجدولاً
-- وبضعَ إعاداتٍ — نحو ستّ عشرة عمليّةً **في يومٍ واحد**. فحدٌّ يوميٌّ معقولٌ
-- يوقفه هو، ويترك المُسيء يعمل كلَّ يومٍ بهدوء.
--
-- والأربعون ضِعفا أثقلِ معلّمٍ واقعيّ، فلا يبلغها أحدٌ يعمل — وتقصُر
-- بالمُسيء عند حدٍّ يخسر عنده أكثرَ ممّا يُتلف، إذ الميزةُ للمشتركين.
-- ==========================================================================

create table if not exists public.ai_quota (
    teacher_id uuid        not null references auth.users(id) on delete cascade,
    period     text        not null,                 -- 'YYYY-MM' بتوقيت UTC
    used       integer     not null default 0,
    updated_at timestamptz not null default now(),
    primary key (teacher_id, period)
);

alter table public.ai_quota enable row level security;

-- يقرأ المعلّم حصّته ليراها، **ولا سياسةَ كتابةٍ إطلاقاً**: الزيادة تجري
-- داخل الدالّة أدناه وحدَها، فلا يملك أحدٌ تصفيرَ عدّاده.
drop policy if exists "read own ai quota" on public.ai_quota;
create policy "read own ai quota" on public.ai_quota
    for select using (auth.uid() = teacher_id);

-- ==========================================================================
-- claim_ai_quota() — تحجز عمليّةً واحدةً وتقول: أمضيتَ أم بلغتَ الحدّ؟
-- ==========================================================================
-- **ذرّيّةٌ في عبارةٍ واحدة** عن قصد: لو قُرئ العدّادُ ثمّ زِيد في عبارتين،
-- لمرّ طلبان متزامنان كلاهما يقرأ ٣٩ فيمضيان معاً. فالشرطُ داخل
-- `on conflict do update ... where`، والصفُّ لا يُحدَّث إن بلغ الحدَّ —
-- فلا يُرجع `returning` شيئاً، وهذا بعينه هو الرفض.
--
-- **والحدُّ ثابتٌ في الدالّة لا وسيطٌ تُنادى به**: الدالّة ممنوحةٌ لدور
-- `authenticated`، فلو كان وسيطاً لناداها العميلُ بحدٍّ من عنده.
-- ==========================================================================

create or replace function public.claim_ai_quota()
returns table (allowed boolean, used integer, quota_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_limit  constant integer := 40;
    v_uid    uuid    := auth.uid();
    v_period text    := to_char(now() at time zone 'utc', 'YYYY-MM');
    v_used   integer;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    insert into public.ai_quota as q (teacher_id, period, used)
         values (v_uid, v_period, 1)
    on conflict (teacher_id, period) do update
            set used = q.used + 1, updated_at = now()
          where q.used < v_limit
      returning q.used into v_used;

    if v_used is null then
        -- لم يُحدَّث الصفّ: الحصّةُ استُنفدت. نقرأ الرقمَ لنقوله للمعلّم.
        select q.used into v_used
          from public.ai_quota q
         where q.teacher_id = v_uid and q.period = v_period;
        return query select false, coalesce(v_used, v_limit), v_limit;
    else
        return query select true, v_used, v_limit;
    end if;
end;
$$;

revoke all     on function public.claim_ai_quota() from public, anon;
grant  execute on function public.claim_ai_quota() to authenticated;
