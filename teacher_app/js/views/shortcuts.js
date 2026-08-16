/* ==========================================================================
   views/shortcuts.js — شاشة «إنجاز» في الشريط السفلي.
   أربعةُ مربّعاتٍ رصاصيةٍ في شبكةٍ واحدة — بنفس مواد صفحتي الفصول
   والرئيسية.

   وكان فوقها شريطٌ كحليٌّ عريض «ملف إنجازك» يذهب حيث يذهب أوّلُ مربّع:
   بابان إلى غرفةٍ واحدة، فحُذف الأعرض. وصفُّ «تذكيراتي» كان وحده بشكلٍ
   مخالف، فصار مربّعاً رابعاً — والشبكة تُقرأ صفّاً واحداً من الشكل.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function sectionsWord(n) {
        if (n === 0) return 'بلا أقسام';
        if (n === 1) return 'قسم واحد';
        if (n === 2) return 'قسمان';
        if (n <= 10) return `${n} أقسام`;
        return `${n} قسماً`;
    }

    function initiativesWord(n) {
        if (n === 0) return '٣٠ مبادرة جاهزة';
        if (n === 1) return 'مبادرة واحدة نُفِّذت';
        if (n === 2) return 'مبادرتان نُفِّذتا';
        if (n <= 10) return `${n} مبادرات نُفِّذت`;
        return `${n} مبادرة نُفِّذت`;
    }

    function evidenceWord(n) {
        if (n === 0) return 'لا شواهد';
        if (n === 1) return 'شاهد واحد';
        if (n === 2) return 'شاهدان';
        if (n <= 10) return `${n} شواهد`;
        return `${n} شاهداً`;
    }

    /* «قادم» لأن المعدود ما لم يُنجَز بعدُ وتاريخه اليوم أو بعده — الرقم
       وحده كان حبّةً على الصفّ، وقد صار المربّعُ يقرأه سطراً. */
    function remindersWord(n) {
        if (n === 0) return 'لا تذكيرات قادمة';
        if (n === 1) return 'تذكير واحد قادم';
        if (n === 2) return 'تذكيران قادمان';
        if (n <= 10) return `${n} تذكيرات قادمة`;
        return `${n} تذكيراً قادماً`;
    }

    /* الشواهد موزّعة على مخازن عدّة: بعضها في صف ملف الإنجاز وبعضها يُجمع
       من فصول المعلم — نعدّها كلها كي يرى رقماً يمثّل ملفه فعلاً. */
    async function collectStats(teacher) {
        /* الاستراتيجيات والمبادرات تُقرآن من سجلّاتهما لا من الجدولين
           القديمين المولَّدين — هذان صارا فارغين، فكان العدّ يُسقطهما. */
        const [portfolio, strategies, initiatives, classes, reminders] = await Promise.all([
            global.TeacherDB.get('portfolio', teacher.id),
            global.TeacherDB.getAllByIndex('strategy_logs',   'teacher_id', teacher.id),
            global.TeacherDB.getAllByIndex('initiative_logs', 'teacher_id', teacher.id),
            global.TeacherDB.getAllByIndex('classes',         'teacher_id', teacher.id),
            global.TeacherDB.getAllByIndex('reminders',       'teacher_id', teacher.id)
        ]);

        const perClass = await Promise.all(classes.map((c) => Promise.all([
            global.TeacherDB.getAllByIndex('exams',       'class_id', c.id),
            global.TeacherDB.getAllByIndex('worksheets',  'class_id', c.id),
            global.TeacherDB.getAllByIndex('assignments', 'class_id', c.id)
        ])));

        const sum = (i) => perClass.reduce((n, group) => n + group[i].length, 0);
        const p = portfolio || {};

        const buckets = [
            (p.certificates || []).length,
            (p.schedules || []).length,
            (p.extras || []).length,
            strategies.length,
            initiatives.length,
            sum(0), sum(1), sum(2)
        ];

        const filled = buckets.filter((n) => n > 0).length
            + (p.personal && Object.keys(p.personal).length ? 1 : 0)
            + ((p.mission || p.vision) ? 1 : 0);

        const today = todayISO();
        return {
            evidence: buckets.reduce((a, b) => a + b, 0),
            sections: filled,
            reminders: reminders.filter((r) => !r.done && r.date >= today).length,
            /* المبادرات المختلفة لا عدد مرات التنفيذ — المهم التنوّع. */
            initiatives: new Set(initiatives.map((r) =>
                r.initiative_key === '__custom__'
                    ? '__custom__:' + (r.custom_name || '')
                    : r.initiative_key)).size
        };
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const s = await collectStats(teacher);

        container.innerHTML = `
            <div class="container enjaz-v1">
                <div class="enjaz-grid">
                    <a href="#/portfolio" class="enjaz-tile">
                        <span class="ic">📁</span>
                        <span class="t">ملف الإنجاز</span>
                        <span class="h">${escapeHtml(sectionsWord(s.sections))} · ${escapeHtml(evidenceWord(s.evidence))}</span>
                    </a>
                    <a href="#/reports" class="enjaz-tile">
                        <span class="ic">📊</span>
                        <span class="t">التقارير</span>
                        <span class="h">الحضور والتقييمات</span>
                    </a>
                    <a href="#/initiatives" class="enjaz-tile">
                        <span class="ic">🌟</span>
                        <span class="t">المبادرات</span>
                        <span class="h">${escapeHtml(initiativesWord(s.initiatives))}</span>
                    </a>
                    <a href="#/reminders" class="enjaz-tile">
                        <span class="ic">🔔</span>
                        <span class="t">تذكيراتي</span>
                        <span class="h">${escapeHtml(remindersWord(s.reminders))}</span>
                    </a>
                </div>
            </div>
        `;
    }

    global.ShortcutsView = { render };
})(window);
