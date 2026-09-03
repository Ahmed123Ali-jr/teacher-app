import { SectionMark } from '@/components/ui/SectionMark';
import { PhoneFrame } from '@/components/ui/PhoneFrame';

/* القسمُ الثالث — التمريرُ المثبَّت.
   كلُّ ميزةٍ كتلةٌ بارتفاع الشاشة، والجوالُ **ملتصقٌ داخلها** فيثبت ما دامت
   الكتلةُ تمرّ ثمّ يُفرَج عنه لتليها التالية. فتُقرأ الشاشةُ ثابتةً والمحتوى
   يتبدّل — بـ`position: sticky` وحدَه.

   ── ولماذا لا مُثبَّتٌ واحدٌ يتبدّل محتواه ──
   ذاك يلزمه `animation-timeline: scroll()` أو مستمعُ تمرير، **وكلاهما تعذّر
   التحقّقُ منه في بيئة القياس عندي** (لا أحداثَ تمريرٍ ولا مراقبَ تقاطعٍ
   ولا خطوطاً زمنيّة — قِيست كلُّها بصفر). و`sticky` تخطيطٌ لا حركة، فيُقاس
   بـ`getBoundingClientRect` عند أيّ موضعِ تمرير، ويتدهور تدهوراً تامّاً:
   من لا يدعمه يرى أربعَ كتلٍ متتالية — وهي نفسُها حالةُ تقليل الحركة. */

type Feature = {
    n: number;
    title: string;
    body: React.ReactNode;
    shot?: string;
    alt: string;
};

const FEATURES: Feature[] = [
    {
        n: 1,
        title: 'الرئيسيّةُ تعرف يومَك',
        body: 'ستُّ حالاتٍ لا شاشةٌ واحدة: تعرف أنّك في نهاية الأسبوع، وتعرف الإجازةَ الرسميّةَ باسمها من تقويم الوزارة، وتعرف أنّ حصصك انتهت. وحين تكون في يومِ دوامٍ تريك حصصَ اليوم بأوقاتها، وتحتها زرٌّ يفتح سجلَّ الفصل الذي أمامك.',
        shot: '/shots/dashboard.webp',
        alt: 'الشاشة الرئيسيّة في تطبيق فصول: تحيّةٌ باسم المعلّم، وتاريخٌ هجريّ، وصندوقُ حصص اليوم',
    },
    {
        n: 2,
        title: 'فصولُك مرتَّبةٌ كما تفكّر بها',
        body: 'المعلّم السعوديُّ يدرّس خمسةَ فصولٍ في مراحلَ مختلفة، وكشوفُه ورقٌ متفرّق. هنا كلُّ فصولك في نظرةٍ واحدة، مجموعةً بالمرحلة — ابتدائيّ ومتوسّط وثانويّ — والمرحلةُ الفارغةُ تُحذف من العرض.',
        shot: '/shots/classes.webp',
        alt: 'شاشةُ الفصول في تطبيق فصول: الفصولُ مجموعةٌ تحت متوسّط وثانويّ',
    },
    {
        n: 3,
        title: 'جدولُك كلُّه في شاشةٍ واحدة',
        body: 'خمسةُ أيّامٍ وسبعُ حصصٍ بلا سحبٍ يميناً ويساراً، وأوقاتُها محسوبةٌ من وقت البداية ومدّة الحصة والفسحة. ومعه التقويمُ الدراسيُّ الرسميُّ يُختار وحدَه من إدارة تعليمك، فيقول لك في أيّ أسبوعٍ أنت ومتى الإجازةُ القادمة.',
        shot: '/shots/schedule.webp',
        alt: 'الجدولُ الأسبوعيُّ في تطبيق فصول: شبكةُ خمسةِ أيّامٍ وسبعِ حصص، وبطاقةُ التقويم الدراسيّ',
    },
    {
        n: 4,
        title: '«كيف حالُ فصولي؟» — جوابٌ ثمّ دليلُه',
        body: (
            <>
                رقمٌ واحدٌ كبيرٌ في الصدر: نسبةُ الحضور العامّة، وتحته من كم حالةٍ حُسبت. ثمّ
                تفصيلُ الحضور بأشرطةٍ تُقاس بالعين، ثمّ الأعلى التزاماً وأكثرُ تغيّباً{' '}
                <strong className="font-semibold text-ink">بأسمائهم</strong> — فتعرف بمن
                تتّصل اليوم.
            </>
        ),
        shot: '/shots/reports.webp',
        alt: 'شاشةُ التقارير في تطبيق فصول: نسبةُ حضورٍ عامّة، وتفصيلٌ بالأشرطة، وقائمةُ الأعلى التزاماً',
    },
];

const AR = '٠١٢٣٤٥٦٧٨٩';
const toArabic = (n: number) => String(n).padStart(2, '0').replace(/\d/g, (d) => AR[+d]);

export function Features() {
    return (
        <section className="grain relative isolate bg-page px-5 pt-8 md:px-6 md:pt-9 lg:pt-10">
            <SectionMark n={3} />

            {FEATURES.map((f) => (
                /* الكتلةُ ‎١٧٠svh‎ والعمودان ‎١٠٠svh‎ ملتصقان — فبينهما ‎٧٠svh‎
                   يثبت فيها الزوجُ كلُّه ثمّ يُفرَج عنه للتالي.
                   وهذا شرطُ `sticky` الذي أغفلتُه أوّلاً: العنصرُ الملتصقُ
                   بارتفاع أبيه لا يجد مدىً يتحرّك فيه، فيمرّ مرورَ العاديّ.
                   (قِيس: كانت الأعلى تنزل ‎1931 ← 131 ← −769‎ بلا تثبيت.) */
                <div key={f.n} className="relative mx-auto max-w-column md:min-h-[170svh]">
                    <div className="grid items-start gap-7 py-8 md:grid-cols-2 md:gap-8 md:py-0
                                    md:min-h-[170svh]">
                        {/* النصُّ أوّلاً في الـDOM — فيقع يميناً تحت dir=rtl،
                            وينطبق مسارُ العين على مسار الـTab. لا row-reverse. */}
                        <div className="md:sticky md:top-0 md:flex md:h-[100svh] md:flex-col
                                        md:justify-center">
                            <div className="mb-4 flex items-center gap-4">
                                <bdi dir="rtl" className="text-folio font-medium text-ink-faint">
                                    {toArabic(f.n)} / {toArabic(FEATURES.length)}
                                </bdi>
                                <span className="h-px w-6 bg-rule-hair" aria-hidden="true" />
                            </div>
                            <h2 className="text-h1 font-semibold text-ink md:text-[34px] md:leading-[1.28]">
                                {f.title}
                            </h2>
                            <p className="mt-5 max-w-measure text-body text-ink-muted md:text-[17px]">
                                {f.body}
                            </p>
                        </div>

                        {/* الجوالُ ملتصقٌ داخل كتلته: يثبت ما دامت تمرّ ثمّ يُفرَج عنه */}
                        <div className="md:sticky md:top-0 md:flex md:h-[100svh] md:items-center">
                            <PhoneFrame src={f.shot} alt={f.alt} />
                        </div>
                    </div>
                </div>
            ))}
        </section>
    );
}
