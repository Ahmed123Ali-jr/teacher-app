import { SectionMark } from '@/components/ui/SectionMark';
import { Counter } from '@/components/ui/Counter';

/* القسمُ الخامس — أرقامٌ من داخل المنتَج لا أرقامَ تبنٍّ.
   لا معلّمين بعد، فأيُّ «٥٠٠٠ معلّم» كذبٌ يُكتشف. وكلُّ رقمٍ أدناه
   **مقيسٌ من الكود**: كتالوجُ الاستراتيجيّات، وكتالوجُ المبادرات،
   وأقسامُ ملفّ الإنجاز، وتقويما وزارة التعليم. */
const STATS = [
    { n: 19, label: 'استراتيجيّةَ تدريس', sub: 'بخمسِ خطواتٍ تنفيذيّةٍ لكلٍّ منها' },
    { n: 30, label: 'مبادرةً مدرسيّة',   sub: 'في ثمانية تصنيفاتٍ بسياقٍ سعوديّ' },
    { n: 10, label: 'أقسامٍ في ملفّ الإنجاز', sub: 'ثلاثةٌ منها تتعبّأ وحدَها' },
    { n: 2,  label: 'تقويمَي وزارةٍ رسميَّين', sub: 'يُختار تقويمُك من إدارة تعليمك' },
];

export function Stats() {
    return (
        <section className="grain vignette relative isolate bg-page px-5 py-8 md:px-6 md:py-9 lg:py-10">
            <SectionMark n={5} />
            <div className="relative z-10 mx-auto mt-8 max-w-column md:mt-9">
                {/* السطحُ البتروليُّ الوحيدُ في الصفحة — يُقرأ «صفحةَ الملخّص» */}
                <div className="rounded-xl bg-sheet-petrol px-5 py-8 md:px-8 md:py-9">
                    <h2 className="mb-8 max-w-measure text-h2 font-semibold text-ink md:text-[26px]">
                        ولم نَعُدَّ لك معلّمين — عددنا ما في التطبيق
                    </h2>
                    <dl className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
                        {STATS.map((s, i) => (
                            <div key={s.label} className={i > 0 ? 'stat-cell' : ''}>
                                <dt className="sr-only">{s.label}</dt>
                                <dd>
                                    <Counter to={s.n} />
                                    <div className="mt-3 text-h3 font-semibold text-ink">{s.label}</div>
                                    <div className="mt-2 text-body text-ink-muted">{s.sub}</div>
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </section>
    );
}
