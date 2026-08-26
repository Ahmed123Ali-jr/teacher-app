-- ==========================================================================
-- إتمامُ السحب على دوالّ المُشغِّلات الباقية
-- ==========================================================================
-- جُرِّب السحبُ على `log_book_takedown` وحدها (20260826070000) وقيس بحساب
-- معلّمٍ حقيقيّ: إنشاءُ فصلٍ ورفعُ كتابٍ **وتعديلُه** — والتعديلُ هو الذي
-- يُطلق المُشغِّل بدور `authenticated`. نجحت الأربعُ عمليّاتٍ كلُّها.
--
-- فثبت أنّ بوستجرس يفحص صلاحيّةَ التنفيذ عند **إنشاء** المُشغِّل لا عند
-- إطلاقه — وهو ما لم أكن واثقاً منه، فجُرِّب ولم يُفترض.
--
-- والباقية ثلاث، وكلُّها `security definer` وتُطلق من مسارات حسّاسة:
--   handle_new_user            — إنشاءُ صفّ المعلّم عند التسجيل
--   handle_user_deleted        — تنظيفُ ملفات المخازن عند حذف الحساب
--   log_book_takedown_delete   — وسمُ سجلّ الإنزال حين يزول صفُّ الكتاب
--
-- ── الرجوع ──
--   grant execute on function public.handle_new_user()          to public;
--   grant execute on function public.handle_user_deleted()      to public;
--   grant execute on function public.log_book_takedown_delete() to public;
-- ==========================================================================

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_user_deleted()      from public, anon, authenticated;
revoke execute on function public.log_book_takedown_delete() from public, anon, authenticated;
