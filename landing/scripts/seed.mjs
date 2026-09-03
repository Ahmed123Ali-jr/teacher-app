/* بذرةُ بيانات العرض — محلّيّةٌ بحتة، يستعملها الالتقاطُ والتشخيص. */
export const TEACHER = '00000000-0000-4000-8000-000000000001';
export const CLASS_ID = 'cccccccc-0000-4000-8000-000000000000';

const NAMES = ['عبدالله الحربي', 'محمد الغامدي', 'سعد القحطاني', 'تركي العتيبي',
    'فهد الشهري', 'ريان الدوسري', 'عبدالعزيز المالكي', 'ناصر الزهراني',
    'سلطان البقمي', 'خالد السبيعي', 'ماجد الحارثي', 'بندر العنزي',
    'يوسف الرشيدي', 'إبراهيم الخالدي', 'صالح المطيري', 'عمر الأحمدي',
    'راكان الجهني', 'مشعل الثبيتي', 'وليد الصاعدي', 'أنس البلوي',
    'حسن العمري', 'طلال الفهيد', 'زياد النفيعي', 'عبدالرحمن الشمري'];

export const SEED = `
const uid = (p, i) => p + '-0000-4000-8000-' + String(i).padStart(12, '0');
const D = window.TeacherDB;
const T = '${TEACHER}';

await D.putLocal('teachers', {
    id: T, name: 'خالد الشمري', school_name: 'ثانوية الملك فهد',
    subjects: ['لغتي'], phone: '', region: 'منطقة الرياض',
});
await D.Settings.setLocal('education_dept', 'الإدارة العامة للتعليم بمنطقة الرياض');
await D.Settings.setLocal('school_gender', 'boys');
await D.Settings.setLocal('academic_term', 1);
await D.Settings.setLocal('onboarded', true);
/* التلميحاتُ تُعلَّم مرئيّةً — طبقتُها المعتمة تحجب نصفَ الشاشة في اللقطة */
await D.Settings.setLocal('hint_class_open', true);
await D.Settings.setLocal('hint_sched_edit', true);

const CLASSES = [
    /* مفاتيحُ المرحلة إنجليزيّةٌ في الكود (classes.js:48) — والعربيّةُ
       تسقط كلُّها في دلو «أخرى». */
    { g: 'الصف الثاني المتوسط', s: 'أ', st: 'intermediate', sub: 'لغتي' },
    { g: 'الصف الثالث المتوسط', s: 'ب', st: 'intermediate', sub: 'لغتي' },
    { g: 'الصف الأول الثانوي',  s: 'أ', st: 'secondary',    sub: 'لغتي' },
    { g: 'الصف الثاني الثانوي', s: 'ج', st: 'secondary',    sub: 'لغتي' },
];
const cids = [];
for (let i = 0; i < CLASSES.length; i++) {
    const c = CLASSES[i], id = uid('c'.repeat(8), i);
    cids.push(id);
    /* خاناتُ التقييم تُبذَر صراحةً: الشاشةُ تكتبها عند أوّل زيارةٍ إن
       غابت، وتلك كتابةٌ تمرّ بمسار المزامنة — فتُسبَق هنا فلا تُحتاج. */
    await D.putLocal('classes', {
        id, teacher_id: T, stage: c.st, grade: c.g, section: c.s, subject: c.sub,
        eval_columns: [
            { id: 'participation', name: 'المشاركة', type: 'stars',  max: 5  },
            { id: 'grade',         name: 'التقييم',  type: 'number', max: 10 },
        ],
    });
}

/* الفصلُ الأوّل ممتلئ: ٢٤ طالباً بحضورٍ ومشاركة */
const names = ${JSON.stringify(NAMES)};
const today = new Date().toISOString().slice(0, 10);
const ABSENT = [4, 11], LATE = [7], EXCUSED = [17];
for (let i = 0; i < names.length; i++) {
    const sid = uid('s'.repeat(8), i);
    await D.putLocal('students', { id: sid, class_id: cids[0], teacher_id: T, name: names[i] });
    const status = ABSENT.includes(i) ? 'absent' : LATE.includes(i) ? 'late'
                 : EXCUSED.includes(i) ? 'excused' : 'present';
    await D.putLocal('attendance', {
        id: uid('a'.repeat(8), i), student_id: sid, class_id: cids[0],
        teacher_id: T, date: today, status,
    });
    await D.putLocal('participation', {
        id: uid('p'.repeat(8), i), student_id: sid, class_id: cids[0],
        teacher_id: T, date: today, value: 3 + (i % 3),
    });
}
/* بقيّةُ الفصول بأعدادٍ فقط — تكفي لعدّادات الشاشات */
for (let c = 1; c < cids.length; c++) {
    for (let i = 0; i < 18 + c; i++) {
        await D.putLocal('students', {
            id: uid(String.fromCharCode(115 + c).repeat(8), i),
            class_id: cids[c], teacher_id: T, name: names[i % names.length],
        });
    }
}

/* جدولٌ أسبوعيٌّ مملوء — حصّةٌ واحدةٌ لكلّ (يوم، حصّة) بلا تكرار */
const DAY_PERIODS = [
    [1, 3, 5],       // الأحد
    [2, 4, 6],       // الاثنين
    [1, 3, 5, 7],    // الثلاثاء
    [2, 3, 6],       // الأربعاء
    [1, 4, 5],       // الخميس
];
let k = 0;
for (let day = 0; day < DAY_PERIODS.length; day++) {
    for (const period of DAY_PERIODS[day]) {
        await D.putLocal('schedule', {
            id: uid('h'.repeat(8), k), teacher_id: T, day, period,
            class_id: cids[k % cids.length], topic: '',
        });
        k++;
    }
}

/* محتوىً يظهر في ملفّ الإنجاز وفي عدّادات الفصل */
for (let i = 0; i < 3; i++) {
    await D.putLocal('exams', { id: uid('e'.repeat(8), i), class_id: cids[i % cids.length], teacher_id: T,
        title: ['اختبار الفترة الأولى','اختبار قصير — الوحدة الثالثة','اختبار الفترة الثانية'][i],
        questions: [], created_at: new Date().toISOString() });
    await D.putLocal('worksheets', { id: uid('w'.repeat(8), i), class_id: cids[i % cids.length], teacher_id: T,
        title: ['ورقة عمل — الجملة الاسمية','تدريبات الإملاء','مراجعة النحو'][i],
        items: [], created_at: new Date().toISOString() });
    await D.putLocal('assignments', { id: uid('g'.repeat(8), i), class_id: cids[i % cids.length], teacher_id: T,
        title: ['حل تمارين الدرس الخامس','قراءة الفصل الثاني','بحث قصير'][i],
        due_date: today, created_at: new Date().toISOString() });
}
return 'seeded';
`;
