-- ==========================================================================
-- توزيعُ المنهج: العمود الذي لم يوجد قطّ.
--
-- شاشةُ «توزيع المنهج» تكتب `classes.curriculum_files` منذ وُلدت، والعمودُ
-- ليس في أيّ هجرة. فكلُّ حفظٍ يُردّ بـ:
--   Could not find the 'curriculum_files' column of 'classes'
-- والمعلّمُ يرى نافذةً تُغلق ولا يجد شيئاً حين يعود — تبويبٌ يبتلع عمله.
--
-- والبياناتُ وحدها هنا: الملفُّ نفسُه يبقى على الجهاز كما في الكتب
-- (قرارُ المستخدم ٢١ أغسطس)، ويُشار إليه بمعرّفٍ في `local_id`.
-- ==========================================================================

alter table public.classes
    add column if not exists curriculum_files jsonb not null default '[]'::jsonb;

comment on column public.classes.curriculum_files is
    'قائمةُ ملفات توزيع المنهج: [{id, name, notes, filename, size, uploaded_at}] — الملفُّ نفسُه محليٌّ في IndexedDB بالمعرّف id';
