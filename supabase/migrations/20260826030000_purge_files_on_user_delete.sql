-- ==========================================================================
-- زوالُ الحساب يُطلق تنظيفَ ملفاته — من أيّ بابٍ زال
-- ==========================================================================
-- التنظيفُ كان في التطبيق: `delete-account` تمسح المخازن ثمّ تحذف الحساب.
-- وهو يعالج البابَ الذي يمرّ منه المعلّم، **ولا يعرف شيئاً عن غيره**:
-- حسابٌ يُحذف من لوحة التحكّم، أو بسكربت، أو من الواجهة الإدارية — تبقى
-- ملفاتُه إلى الأبد، إذ سياساتُ المخازن تُطابق المجلّد بـ`auth.uid()`
-- ومعرّفُ صاحبه لم يعد له وجود. فلا هو يصل إليها، ولا غيرُه، ولا أنت من
-- داخل التطبيق.
--
-- فيُنقل التنظيفُ إلى حيث لا يُتجاوز: مُشغِّلٌ على `auth.users` نفسِه.
-- **الحذفُ لا يتمّ إلّا بإزالة الصفّ، والمُشغِّلُ ملتصقٌ بالصفّ** — فما من
-- بابٍ يفوته. (وفي المشروع أخوه في الاتجاه المعاكس منذ أوّل ترحيل:
-- `on_auth_user_created` الذي يُنشئ صفَّ المعلّم عند التسجيل.)
--
-- ── لماذا `pg_net` ولماذا بعد الحذف ──
-- الحذفُ الفعليُّ للملفّ لا يكون إلّا عبر واجهة التخزين (وسوبابيس تمنع
-- الحذفَ المباشر من جداولها — وقد كسر ذلك حذفَ الحساب يوم ٢٦ أغسطس).
-- و`pg_net` يضع الطلبَ في طابورٍ ويرسله عاملٌ في الخلفية **بعد أن تُثبَّت
-- المعاملة**، فلا ينتظره الحذفُ ولا يبطئه. وترتيبٌ مقصود: حين يصل الطلبُ
-- يكون الحسابُ قد زال فعلاً، فيمرّ من حارس الدالّة («لا تُنظّف إلّا
-- معرّفاً لا وجود له»).
--
-- ══ والسلامةُ قبل كلّ شيء ══
-- **مُشغِّلٌ يرمي خطأً على `auth.users` يعني أن حذفَ الحساب يتعطّل تماماً**
-- — وهو شرطُ آبل 5.1.1(v)، وقد وقع فعلاً في هذا المشروع قبل ساعاتٍ حين
-- أُضيف حذفُ التخزين داخل `delete_own_account`.
--
-- فكلُّ جسم الدالّة داخل `begin … exception when others` يبتلع كلَّ شيء:
-- امتدادٌ غيرُ مثبَّت، طابورٌ ممتلئ، عنوانٌ خاطئ — لا شيء منها يمنع معلّماً
-- من حذف حسابه. أسوأُ ما يقع أن يبقى ملفٌّ، وتلتقطه مكنسةُ
-- `tools/purge-orphan-files.mjs`.
--
-- ── الرجوع ──
--   drop trigger  if exists on_auth_user_deleted on auth.users;
--   drop function if exists public.handle_user_deleted();
--   -- والامتدادُ يُترك: قد تستعمله أشياءُ أخرى.
-- ==========================================================================

create extension if not exists pg_net;

create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        perform net.http_post(
            url     := 'https://rbsfpsmolxldmwcclhlc.supabase.co/functions/v1/purge-user-files',
            body    := jsonb_build_object('uid', old.id),
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                -- المفتاحُ العامّ (المنشور في التطبيق) — يمرّ به الطلبُ من
                -- بوّابة الدوالّ لا غير. والصلاحيةُ الفعليّةُ في الدالّة
                -- نفسِها: لا تُنظّف إلّا معرّفاً لا وجود له.
                'Authorization', 'Bearer sb_publishable_z5RQ0LotgRBWRSUXjTz38w_GOyBOhUX'
            ),
            timeout_milliseconds := 8000
        );
    exception when others then
        /* لا شيءَ يمنع حذفَ الحساب. يُسجَّل التحذيرُ ويمضي. */
        raise warning '[handle_user_deleted] تعذّر إطلاق التنظيف لـ% : %', old.id, sqlerrm;
    end;
    return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
    after delete on auth.users
    for each row execute function public.handle_user_deleted();
