-- ==========================================================================
-- مخزنُ مرفقات ملفّ الإنجاز
-- ==========================================================================
-- مرفقاتُ ملفّ الإنجاز (الشهادات والجداول والإضافات والأقسام المخصّصة) كانت
-- تُرمَّز نصّاً (base64) وتُحشى في عمود `data` في **صفٍّ واحدٍ** لكلّ معلّم.
-- ونتيجتُه أن الصفَّ كلَّه يُرفع في كلّ حفظٍ ويُنزَّل في كلّ فتحة: تعديلُ
-- كلمةٍ في الرؤية كان يرفع مرفقاتِ المعلّم كلَّها معها.
--
-- فتنتقل الملفاتُ إلى مخزنٍ خاصّ، ويبقى في `data` **إشارةٌ إليها لا هي**:
-- `storage_path` مع اسمها وحجمها ونوعها. فيصير الصفُّ كيلوباياتٍ معدودة،
-- ولا يُنزَّل المرفقُ إلّا حين يفتحه المعلّم أو يطبع ملفَّه.
--
-- ── لماذا لا يُستعمل جدول `portfolio_files` القائم ──
-- هو موجودٌ منذ أوّل ترحيلٍ وفارغ. وملفُّ الإنجاز **وثيقةٌ** لا جدول: أقسامٌ
-- مرتّبةٌ فيها عناصرُ مرتّبة، وأقسامٌ يصنعها المعلّم بنفسه. فلو سكن
-- الوصفُ jsonb وسكنت المرفقاتُ جدولاً لصار للحقيقة الواحدة موضعان يفترقان
-- (عنصرٌ يُحذف من الوثيقة فيبقى صفُّه يتيماً). فالمرجعُ واحد: الوثيقة،
-- وفيها مسارُ الملفّ.
--
-- ── الحدود ──
-- • خاصٌّ لا عامّ، وكلُّ معلّمٍ في مجلدٍ باسم معرّفه — كما `books`
--   و`evidence` تماماً.
-- • ٣٢ ميجابايت للملفّ: أقصى ما تقبله الشاشةُ ٣٠ للمستندات، والصورُ تُضغط
--   في المتصفّح قبل أن تصل (٩٫٧ ميجا تصير ٣٨٢ كيلو).
-- • **ولا قيدَ على نوع الملفّ**: القيدُ نفسُه رُفع عن `books` يوم ٢٠٦٢٠٥١٢
--   لأنّ iOS يرسل الـPDF أحياناً بنوعٍ فارغٍ أو `application/octet-stream`
--   فيُردّ الرفعُ بلا سبب. والشاشةُ تحصر الاختيارَ بـ`accept` أصلاً.
--
-- ── الرجوع ──
--   delete from storage.objects where bucket_id = 'portfolio';
--   delete from storage.buckets where id = 'portfolio';
--   (وسياساتُها تُسقط بأسمائها الأربعة أدناه)
-- ==========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', false, 33554432 /* 32 MB */, null)
on conflict (id) do update set
    public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portfolio_owner_read"   on storage.objects;
drop policy if exists "portfolio_owner_insert" on storage.objects;
drop policy if exists "portfolio_owner_update" on storage.objects;
drop policy if exists "portfolio_owner_delete" on storage.objects;

create policy "portfolio_owner_read"   on storage.objects
    for select using (
        bucket_id = 'portfolio'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "portfolio_owner_insert" on storage.objects
    for insert with check (
        bucket_id = 'portfolio'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "portfolio_owner_update" on storage.objects
    for update using (
        bucket_id = 'portfolio'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "portfolio_owner_delete" on storage.objects
    for delete using (
        bucket_id = 'portfolio'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
