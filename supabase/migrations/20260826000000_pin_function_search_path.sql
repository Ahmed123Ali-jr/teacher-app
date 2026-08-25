-- ==========================================================================
-- تثبيتُ `search_path` في دالّتَي المُشغِّلات
-- ==========================================================================
-- فاحصُ Supabase الآليّ يرفع `function_search_path_mutable` على دالّتين:
-- `set_updated_at` و`reminders_sync_text`. ومعناه أن الدالّة تبحث عن ما
-- تناديه في مسارٍ يملك مناديها تغييرَه — فيُنشئ كائناً بالاسم نفسِه في
-- مخطّطٍ يسبق في الترتيب، فتُنفَّذ شيفرتُه بدل المقصودة.
--
-- **والخطرُ هنا نظريٌّ لا عمليّ**: الدالّتان `security invoker` (لا
-- `definer`)، فتعملان بصلاحيّات المستدعي نفسِه — فلا صلاحيّةَ تُختطف.
-- لكنّ التثبيتَ مجّانيّ، ويُسكت رايةً تبقى ترتفع في كل فحص.
--
-- ── لماذا `''` لا يكسر شيئاً ──
-- `set_updated_at` جسمُها `new.updated_at = now()` — و`now()` من
-- `pg_catalog`، وهو في المسار دائماً ولو كان فارغاً (يضيفه بوستجرس ضمناً).
-- و`reminders_sync_text` إسنادُ حقولٍ بلا نداءِ دالّةٍ واحد.
--
-- ── الرجوع ──
--   alter function public.set_updated_at()      reset search_path;
--   alter function public.reminders_sync_text() reset search_path;
-- ==========================================================================

alter function public.set_updated_at()      set search_path = '';
alter function public.reminders_sync_text() set search_path = '';
