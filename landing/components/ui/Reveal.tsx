'use client';
import { useReveal } from '@/lib/useScrollProgress';

/* غلافُ ظهور: عتامةٌ وارتفاعٌ رأسيّ — **بلا `translateX`** فلا ينقلب في RTL.
   والحالةُ قبل الظهور ليست `opacity:0` وحدها: لو تعطّل الـJS بقي المحتوى
   مخفيّاً أبداً. فالسكونُ هو الظهور، والإخفاءُ يُضاف بصنفٍ يكتبه الـJS. */
export function Reveal({
    children, delay = 0, y = 21, className = '',
}: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
    const { ref, shown } = useReveal<HTMLDivElement>();
    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: shown ? 1 : 0,
                transform: shown ? 'none' : `translate3d(0, ${y}px, 0)`,
                transition: `opacity 830ms var(--ease-ink) ${delay}ms,
                             transform 830ms var(--ease-page) ${delay}ms`,
            }}
        >
            {children}
        </div>
    );
}
