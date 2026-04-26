/* ==========================================================================
   views/classes.js — Standalone classes list (used by bottom-nav → الفصول).
   Classes are grouped by stage (ابتدائي · متوسط · ثانوي).
   ========================================================================== */

(function (global) {
    'use strict';

    const STAGE_ORDER  = ['primary', 'intermediate', 'secondary'];
    const STAGE_LABELS = { primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي' };
    const STAGE_ICONS  = { primary: '🏫', intermediate: '📘', secondary: '🎓' };

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);

        container.innerHTML = `
            <div class="container">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <h2 class="section-title">📚 فصولي</h2>
                    <button class="btn btn-primary" id="btn-add-class">+ إضافة فصل</button>
                </div>
                ${classes.length === 0
                    ? global.DashboardView.emptyClassesState()
                    : groupedHtml(classes)}
            </div>
        `;

        bind(container, teacher);
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
            .map((s) => sectionHtml(STAGE_LABELS[s], STAGE_ICONS[s], buckets[s]));

        if (buckets.other.length) {
            sections.push(sectionHtml('أخرى', '📚', buckets.other));
        }

        // Always show the "+ add" tile at the very end
        sections.push(`
            <div class="classes-add-tile-wrap">
                <button class="class-card class-card-add" data-add-class>
                    <span class="plus">+</span>
                    <span>إضافة فصل جديد</span>
                </button>
            </div>
        `);

        return sections.join('');
    }

    function sectionHtml(label, icon, list) {
        return `
            <div class="classes-stage-group">
                <h3 class="classes-stage-title">
                    <span>${icon}</span>
                    <span>${label}</span>
                    <span class="text-muted" style="font-size: var(--fs-sm); font-weight: normal;">
                        (${list.length})
                    </span>
                </h3>
                <div class="grid grid-3 classes-stage-grid">
                    ${list.map(classCardHtml).join('')}
                </div>
            </div>
        `;
    }

    function classCardHtml(c) {
        return `
            <button class="class-card" data-class-id="${c.id}"
                    style="--card-color: ${c.color || '#1E40AF'};">
                <div>
                    <h4 class="class-card-title">${escapeHtml(c.grade)} / ${escapeHtml(c.section)}</h4>
                    <div class="class-card-subject">${escapeHtml(c.subject)}</div>
                </div>
                <div class="class-card-meta">
                    <span>${c.student_count || 0} طالب</span>
                    <span class="class-card-count">📖</span>
                </div>
            </button>
        `;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function bind(container, teacher) {
        const openAdd = () => global.DashboardView.openAddClassModal(teacher);

        container.querySelector('#btn-add-class')?.addEventListener('click', openAdd);
        container.querySelectorAll('[data-add-class], [data-empty-add]').forEach((el) => {
            el.addEventListener('click', openAdd);
        });
        container.querySelectorAll('.class-card[data-class-id]').forEach((el) => {
            el.addEventListener('click', () => {
                global.location.hash = '#/class/' + el.dataset.classId;
            });
        });
    }

    global.ClassesView = { render };
})(window);
