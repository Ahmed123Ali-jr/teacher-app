-- =====================================================================
-- أعمدةُ الاختبارات وأوراق العمل اليدويّة
-- ---------------------------------------------------------------------
-- بُني الجدولان يوم كان المحتوى يُولَّد بالذكاء الاصطناعيّ: عمودٌ واحدٌ
-- اسمه `content` يحمل كلَّ شيء، ومعه `prompt`. ثمّ صار الإنشاءُ يدويّاً
-- بمحرّر أسئلةٍ حقيقيّ، فصار التطبيقُ يكتب حقولاً لا وجودَ لها في
-- المخطّط — ولم يُكتب لها ترحيلٌ قطّ.
--
-- والنتيجةُ أن كلَّ حفظٍ يُرفض:
--     Could not find the 'instructions' column of 'worksheets'
--     Could not find the 'questions'    column of 'exams'
-- والطباعةُ تبدأ بحفظٍ فتموت معه. (بلاغُ المعلّم، ٢٠ أغسطس ٢٠٢٦:
-- «أسوي الأسئلة وأسوي طباعة وحفظ ماتنطبع ولاتنحفظ».)
--
-- والأعمدةُ كلُّها تقبل العدم ولها قيمٌ افتراضيّة، فالصفوفُ القديمة
-- المولَّدةُ بالذكاء تبقى صالحةً كما هي، و`content` و`prompt` لا يُمسّان.
-- =====================================================================

-- ── أوراق العمل ──
alter table public.worksheets
    add column if not exists topic        text,
    add column if not exists instructions text,
    add column if not exists questions    jsonb not null default '[]'::jsonb,
    add column if not exists exercises    jsonb,
    add column if not exists updated_at   timestamptz;

-- ── الاختبارات ──
alter table public.exams
    add column if not exists source_type    text,
    add column if not exists source_details text,
    add column if not exists questions      jsonb not null default '[]'::jsonb,
    add column if not exists settings       jsonb not null default '{}'::jsonb,
    add column if not exists updated_at     timestamptz;
