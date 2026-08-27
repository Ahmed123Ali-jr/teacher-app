-- ==========================================================================
-- السياساتُ تُقيَّد بدور `authenticated` — وما الذي يعنيه ذلك فعلاً
-- ==========================================================================
-- كلُّ سياسةٍ في `public` مكتوبةٌ بلا `TO`، ومعناها في بوستجرس `TO public`
-- أي **تُقيَّم لكلّ دور** — بما فيه `anon` (الزائرُ بلا حساب). وهي لا تُسرِّب
-- شيئاً اليوم: كلُّها تشترط `auth.uid()`، وهو `null` لغير المسجَّل، فلا
-- يطابق صفّاً (قِيس في المحور الأول: المفتاحُ العامّ يرجع `[]` من الجداول
-- الأربعة والعشرين). **فهذا تحصينٌ لا إصلاحُ ثغرة.**
--
-- وفائدتُه شيئان:
--   ١) **أداء**: بوستجرس يتخطّى تقييمَ السياسة كلَّها لدور `anon` بدل أن
--      يحسب `auth.uid()` ثمّ يجدها لا تطابق.
--   ٢) **وضوحُ النيّة**: من يقرأ السياسة يعرف لمن هي، ويُسقط ٢٥ تحذيراً في
--      فاحص سوبابيس فتبقى القائمةُ نظيفةً تُرى فيها التحذيراتُ الحقيقيّة.
--
-- ── لماذا `ALTER POLICY` لا إعادةُ الكتابة ──
-- `alter policy … to authenticated` تغيّر **الدورَ وحده**، وتترك `USING`
-- و`WITH CHECK` كما هما حرفاً بحرف. فلا خطرَ من خطأٍ في نقل شرطٍ معقّد —
-- وشروطُ هذا المشروع فيها `owns_class` و`owns_student` و`owns_eval_column`
-- ممّا لا يُعاد كتابتُه بلا مخاطرة.
--
-- ── ما قد يكسره ──
-- **لا شيء في هذا المشروع** — وقيس قبل الكتابة لا افتراضاً:
--
--   • **حسابُ الزائر دورُه `authenticated` لا `anon`** (قِيس ٢٧ أغسطس ٢٠٢٦
--     بفكّ رمز جلسةٍ حقيقيّة: `role=authenticated` و`is_anonymous=true`).
--     فالزائرُ لا يتأثّر — وهذا أخطرُ ما كان يمكن أن ينكسر.
--   • ولا سياسةَ واحدةٌ تمنح `anon` وصولاً، فلا شيءَ يُفقد بإقصائه.
--
-- **ولو احتجتَ يوماً قراءةً عامّةً بلا حساب** (صفحةُ مشاركةٍ مثلاً) فاكتب
-- لها سياسةً صريحةً `TO anon` — ولا تعتمد على `public` المبهمة.
--
-- ── ما لا يُمسّ ──
-- سياساتُ `storage.objects` خارج هذا الترحيل (مخطَّطٌ آخر): تديرها سوبابيس
-- وقواعدُها مختلفة، وتغييرُها هنا خطرٌ بلا مقابل.
--
-- ── الرجوع ──
--   do $$ declare r record; begin
--     for r in select schemaname, tablename, policyname from pg_policies
--              where schemaname = 'public' and roles = '{authenticated}'
--     loop execute format('alter policy %I on %I.%I to public',
--                         r.policyname, r.schemaname, r.tablename); end loop;
--   end $$;
-- ==========================================================================

do $$
declare
    r       record;
    changed int := 0;
begin
    for r in
        select schemaname, tablename, policyname
          from pg_policies
         where schemaname = 'public'
           and roles      = '{public}'      -- المبهمةُ وحدها؛ المقيَّدةُ تُترك
         order by tablename, policyname
    loop
        execute format('alter policy %I on %I.%I to authenticated',
                       r.policyname, r.schemaname, r.tablename);
        changed := changed + 1;
    end loop;

    raise notice 'قُيّدت % سياسةً بدور authenticated', changed;
end $$;
