/* ==========================================================================
   words.js — الكلمات التي تتبدّل بنوع المدرسة.

   «طالب» كانت مكتوبة نصاً ثابتاً في ست شاشات، فمعلّمة في مدرسة بنات ترى
   تطبيقاً يخاطبها بلغة غير لغتها. الكلمة الآن من مصدر واحد يقرأ نوع
   المدرسة مرة عند الإقلاع.
   ========================================================================== */

(function (global) {
    'use strict';

    const FORMS = {
        boys: {
            one:    'طالب',      two:  'طالبان',   many: 'طلاب',
            plural: 'الطلاب',    acc:  'طالباً',   theOne: 'الطالب'
        },
        girls: {
            one:    'طالبة',     two:  'طالبتان',  many: 'طالبات',
            plural: 'الطالبات',  acc:  'طالبةً',   theOne: 'الطالبة'
        }
    };

    let gender = 'boys';

    async function reload() {
        try {
            const v = await global.TeacherDB.Settings.get('school_gender');
            gender = (v === 'girls') ? 'girls' : 'boys';
        } catch { gender = 'boys'; }
        return gender;
    }

    function f() { return FORMS[gender] || FORMS.boys; }

    /** «طالب» أو «طالبة» — المفرد النكرة. */
    function student()     { return f().one; }
    /** «الطالب» أو «الطالبة». */
    function theStudent()  { return f().theOne; }
    /** «الطلاب» أو «الطالبات» — الجمع المعرّف. */
    function students()    { return f().plural; }
    /** «طلاب» أو «طالبات» — الجمع النكرة. */
    function studentsBare(){ return f().many; }

    /** عدد + تمييز صحيح عربياً: «طالب واحد · طالبان · ٣ طلاب · ١٢ طالباً». */
    function count(n) {
        const w = f();
        const num = Number(n) || 0;
        if (num === 0)  return 'بلا ' + w.many;
        if (num === 1)  return w.one + ' واحد' + (gender === 'girls' ? 'ة' : '');
        if (num === 2)  return w.two;
        if (num <= 10)  return num + ' ' + w.many;
        return num + ' ' + w.acc;
    }

    function isGirls() { return gender === 'girls'; }

    global.Words = { reload, student, theStudent, students, studentsBare, count, isGirls };
})(window);
