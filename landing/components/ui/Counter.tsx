'use client';
import { useEffect, useRef } from 'react';

/* العدّادُ يُكتب **بقيمته النهائيّة** في الترميز الساكن، والـJS يستبدله
   فقط إن سُمح بالحركة. فيحلّ ثلاثاً دفعةً واحدة:
     • لا انزياحَ تخطيطٍ (CLS): الصندوقُ محجوزٌ منذ الرسمة الأولى.
     • تقليلُ الحركة: لا فرقَ بصريٌّ إلّا غيابُ العدّ.
     • تعطّلُ الـJS: الرقمُ صحيحٌ بلا سكربتٍ أصلاً.
   والأرقامُ هنديّةٌ لأنّ الوثيقةَ المدرسيّةَ السعوديّةَ تُقرأ هكذا. */
const AR = '٠١٢٣٤٥٦٧٨٩';
export const toArabic = (n: number) => String(n).replace(/\d/g, (d) => AR[+d]);

export function Counter({ to }: { to: number }) {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let raf = 0;
        const io = new IntersectionObserver(([e], obs) => {
            if (!e.isIntersecting) return;
            obs.disconnect();
            const start = performance.now();
            const DUR = 1130;                                  // فيبوناتشي
            const ease = (t: number) => 1 - Math.pow(1 - t, 3);
            const tick = (now: number) => {
                const t = Math.min(1, (now - start) / DUR);
                el.textContent = toArabic(Math.round(ease(t) * to));
                if (t < 1) raf = requestAnimationFrame(tick);
            };
            el.textContent = toArabic(0);
            raf = requestAnimationFrame(tick);
        }, { threshold: 0.4 });

        io.observe(el);
        return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [to]);

    /* `tabular-nums` لا تُكتب هنا: الخطُّ **لا يملك `tnum`** (سماتُه
       calt ccmp fina init kern locl mark medi mkmk rlig)، وعروضُ الأرقام
       الهنديّة فيه تتراوح ٢٨١→٦٣٥ — أي مدىً ٢٫٢٦×. فالثباتُ يُصنع
       بعرضٍ محجوزٍ في CSS لا بسمةٍ لا وجودَ لها. */
    return <span ref={ref} className="stat-num">{toArabic(to)}</span>;
}
