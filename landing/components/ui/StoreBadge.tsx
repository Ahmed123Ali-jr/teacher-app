/* شارةُ متجرٍ **مرسومةٌ بأسلوبنا** — لا فنَّ آبل الرسميّ ولا فنَّ قوقل بلاي.
   إرشاداتُ آبل التسويقيّة تمنع استعمالَ شارتها لتطبيقٍ لم يُنشر، فتُرسم
   هنا بلغة رسومنا نفسِها (‏viewBox 24 · stroke 1.8 · currentColor) ويُكتفى
   باسم المتجر نصّاً. والشاراتُ **لا تُقلَب** في RTL — الشعاراتُ لا تُعكَس.
   وهي معطَّلةٌ صراحةً: `aria-disabled` وليست رابطاً، فلا يضغطها أحدٌ عبثاً. */
export function StoreBadge({ store, icon }: { store: string; icon: 'phone' | 'android' }) {
    return (
        <span
            role="link"
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-4 rounded-sm border
                       border-rule/70 bg-sheet px-5 py-4 text-start opacity-80"
        >
            <svg
                width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true" className="shrink-0 text-ink-faint"
            >
                {icon === 'phone'
                    ? <path d="M7 2h10v20H7zM10.5 18.5h3" />
                    : <path d="M5 9a7 7 0 0 1 14 0v8H5zM8 4.5 6.5 2M16 4.5 17.5 2" />}
            </svg>
            <span className="leading-tight">
                <span className="block text-folio text-ink-faint">قريباً على</span>
                <span dir="ltr" className="block text-h3 font-semibold text-ink-muted">{store}</span>
            </span>
        </span>
    );
}
