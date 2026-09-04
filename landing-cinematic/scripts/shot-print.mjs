/* تصويرُ الورقة المطبوعة نفسِها — لا زرِّ الطباعة.
   `PdfCore.createStage` يبني مسرحاً حقيقيّاً بمقاس A4 خارج الشاشة
   (‏`left:-20000px`، عرض ٧٩٤px) ثمّ يلتقطه html2canvas ويبني PDF.
   فنعترضه: نُظهر المسرح، ونُبطل بناءَ الـPDF، ونصوّر الورقةَ كما هي. */
import { goto, evaluate, reload, waitReady, done, shootRaw, shootClip } from './shoot.mjs';
import { SEED, CLASS_ID } from './seed.mjs';
import { mkdirSync } from 'node:fs';
mkdirSync(process.env.SHOT_OUT || 'assets/screens', { recursive: true });

await goto('#/dashboard');
await evaluate(`(async()=>{${SEED}})()`);
await reload();
await goto('#/dashboard');
await waitReady();

/* اختبارٌ فيه أسئلةٌ حقيقيّة — المبذور بلا فقرات فتخرج ورقةٌ فارغة */
await evaluate(`(async () => {
  const ex = await TeacherDB.get('exams', 'eeeeeeee-0000-4000-8000-000000000000');
  ex.title = 'اختبار الفترة الأولى';
  ex.questions = [
    { id:'q1', type:'mcq', text:'ما نوعُ «كتب» في قولنا: كتب الطالبُ الدرسَ؟',
      options:['فعلٌ ماضٍ','فعلٌ مضارع','اسم','حرف'], answer:0, marks:2 },
    { id:'q2', type:'mcq', text:'أيُّ الكلمات الآتية جمعُ تكسير؟',
      options:['معلّمون','كتُب','مسلمات','قلمان'], answer:1, marks:2 },
    { id:'q3', type:'truefalse', text:'الفاعلُ يأتي مرفوعاً دائماً.', answer:true, marks:1 },
    { id:'q4', type:'truefalse', text:'همزةُ الوصل تُنطق في وسط الكلام.', answer:false, marks:1 },
    { id:'q5', type:'blank', text:'المفعولُ به منصوبٌ وعلامةُ نصبه ………', answer:'الفتحة', marks:2 },
    { id:'q6', type:'essay', text:'اكتب فقرةً من خمسة أسطرٍ عن أثر القراءة في بناء الشخصيّة.', marks:5 }
  ];
  await TeacherDB.putLocal('exams', ex);
  return ex.questions.length;
})()`).then(n => console.log('أسئلةُ الاختبار:', n));

await evaluate(`location.hash=${JSON.stringify('#/class/' + CLASS_ID + '/exams')}`);
await new Promise(r => setTimeout(r, 2200));
await evaluate(`(async()=>{const el=document.getElementById('app-main');
  await ClassView.render(el, ${JSON.stringify(CLASS_ID)}, 'exams');})()`);
await new Promise(r => setTimeout(r, 1200));

/* الاعتراض */
const pages = await evaluate(`(async () => {
  const orig = PdfCore.createStage;
  PdfCore.createStage = async function () {
    const s = await orig.apply(this, arguments);
    s.el.style.left = '0px'; s.el.style.top = '0px'; s.el.style.zIndex = '99999';
    window.__stage = s.el;
    const d = s.destroy; s.destroy = () => {};   // لا يُهدم قبل التصوير
    return s;
  };
  PdfCore.renderPdf = async () => new Blob([''], { type: 'application/pdf' });
  PdfCore.deliverPdf = async () => {};

  const cls = await TeacherDB.get('classes', ${JSON.stringify(CLASS_ID)});
  const exam = await TeacherDB.get('exams', 'eeeeeeee-0000-4000-8000-000000000000');
  const teacher = await TeacherDB.get('teachers', '00000000-0000-4000-8000-000000000001');
  try {
    await PrintExam.savePdf({ exam, cls, teacher },
      { header:true, teacherName:true, date:true, studentName:true, total:true, instructions:true, answerKey:true });
  } catch (e) { return 'خطأ: ' + String(e).slice(0,180); }
  const st = window.__stage;
  return st ? st.querySelectorAll('.pdfcore-page, .exam-page, [class*=page]').length : 'لا مسرح';
})()`);
console.log('صفحاتُ الورقة:', pages);

/* قياسُ صفحاتِ المسرح والتقاطُ كلٍّ منها كاملةً */
const boxes = await evaluate(`(() => {
  const st = window.__stage; if (!st) return [];
  const kids = [...st.children].filter(e => e.tagName !== 'STYLE' && e.offsetHeight > 200);
  return kids.map(e => { const r = e.getBoundingClientRect();
    return { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY),
             width: Math.round(r.width), height: Math.round(r.height) }; });
})()`);
console.log('صفحاتٌ مقيسة:', boxes.length, boxes[0] || '');
for (let i = 0; i < Math.min(boxes.length, 3); i++) {
    await shootClip(`exam-page-${i + 1}`, boxes[i], 2);
}
await done();
