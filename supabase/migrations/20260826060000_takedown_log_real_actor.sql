-- ==========================================================================
-- سجلُّ الإنزالات: مَن حذف الصفَّ فعلاً — لا مَن يملك الدالّة
-- ==========================================================================
-- مُشغِّلُ الوسم كان يكتب `current_user` في `deleted_by`. ودالّةُ
-- `security definer` تعمل بهويّة **مالكها** لا مناديها، فكان العمود يقول
-- `postgres` في كل حالة — سواءٌ حذف المعلّمُ فصلَه من التطبيق أو حذفتَ أنت
-- الصفَّ من اللوحة. قيس في أوّل تجربةٍ حيّة (٢٦ أغسطس ٢٠٢٦): حُذف الفصلُ
-- من التطبيق فتتالى الكتابُ معه، وكُتب `postgres`.
--
-- وهويّةُ المنادي الحقيقيّة تُقرأ من مطالبات الرمز التي يضعها PostgREST في
-- إعدادات الجلسة (`request.jwt.claims`) — وهي متاحةٌ داخل دالّة الـdefiner
-- لأنّها إعدادُ جلسةٍ لا صلاحيّة. فمنها الدورُ والمعرّف:
--   • حذفٌ من التطبيق  → role = authenticated ومعه معرّفُ المعلّم
--   • حذفٌ من اللوحة أو بمفتاح الخدمة → لا مطالبات، فيُكتب `current_user`
--
-- ولا يُلمس السطرُ المكتوبُ سلفاً في التجربة: `deleted_by` فيه `postgres`
-- وهو أثرُ العطب لا أثرُ حذفٍ من اللوحة. يُصحَّح يدوياً أو يُترك — هو سطرُ
-- تجربةٍ لا امتثال.
-- ==========================================================================

alter table public.takedown_log
    add column if not exists deleted_by_uid uuid;

comment on column public.takedown_log.deleted_by is
    'دورُ من أزال الصفّ: authenticated = معلّمٌ من التطبيق · postgres = من اللوحة';
comment on column public.takedown_log.deleted_by_uid is
    'معرّفُ المعلّم الذي أزال الصفّ إن كان الحذف من التطبيق — وإلّا فارغ';

create or replace function public.log_book_takedown_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_uid  uuid;
begin
    begin
        /* مطالباتُ الرمز إعدادُ جلسةٍ يضعه PostgREST — يُقرأ داخل دالّة
           الـdefiner، بخلاف `current_user` الذي يصير هويّةَ المالك. */
        begin
            v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
            v_uid  := nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
        exception when others then
            v_role := null; v_uid := null;   /* مطالباتٌ مشوّهةٌ لا تُوقف الحذف */
        end;

        update public.takedown_log
           set book_deleted_at = now(),
               deleted_by      = coalesce(v_role, current_user::text),
               deleted_by_uid  = v_uid
         where book_id = old.id
           and book_deleted_at is null;
    exception when others then
        raise warning '[takedown_log] تعذّر وسمُ حذف الكتاب % : %', old.id, sqlerrm;
    end;
    return old;
end;
$$;
