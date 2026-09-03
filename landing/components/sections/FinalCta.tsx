import { SectionMark } from '@/components/ui/SectionMark';
import { StoreBadge } from '@/components/ui/StoreBadge';

const APP_URL = 'https://ahmed123ali-jr.github.io/teacher-app/';

/* القسمُ السادس — بسيطٌ جدّاً: عنوانٌ قصير، وبابٌ واحدٌ يعمل، وشارتان
   معطَّلتان تقولان «قريباً» بصدق. */
export function FinalCta() {
    return (
        <section className="grain vignette relative isolate bg-void px-5 py-9 md:px-6 md:py-10">
            <SectionMark n={6} />
            <div className="relative z-10 mx-auto mt-8 max-w-column text-center md:mt-9">
                <h2 className="mx-auto max-w-lede text-h1 font-bold text-ink md:text-[42px] md:leading-[1.24]">
                    ابدأ بفصلٍ واحد
                </h2>
                <p className="mx-auto mt-5 max-w-lede text-body-lg text-ink-muted">
                    فصلُك الأوّل مجّانيٌّ كاملاً — بلا بطاقةٍ ولا تجربةٍ تنتهي.
                    وإن انتهى اشتراكُك يوماً، لا تُحذف بياناتك.
                </p>

                <a
                    href={APP_URL}
                    className="mt-7 inline-flex h-[55px] items-center rounded-sm bg-gold px-6
                               text-h3 font-semibold text-petrol-deep transition-transform
                               duration-[144ms] ease-ui hover:scale-[1.02] active:scale-[.99]"
                    style={{
                        boxShadow:
                            '0 0 0 1px rgba(201,169,97,.35), 0 10px 34px -10px rgba(201,169,97,.26)',
                    }}
                >
                    افتح فصول الآن
                </a>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                    <StoreBadge store="App Store" icon="phone" />
                    <StoreBadge store="Google Play" icon="android" />
                </div>
            </div>
        </section>
    );
}
