-- ==========================================================================
-- السقفُ سنةٌ دراسيّةٌ لا شهر — وأرقامُه من استعمال المعلّم لا من التقدير
-- ==========================================================================
-- قال المستخدم (١ سبتمبر ٢٠٢٦): **«المعلّم يرفع جدوله ٤ مرّات في السنة،
-- وعنده عشرون فصلاً في السنة».** وكنتُ قدّرتُ عشرةً فأخطأت.
--
-- ── والخللُ في المدّة قبل الرقم ──
-- الاستيرادُ **دفعةٌ عند بداية الفصل ثمّ صمتٌ شهوراً**: يبني فصولَه ويرفع
-- كشوفَها في أسبوع، ثمّ لا يمسّ الاستيرادَ حتى الفصل التالي. والسقفُ
-- الشهريُّ يقطع تلك الدفعةَ في منتصفها ثمّ يمنحه في الشهر الذي لا يحتاجه.
--
-- وقِيس: أثقلُ سنةٍ عنده **٣١٦ صورةً و٢٤ نداءً**، والسقفُ الشهريُّ
-- (١٢٠ صورة) يوقفه عند **٣٧٪** منها لو وقعت في شهر.
--
-- ── الأرقام، من فاتورته لا من التخمين ──
-- كشفٌ واحدٌ في سجلّه = ‎١٠٬٦٥٧‎ توكناً ≈ ٦ صور، وآخرُ ‎٢١٬٧٩٢‎ ≈ ١٢ صورة.
-- فأثقلُ سنة: ٢٠ كشفاً × ١٢ + ٤ جداولَ × ١٩ (لو كانت مسحاً ضوئيّاً)
--            = ٣١٦ صورةً و٢٤ نداءً = ‎٣٫١٥$‎ بأوبس ٥.
--
--   السقفُ الجديد: **٧٠٠ صورة + ١٠٠ نداء / السنة الدراسيّة**
--   → ضِعفان وربعٌ ممّا يحتاجه أثقلُ معلّمٍ عنده.
--   → وأقصى ما يبلغه مُسيءٌ: ‎١٠٫٠٠$‎ في السنة، واشتراكُه يصل ‎٢٠٫٧٦$‎.
--
-- ── ولماذا سنةٌ دراسيّةٌ لا سنةٌ ميلاديّة ──
-- الفصلُ الثاني يقع في يناير: لو كان العدّادُ ميلاديّاً لانقسمت سنةُ
-- المعلّم عدّادين، وبدأ فصلَه الثاني برصيدٍ جديدٍ لا يحتاجه — وضاع القيدُ
-- على من يستنزف. فتبدأ من أغسطس حيث يبدأ العامُ الدراسيّ.
-- ==========================================================================

drop function if exists public.claim_ai_quota(integer);

create or replace function public.claim_ai_quota(p_pages integer default 1)
returns table (allowed boolean, used integer, quota_limit integer,
               pages integer, pages_limit integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_calls  constant integer := 100;   -- نداءات/سنة  → تقيس الخرج
    v_pages  constant integer := 700;   -- صور/سنة     → تقيس الدخل
    v_uid    uuid    := auth.uid();
    v_now    timestamptz := now() at time zone 'utc';
    /* السنةُ الدراسيّة تبدأ في أغسطس: ما كان شهرُه ٨ فأعلى فهو من سنته،
       وما دونه فمن السنة التي قبله. */
    v_start  integer := extract(year from v_now)::int
                        - case when extract(month from v_now) >= 8 then 0 else 1 end;
    v_period text    := v_start::text || '/' || (v_start + 1)::text;
    v_n      integer := greatest(1, least(coalesce(p_pages, 1), 100));
    v_used   integer;
    v_pg     integer;
begin
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    /* ذرّيّةٌ في عبارةٍ واحدة: لو قُرئ العدّادُ ثمّ زِيد في عبارتين لمرّ
       طلبان متزامنان كلاهما يقرأ ما دون الحدّ فيمضيان معاً. والشرطان
       في `where` — فمن بلغ أيَّهما لم يُحدَّث صفُّه ولم يُرجِع شيئاً. */
    insert into public.ai_quota as q (teacher_id, period, used, pages_used)
         values (v_uid, v_period, 1, v_n)
    on conflict (teacher_id, period) do update
            set used       = q.used + 1,
                pages_used = q.pages_used + v_n,
                updated_at = now()
          where q.used < v_calls
            and q.pages_used + v_n <= v_pages
      returning q.used, q.pages_used into v_used, v_pg;

    if v_used is null then
        select q.used, q.pages_used into v_used, v_pg
          from public.ai_quota q
         where q.teacher_id = v_uid and q.period = v_period;
        return query select false,
                            coalesce(v_used, v_calls),
                            v_calls,
                            coalesce(v_pg, v_pages),
                            v_pages,
                            case when coalesce(v_used, v_calls) >= v_calls
                                 then 'operations' else 'pages' end;
        return;
    end if;
    return query select true, v_used, v_calls, v_pg, v_pages, null::text;
end;
$$;

revoke all     on function public.claim_ai_quota(integer) from public, anon;
grant  execute on function public.claim_ai_quota(integer) to authenticated;
