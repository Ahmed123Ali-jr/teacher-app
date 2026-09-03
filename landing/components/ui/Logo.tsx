/* شعارُ «فصول» — منقولٌ من teacher_app/index.html:103-115 بالقيم نفسِها.
   قبّعةُ تخرّجٍ في قرصٍ بتدرّجٍ بتروليّ وحلقةٍ ذهبيّة ٢٫٥.
   ولا يُقلَب في RTL — الشعاراتُ لا تُعكَس أبداً. */
export function Logo({ size = 34 }: { size?: number }) {
    return (
        <svg
            width={size} height={size} viewBox="0 0 96 96"
            role="img" aria-label="شعار فصول" className="shrink-0"
        >
            <defs>
                <linearGradient id="fusul-logo-bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#105260" />
                    <stop offset="1" stopColor="#0A3F4A" />
                </linearGradient>
            </defs>
            <circle cx="48" cy="48" r="45" fill="url(#fusul-logo-bg)" />
            {/* الحلقةُ الذهبيّة — الموضعُ الأوّلُ من ميزانيّة السبعة */}
            <circle cx="48" cy="48" r="45" fill="none" stroke="#C9A961" strokeWidth="2.5" />
            <path d="M48 29 L77 41.5 L48 54 L19 41.5 Z" fill="#FFFFFF" />
            <path d="M33.5 48.5 V58.5 c0 4.2 6.8 7.2 14.5 7.2 s14.5-3 14.5-7.2 V48.5 L48 54.8 Z" fill="#E8ECF4" />
            <path d="M75 43 v11.5" stroke="#C9A961" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="75" cy="58" r="3.2" fill="#C9A961" />
        </svg>
    );
}
