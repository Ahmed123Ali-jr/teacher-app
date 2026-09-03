'use client';
import { SectionMark } from '@/components/ui/SectionMark';
import { useEffect, useState } from 'react';
import { useScrollProgress } from '@/lib/useScrollProgress';

/* القسمُ الثاني — الجملةُ تتلوّن مع التمرير.
   القيادةُ بـJS لا بـ`animation-timeline`: الثاني هو الأصحّ نظريّاً لكن
   تعذّر التحقّقُ منه، وحركةٌ لا تُرى أسوأُ من شيفرةٍ صغيرةٍ مفهومة.
   والحالةُ الأساسيّة (`--p: 1`) محبَّرةٌ كاملة، فبلا JS يُقرأ النصُّ تامّاً. */
export function Statement() {
    const { ref, p } = useScrollProgress<HTMLDivElement>();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    return (
        <section className="grain vignette relative isolate bg-page px-5 py-8 md:px-6 md:py-9 lg:py-10">
            <div className="light-pool" />
            <SectionMark n={2} />
            <div ref={ref} className="relative z-10 mx-auto mt-8 max-w-column md:mt-9">
                <p
                    className="reveal-text font-semibold"
                    /* لا تُكتب قبل الترطيب: الخادمُ يرسم ‎0‎ فيبقى النصُّ خافتاً
                       أبداً لو تعطّل الـJS. وبلا السمة يحكم افتراضُ CSS: ‎1‎. */
                    style={mounted ? { ['--p' as string]: Math.min(1, p * 1.7) } : undefined}
                >
                    <span className="block">كلُّ ما يُطلَب منك آخرَ العام</span>
                    <span className="block">يجمعه التطبيقُ وأنتَ تُعطي حصّتَك.</span>
                </p>
            </div>
        </section>
    );
}
