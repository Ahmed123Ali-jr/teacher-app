import { Logo } from '@/components/ui/Logo';

const APP_URL = 'https://ahmed123ali-jr.github.io/teacher-app';

/* القسمُ السابع — أنيقٌ ومختصر. والشعارُ هنا تكرارُ العنصر نفسِه لا
   موضعٌ ذهبيٌّ ثامن. */
export function Footer() {
    return (
        <footer className="grain relative isolate border-t border-rule-hair bg-void px-5 py-8 md:px-6">
            <div className="relative z-10 mx-auto flex max-w-column flex-col items-center gap-5
                            text-center md:flex-row md:justify-between md:text-start">
                <div className="flex items-center gap-4">
                    <Logo size={26} />
                    <span className="text-h3 font-semibold text-ink">فصول</span>
                </div>

                <nav className="flex flex-wrap items-center justify-center gap-6">
                    {[
                        { href: `${APP_URL}/privacy.html`, label: 'سياسة الخصوصيّة' },
                        { href: `${APP_URL}/terms.html`,   label: 'شروط الاستخدام' },
                    ].map((l) => (
                        <a
                            key={l.href}
                            href={l.href}
                            className="text-body text-ink-muted transition-colors duration-[144ms]
                                       ease-ui hover:text-ink"
                        >
                            {l.label}
                        </a>
                    ))}
                </nav>

                <p className="text-label text-ink-faint">
                    صُنع في السعوديّة لمعلّميها
                </p>
            </div>
        </footer>
    );
}
