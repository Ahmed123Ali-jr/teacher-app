-- ---------------------------------------------------------------------
-- حذف الحساب من داخل التطبيق.
--
-- آبل تشترط على كل تطبيق يُنشئ حسابات أن يتيح حذف الحساب من داخله
-- (App Store Guideline 5.1.1(v))، ورفضُه من أشهر أسباب رفض التطبيقات.
--
-- حذف صف المعلم وحده لا يكفي: يبقى الحساب في auth.users فيستطيع الدخول
-- بعدها ببريده. والعميل لا يملك مفتاح الخدمة ليحذف من auth.users مباشرةً،
-- فنمرّ بدالة security definer تحذف صاحبها هو فقط.
--
-- والحذف يتتالى وحده: teachers.id يشير إلى auth.users بـon delete cascade،
-- وكل الجداول الأخرى تشير إلى teachers بالمثل — فصفٌّ واحد يُسقط كل شيء.
-- ---------------------------------------------------------------------

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

-- لا تُستدعى إلا من مستخدم مسجَّل الدخول — لا من زائر مجهول.
revoke all     on function public.delete_own_account() from public, anon;
grant  execute on function public.delete_own_account() to authenticated;
