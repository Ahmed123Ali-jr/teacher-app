'use client';
import { useEffect, useState } from 'react';
import { SectionMark } from '@/components/ui/SectionMark';
import { useScrollProgress } from '@/lib/useScrollProgress';

/* القسمُ الثالث — تمريرٌ مثبَّتٌ حقيقيّ.
   شاشةٌ واحدةٌ تثبت، ومحتواها يتبدّل: النصُّ يتلاشى ويحلّ محلَّه التالي،
   واللقطةُ في الجوال تتبدّل معه. وسكّةُ تقدّمٍ في الهامش تقول أين أنت.

   والقيادةُ بـJS صريح: `IntersectionObserver` يفتح الحلقة، و`rAF` يخنقها.
   (جُرّب `animation-timeline` أوّلاً فتعذّر التحقّقُ منه، وحركةٌ لا تُرى
   أسوأُ من حركةٍ مقودةٍ بشيفرةٍ صغيرةٍ مفهومة.) */

const FEATURES = [
    {
        title: 'الرئيسيّةُ تعرف يومَك',
        body: 'ستُّ حالاتٍ لا شاشةٌ واحدة: تعرف نهايةَ الأسبوع، وتعرف الإجازةَ الرسميّةَ باسمها من تقويم الوزارة. وفي يوم الدوام تريك حصصَ اليوم بأوقاتها، وتحتها زرٌّ يفتح سجلَّ الفصل الذي أمامك.',
        shot: '/shots/dashboard.webp',
        alt: 'الشاشة الرئيسيّة: تحيّةٌ باسم المعلّم، وتاريخٌ هجريّ، وصندوقُ حصص اليوم',
    },
    {
        title: 'فصولُك مرتَّبةٌ كما تفكّر بها',
        body: 'المعلّم السعوديُّ يدرّس خمسةَ فصولٍ في مراحلَ مختلفة، وكشوفُه ورقٌ متفرّق. هنا كلُّ فصولك في نظرةٍ واحدة، مجموعةً بالمرحلة — والمرحلةُ الفارغةُ تُحذف من العرض.',
        shot: '/shots/classes.webp',
        alt: 'شاشةُ الفصول: الفصولُ مجموعةٌ تحت متوسّط وثانويّ',
    },
    {
        title: 'جدولُك كلُّه في شاشةٍ واحدة',
        body: 'خمسةُ أيّامٍ وسبعُ حصصٍ بلا سحبٍ يميناً ويساراً، وأوقاتُها محسوبةٌ من وقت البداية والمدّة والفسحة. ومعه التقويمُ الرسميُّ يُختار وحدَه من إدارة تعليمك.',
        shot: '/shots/schedule.webp',
        alt: 'الجدولُ الأسبوعيّ: شبكةُ خمسةِ أيّامٍ وسبعِ حصص، وبطاقةُ التقويم الدراسيّ',
    },
    {
        title: '«كيف حالُ فصولي؟»',
        body: 'رقمٌ واحدٌ كبيرٌ في الصدر: نسبةُ الحضور العامّة، وتحته من كم حالةٍ حُسبت. ثمّ تفصيلُ الحضور بأشرطةٍ تُقاس بالعين، ثمّ الأعلى التزاماً وأكثرُ تغيّباً بأسمائهم.',
        shot: '/shots/reports.webp',
        alt: 'شاشةُ التقارير: نسبةُ حضورٍ عامّة، وتفصيلٌ بالأشرطة، وقائمةُ الأعلى التزاماً',
    },
];

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n: number) => String(n).padStart(2, '0').replace(/\d/g, (d) => AR[+d]);

export function Features() {
    const { ref, p } = useScrollProgress<HTMLElement>();
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }, []);

    const N = FEATURES.length;
    /* الحدُّ الأخير يُبلَغ عند ‎٩٢٪‎ لا ‎١٠٠٪‎: آخرُ ميزةٍ تستحقّ أن تُقرأ
       قبل أن يُفرَج عن التثبيت، لا أن تومض في آخر بكسل. */
    const idx = Math.min(N - 1, Math.floor((p / 0.92) * N));

    return (
        <section
            ref={ref}
            className="features-track relative bg-page"
            style={{ height: reduced ? 'auto' : `calc(${N} * 100svh)` }}
        >
            <div
                className={`grain relative isolate overflow-clip px-5 md:px-6
                            ${reduced ? '' : 'sticky top-0 h-[100svh]'}`}
            >
                {/* توهّجٌ يتحرّك مع التقدّم — ضوءٌ يتبع الشاشةَ لا لونٌ ثابت */}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{
                        background:
                            'radial-gradient(46% 42% at var(--gx) 46%, rgba(20,96,111,.42) 0%,' +
                            ' rgba(20,96,111,.14) 45%, rgba(20,96,111,0) 74%)',
                        ['--gx' as string]: `${26 + p * 16}%`,
                        transition: 'background 120ms linear',
                    }}
                />

                <div className="mx-auto flex h-full max-w-column flex-col justify-center py-8">
                    <SectionMark n={3} />

                    <div className="mt-7 grid items-center gap-7 md:mt-8 md:grid-cols-2 md:gap-8">
                        {/* النصُّ أوّلاً في الـDOM ⇒ يقع يميناً تحت dir=rtl */}
                        <div className="relative min-h-[240px] md:min-h-[300px]">
                            {FEATURES.map((f, i) => (
                                <div
                                    key={f.title}
                                    aria-hidden={!reduced && i !== idx}
                                    className={reduced ? 'mb-8' : 'absolute inset-0'}
                                    style={reduced ? undefined : {
                                        opacity: i === idx ? 1 : 0,
                                        visibility: i === idx ? 'visible' : 'hidden',
                                        transform: i === idx ? 'none' : 'translate3d(0,13px,0)',
                                        transition: 'opacity 610ms var(--ease-ink),' +
                                                    ' transform 610ms var(--ease-page),' +
                                                    ' visibility 0s linear ' + (i === idx ? '0s' : '610ms'),
                                    }}
                                >
                                    <bdi dir="rtl" className="text-folio font-medium text-ink-faint">
                                        {ar(i + 1)} / {ar(N)}
                                    </bdi>
                                    <h2 className="mt-4 text-h1 font-semibold text-ink md:text-[34px] md:leading-[1.28]">
                                        {f.title}
                                    </h2>
                                    <p className="mt-5 max-w-measure text-body text-ink-muted md:text-[17px]">
                                        {f.body}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* الجوال: إطارٌ واحدٌ وأربعُ لقطاتٍ متراكبةٌ تتبادل */}
                        <div className="flex justify-center">
                            <div
                                className="phone relative w-[240px] overflow-hidden rounded-xl
                                           border border-rule bg-sheet md:w-[286px]"
                                style={{ aspectRatio: '375 / 812' }}
                            >
                                <span
                                    aria-hidden="true"
                                    className="absolute inset-x-0 top-4 z-10 mx-auto h-[5px] w-[55px]
                                               rounded-full bg-rule"
                                />
                                {FEATURES.map((f, i) => (
                                    <img
                                        key={f.shot}
                                        src={f.shot}
                                        alt={f.alt}
                                        width={600}
                                        height={1299}
                                        loading={i === 0 ? 'eager' : 'lazy'}
                                        decoding="async"
                                        className="absolute inset-0 h-full w-full object-cover object-top"
                                        style={reduced ? { position: 'relative' } : {
                                            opacity: i === idx ? 1 : 0,
                                            transform: `scale(${i === idx ? 1 : 1.02})`,
                                            transition: 'opacity 610ms var(--ease-ink),' +
                                                        ' transform 830ms var(--ease-page)',
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* سكّةُ التقدّم — أفقيّةٌ على الجوال، ولا اتّجاهَ لها رأسيّاً */}
                    {!reduced && (
                        <div
                            aria-hidden="true"
                            className="mt-7 flex items-center justify-center gap-3 md:mt-8"
                        >
                            {FEATURES.map((f, i) => (
                                <span
                                    key={f.title}
                                    className="block h-px transition-all duration-[377ms] ease-ui"
                                    style={{
                                        width: i === idx ? 34 : 21,
                                        height: i === idx ? 2 : 1,
                                        background: i === idx ? 'var(--gold)' : 'var(--rule)',
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
