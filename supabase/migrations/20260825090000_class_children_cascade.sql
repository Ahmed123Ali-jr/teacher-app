-- ==========================================================================
-- حذفُ الفصل يسحب ما يخصّه — لا يتركه يتيماً
-- ==========================================================================
-- كانت `exams` و`worksheets` و`books` تربط الفصلَ بـ`on delete set null`.
-- فحذفُ الفصل يُبقي صفوفَها بـ`class_id = null`:
--
--   • لا تُرى في الواجهة — كلُّ الشاشات تُصفّي بالفصل، فلا شاشةَ تعرضها
--     ولا سبيلَ لحذفها.
--   • ولا تزول — يسحبها التحميلُ التالي إلى المخبأ من جديد، فتُثقل جهازَ
--     المعلّم بما لا يراه ولا يملك حذفه.
--
-- وقياسٌ قبل هذا الترحيل: فصلٌ فيه اختبارٌ وورقةُ عملٍ وكتاب، حُذف — فبقيت
-- الثلاثةُ كلُّها على الخادم بـ`class_id = null`.
--
-- والصوابُ `cascade`: هذه الصفوف **تخصّ الفصل**، لا تسبقه ولا تبقى بعده.
-- وأخواتُها في الجدول نفسِه (`students` و`attendance` و`participation`
-- و`assignments` و`schedule`) تتتالى أصلاً منذ أوّل ترحيل — فهذا يُلحق
-- الشاذَّ بالقاعدة لا يبتدع سياسة.
--
-- **و`reminders` تبقى `set null` عمداً**: التذكيرُ نصٌّ كتبه المعلّم
-- لنفسه، ويظهر في شاشة التذكيرات بفصلٍ أو بغير فصل — فلا يصير خفيّاً،
-- وحذفُ ما كتبه بيده دون أن يطلب أشدُّ من إبقائه.
--
-- و`curricula` مُدرجةٌ معها وإن كان التطبيق لا يستعملها اليوم: قيدُها
-- خاطئٌ بالخطأ نفسِه، وتركُه صحيحاً أهونُ من تذكّره يوم يُستعمل الجدول.
-- ==========================================================================

alter table public.exams      drop constraint if exists exams_class_id_fkey;
alter table public.exams      add  constraint exams_class_id_fkey
    foreign key (class_id) references public.classes(id) on delete cascade;

alter table public.worksheets drop constraint if exists worksheets_class_id_fkey;
alter table public.worksheets add  constraint worksheets_class_id_fkey
    foreign key (class_id) references public.classes(id) on delete cascade;

alter table public.books      drop constraint if exists books_class_id_fkey;
alter table public.books      add  constraint books_class_id_fkey
    foreign key (class_id) references public.classes(id) on delete cascade;

alter table public.curricula  drop constraint if exists curricula_class_id_fkey;
alter table public.curricula  add  constraint curricula_class_id_fkey
    foreign key (class_id) references public.classes(id) on delete cascade;

-- ما تيتّم قبل هذا الترحيل يُمسح: لا شاشةَ تعرضه، ولا معنى لإبقائه.
delete from public.exams      where class_id is null;
delete from public.worksheets where class_id is null;
delete from public.books      where class_id is null;
delete from public.curricula  where class_id is null;
