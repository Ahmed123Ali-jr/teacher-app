-- ==========================================================================
-- تراجعٌ فوريّ: شبكةُ الأمان في القاعدة **تكسر حذف الحساب**
-- ==========================================================================
-- الترحيلُ السابق (20260826020000) أضاف إلى `delete_own_account` عبارةَ
-- حذفٍ من `storage.objects` لتلتقط ما يفوت مسحَ التطبيق.
--
-- وسوبابيس تمنع ذلك بمُشغِّلٍ على الجدول:
--     Direct deletion from storage tables is not allowed.
--     Use the Storage API instead.
--
-- فالعبارةُ ترمي، والمعاملةُ كلُّها تُلغى، **فلا يُحذف الحساب إطلاقاً** —
-- وهو بعينه شرطُ آبل الذي أردنا تحصينَه. قيس بحسابٍ تجريبيّ فورَ التطبيق
-- (٢٦ أغسطس ٢٠٢٦) فظهر الخطأ في أوّل محاولة.
--
-- فتعود الدالّةُ إلى جسمها المُثبَت: تحذف الحسابَ وحده، ويتتالى معه كلُّ
-- صفوف القاعدة. ومسحُ الملفات يبقى حيث كان — في التطبيق قبل النداء
-- (`purgeStorage`)، وقد صار يشمل مخزن `portfolio` ولا يسقط مخزنٌ بفشل
-- أخيه.
--
-- والسبيلُ الوحيد لشبكةِ أمانٍ حقيقيّةٍ هو دالّةُ حافّةٍ (Edge Function)
-- بمفتاح الخدمة تنادي **واجهةَ التخزين** ثم تحذف الحساب — قرارٌ مستقلّ.
-- ==========================================================================

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
declare
    uid uuid := auth.uid();
begin
    -- auth.uid() هو الضمانة: لا يستطيع المستخدم حذف غير نفسه مهما استُدعيت.
    if uid is null then
        raise exception 'not authenticated';
    end if;

    delete from auth.users where id = uid;
end;
$$;

revoke all     on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;
