import type { Config } from 'tailwindcss';

/* رموزُ التصميم كلُّها معرَّفةٌ في app/globals.css كمتغيّرات CSS.
   هنا تُعرَض على تايلويند لا تُكرَّر — مصدرُ حقيقةٍ واحد. */
const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
        // السلّم فيبوناتشي — ولا قيمةَ خارجه. حُذف سلّمُ تايلويند الافتراضيّ عمداً.
        spacing: {
            0: '0px',
            1: '3px',
            2: '5px',
            3: '8px',
            4: '13px',
            5: '21px',
            6: '34px',
            7: '55px',
            8: '89px',
            9: '144px',
            10: '233px',
            px: '1px',
        },
        borderRadius: {
            none: '0',
            sm: '8px',
            md: '13px',
            lg: '21px',
            xl: '34px',
            full: '9999px',
        },
        fontSize: {
            folio: ['11px', { lineHeight: '1.20' }],
            label: ['13px', { lineHeight: '1.40' }],
            body: ['15px', { lineHeight: '1.618' }],
            'body-lg': ['17px', { lineHeight: '1.618' }],
            h3: ['18px', { lineHeight: '1.35' }],
            h2: ['21px', { lineHeight: '1.28' }],
            h1: ['26px', { lineHeight: '1.24' }],
            display: ['30px', { lineHeight: '1.24' }],
            hero: ['40px', { lineHeight: '1.20' }],
            stat: ['55px', { lineHeight: '1.10' }],
        },
        fontWeight: {
            // أربعةٌ لا خامس — العائلةُ تنتهي عند ٧٠٠ (main.css:102)
            normal: '400',
            medium: '500',
            semibold: '600',
            bold: '700',
        },
        extend: {
            colors: {
                void: 'var(--page-void)',
                page: 'var(--page)',
                sheet: 'var(--sheet)',
                'sheet-raised': 'var(--sheet-raised)',
                'sheet-petrol': 'var(--sheet-petrol)',
                rule: 'var(--rule)',
                'rule-hair': 'var(--rule-hair)',
                'rule-gold': 'var(--rule-gold)',
                ink: 'var(--ink)',
                'ink-muted': 'var(--ink-muted)',
                'ink-faint': 'var(--ink-faint)',
                petrol: 'var(--petrol)',
                'petrol-light': 'var(--petrol-light)',
                'petrol-deep': 'var(--petrol-deep)',
                gold: 'var(--gold)',
                'gold-light': 'var(--gold-light)',
            },
            fontFamily: {
                sans: ['var(--font-plex)', 'Tahoma', 'sans-serif'],
            },
            transitionTimingFunction: {
                page: 'var(--ease-page)',
                inkc: 'var(--ease-ink)',
                rulec: 'var(--ease-rule)',
                lift: 'var(--ease-lift)',
                ui: 'var(--ease-ui)',
            },
            screens: { xs: '375px', sm: '600px', md: '900px', lg: '1200px', xl: '1600px' },
            maxWidth: { column: '1120px', measure: '38em', lede: '28em' },
        },
    },
    plugins: [],
};
export default config;
