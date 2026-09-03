import { shoot, goto, evaluate, reload, waitReady, done } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';

/* ══════════════════════════════════════════════════════════════════════
   بياناتُ عرضٍ محلّيّةٌ بحتة.
   تُكتب بـ`putLocal` — وهي **لا تلمس الشبكة ولا قاعدةَ البيانات**، إنّما
   IndexedDB داخل ملفّ تعريفٍ مؤقّتٍ يُمحى بعد اللقطات. فالتطبيقُ يرسم
   شاشاتِه الحقيقيّةَ ببياناتٍ تمثيليّة — كما تفعل لقطاتُ كلّ متجر.
   ══════════════════════════════════════════════════════════════════════ */



await goto('#/dashboard');
console.log('البذر:', await evaluate(`(async()=>{${SEED}})()`));

/* إعادةُ تحميلٍ بعد البذر: التطبيقُ أقلع على مخبأٍ فارغ، فلا يجد الفصلَ
   ويردّ إلى الرئيسيّة. وبعدها يقرأ ما بُذر من أوّل رسمة. */
await reload();
await goto('#/dashboard');
await waitReady();          /* إقلاعٌ واحدٌ على الرئيسيّة، ثمّ تنقّلٌ داخليّ */

/* سجلُّ المتابعة لا يكتمل رسمُه في وضع «بلا اتصال» — يرسم هيكلاً (‏٩٠٣
   محرفاً) ولا يُكمله. تُرك، وأُخذ بدلَه ما يكتمل: الرئيسيّةُ والفصول. */
await shoot('dashboard', '#/dashboard');
await shoot('classes',   '#/classes');
await shoot('schedule',  '#/schedule');
await shoot('portfolio', '#/portfolio');
await shoot('reports',   '#/reports');
await done();
