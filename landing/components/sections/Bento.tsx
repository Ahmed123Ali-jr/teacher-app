import { SectionMark } from '@/components/ui/SectionMark';
import { Reveal } from '@/components/ui/Reveal';

/* القسمُ الرابع — شبكةٌ غير متناظرة.
   ولا أرقامَ أعمدةٍ صريحة (`grid-column: 1/8`): المسارُ ١ يبقى يساراً مهما
   كان الاتّجاه. فالمناطقُ بأسمائها، والخليّةُ الكبرى **أوّلَ عنصرٍ في
   الـDOM** فتقع يميناً من تلقائها، وينطبق مسارُ العين على مسار الـTab. */

type Cell = { area: string; title: string; body: React.ReactNode; gold?: boolean };

const CELLS: Cell[] = [
    {
        area: 'a',
        title: 'شبكةُ المدرسة تنقطع — وعملُك لا',
        body: 'تُحضّر ثلاثين طالباً في فصلٍ بلا تغطية، فيُقال لك مرّةً واحدةً «لا اتصال — ما تكتبه محفوظٌ على جهازك»، ثمّ يُرسل كلُّ شيءٍ وحدَه حين تعود الشبكة. وصندوقٌ صادرٌ يحفظ الترتيب: طالبٌ يُضاف ثمّ يُعدَّل لا يُعدَّل قبل أن يُضاف.',
        gold: true,
    },
    {
        area: 'b',
        title: 'ورقةٌ لا يُقصُّ فيها سؤال',
        body: 'خمسةُ أنواعِ أسئلة، وترويسةُ وزارة التعليم بشعار مدرستك، ونموذجُ إجابةٍ في صفحةٍ منفصلة — والترقيمُ يقيس كلَّ كتلةٍ قبل رصّها.',
    },
    {
        area: 'c',
        title: '١٩ استراتيجيّة و٣٠ مبادرة',
        body: 'بخطواتها التنفيذيّة وشواهدها المقترحة — لا تعريفاتٍ نظريّة. يسألك المشرف «أيَّ استراتيجيّةٍ طبّقت؟» فيكون الجوابُ موثَّقاً بتاريخه.',
    },
    {
        area: 'd',
        title: 'صوِّر كشفَك — ولا يُحفظ اسمٌ لم تره',
        body: (
            <>
                الإكسل يُقرأ داخل متصفّحك بلا رفع. والصورةُ تُقرأ بالذكاء، ثمّ{' '}
                <strong className="font-semibold text-ink">شاشةُ مراجعةٍ إلزاميّة</strong>{' '}
                تقول لك بصراحة أيَّ طريقٍ قرأ أسماءك، ومتى يجب أن تدقّق.
            </>
        ),
    },
    {
        area: 'e',
        title: '«طالبة» لا «طالب»',
        body: 'كلمةٌ واحدةٌ في الإعدادات تقلب التطبيق كلَّه — ومعها عدٌّ عربيٌّ صحيح: «طالبتان» لا «٢ طلاب».',
    },
    {
        area: 'f',
        title: 'لونُ التطبيق تختاره أنت',
        body: (
            <>
                أربعَ عشرةَ عائلةَ لونٍ بسبع درجات — والحدُّ الأدنى للتباين{' '}
                <strong className="font-semibold text-ink">مفروضٌ بالحساب</strong>: الأبيضُ فوق
                لونك ‎٧:١‎ فأعلى.
            </>
        ),
    },
];

export function Bento() {
    return (
        <section className="grain vignette relative isolate bg-page px-5 py-8 md:px-6 md:py-9 lg:py-10">
            <SectionMark n={4} />
            <div className="relative z-10 mx-auto mt-8 max-w-column md:mt-9">
                <h2 className="mb-7 max-w-measure text-h1 font-semibold text-ink md:text-[34px] md:leading-[1.28]">
                    وتفاصيلُ لا تُذكر في إعلان — تُحَسّ يومَ تعمل
                </h2>
                <div className="bento grid gap-4 md:gap-5">
                    {CELLS.map((c, i) => (
                        <Reveal key={c.area} delay={i * 90} className="contents-reveal"
                                y={13}>
                        <article
                            style={{ gridArea: c.area }}
                            className={`bento-card group rounded-lg border border-rule/60 bg-sheet p-5
                                        transition-[background-color,border-color,transform]
                                        duration-[233ms] ease-lift md:p-6
                                        ${c.gold ? 'border-t-rule-gold' : ''}`}
                        >
                            <h3 className="text-h3 font-semibold text-ink md:text-[21px]">{c.title}</h3>
                            <p className="mt-4 text-body text-ink-muted">{c.body}</p>
                        </article>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
