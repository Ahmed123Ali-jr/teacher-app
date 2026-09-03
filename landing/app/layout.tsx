import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = 'فصول — سجلّ الطلاب والاختبارات وملفّ الإنجاز';
const DESC =
    'تطبيقٌ سعوديٌّ يجمع سجلَّ طلابك وجدولَك واختباراتِك وملفَّ إنجازك في مكانٍ واحد، ' +
    'يعمل بلا إنترنت، ويُخرج كلَّ ذلك أوراقاً رسميّةً جاهزةً للطباعة.';
const SITE = 'https://fusooli.com';

export const metadata: Metadata = {
    metadataBase: new URL(SITE),
    title: TITLE,
    description: DESC,
    applicationName: 'فصول',
    keywords: ['سجل المعلم', 'حضور وغياب الطلاب', 'ملف الإنجاز', 'تحضير الطلاب',
               'اختبارات', 'المعلم السعودي', 'جدول الحصص', 'وزارة التعليم'],
    openGraph: {
        type: 'website', locale: 'ar_SA', siteName: 'فصول',
        title: TITLE, description: DESC, url: SITE,
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
    robots: { index: true, follow: true },
};

export const viewport: Viewport = {
    themeColor: '#0D1117',
    width: 'device-width',
    initialScale: 1,
};

/* JSON-LD — بالعربيّة، ومحقونٌ ساكناً (التصديرُ الساكن لا يشغّل دالّة). */
const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'فصول',
    description: DESC,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, iOS, Android',
    inLanguage: 'ar-SA',
    audience: { '@type': 'Audience', audienceType: 'معلمو ومعلمات التعليم العام' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ar" dir="rtl">
            <head>
                {/* العربيُّ ٤٠٠ و٧٠٠ وحدَهما يُسبَقان — اللاتينيُّ لا يُسبَق أبداً. */}
                <link rel="preload" href="/fonts/plex-700-ar.woff2" as="font" type="font/woff2" crossOrigin="" />
                <link rel="preload" href="/fonts/plex-400-ar.woff2" as="font" type="font/woff2" crossOrigin="" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            </head>
            <body>
                <div className="paper-rules" aria-hidden="true" />
                {children}
            </body>
        </html>
    );
}
