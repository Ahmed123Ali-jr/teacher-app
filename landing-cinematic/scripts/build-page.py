# -*- coding: utf-8 -*-
"""يبني index.html من هيكل الحزمة: لوحةٌ داكنةٌ بهويّة «فصول»، ونصٌّ عربيّ."""
import re, pathlib

src = pathlib.Path('templates/index.skeleton.html').read_text(encoding='utf-8')

# ── اللوحة الداكنة (memory/05): الأصولُ خلفيّتُها شبه سوداء ⇒ screen لا multiply ──
src = src.replace(
"""    /* LIGHT palette — derive accents from YOUR product. Gold must be deep to read on light. */
    --paper:#FBF8F2; --mist:#F7F4EC; --cream:#F3EEE2; --sand:#ECE2CF;
    --ink:#241812; --ink-soft:#6E5C4B; --ink-faint:#9A8975;
    --gold:#A97B33; --gold-deep:#8A6128; --gold-bright:#C2974A; --accent:#A8632E;
    --line:rgba(58,33,20,.16); --line-soft:rgba(58,33,20,.09);
    --ambient:#FBF8F2; --maxw:1280px; --ease:cubic-bezier(.22,.61,.36,1);""",
"""    /* DARK palette — مشتقّةٌ من هويّة «فصول»: بتروليّ ‎#0A3F4A‎ وذهبيّ ‎#C9A961‎.
       ولا أسودَ خالصاً ولا أبيضَ خالص — قرارٌ من ‎theme-dark.css‎ في التطبيق:
       «الأسودُ الخالص يُجهد العين» و«الأبيضُ الخالص يهتزّ (halation)». */
    --paper:#090C11; --mist:#0F1420; --cream:#141B28; --sand:#1B2432;
    --ink:#E8ECF3; --ink-soft:#A3AEC0; --ink-faint:#7E8CA3;
    --gold:#C9A961; --gold-deep:#A8894A; --gold-bright:#E8D9A8; --accent:#14606F;
    --line:rgba(232,236,243,.14); --line-soft:rgba(232,236,243,.07);
    --ambient:#090C11; --maxw:1280px; --ease:cubic-bezier(.22,.61,.36,1);""")

# طبقاتُ الضوء تُقلَب للداكن
src = src.replace(
"""  #glow{position:fixed;inset:0;z-index:-2;pointer-events:none;opacity:.5;
    background:radial-gradient(120% 90% at 50% 0%,rgba(255,255,255,.8),rgba(244,239,229,0) 60%)}""",
"""  #glow{position:fixed;inset:0;z-index:-2;pointer-events:none;opacity:.5;
    background:radial-gradient(105% 78% at 50% 8%,rgba(20,96,111,.55),rgba(10,63,74,0) 66%)}""")
src = src.replace(
"""    background:radial-gradient(135% 120% at 50% 42%,transparent 55%,rgba(120,90,50,.06) 100%)}""",
"""    background:radial-gradient(128% 108% at 50% 44%,transparent 48%,rgba(2,4,7,.72) 100%)}""")
src = src.replace("opacity:.035;mix-blend-mode:multiply;", "opacity:.055;mix-blend-mode:overlay;")
src = src.replace("header.solid{background:rgba(251,248,242,.78);", "header.solid{background:rgba(9,12,17,.72);")
src = src.replace(".nav-cta:hover{background:var(--gold);color:#fff!important}",
                  ".nav-cta:hover{background:var(--gold);color:#05262D!important}")
src = src.replace("::selection{background:var(--gold-bright);color:#fff}",
                  "::selection{background:var(--gold);color:#05262D}")
src = src.replace(".btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#fff;",
                  ".btn-primary{background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#05262D;")
src = src.replace(".btn-ghost:hover{background:var(--gold);color:#fff;", ".btn-ghost:hover{background:var(--gold);color:#05262D;")
src = src.replace("#hero .aura{", "#hero .aura{")
src = src.replace("background:radial-gradient(circle,rgba(226,178,100,.46),rgba(200,132,60,.14) 40%,transparent 66%);",
                  "background:radial-gradient(circle,rgba(20,96,111,.62),rgba(28,141,166,.18) 42%,transparent 68%);")
src = src.replace("background:radial-gradient(circle,rgba(238,208,142,.95),rgba(238,208,142,0) 70%);",
                  "background:radial-gradient(circle,rgba(201,169,97,.9),rgba(201,169,97,0) 70%);")
# الأصولُ خلفيّتُها ‎#090C11‎ ⇒ screen يذيبها في الأرضيّة
src = src.replace(".multiply{mix-blend-mode:multiply}", ".multiply{mix-blend-mode:screen}")
src = src.replace('.fallback-host.is-missing{background-image:linear-gradient(135deg,var(--cream),var(--sand) 78%);',
                  '.fallback-host.is-missing{background-image:linear-gradient(135deg,var(--cream),var(--sand) 78%);')
src = src.replace('#film .stage{position:sticky;top:0;height:100svh;overflow:hidden;background:var(--paper)}',
                  '#film .stage{position:sticky;top:0;height:100svh;overflow:hidden;background:#090C11}')
src = src.replace('ctx.fillStyle="#FBF8F2";', 'ctx.fillStyle="#090C11";')
src = src.replace("#cta .dim{position:absolute;inset:0;opacity:0;backdrop-filter:blur(2px);background:radial-gradient(120% 100% at 50% 50%,rgba(251,248,242,.62),rgba(244,238,226,.9))}",
                  "#cta .dim{position:absolute;inset:0;opacity:0;backdrop-filter:blur(3px);background:radial-gradient(120% 100% at 50% 50%,rgba(9,12,17,.70),rgba(4,6,10,.94))}")
src = src.replace("#ritual .frame::after{content:\"\";position:absolute;inset:0;background:linear-gradient(to left,rgba(251,248,242,.9),rgba(251,248,242,.25) 52%,transparent 84%),linear-gradient(0deg,rgba(251,248,242,.8),transparent 52%)}",
                  "#ritual .frame::after{content:\"\";position:absolute;inset:0;background:linear-gradient(to left,rgba(9,12,17,.92),rgba(9,12,17,.35) 54%,transparent 86%),linear-gradient(0deg,rgba(9,12,17,.85),transparent 54%)}")
src = src.replace("box-shadow:0 50px 110px -50px rgba(80,55,25,.45)", "box-shadow:0 50px 110px -50px rgba(0,0,0,.85)")
src = src.replace("box-shadow:0 34px 70px -36px rgba(80,55,25,.4)", "box-shadow:0 34px 70px -36px rgba(0,0,0,.75)")
src = src.replace("filter:drop-shadow(0 28px 36px rgba(90,62,28,.32))", "filter:drop-shadow(0 34px 48px rgba(0,0,0,.7))")
src = src.replace("background:linear-gradient(115deg,transparent 40%,rgba(255,251,240,.65) 50%,transparent 60%)",
                  "background:linear-gradient(115deg,transparent 40%,rgba(232,236,243,.42) 50%,transparent 60%)")

# ── الأجواءُ لكلّ قسم ──
for old, new in [('data-ambient="#FBF8F2" data-glow="0"',   'data-ambient="#090C11" data-glow=".28"'),
                 ('data-ambient="#F8F5EF" data-glow=".7"',  'data-ambient="#070A0E" data-glow=".62"'),
                 ('data-ambient="#F4EFE4" data-glow=".55"', 'data-ambient="#0B1017" data-glow=".44"'),
                 ('data-ambient="#F1E7D5" data-glow=".5"',  'data-ambient="#0A1219" data-glow=".38"'),
                 ('data-ambient="#F6F1E8" data-glow=".5"',  'data-ambient="#070A0E" data-glow=".5"'),
                 ('data-ambient="#F2ECE0" data-glow=".5"',  'data-ambient="#0B1017" data-glow=".34"')]:
    src = src.replace(old, new)

# ── النصّ ──
V = {
 'LANG|ar':'ar', 'DIR|rtl':'rtl',
 'PRODUCT_NAME':'فصول',
 'META_DESCRIPTION':'سجلُّ فصولك وجدولُك واختباراتُك وملفُّ إنجازك في مكانٍ واحد — يعمل بلا إنترنت، ويُخرج ورقاً رسميّاً بضغطة.',
 'LATIN_LABEL':'FUSUL · KSA',
 'TAGLINE':'سجلُّ فصولك، وجدولُك، وملفُّ إنجازك — في مكانٍ واحد.',
 'SCROLL_WORD':'مرِّر',
 'NAV_1':'التقارير','NAV_2':'الفصول','NAV_3':'الشاشات','NAV_CTA':'ابدأ الآن',
 'FILM_CAP_1':'أسبوعُك يبدأ فارغاً.',
 'FILM_CAP_2':'حصّةً حصّة، يمتلئ.',
 'FILM_CAP_3':'وأوقاتُه تُحسب وحدَها.',
 'FILM_CAP_4':'ويومُك يُضيء نفسَه.',
 'REVEAL_EYEBROW':'التقارير',
 'REVEAL_TITLE':'كيف حالُ فصولي؟',
 'REVEAL_LEAD':'رقمٌ واحدٌ كبيرٌ في الصدر، وتحته من كم حالةٍ حُسب. ثمّ تفصيلُ الحضور بأشرطةٍ تُقاس بالعين، ثمّ الأعلى التزاماً وأكثرُ تغيّباً بأسمائهم — فتعرف بمن تتّصل اليوم.',
 'SPEC_1_K':'الحضور','SPEC_1_V':'حاضر · غائب · متأخّر · مستأذن — بضغطةٍ واحدة',
 'SPEC_2_K':'خاناتُ التقييم','SPEC_2_V':'تصنعها أنت: نجوم، أو رقمٌ بحدٍّ تختاره، أو علامة',
 'SPEC_3_K':'الطباعة','SPEC_3_V':'ثلاثةُ أنواعِ سجلّاتٍ بترويسة وزارة التعليم',
 'SPEC_4_K':'بلا إنترنت','SPEC_4_V':'صندوقٌ صادرٌ يحفظ ما كتبتَه ويُرسله حين تعود الشبكة',
 'RITUAL_ALT':'شاشةُ الفصول في تطبيق فصول',
 'RITUAL_EYEBROW':'فصولك',
 'RITUAL_TITLE':'مرتَّبةٌ كما تفكّر بها',
 'RITUAL_BODY':'خمسةُ فصولٍ في مراحلَ مختلفة، وكشوفٌ ورقٌ متفرّق. هنا كلُّها في نظرةٍ واحدة، مجموعةً بالمرحلة — والمرحلةُ الفارغةُ تُحذف من العرض.',
 'CTA_LABEL':'ONE CLASS · FREE',
 'CTA_TITLE':'ابدأ بفصلٍ واحد',
 'CTA_BODY':'فصلُك الأوّل مجّانيٌّ كاملاً — بلا بطاقةٍ ولا تجربةٍ تنتهي. وإن انتهى اشتراكُك يوماً، لا تُحذف بياناتك.',
 'CTA_PRIMARY':'افتح فصول الآن','CTA_SECONDARY':'اطّلع على الشاشات',
 'EDITIONS_EYEBROW':'الشاشات',
 'EDITIONS_TITLE':'ما تراه كلَّ يوم',
 'ED_1_T':'التقارير','ED_1_D':'نسبةُ الحضور العامّة، وتفصيلُها بالأشرطة، وقوائمُ بالأسماء.',
 'ED_2_T':'الجدول الأسبوعيّ','ED_2_D':'خمسةُ أيّامٍ وسبعُ حصصٍ بلا سحب، ومعه التقويمُ الرسميّ.',
 'ED_3_T':'الرئيسيّة','ED_3_D':'حصصُ اليوم بأوقاتها، وحصّتُك الحالية وزرُّ سجلّها.',
 'FOOTER_COPYRIGHT':'فصول — صُنع في السعوديّة لمعلّميها.',
 'FRAME_COUNT|93':'96',
}
for k, v in V.items():
    src = src.replace('{{' + k + '}}', v)

# روابطُ الأزرار الحقيقيّة
src = src.replace('<a class="btn btn-primary" href="#">', '<a class="btn btn-primary" href="https://ahmed123ali-jr.github.io/teacher-app/">')

left = set(re.findall(r'\{\{[^}]+\}\}', src))
pathlib.Path('index.html').write_text(src, encoding='utf-8')
print('✓ index.html مكتوب')
print('عناصرُ نائبةٌ باقية:', left if left else 'لا شيء')
