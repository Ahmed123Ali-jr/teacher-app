#!/usr/bin/env node
/* ==========================================================================
   check-version.mjs — رقمُ إصدارٍ واحدٌ في أربعة مواضعَ تفترق بصمت.

   العيبُ الذي يمسكه: أن يُبدَّل الرقمُ في موضعٍ **من غير أن يُفتح الآخر**.
   وهذا يقع من غير نسيانٍ أصلاً:
     · تبدّله من واجهة Xcode ← يُكتب `pbxproj` وحدَه ولا ترى `settings.js`.
     · `npm version` ← يعيد كتابة `package.json` وحدَه.
   فيصير في التطبيق رقمٌ وفي المتجر آخر. وقع فعلاً (٥ سبتمبر ٢٠٢٦):
   `0.9.0` في التطبيق و`1.0` في Xcode.

   ── ما لا يفعله ──
   **لا يقول إن كان الرقمُ صحيحاً.** لو كُتب `9.9.9` في الأربعة رضي.
   يحرس الاتّفاقَ لا الصواب.

   ── و`CURRENT_PROJECT_VERSION` ليس منها عمداً ──
   ذاك رقمُ البناء: يرتفع مع كلّ رفعةٍ إلى App Store Connect ولو لم يتغيّر
   الإصدار. وربطُه بالإصدار يعني رفضَ رفعةٍ بحجّة «رقمُ بناءٍ مستعمَل».

   يُشغَّل من جذر المستودع:
       node teacher_app/tools/check-version.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';

/* كلُّ مصدرٍ: أين يُقرأ، وبأيّ نمط، وبأيّ اسمٍ يُعرَض.
   و`all: true` تعني أنّ المواضعَ المتعدّدة داخل الملفّ الواحد **يجب أن
   تتّفق بينها أيضاً** — Debug و Release في `pbxproj`. */
const SOURCES = [
    {
        file:  'teacher_app/js/views/settings.js',
        label: 'APP_VERSION (ما يراه المعلّم)',
        re:    /const APP_VERSION\s*=\s*'([^']+)'/g,
    },
    {
        file:  'package.json',
        label: 'package.json → version',
        re:    /"version"\s*:\s*"([^"]+)"/g,
    },
    {
        file:  'ios/App/App.xcodeproj/project.pbxproj',
        label: 'MARKETING_VERSION (Debug و Release)',
        re:    /MARKETING_VERSION\s*=\s*([^;\s]+)\s*;/g,
        all:   true,
    },
    {
        /* رأسُ سجلّ التحديثات: أوّلُ `v:` في `CHANGELOG`. ولو تخلّف عن
           `APP_VERSION` لرأى المعلّمُ إصداراً في السطر وسجلّاً أقدمَ تحته. */
        file:  'teacher_app/js/views/settings.js',
        label: 'رأسُ CHANGELOG',
        re:    /const CHANGELOG\s*=\s*\[\s*\{\s*v:\s*'([^']+)'/g,
    },
];

const found = [];
const broken = [];

for (const src of SOURCES) {
    let text;
    try {
        text = readFileSync(src.file, 'utf8');
    } catch {
        broken.push({ ...src, why: 'الملفُّ غيرُ موجود' });
        continue;
    }
    const hits = [...text.matchAll(src.re)].map((m) => ({
        v:  m[1].trim(),
        at: text.slice(0, m.index).split('\n').length,
    }));
    if (!hits.length) {
        /* النمطُ لم يُطابَق: أُعيدت التسميةُ أو غُيّر الشكل. وهذا **عيبٌ**
           لا تجاهُلٌ — حارسٌ لا يجد ما يحرسه يقول ذلك ولا يسكت. */
        broken.push({ ...src, why: 'لم يُطابَق النمط — أُعيدت التسميةُ أو غُيّر الشكل؟' });
        continue;
    }
    if (!src.all && hits.length > 1) {
        broken.push({ ...src, why: hits.length + ' مطابقاتٍ ومُنتظَرُها واحدة' });
        continue;
    }
    for (const h of hits) found.push({ file: src.file, label: src.label, ...h });
}

const versions = [...new Set(found.map((f) => f.v))];
const agreed = versions.length === 1 && !broken.length;

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
const width = Math.max(...found.map((f) => [...f.label].length), 0);

if (agreed) {
    console.log('✅ رقمُ الإصدار متّفقٌ في ' + found.length + ' مواضع: ' + versions[0] + '\n');
    for (const f of found) console.log('   ' + pad(f.label, width) + '  ' + f.file + ':' + f.at);
} else {
    console.log('‼️  رقمُ الإصدار مفترق\n');
    for (const f of found) {
        const odd = versions.length > 1 && f.v !== versions[0];
        console.log('   ' + pad(f.label, width) + '  ' + pad(f.v, 8) +
                    f.file + ':' + f.at + (odd ? '   ←' : ''));
    }
    for (const b of broken) {
        console.log('   ' + pad(b.label, width) + '  ' + pad('؟', 8) + b.file + '   ← ' + b.why);
    }
    console.log('\nالعلاج: وحّدها — ولا تُغيَّر واحدةٌ وحدَها.');
    console.log('        والمواضعُ مسمّاةٌ في تعليق `APP_VERSION` بـsettings.js.');
}

process.exit(agreed ? 0 : 1);
