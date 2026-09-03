/* فاصلُ الأقسام: خطٌّ شعريٌّ بعرض عمود المحتوى، ورقمُ القسم في الهامش.
   الفاصلُ ليس فراغاً — هو ترقيمُ صفحاتِ الوثيقة.
   والأرقامُ هنديّةٌ لأنّ الوثيقةَ المدرسيّةَ السعوديّةَ تُقرأ هكذا. */
const AR = '٠١٢٣٤٥٦٧٨٩';
const toArabic = (n: number) => String(n).padStart(2, '0').replace(/\d/g, (d) => AR[+d]);

export function SectionMark({ n, total = 7 }: { n: number; total?: number }) {
    return (
        <div className="relative mx-auto w-full max-w-column" aria-hidden="true">
            <div className="h-px w-full bg-rule-hair" />
            {/* الرقمُ في هامش البداية (يمينُ الصفحة في RTL) — وهو الهامشُ
                الذي يبقى وحدَه تحت ‎٩٠٠px‎، فلا ينفصل الرقمُ عن خطّه.
                ويُعزَل بـ‎bdi‎: «٠٢ / ٠٧» فيها فاصلٌ محايدٌ قد يقلب الترتيب.

                و‎dir="rtl"‎ صريحةٌ عليه لا اكتفاءً بالوراثة: ‎bdi‎ افتراضُه
                ‎dir="auto"‎، والأرقامَ الهنديّةَ صنفُها البِدْيُّ «رقمٌ عربيّ»
                وهو **ضعيفٌ لا قويّ** — فلا يجد المتصفّحُ محرفاً قويّاً يشتقّ
                منه الاتّجاه فيقع على ‎ltr‎. وحينها ينقلب ‎inset-inline-start‎
                إلى يسار الصفحة بدل يمينها. (قِيس: ‎direction‎ رجع ‎ltr‎.) */}
            <bdi dir="rtl" className="absolute start-0 top-4 text-folio font-medium text-ink-faint">
                {toArabic(n)} / {toArabic(total)}
            </bdi>
        </div>
    );
}
