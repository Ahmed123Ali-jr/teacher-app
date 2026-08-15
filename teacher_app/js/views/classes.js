/* ==========================================================================
   views/classes.js — Standalone classes list (used by bottom-nav → الفصول).
   Classes are grouped by stage (ابتدائي · متوسط · ثانوي).
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_ORDER  = ['primary', 'intermediate', 'secondary'];
    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        if (global.StageColors?.normalizeAll) await global.StageColors.normalizeAll(teacher.id);
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);

        container.innerHTML = `
            <div class="container">
                <div class="section-header classes-header" style="margin-top: var(--space-6);">
                    <button class="btn-add-gray" id="btn-add-class">+ إضافة فصل</button>
                </div>
                ${classes.length === 0
                    ? global.DashboardView.emptyClassesState()
                    : groupedHtml(classes)}
            </div>
        `;

        bind(container, teacher, classes);
    }

    /** Build sections grouped by stage; empty stages are skipped. */
    function groupedHtml(classes) {
        const buckets = { primary: [], intermediate: [], secondary: [], other: [] };
        for (const c of classes) {
            if (buckets[c.stage]) buckets[c.stage].push(c);
            else buckets.other.push(c);
        }

        const sections = STAGE_ORDER
            .filter((s) => buckets[s].length > 0)
            .map((s) => sectionHtml(STAGE_LABELS[s], buckets[s]));

        if (buckets.other.length) {
            sections.push(sectionHtml('أخرى', buckets.other));
        }

        /* زر الإضافة أعلى الصفحة وحده — تكراره أسفل البطاقات كان يشتّت. */
        return sections.join('');
    }

    /* لافتة المرحلة: الاسم وحده — بلا أيقونة ولا عدد. */
    function sectionHtml(label, list) {
        return `
            <div class="classes-stage-group">
                <h3 class="cl-stage">
                    <b>${label}</b>
                </h3>
                ${list.map(classRowHtml).join('')}
            </div>
        `;
    }

    /* على البطاقة نكتب الصف بلا كلمة «الصف» — «الرابع الابتدائي» بدل
       «الصف الرابع الابتدائي». الاسم المخزَّن لا يتغيّر. */
    function shortGrade(grade) {
        return String(grade || '').replace(/^\s*الصف\s+/, '');
    }

    /* صفّ واحد لكل فصل، تحت بعضها: اسم وفصل ومادة وحدها. التعديل انتقل
       إلى صفحة الفصل — هدف ضغط واحد في الصف أدقّ على الجوال من هدفين
       متجاورين. */
    function classRowHtml(c) {
        return `
            <button class="cls-row" data-class-id="${c.id}">
                <span class="cls-tx">
                    <span class="cls-t">${escapeHtml(c.section ? shortGrade(c.grade) + ' / ' + c.section : shortGrade(c.grade))}</span>
                    <span class="cls-s">${escapeHtml(c.subject)}</span>
                </span>
            </button>
        `;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function bind(container, teacher, classes) {
        const openAdd = () => global.DashboardView.openAddClassModal(teacher);

        container.querySelector('#btn-add-class')?.addEventListener('click', openAdd);
        container.querySelectorAll('[data-add-class], [data-empty-add]').forEach((el) => {
            el.addEventListener('click', openAdd);
        });
        container.querySelectorAll('.cls-row[data-class-id]').forEach((el) => {
            el.addEventListener('click', (e) => {
                // «تعديل» has its own handler — don't navigate into the class.
                global.location.hash = '#/class/' + el.dataset.classId;
            });
        });

        /* البطاقة لا تبدو مضغوطة، فيظنّ المعلّم أنها عرضٌ لا باب. يُبرَز
           أوّلها مرّةً واحدة — ولا شيء يُبرَز إن لم يكن له فصلٌ بعد. */
        const first = container.querySelector('.cls-row[data-class-id]');
        if (first && global.Hints) {
            global.Hints.showOnce('class_open', {
                target: first,
                title: 'اضغط على الفصل',
                text:  'يعرض لك ' + global.Words.students() + ' وحضورهم ودرجاتهم.'
            }).catch(() => {});
        }
    }

    global.ClassesView = { render };
})(window);
