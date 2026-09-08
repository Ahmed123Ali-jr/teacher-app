-- ============================================================================
--  بوّابةُ رمز الدخول — للموقع وحدَه
-- ============================================================================
--  طلبُه (٩ سبتمبر ٢٠٢٦): «أريد أيّ أحدٍ يدخل على الموقع يطلع له رمز إدخال،
--  ولا يدخل إلّا اللي يدخل الرمز». **والتطبيقُ المغلَّف لا يطلبه** — بابُه
--  في العميل ويُتخطّى بـ`Capacitor.isNativePlatform()`.
--
--  ── ما تحرسه هذه الهجرة، وما لا تحرسه ──
--  تحرس: **ألّا يُقرأ الرمزُ ولا يُخمَّن**. فلا `select` على الجدول لأحدٍ
--  من العملاء، والتحقّقُ دالّةٌ تردّ `true/false` ولا تُفشي شيئاً.
--  ولا تحرس: **تخطّي البابِ نفسِه** — وهو في العميل، ومن يفتح أدوات
--  المتصفّح يتجاوزه. وقد قَبِل ذلك صراحةً: البابُ يوقف الزائرَ العاديّ،
--  ولا يمكن أن يكون خادميّاً ما دام التطبيقُ معفًى منه — الاثنان يكلّمان
--  سوبابيس بالمفتاح العام نفسِه، والخادمُ لا يصدّق عميلاً يقول «أنا التطبيق».
--
--  ⚠️ ولا يُكتب الرمزُ هنا: المستودعُ **عامّ**، وتاريخُ git لا يُمحى.
--     يُكتب من لوحة سوبابيس بعد تشغيل الهجرة (السطرُ في آخر الملفّ).
-- ============================================================================

create table if not exists public.web_access_codes (
    code        text primary key,
    label       text,
    active      boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table public.web_access_codes is
    'رموزُ دخول الموقع. لا يقرؤها عميلٌ أبداً — التحقّقُ عبر web_code_ok() وحدَها. والتطبيقُ المغلَّف لا يمرّ بها.';

alter table public.web_access_codes enable row level security;

-- لا سياسةَ قراءةٍ ولا كتابةٍ لأحد: الجدولُ للوحة المالك وحدَها.
-- (لوحةُ سوبابيس تدخل بمفتاح المالك فتتجاوز RLS — فهو يقرؤه ويكتبه منها.)
revoke all on public.web_access_codes from anon, authenticated;

-- ── دالّةُ التحقّق ──
--  `security definer` لتقرأ الجدولَ الذي لا يقرؤه أحد.
--  و`search_path` مثبَّتٌ: بلا تثبيته يمكن أن يُخدع بمخطّطٍ يسبقه.
create or replace function public.web_code_ok(p_code text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
    select exists (
        select 1 from public.web_access_codes
        /* يُشذَّب ويُوحَّد حرفُه: المعلّمُ يلصق الرمزَ فتأتي معه مسافة. */
        where active
          and lower(code) = lower(btrim(p_code))
    );
$$;

comment on function public.web_code_ok(text) is
    'هل هذا رمزُ دخولٍ صالح؟ تردّ true/false فقط ولا تُفشي الرموز.';

-- البابُ يقع **قبل الدخول**، فالمنادي `anon` لا `authenticated`.
revoke all on function public.web_code_ok(text) from public;
grant execute on function public.web_code_ok(text) to anon, authenticated;

-- ============================================================================
--  بعد `supabase db push` يُكتب الرمزُ من لوحة سوبابيس (SQL Editor):
--
--      insert into public.web_access_codes (code, label)
--      values ('ضع-الرمز-هنا', 'الرمز العام');
--
--  ولتغييره لاحقاً:   update public.web_access_codes set active = false;
--                    ثمّ أدرج رمزاً جديداً.
--  ولإطفاء البوّابة كلِّها قبل رفع آبل: `GATE_ON = false` في js/web-gate.js
--  — ولا حاجةَ لمسّ القاعدة.
-- ============================================================================
