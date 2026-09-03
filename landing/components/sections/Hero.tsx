import { Logo } from '@/components/ui/Logo';

/* ثلاثةُ أسطرٍ وثمانُ كلمات. النصُّ مقيسٌ على plex-700-arabic عند line-height 1.20:
   أضيقُ زوجٍ (ب ‎−٣٠٤‎ فوق ك ‎+٧٤١‎) خلوصُه ‎+٠٫١٥٥em‎ = ‎+١٦px‎ عند ١٠٤px.
   أيُّ تغييرٍ في النصّ يستدعي إعادةَ القياس — انظر scripts/check-headline.mjs */
const LINES: string[][] = [
    ['أوراقُ', 'فصلِك'],
    ['مرتَّبةٌ', 'كما', 'تحبّ'],
    ['ومطبوعةٌ', 'كما', 'يجب'],
];
const GOLD_WORD = 'أوراقُ';   // الموضعُ الثاني من ميزانيّة الذهب السبعة

const STAGGER = 90;           // ms — يُخفَّض إلى ٦٠ في globals.css على ≤600px
const WORD_MS = 720;

export function Hero() {
    let i = -1;   // عدّادٌ متسلسلٌ عبر الأسطر — ترتيبُ الـDOM هو ترتيبُ RTL
    const totalMs = (LINES.flat().length - 1) * STAGGER + WORD_MS;

    return (
        <section
            className="grain vignette relative isolate overflow-hidden bg-void px-5 md:px-6"
            style={{ height: '100svh' }}
        >
            {/* ── الخلفيّة: طبقتان مطليّتان مرّةً، تتحرّكان بـtransform وحدَه.
                   صفرُ filter:blur — التوهّجُ مرسومٌ لا مُرشَّح. ── */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                <div className="light-pool breathe-a" />
                <div className="sheen" />
                <div
                    className="breathe-b absolute inset-0"
                    style={{
                        background:
                            'radial-gradient(88% 60% at 50% 108%, rgba(10,63,74,.34) 0%,' +
                            ' rgba(10,63,74,0) 64%)',
                    }}
                />
            </div>

            {/* الكتلةُ في المركز البصريّ ≈٤٢٪ لا في المنتصف الحسابيّ: حشوةٌ
                سفليّةٌ ترفعها قليلاً، فالفراغُ يحتضن جسماً مضيئاً لا يحيط بعدم. */}
            <div className="relative z-10 mx-auto flex h-full w-full max-w-column flex-col
                            items-center justify-center pb-8 text-center">

                <div className="fade-up mb-6 flex items-center gap-4" style={{ '--d': '0ms' } as React.CSSProperties}>
                    <Logo size={34} />
                    <span className="h-5 w-px bg-rule" aria-hidden="true" />
                    <span className="text-label font-medium text-ink-faint">
                        كشفُ درجات · جدول · ملفُّ إنجاز
                    </span>
                </div>

                <h1 className="hero-title font-bold text-ink">
                    {LINES.map((line, li) => (
                        <span key={li} className="block">
                            {line.map((w) => {
                                i += 1;
                                const inner =
                                    w === GOLD_WORD ? <span className="gold-underline">{w}</span> : w;
                                return (
                                    <span
                                        key={w + i}
                                        className="hero-word"
                                        style={{ '--d': `${i * STAGGER}ms` } as React.CSSProperties}
                                    >
                                        {inner}
                                        {' '}
                                    </span>
                                );
                            })}
                        </span>
                    ))}
                </h1>

                <p
                    className="fade-up mt-6 max-w-lede text-body-lg text-ink-muted md:text-[21px]"
                    style={{ '--d': `${totalMs + 90}ms` } as React.CSSProperties}
                >
                    فصولُك وطلابُك وحضورُهم ودرجاتُهم في مكانٍ واحد — يعمل بلا إنترنت،
                    ويخرج ورقاً رسميّاً بضغطة.
                </p>

                {/* الموضعُ الثالث: المساحةُ الذهبيّةُ الوحيدةُ في الصفحة كلِّها. */}
                <a
                    href="https://ahmed123ali-jr.github.io/teacher-app/"
                    className="fade-up mt-7 inline-flex h-[55px] items-center rounded-sm bg-gold px-6
                               text-h3 font-semibold text-petrol-deep transition-transform
                               duration-[144ms] ease-ui hover:scale-[1.02] active:scale-[.99]"
                    style={{
                        '--d': `${totalMs + 180}ms`,
                        boxShadow:
                            '0 0 0 1px rgba(201,169,97,.35), 0 10px 34px -10px rgba(201,169,97,.26)',
                    } as React.CSSProperties}
                >
                    ابدأ الآن — فصلُك الأوّل مجّاناً
                </a>
            </div>

            {/* ── مؤشّرُ التمرير ──
                مطلقٌ فلا يزاحم الكتلةَ على شاشةٍ قصيرة، ومركزيٌّ بـinset-inline
                وmargin لا بـtranslateX (التحويلاتُ لا تنقلب في RTL).
                وهو رأسيٌّ أصلاً فلا اتّجاهَ له. */}
            <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-5 z-10 mx-auto h-6 w-px
                           overflow-hidden bg-rule-hair sm:bottom-6 sm:h-7"
            >
                <span className="scroll-dash absolute inset-x-0 top-0 block h-4 bg-gold/70" />
            </div>
        </section>
    );
}
