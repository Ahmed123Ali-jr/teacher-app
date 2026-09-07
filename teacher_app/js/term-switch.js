/* ==========================================================================
   term-switch.js — تبديل الفصل الدراسي ونقل الفصول معه.

   المعلّم حين ينتقل لا يريد بياناتٍ موسومة بل فصولاً جديدة: أسماء طلابه
   معه، وسجلّات المتابعة والملاحظات نظيفة. وهذا ما يفعله `carry`:

     • يُنسخ صفُّ الفصل بمادّته وصفّه وشعبته و**بنود التقييم كما رتّبها**
       — البنود طريقةُ تقييمه لا نتيجتُه، فترحل معه فارغةً من الدرجات.
     • تُنسخ أسماء الطلاب بهُويّاتهم وجوّالاتهم وترتيبهم — **بلا الملاحظات**،
       فملاحظةُ فصلٍ مضى ليست حكماً على فصلٍ لم يبدأ.
     • ولا يُمسّ الحضور ولا التقييمات ولا المشاركة ولا الاختبارات ولا أوراق
       العمل ولا المنهج ولا الواجبات — كلُّها معلّقةٌ بالصفّ القديم، فتبقى
       هناك محفوظةً ويبدأ الجديد فارغاً.

   ولا يُحذف شيء. فصول الفصل الأول باقيةٌ كما هي، والرجوع إليها تبديلٌ
   واحد — وهذا أهمّ ما في التصميم: قرارٌ يمكن نقضه لا يحتاج تحذيراً
   مرعباً، ويحتاج تحذيراً صادقاً.
   ========================================================================== */

(function (global) {
    'use strict';

    const TERMS = [
        { k: 1, label: 'الفصل الأول' },
        { k: 2, label: 'الفصل الثاني' }
    ];

    const labelOf = (n) => (TERMS.find((t) => t.k === Number(n)) || TERMS[0]).label;

    const DB = () => global.TeacherDB;

    async function current() {
        return DB().Term.current();
    }

    /** كل فصول المعلّم مقسومةً على الفصول الدراسية. */
    async function survey(teacherId) {
        const all = (await DB().Term.allClasses())
            .filter((c) => c.teacher_id === teacherId);
        const by = {};
        TERMS.forEach((t) => { by[t.k] = []; });
        all.forEach((c) => {
            const k = DB().Term.of(c);
            (by[k] = by[k] || []).push(c);
        });
        return by;
    }

    /* «الصف / الشعبة — المادة» كما في شاشة الفصول، لا صيغةً ثانيةً
       للشيء نفسه. */
    const nameOf = (c) => (c.section ? c.grade + ' / ' + c.section : c.grade)
        + (c.subject ? ' — ' + c.subject : '');

    /* ------------------------------------------------------------------
       النقل
       ------------------------------------------------------------------ */

    /**
     * ينسخ الفصول المختارة إلى فصلٍ دراسيٍّ آخر.
     * @param {string[]} classIds  هُويّات الفصول المنقولة
     * @param {number}   toTerm    الفصل الدراسي المقصود
     * @returns {Promise<{classes:number, students:number}>}
     */
    async function carry(classIds, toTerm) {
        const db = DB();
        const all = await db.Term.allClasses();
        const byId = {};
        all.forEach((c) => { byId[c.id] = c; });

        /* ══ الكشفُ المشترك ينتقل مشتركاً ══
           فصلان يقرآن الكشفَ نفسَه في الفصل الأوّل يجب أن يقرآه نفسَه في
           الثاني. ولو نُسخ `roster_id` كما هو لأشار إلى فصلٍ في الفصل
           الدراسيّ الماضي — رقمٌ لا يُقرأ هنا، فينفصل الشريكان ويعود
           الإدخالُ مرّتين.
           فتُبنى المجموعةُ من المنقول وحدَه: **أوّلُ ما يُنشأ منها هو
           الصاحبُ** (`roster_id = null`، أي كشفُه كشفُه)، والباقي يشير
           إليه. والطلابُ يُنسخون **مرّةً واحدةً للمجموعة**.

           و`studentsOf` تُسأل لا `getAllByIndex`: الطلابُ يسكنون فصلاً
           واحداً من المجموعة، فلو نُقل الشريكُ وحدَه وسُئل عن صفوفه
           لجاء فارغاً — ووصل المعلّمُ إلى فصلٍ جديدٍ بلا أسماء. */
        const rid = (c) => (c.roster_id || c.id);
        const group = new Map();   /* كشفٌ قديم → { owner: مُعرَّفٌ جديد, n } */

        let nClasses = 0, nStudents = 0;

        for (const id of classIds) {
            const src = byId[id];
            if (!src) continue;

            /* الهُويّة والتواريخ تُولَّد من جديد، والعدّاد يُحسب من المنقول
               لا يُنسخ — فلو فشل نسخُ طالبٍ بقي الرقم صادقاً. */
            const fresh = Object.assign({}, src);
            delete fresh.id;
            delete fresh.created_at;
            delete fresh.updated_at;
            fresh.term = toTerm;
            fresh.student_count = 0;

            const key  = rid(src);
            const seen = group.get(key);
            /* الصاحبُ يُترك فارغاً؛ ومن بعده يشير إليه. */
            fresh.roster_id = seen ? seen.owner : null;

            const newId = await db.add('classes', fresh);
            nClasses += 1;

            if (seen) {
                /* شريكٌ: الكشفُ منسوخٌ سلفاً، فيرث العددَ ولا يُعيد النسخ. */
                if (seen.n) {
                    const cls = await db.get('classes', newId);
                    if (cls) { cls.student_count = seen.n; await db.put('classes', cls); }
                }
                continue;
            }

            const students = await db.studentsOf(id);
            let moved = 0;
            for (const s of students) {
                try {
                    await db.add('students', {
                        teacher_id: s.teacher_id,
                        class_id:   newId,
                        name:       s.name,
                        national_id: s.national_id || null,
                        phone:      s.phone || null,
                        notes:      null,          /* الملاحظات تبدأ نظيفة */
                        sort_order: s.sort_order || 0
                    });
                    moved += 1;
                } catch (e) {
                    console.warn('[TermSwitch] تعذّر نقل الطالب:', s.name, e.message);
                }
            }
            nStudents += moved;
            group.set(key, { owner: newId, n: moved });

            if (moved !== fresh.student_count) {
                const cls = await db.get('classes', newId);
                if (cls) { cls.student_count = moved; await db.put('classes', cls); }
            }
        }

        return { classes: nClasses, students: nStudents };
    }

    /** يبدّل الفصل الدراسي ويُبطل مذكّرة التصفية. */
    async function setTerm(n) {
        await DB().Settings.set('academic_term', Number(n));
        DB().Term.forget();
    }

    global.TermSwitch = { TERMS, labelOf, current, survey, nameOf, carry, setTerm };
})(window);
