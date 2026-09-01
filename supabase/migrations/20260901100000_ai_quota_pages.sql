-- ==========================================================================
-- سقفُ الذكاء يعدُّ الصفحاتِ لا العمليّاتِ وحدَها
-- ==========================================================================
-- كان السقفُ أربعين **عمليّةً** بلا نظرٍ إلى حجمها. والعمليّةُ الواحدة
-- تحتمل مئةَ صورة (سقفُ النموذج نفسِه) — فأربعون عمليّةً تعني **أربعةَ
-- آلاف صورة**، أي ‎٣٠$‎ دخلاً وحدَه لمعلّمٍ واحدٍ في شهر. واشتراكُه يصل
-- صاحبَ التطبيق منه ‎١٫٧٣$‎ في الشهر.
--
-- والعدّادُ لا يُصلحه تقليلُ العمليّات: عشرُ عمليّاتٍ بمئة صفحةٍ أغلى من
-- أربعين بصفحة. فالمقياسُ الصحيح ما يُرسل، لا كم مرّةً أُرسل.
--
-- ── والعدّادان معاً لا أحدُهما ──
-- الصفحاتُ تقيس **الدخل**، والعمليّاتُ تقيس **الخرج**: كلُّ نداءٍ يُخرج
-- ألفاً أو ألفين مهما صغُرت صورتُه. فمن حُدَّ بالصفحات وحدَها استطاع مئةَ
-- ندائها بصورةٍ واحدةٍ وأخرج ما شاء. فأيُّهما بلغ حدَّه أوقف.
--
-- ── الأرقام، مقيسةٌ على أوبس ٥ (‎٥$‎ دخلاً و‎٢٥$‎ خرجاً للمليون) ──
--
--   اليوم  : ٤٠ عمليّة × ١٠٠ صفحة  = ‎٣٠٫٠٠$‎ دخلاً وحدَه
--   الجديد : ١٢٠ صورة + ٤٠ عمليّة = ‎٢٫٨٠$‎ أقصى مطلق
--   والمعلّمُ الحقيقيّ (١٠ فصول): ‎٦٣‎ صورةً و‎١٣‎ نداءً = ‎٠٫٨٦$‎
--
-- فالسقفُ الجديدُ ضِعفا ما يحتاجه أثقلُ معلّمٍ واقعيّ، ويقصُر بالمُسيء
-- عند حدٍّ لا يؤذي.
--
-- ── ولماذا يجوز أن يكون عددُ الصفحات وسيطاً ──
-- الدالّةُ ممنوحةٌ لدور `authenticated`، فقد يناديها العميلُ مباشرةً برقمٍ
-- من عنده. **ولا مكسبَ له في ذلك**: النداءُ المباشر لا يزيد إلّا عدّادَه
-- هو. وطريقُه إلى إنفاق المال هو البروكسي وحدَه، والبروكسي يحسب العددَ
-- من الصور التي فحصها بنفسه ولا يقبله من الجسم. فالوسيطُ لا يُخفّض شيئاً.
-- (والحدُّ نفسُه يبقى ثابتاً في الدالّة لا وسيطاً — وذاك ما لا يجوز.)
-- ==========================================================================

alter table public.ai_quota
    add column if not exists pages_used integer not null default 0;

drop function if exists public.claim_ai_quota();

create or replace function public.claim_ai_quota(p_pages integer default 1)
returns table (allowed boolean, used integer, quota_limit integer,
               pages integer, pages_limit integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ops    constant integer := 40;    -- نداءات/شهر  → تقيس الخرج
    v_pages  constant integer := 120;   -- صور/شهر     → تقيس الدخل
    v_uid    uuid    := auth.uid();
    v_period text    := to_char(now() at time zone 'utc', 'YYYY-MM');
    v_n      integer := greatest(1, least(coalesce(p_pages, 1), 100));
    v_used   integer;
    v_pg     integer;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    /* ذرّيّةٌ في عبارةٍ واحدة كما كانت: لو قُرئ العدّادُ ثمّ زِيد في
       عبارتين، لمرّ طلبان متزامنان كلاهما يقرأ ٣٩ فيمضيان معاً.
       والشرطان معاً في `where` — فمن بلغ أيَّهما لم يُحدَّث صفُّه. */
    insert into public.ai_quota as q (teacher_id, period, used, pages_used)
         values (v_uid, v_period, 1, v_n)
    on conflict (teacher_id, period) do update
            set used       = q.used + 1,
                pages_used = q.pages_used + v_n,
                updated_at = now()
          where q.used < v_ops
            and q.pages_used + v_n <= v_pages
      returning q.used, q.pages_used into v_used, v_pg;

    if v_used is null then
        -- لم يُحدَّث الصفّ: بلغ أحدَ الحدَّين. نقرأ أيَّهما ليُقال له.
        select q.used, q.pages_used into v_used, v_pg
          from public.ai_quota q
         where q.teacher_id = v_uid and q.period = v_period;
        return query select false,
                            coalesce(v_used, v_ops),
                            v_ops,
                            coalesce(v_pg, v_pages),
                            v_pages,
                            case when coalesce(v_used, v_ops) >= v_ops
                                 then 'operations' else 'pages' end;
        return;
    end if;
    return query select true, v_used, v_ops, v_pg, v_pages, null::text;
end;
$$;

revoke all     on function public.claim_ai_quota(integer) from public, anon;
grant  execute on function public.claim_ai_quota(integer) to authenticated;
