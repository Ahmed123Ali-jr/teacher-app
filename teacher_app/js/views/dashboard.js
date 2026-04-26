/* ==========================================================================
   views/dashboard.js — Home screen with today summary + classes grid.
   ========================================================================== */

(function (global) {
    'use strict';

    const GRADES = {
        primary:      ['الصف الأول الابتدائي','الصف الثاني الابتدائي','الصف الثالث الابتدائي',
                       'الصف الرابع الابتدائي','الصف الخامس الابتدائي','الصف السادس الابتدائي'],
        intermediate: ['الصف الأول المتوسط','الصف الثاني المتوسط','الصف الثالث المتوسط'],
        secondary:    ['الصف الأول الثانوي','الصف الثاني الثانوي','الصف الثالث الثانوي']
    };

    const STAGE_LABELS = {
        primary: 'ابتدائي', intermediate: 'متوسط', secondary: 'ثانوي'
    };

    const COLORS = ['#1E40AF', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#8B5CF6', '#EC4899', '#14B8A6'];

    const SUBJECTS = [
        'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
        'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
        'الاجتماعيات', 'التاريخ', 'الجغرافيا',
        'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
    ];

    function teacherSubjects(teacher) {
        if (Array.isArray(teacher.subjects) && teacher.subjects.length) return teacher.subjects;
        return teacher.subject ? [teacher.subject] : [];
    }

    function subjectOptionsFor(teacher) {
        const mine  = teacherSubjects(teacher);
        const other = SUBJECTS.filter((s) => !mine.includes(s));
        const opts  = [`<option value="">— اختر المادة —</option>`];
        if (mine.length) {
            opts.push(`<optgroup label="المواد التي تدرّسها">`);
            mine.forEach((s) => opts.push(`<option value="${s}" ${s === mine[0] ? 'selected' : ''}>${s}</option>`));
            opts.push(`</optgroup>`);
        }
        if (other.length) {
            opts.push(`<optgroup label="مواد أخرى">`);
            other.forEach((s) => opts.push(`<option value="${s}">${s}</option>`));
            opts.push(`</optgroup>`);
        }
        return opts.join('');
    }

    function greet() {
        const h = new Date().getHours();
        if (h < 5)  return 'مساء الخير';
        if (h < 12) return 'صباح الخير';
        if (h < 18) return 'مساء الخير';
        return 'مساء الخير';
    }

    function nextClassWidgetHtml(info) {
        if (!info) return '';
        if (info.state === 'done') {
            return `
                <div class="next-class-widget done">
                    <span class="nc-icon">🎉</span>
                    <div>
                        <div class="nc-title">انتهت حصصك اليوم</div>
                        <div class="nc-sub">استمتع بباقي يومك</div>
                    </div>
                </div>
            `;
        }
        if (info.state === 'now') {
            return `
                <a href="#/class/${info.cls.id}" class="next-class-widget live">
                    <span class="nc-icon">▶️</span>
                    <div>
                        <div class="nc-title">حصتك الآن: ${info.cls.grade} / ${info.cls.section}</div>
                        <div class="nc-sub">${info.cls.subject} · حصة ${info.period.n} — تنتهي ${info.period.end}</div>
                    </div>
                </a>
            `;
        }
        if (info.state === 'upcoming') {
            const label = info.minsUntil <= 5 ? 'بعد دقائق ⏰' : `بعد ${info.minsUntil} دقيقة`;
            return `
                <a href="#/class/${info.cls.id}" class="next-class-widget upcoming">
                    <span class="nc-icon">🔔</span>
                    <div>
                        <div class="nc-title">حصتك القادمة: ${info.cls.grade} / ${info.cls.section} — ${label}</div>
                        <div class="nc-sub">${info.cls.subject} · حصة ${info.period.n} — ${info.period.start}</div>
                    </div>
                </a>
            `;
        }
        return '';
    }

    function hijriToday() {
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
                day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
            }).format(new Date());
        } catch {
            return new Date().toLocaleDateString('ar-SA');
        }
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) {
            global.location.hash = '#/login';
            return;
        }

        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const studentsAll = [];
        for (const c of classes) {
            const rows = await global.TeacherDB.getAllByIndex('students', 'class_id', c.id);
            studentsAll.push(...rows);
        }
        const remindersToday = global.RemindersView
            ? await global.RemindersView.todayCount(teacher)
            : 0;
        const nextClass = global.ScheduleView
            ? await global.ScheduleView.nextClassInfo(teacher)
            : null;

        // Today's scheduled periods count (Sun-Thu only; Fri/Sat → 0)
        const scheduleRows = await global.TeacherDB.getAllByIndex('schedule', 'teacher_id', teacher.id);
        const jsDay = new Date().getDay();
        const todayIdx = (jsDay >= 0 && jsDay <= 4) ? jsDay : -1;
        const todayPeriodsCount = todayIdx === -1
            ? 0
            : scheduleRows.filter((r) => r.day === todayIdx).length;

        const avatarHtml = global.ProfileView
            ? global.ProfileView.avatarInner(teacher, true)
            : `<span>${(teacher.name || '').charAt(0)}</span>`;

        container.innerHTML = `
            <div class="container">
                <div class="dashboard-section">
                    <h2 class="welcome-title">${greet()}، ${teacher.name} 👋</h2>
                    <p class="welcome-subtitle">
                        ${hijriToday()}
                    </p>

                    <a href="#/profile" class="card profile-card">
                        <div class="profile-card-avatar">${avatarHtml}</div>
                        <div class="profile-card-body">
                            <div class="profile-card-name">${teacher.name || ''}</div>
                            <div class="profile-card-meta">
                                ${teacher.school_name || ''}${teacherSubjects(teacher).length ? ' · ' + teacherSubjects(teacher).join('، ') : ''}
                            </div>
                            <div class="profile-card-hint">اضغط لعرض وتعديل بياناتك ←</div>
                        </div>
                    </a>

                    ${nextClassWidgetHtml(nextClass)}

                    <div class="grid grid-4">
                        <div class="card stat-card">
                            <div class="stat-icon">📚</div>
                            <div class="stat-value num">${classes.length}</div>
                            <div class="stat-label">فصولي</div>
                        </div>
                        <div class="card stat-card">
                            <div class="stat-icon">👥</div>
                            <div class="stat-value num">${studentsAll.length}</div>
                            <div class="stat-label">إجمالي الطلاب</div>
                        </div>
                        <a href="#/schedule" class="card stat-card stat-card-link">
                            <div class="stat-icon">📅</div>
                            <div class="stat-value num">${todayPeriodsCount}</div>
                            <div class="stat-label">حصص اليوم</div>
                        </a>
                        <a href="#/reminders" class="card stat-card stat-card-link">
                            <div class="stat-icon">🔔</div>
                            <div class="stat-value num">${remindersToday}</div>
                            <div class="stat-label">تذكيرات اليوم</div>
                        </a>
                    </div>
                </div>

                <div class="dashboard-section">
                    <div class="section-header">
                        <h3 class="section-title">📚 فصولي</h3>
                        <button class="btn btn-primary" id="btn-add-class">+ إضافة فصل</button>
                    </div>
                    <div class="grid grid-3" id="classes-grid">
                        ${classes.length === 0 ? emptyState() : classesHtml(classes)}
                    </div>
                </div>

                <div class="dashboard-section">
                    <h3 class="section-title">⚡ اختصارات سريعة</h3>
                    <div class="grid grid-4">
                        <a href="#/portfolio" class="shortcut-tile">
                            <span class="icon">📁</span>
                            <span class="label">ملف الإنجاز</span>
                        </a>
                        <a href="#/reports" class="shortcut-tile">
                            <span class="icon">📊</span>
                            <span class="label">التقارير</span>
                        </a>
                        <a href="#/reminders" class="shortcut-tile">
                            <span class="icon">🔔</span>
                            <span class="label">تذكيراتي</span>
                        </a>
                    </div>
                </div>
            </div>
        `;

        bind(container, teacher);
    }

    function emptyState() {
        return `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon">🏫</div>
                <h3>لا توجد فصول بعد</h3>
                <p>ابدأ بإضافة فصلك الأول لتنظيم طلابك ومتابعتهم.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة فصلي الأول</button>
            </div>
        `;
    }

    function classesHtml(classes) {
        const cards = classes.map((c) => `
            <button class="class-card" data-class-id="${c.id}"
                    style="--card-color: ${c.color || '#1E40AF'};">
                <div>
                    <h4 class="class-card-title">${STAGE_LABELS[c.stage] || ''} — ${c.grade} / ${c.section}</h4>
                    <div class="class-card-subject">${c.subject}</div>
                </div>
                <div class="class-card-meta">
                    <span>${c.student_count || 0} طالب</span>
                    <span class="class-card-count">📖</span>
                </div>
            </button>
        `).join('');

        const addTile = `
            <button class="class-card class-card-add" data-add-class>
                <span class="plus">+</span>
                <span>إضافة فصل جديد</span>
            </button>
        `;
        return cards + addTile;
    }

    function bind(container, teacher) {
        const openAdd = () => openAddClassModal(teacher);

        const addBtn = container.querySelector('#btn-add-class');
        if (addBtn) addBtn.addEventListener('click', openAdd);

        container.querySelectorAll('[data-add-class], [data-empty-add]').forEach((el) => {
            el.addEventListener('click', openAdd);
        });

        container.querySelectorAll('.class-card[data-class-id]').forEach((el) => {
            el.addEventListener('click', () => {
                global.location.hash = '#/class/' + el.dataset.classId;
            });
        });

        container.querySelectorAll('.shortcut-tile').forEach((el) => {
            // Only show placeholder toast for shortcuts without a real href
            if (el.tagName === 'A' && el.getAttribute('href')) return;
            el.addEventListener('click', () => {
                global.TeacherApp.toast('هذه الشاشة ستُبنى في مرحلة لاحقة.', 'info');
            });
        });
    }

    /* ---------- Add class modal ---------- */
    function openAddClassModal(teacher) {
        let selectedColor = COLORS[0];
        let stage = 'primary';

        const form = document.createElement('form');
        form.id = 'form-add-class';
        form.innerHTML = `
            <div class="field">
                <label class="label" for="c-stage">المرحلة *</label>
                <select class="select" id="c-stage" required>
                    <option value="primary">ابتدائي</option>
                    <option value="intermediate">متوسط</option>
                    <option value="secondary">ثانوي</option>
                </select>
            </div>

            <div class="field">
                <label class="label" for="c-grade">الصف *</label>
                <select class="select" id="c-grade" required></select>
            </div>

            <div class="field">
                <label class="label" for="c-section">الشعبة *</label>
                <input class="input" id="c-section" type="text" required
                       placeholder="أ" maxlength="8">
            </div>

            <div class="field">
                <label class="label" for="c-subject">المادة *</label>
                <select class="select" id="c-subject" required>
                    ${subjectOptionsFor(teacher)}
                </select>
            </div>

            <div class="field">
                <label class="label">لون مميز</label>
                <div class="color-picker" id="c-colors">
                    ${COLORS.map((c, i) => `
                        <button type="button" class="color-chip ${i === 0 ? 'selected' : ''}"
                                style="background:${c}" data-color="${c}" aria-label="${c}"></button>
                    `).join('')}
                </div>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">حفظ الفصل</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        const gradeSel = form.querySelector('#c-grade');
        function refreshGrades() {
            gradeSel.innerHTML = GRADES[stage]
                .map((g) => `<option value="${g}">${g}</option>`).join('');
        }
        refreshGrades();

        form.querySelector('#c-stage').addEventListener('change', (e) => {
            stage = e.target.value; refreshGrades();
        });

        form.querySelectorAll('.color-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                form.querySelectorAll('.color-chip').forEach((c) => c.classList.remove('selected'));
                chip.classList.add('selected');
                selectedColor = chip.dataset.color;
            });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                await global.TeacherDB.add('classes', {
                    teacher_id: teacher.id,
                    stage:      form.querySelector('#c-stage').value,
                    grade:      form.querySelector('#c-grade').value,
                    section:    form.querySelector('#c-section').value.trim(),
                    subject:    form.querySelector('#c-subject').value,
                    color:      selectedColor,
                    student_count: 0,
                    created_at: new Date().toISOString()
                });
                global.Modal.close();
                global.TeacherApp.toast('تمت إضافة الفصل ✅', 'success');
                await render(document.getElementById('view-dashboard'));
            } catch (err) {
                global.TeacherApp.toast('فشل الحفظ: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });

        global.Modal.open({ title: 'إضافة فصل جديد', body: form });
    }

    global.DashboardView = {
        render,
        // Exposed helpers so the standalone #/classes screen can reuse the
        // exact same rendering + modal without duplicating code.
        openAddClassModal,
        classesHtml,
        emptyClassesState: emptyState
    };
})(window);
