'use client';
import { useEffect, useRef, useState } from 'react';

/* تقدُّمُ عنصرٍ عبر الشاشة، من ‎0‎ إلى ‎1‎.
   مراقبُ تقاطعٍ يفتح الحلقةَ ويغلقها، و`rAF` يخنق التحديث فلا يقع أكثرَ من
   مرّةٍ في الإطار. ولا حسابَ إطلاقاً ما دام العنصرُ خارج الشاشة.
   ويحترم `prefers-reduced-motion`: يُثبّت على القيمة النهائيّة ولا يستمع. */
export function useScrollProgress<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [p, setP] = useState(0);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setP(1); return; }

        let raf = 0;

        const measure = () => {
            raf = 0;
            const r = el.getBoundingClientRect();
            /* خروجٌ مبكّرٌ رخيص: العنصرُ بعيدٌ عن الشاشة فلا حساب.
               ولا مراقبَ تقاطعٍ يحرس الحلقة — كان يحرسها فيمنعها: لو تأخّر
               بلاغُه أو لم يصل، بقي `live` كاذباً و**لم تتحرّك الصفحةُ أبداً**.
               وقراءةُ مستطيلٍ واحدٍ في الإطار أرخصُ من عطبٍ صامت. */
            if (r.bottom < -200 || r.top > innerHeight + 200) return;

            const span = r.height - innerHeight;
            const t = span > 0
                ? -r.top / span
                : (innerHeight - r.top) / (innerHeight + r.height);
            setP(Math.min(1, Math.max(0, t)));
        };
        const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };

        /* ══ التعافي من لسانٍ مخفيّ ══
           `requestAnimationFrame` **يتوقّف** حين يُخفى اللسان. فطلبٌ معلّقٌ
           لا يُنفَّذ أبداً يُبقي `raf` غيرَ صفرٍ إلى الأبد، فيصير كلُّ
           `schedule` بعده لا شيئاً — وتتجمّد الصفحةُ حتى بعد أن يعود اللسانُ
           ظاهراً. والمستخدمُ يبدّل ألسنتَه وهو يمرّر كلَّ يوم.
           فعند العودة: يُلغى المعلَّق، ويُصفَّر الحارس، ويُقاس مباشرةً. */
        const onVisible = () => {
            if (document.hidden) return;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            measure();
        };

        addEventListener('scroll', schedule, { passive: true });
        addEventListener('resize', schedule, { passive: true });
        document.addEventListener('visibilitychange', onVisible);
        measure();

        return () => {
            removeEventListener('scroll', schedule);
            removeEventListener('resize', schedule);
            document.removeEventListener('visibilitychange', onVisible);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    return { ref, p };
}

/* ظهورٌ لمرّةٍ واحدةٍ عند دخول العنصر — مراقبُ تقاطعٍ خالص.
   وهو النمطُ الوحيدُ الذي تحقّقتُ من عمله فعلاً (العدّاد اشتغل به). */
export function useReveal<T extends HTMLElement>(threshold = 0.18) {
    const ref = useRef<T>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return; }
        const io = new IntersectionObserver(([e], obs) => {
            if (!e.isIntersecting) return;
            setShown(true);
            obs.disconnect();
        }, { threshold });
        io.observe(el);
        return () => io.disconnect();
    }, [threshold]);

    return { ref, shown };
}
