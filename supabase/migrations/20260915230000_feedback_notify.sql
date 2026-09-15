-- ==========================================================================
-- ملاحظةُ المعلّم تُرسل بريداً — مشغّلٌ على `feedback`
-- ==========================================================================
-- هجرةُ الجدول (٤ سبتمبر ٢٠٢٦) نصّت: «الجدولُ يُقرأ من لوحة سوبابيس
-- بالعين». وكان صحيحاً يومَها — لا مستخدمين. ويسقط مع أوّل خمسة آلاف
-- معلّم: بلاغُ عطبٍ يجلس أسبوعين لأنّ لا شيءَ يقول إنّه وصل.
--
-- والنمطُ هنا هو نمطُ `handle_user_deleted` نفسُه (٢٦ أغسطس): `pg_net`
-- يضع الطلبَ في طابورٍ ويرسله عاملٌ في الخلفية، فلا يُبطئ الإدخال ولا
-- يربطه بنجاح الشبكة.
--
-- ── ثلاثةُ قرارات ──
--
-- ١) **`after insert` لا `before`.** الصفُّ يُثبَّت أوّلاً؛ فلو انهار
--    الإرسالُ بقيت الملاحظة. والمعلّمُ يرى «وصلَتنا» لأنّها وصلت فعلاً
--    إلى الجدول — وهو ما وُعد به لا بالبريد.
--
-- ٢) **`exception when others` يبتلع كلَّ شيء.** لا شيءَ يمنع معلّماً
--    من إيصال ملاحظته. ويُسجَّل التحذيرُ ويمضي.
--
-- ٣) **المفتاحُ العامُّ في الترويسة** — كما في المشغّل الأخ: يمرّ الطلبُ
--    من بوّابة الدوالّ لا غير، والصلاحيةُ الفعليّةُ في الدالّة نفسِها
--    (لا ترسل إلّا إلى عنوانٍ واحدٍ مثبَّتٍ في شيفرتها).
-- ==========================================================================

create extension if not exists pg_net;

create or replace function public.notify_new_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        perform net.http_post(
            url     := 'https://rbsfpsmolxldmwcclhlc.supabase.co/functions/v1/feedback-notify',
            body    := to_jsonb(new),
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer sb_publishable_z5RQ0LotgRBWRSUXjTz38w_GOyBOhUX'
            ),
            timeout_milliseconds := 8000
        );
    exception when others then
        raise warning '[notify_new_feedback] تعذّر إطلاق البريد لـ% : %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists on_feedback_insert on public.feedback;
create trigger on_feedback_insert
    after insert on public.feedback
    for each row execute function public.notify_new_feedback();
