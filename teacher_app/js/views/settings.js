/* ==========================================================================
   views/settings.js — Menu-style settings (Snapchat-like).
   Main screen = list of rows with a chevron. Tapping a row opens its page.
   ========================================================================== */

(function (global) {
    'use strict';

    const APP_VERSION = '0.9.0';
    const APP_RELEASE_DATE = '2026-04';
    const SUPPORT_EMAIL = 'support@teacher-app.local';

    const KIND_LABELS = {
        exam:        'اختبارات',
        exam_regen:  'إعادة توليد سؤال',
        worksheet:   'أوراق عمل',
        strategy:    'تقارير استراتيجيات',
        initiative:  'تقارير مبادرات',
        mission:     'رسالة ورؤية',
        other:       'أخرى'
    };

    const CHANGELOG = [
        { v: '0.9.0', date: '2026-04', items: [
            'شاشة الملف التعريفي مع تعديل فوري لكل حقل',
            'تقرير استهلاك الذكاء الاصطناعي + تقدير التكلفة',
            'تحسينات شاملة لتجربة الجوال'
        ]},
        { v: '0.8.0', date: '2026-03', items: [
            'شاشة التقارير مع تحليل الحضور والتقييمات',
            'طباعة سجل الطلاب (سجل فارغ / معبّأ / فترة / مجمّع)'
        ]},
        { v: '0.7.0', date: '2026-03', items: [
            'الجدول الأسبوعي + إشعارات الحصة القادمة',
            'ملف الإنجاز مع تقارير AI للاستراتيجيات والمبادرات'
        ]}
    ];

    /**
     * Menu items. `page` is the detail-screen key; if it's a direct hash,
     * tapping navigates there instead of opening a subsection.
     */
    const MENU_GROUPS = [
        {
            title: 'الحساب',
            items: [
                { page: 'profile-link', icon: '👤', label: 'ملفي التعريفي',     sub: 'الاسم، البريد، التخصص...', href: '#/profile' },
                { page: 'password',      icon: '🔐', label: 'كلمة المرور',       sub: 'تغيير كلمة المرور' },
                { page: 'school',        icon: '🏫', label: 'معلومات المدرسة',   sub: 'الشعار، العام الدراسي، المدير' },
                { page: 'reminders',     icon: '🔔', label: 'التذكيرات والإشعارات', sub: 'تذكيري بالحضور والنسخ الاحتياطي' }
            ]
        },
        {
            title: 'المظهر والعرض',
            items: [
                { page: 'appearance',    icon: '🎨', label: 'مظهر التطبيق',      sub: 'الوضع الليلي وحجم الخط' }
            ]
        },
        {
            title: 'البيانات',
            items: [
                { page: 'stats',         icon: '📊', label: 'إحصائياتي',        sub: 'الفصول، الطلاب، الملفات' },
                { page: 'usage',         icon: '🤖', label: 'استهلاك الذكاء الاصطناعي', sub: 'التوكنز والتكلفة التقديرية' },
                { page: 'backup',        icon: '💾', label: 'النسخ الاحتياطي',    sub: 'تصدير واستيراد بياناتك' }
            ]
        },
        {
            title: 'الاشتراك',
            items: [
                { page: 'subscription',  icon: '💳', label: 'الاشتراك',          sub: 'الخطة الحالية وتاريخ التجديد' },
                { page: 'invite',        icon: '👥', label: 'ادعُ معلماً',        sub: 'احصل على شهر مجاني' }
            ]
        },
        {
            title: 'معلومات',
            items: [
                { page: 'about',         icon: 'ℹ️', label: 'عن التطبيق',         sub: 'الإصدار وسجل التحديثات' },
                { page: 'legal',         icon: '📜', label: 'الخصوصية والقانون',  sub: 'ما نحفظه وما نرسله' },
                { page: 'support',       icon: '💬', label: 'الدعم الفني',         sub: 'تواصل معنا' }
            ]
        },
        {
            title: 'خطر',
            items: [
                { page: 'danger',        icon: '🔥', label: 'حذف جميع البيانات',   sub: 'لا يمكن التراجع', danger: true }
            ]
        }
    ];

    /* ==========================================================================
       Helpers
       ========================================================================== */

    function fmtNum(n) {
        if (typeof n !== 'number') n = Number(n) || 0;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
        if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
        return String(n);
    }
    function fmtBytes(bytes) {
        if (!bytes) return '0 KB';
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(0) + ' KB';
        const mb = kb / 1024;
        if (mb < 1024) return mb.toFixed(1) + ' MB';
        return (mb / 1024).toFixed(2) + ' GB';
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    async function getPref(key, fallback) {
        const v = await global.TeacherDB.Settings.get(key);
        return v === undefined ? fallback : v;
    }
    async function setPref(key, value) {
        await global.TeacherDB.Settings.set(key, value);
    }

    async function computeQuickStats(teacher) {
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        let students = 0, exams = 0, worksheets = 0, homework = 0;
        let storageBytes = 0;

        for (const c of classes) {
            const s = await global.TeacherDB.getAllByIndex('students', 'class_id', c.id);
            students += s.length;
            const e = await global.TeacherDB.getAllByIndex('exams', 'class_id', c.id);
            exams += e.length;
            const w = await global.TeacherDB.getAllByIndex('worksheets', 'class_id', c.id);
            worksheets += w.length;
            const h = await global.TeacherDB.getAllByIndex('assignments', 'class_id', c.id);
            homework += h.length;
            const books = await global.TeacherDB.getAllByIndex('books', 'class_id', c.id);
            for (const b of books) if (b.file) storageBytes += b.file.size || 0;
        }
        const strategies = await global.TeacherDB.getAllByIndex('strategies', 'teacher_id', teacher.id);
        const initiatives= await global.TeacherDB.getAllByIndex('initiatives','teacher_id', teacher.id);

        return { classes: classes.length, students, exams, worksheets, homework,
                 strategies: strategies.length, initiatives: initiatives.length, storageBytes };
    }

    async function loadAllPrefs() {
        return {
            academic_year:    await getPref('academic_year',    ''),
            principal_name:   await getPref('principal_name',   ''),
            school_logo:      await getPref('school_logo',      null),
            remind_attendance:await getPref('remind_attendance',false),
            attendance_time:  await getPref('attendance_time',  '08:00'),
            remind_backup:    await getPref('remind_backup',    true),
            backup_days:      await getPref('backup_days',      7),
            remind_next_class:await getPref('remind_next_class',true),
            theme:            await getPref('theme',            'light'),
            font_size:        await getPref('font_size',        'medium'),
            last_backup:      await getPref('last_backup',      null),
            plan:             await getPref('plan',             'basic')
        };
    }

    /* ==========================================================================
       Sub-page state (pure in-memory so no router work needed)
       ========================================================================== */

    const state = { page: null };

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        if (!state.page) {
            renderMenu(container, teacher);
        } else {
            renderPage(container, teacher, state.page);
        }
    }

    /* ==========================================================================
       MAIN MENU (list)
       ========================================================================== */

    function renderMenu(container, teacher) {
        container.innerHTML = `
            <div class="container" style="max-width: 720px;">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <div>
                        <a href="#/dashboard" class="btn btn-ghost btn-sm">← الرئيسية</a>
                        <h2 class="section-title" style="display:inline-block; margin-right:var(--space-3);">
                            ⚙️ الإعدادات
                        </h2>
                    </div>
                </div>

                ${MENU_GROUPS.map(groupHtml).join('')}

                <div style="text-align: center; color: var(--text-muted); font-size: var(--fs-sm); margin: var(--space-6) 0 var(--space-10);">
                    الإصدار ${APP_VERSION}
                </div>
            </div>
        `;

        container.querySelectorAll('[data-settings-page]').forEach((el) => {
            el.addEventListener('click', (e) => {
                const href = el.getAttribute('href');
                if (href) return; // actual navigation link, let the browser handle it
                e.preventDefault();
                state.page = el.dataset.settingsPage;
                render(container);
            });
        });
    }

    function groupHtml(group) {
        return `
            <div class="settings-group">
                <div class="settings-group-title">${group.title}</div>
                <div class="settings-list">
                    ${group.items.map((it) => itemHtml(it)).join('')}
                </div>
            </div>
        `;
    }

    function itemHtml(it) {
        const tag = it.href ? 'a' : 'button';
        const hrefAttr = it.href ? ` href="${it.href}"` : ' type="button"';
        return `
            <${tag} class="settings-item ${it.danger ? 'is-danger' : ''}"
                    data-settings-page="${it.page}"${hrefAttr}>
                <span class="settings-item-icon">${it.icon}</span>
                <span class="settings-item-label">${it.label}</span>
                <span class="settings-item-chev">❯</span>
            </${tag}>
        `;
    }

    /* ==========================================================================
       SUB-PAGES
       ========================================================================== */

    async function renderPage(container, teacher, page) {
        const prefs = await loadAllPrefs();

        let title = '';
        let body  = '';
        let bindFn = null;

        switch (page) {
            case 'password':
                title = '🔐 تغيير كلمة المرور'; body = passwordBody(); bindFn = bindPassword; break;
            case 'school':
                title = '🏫 معلومات المدرسة'; body = schoolBody(teacher, prefs); bindFn = bindSchool; break;
            case 'reminders':
                title = '🔔 التذكيرات'; body = remindersBody(prefs); bindFn = bindReminders; break;
            case 'appearance':
                title = '🎨 مظهر التطبيق'; body = appearanceBody(prefs); bindFn = bindAppearance; break;
            case 'stats':
                title = '📊 إحصائياتي';
                body = await statsBody(teacher);
                break;
            case 'usage':
                title = '🤖 استهلاك الذكاء الاصطناعي';
                body = usageBody(await global.AI.getUsage());
                bindFn = bindUsage;
                break;
            case 'backup':
                title = '💾 النسخ الاحتياطي'; body = backupBody(prefs); bindFn = bindBackup; break;
            case 'subscription':
                title = '💳 الاشتراك'; body = subscriptionBody(prefs); break;
            case 'invite':
                title = '👥 ادعُ معلماً'; body = inviteBody(); bindFn = bindInvite; break;
            case 'about':
                title = 'ℹ️ عن التطبيق'; body = aboutBody(); break;
            case 'legal':
                title = '📜 الخصوصية والقانون'; body = legalBody(await computeQuickStats(teacher)); break;
            case 'support':
                title = '💬 الدعم الفني'; body = supportBody(); break;
            case 'danger':
                title = '🔥 حذف جميع البيانات'; body = dangerBody(); bindFn = bindDanger; break;
            default:
                state.page = null; render(container); return;
        }

        container.innerHTML = `
            <div class="container" style="max-width: 720px;">
                <div class="settings-page-header">
                    <button type="button" class="btn btn-ghost btn-sm" id="btn-back-settings">← رجوع</button>
                    <h2 class="section-title" style="margin: 0 var(--space-3);">${title}</h2>
                </div>

                <div class="card" style="margin-bottom: var(--space-8);">
                    ${body}
                </div>
            </div>
        `;

        container.querySelector('#btn-back-settings').addEventListener('click', () => {
            state.page = null;
            render(container);
        });

        if (bindFn) bindFn(container, teacher);
    }

    /* ---------- Page bodies ---------- */

    function passwordBody() {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                لتغيير كلمة المرور، أدخل الحالية ثم الجديدة.
            </p>

            <div class="field">
                <label class="label" for="pw-current">كلمة المرور الحالية</label>
                <input class="input" id="pw-current" type="password" autocomplete="current-password">
            </div>

            <div class="field">
                <label class="label" for="pw-new">كلمة المرور الجديدة</label>
                <input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="6">
                <div class="field-hint">٦ أحرف على الأقل.</div>
            </div>

            <div class="field">
                <label class="label" for="pw-confirm">تأكيد كلمة المرور الجديدة</label>
                <input class="input" id="pw-confirm" type="password" autocomplete="new-password">
            </div>

            <button class="btn btn-primary btn-block" id="btn-change-pw">💾 حفظ كلمة المرور</button>
        `;
    }

    function bindPassword(container) {
        const btn = container.querySelector('#btn-change-pw');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const current = container.querySelector('#pw-current').value;
            const next    = container.querySelector('#pw-new').value;
            const confirm = container.querySelector('#pw-confirm').value;

            if (!current || !next || !confirm) {
                return global.TeacherApp.toast('عبّئ جميع الحقول.', 'warning');
            }
            if (next !== confirm) {
                return global.TeacherApp.toast('كلمة المرور الجديدة غير متطابقة مع التأكيد.', 'warning');
            }
            if (next === current) {
                return global.TeacherApp.toast('كلمة المرور الجديدة يجب أن تكون مختلفة.', 'warning');
            }

            btn.disabled = true;
            try {
                await global.Auth.changePassword(current, next);
                global.TeacherApp.toast('تم تغيير كلمة المرور ✅', 'success');
                container.querySelector('#pw-current').value = '';
                container.querySelector('#pw-new').value     = '';
                container.querySelector('#pw-confirm').value = '';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        });
    }

    function schoolBody(teacher, prefs) {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                هذه البيانات تظهر في ترويسة جميع المطبوعات.
            </p>

            <div class="field">
                <label class="label">اسم المدرسة</label>
                <input class="input" id="pref-school-name" type="text"
                       value="${escapeAttr(teacher.school_name || '')}">
            </div>

            <div class="grid grid-2">
                <div class="field">
                    <label class="label">العام الدراسي</label>
                    <input class="input" id="pref-academic-year" type="text"
                           placeholder="١٤٤٧/١٤٤٨"
                           value="${escapeAttr(prefs.academic_year || '')}">
                </div>
                <div class="field">
                    <label class="label">اسم مدير المدرسة</label>
                    <input class="input" id="pref-principal-name" type="text"
                           placeholder="للخطابات الرسمية"
                           value="${escapeAttr(prefs.principal_name || '')}">
                </div>
            </div>

            <div class="field">
                <label class="label">شعار المدرسة (اختياري)</label>
                <div class="flex gap-3" style="align-items: center; flex-wrap: wrap;">
                    <div class="school-logo-preview">
                        ${prefs.school_logo instanceof Blob
                            ? `<img src="${URL.createObjectURL(prefs.school_logo)}" alt="">`
                            : '<span>🏫</span>'}
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-logo">
                        📷 ${prefs.school_logo ? 'تغيير الشعار' : 'رفع شعار'}
                    </button>
                    ${prefs.school_logo ? '<button class="btn btn-ghost btn-sm" id="btn-remove-logo">🗑️</button>' : ''}
                    <input type="file" id="logo-input" accept="image/*" hidden>
                </div>
            </div>

            <button class="btn btn-primary btn-block" id="btn-save-school">💾 حفظ</button>
        `;
    }

    function bindSchool(container, teacher) {
        const logoInput = container.querySelector('#logo-input');
        container.querySelector('#btn-upload-logo')?.addEventListener('click', () => logoInput?.click());
        logoInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 3 * 1024 * 1024) {
                return global.TeacherApp.toast('الصورة كبيرة (أقصى ٣ MB).', 'warning');
            }
            await setPref('school_logo', file);
            await refreshPrintCache();
            global.TeacherApp.toast('تم رفع الشعار ✅', 'success');
            await render(container);
        });
        container.querySelector('#btn-remove-logo')?.addEventListener('click', async () => {
            if (!global.confirm('حذف الشعار؟')) return;
            await global.TeacherDB.Settings.unset('school_logo');
            await refreshPrintCache();
            global.TeacherApp.toast('تم الحذف.', 'info');
            await render(container);
        });
        container.querySelector('#btn-save-school')?.addEventListener('click', async () => {
            teacher.school_name = container.querySelector('#pref-school-name').value.trim();
            teacher.updated_at = new Date().toISOString();
            await global.TeacherDB.put('teachers', teacher);
            await setPref('academic_year',  container.querySelector('#pref-academic-year').value.trim());
            await setPref('principal_name', container.querySelector('#pref-principal-name').value.trim());
            await refreshPrintCache();
            global.TeacherApp.toast('تم الحفظ ✅', 'success');
        });
    }

    function remindersBody(prefs) {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                سيظهر تنبيه في الرئيسية عند فتح التطبيق إذا حان موعد التذكير.
            </p>

            <label class="cb-row">
                <input type="checkbox" id="pref-remind-attendance" ${prefs.remind_attendance ? 'checked' : ''}>
                <span>ذكّرني بأخذ الحضور يومياً في
                    <input class="input input-sm" id="pref-attendance-time" type="time"
                           style="max-width: 120px; display: inline-block;"
                           value="${prefs.attendance_time || '08:00'}">
                </span>
            </label>
            <label class="cb-row">
                <input type="checkbox" id="pref-remind-backup" ${prefs.remind_backup ? 'checked' : ''}>
                <span>ذكّرني بعمل نسخة احتياطية كل
                    <select class="select select-sm" id="pref-backup-days" style="max-width: 110px; display: inline-block;">
                        <option value="7"  ${prefs.backup_days === 7  ? 'selected' : ''}>٧ أيام</option>
                        <option value="14" ${prefs.backup_days === 14 ? 'selected' : ''}>أسبوعين</option>
                        <option value="30" ${prefs.backup_days === 30 ? 'selected' : ''}>شهر</option>
                    </select>
                </span>
            </label>
            <label class="cb-row">
                <input type="checkbox" id="pref-remind-class" ${prefs.remind_next_class !== false ? 'checked' : ''}>
                <span>أظهر تنبيه "الحصة القادمة" في الرئيسية</span>
            </label>

            <button class="btn btn-primary btn-block" id="btn-save-reminders"
                    style="margin-top: var(--space-3);">💾 حفظ</button>
        `;
    }
    function bindReminders(container) {
        container.querySelector('#btn-save-reminders')?.addEventListener('click', async () => {
            await setPref('remind_attendance', container.querySelector('#pref-remind-attendance').checked);
            await setPref('attendance_time',   container.querySelector('#pref-attendance-time').value);
            await setPref('remind_backup',     container.querySelector('#pref-remind-backup').checked);
            await setPref('backup_days',       Number(container.querySelector('#pref-backup-days').value));
            await setPref('remind_next_class', container.querySelector('#pref-remind-class').checked);
            global.TeacherApp.toast('تم حفظ التفضيلات ✅', 'success');
        });
    }

    function appearanceBody(prefs) {
        return `
            <div class="field">
                <label class="label">الوضع</label>
                <div class="flex gap-2" style="flex-wrap: wrap;">
                    ${themeChip('light', '☀️', 'فاتح',   prefs.theme)}
                    ${themeChip('dark',  '🌙', 'داكن',    prefs.theme)}
                    ${themeChip('auto',  '🌓', 'تلقائي',  prefs.theme)}
                </div>
            </div>
            <div class="field">
                <label class="label">حجم الخط</label>
                <div class="flex gap-2" style="flex-wrap: wrap;">
                    ${fontChip('small',  '12px', 'صغير',   prefs.font_size)}
                    ${fontChip('medium', '16px', 'متوسط',  prefs.font_size)}
                    ${fontChip('large',  '20px', 'كبير',   prefs.font_size)}
                </div>
            </div>
        `;
    }
    function themeChip(value, icon, label, current) {
        const active = (current || 'light') === value;
        return `<button type="button" class="chip ${active ? 'active' : ''}" data-theme="${value}"
                        style="flex:1; min-width:100px;">${icon} ${label}</button>`;
    }
    function fontChip(value, size, label, current) {
        const active = (current || 'medium') === value;
        return `<button type="button" class="chip ${active ? 'active' : ''}" data-font="${value}"
                        style="flex:1; min-width:100px;"><span style="font-size:${size}">أ</span> ${label}</button>`;
    }
    function bindAppearance(container) {
        container.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                await setPref('theme', btn.dataset.theme);
                applyTheme(btn.dataset.theme);
                container.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('active', b === btn));
                global.TeacherApp.toast('تم تغيير الوضع.', 'success', 1200);
            });
        });
        container.querySelectorAll('[data-font]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                await setPref('font_size', btn.dataset.font);
                applyFontSize(btn.dataset.font);
                container.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('active', b === btn));
                global.TeacherApp.toast('تم تغيير الحجم.', 'success', 1200);
            });
        });
    }

    async function statsBody(teacher) {
        const stats = await computeQuickStats(teacher);
        return `
            <div class="grid grid-2">
                ${miniStat('📚', stats.classes,    'فصول')}
                ${miniStat('👥', stats.students,   'طلاب')}
                ${miniStat('📝', stats.exams,      'اختبارات')}
                ${miniStat('📄', stats.worksheets, 'أوراق عمل')}
                ${miniStat('📚', stats.homework,   'واجبات')}
                ${miniStat('🎯', stats.strategies, 'استراتيجيات')}
                ${miniStat('🌟', stats.initiatives,'مبادرات')}
                ${miniStat('💾', fmtBytes(stats.storageBytes), 'ملفات مرفوعة')}
            </div>
        `;
    }
    function miniStat(icon, value, label) {
        return `
            <div style="padding: var(--space-4); background: var(--surface-alt); border-radius: var(--radius-md);">
                <div style="font-size: 22px; line-height: 1;">${icon}</div>
                <div style="font-size: var(--fs-display); font-weight: var(--fw-black); color: var(--primary); line-height: 1; margin-top: var(--space-2);">${value}</div>
                <div class="text-muted" style="font-size: var(--fs-sm); margin-top: 2px;">${label}</div>
            </div>
        `;
    }

    function usageBody(usage) {
        const cost = global.AI.estimateCost(usage);
        if (usage.calls === 0) return '<p class="text-muted" style="margin:0;">لم يتم استخدام الذكاء الاصطناعي بعد.</p>';
        const entries = Object.entries(usage.byKind || {});
        return `
            <div class="grid grid-2" style="margin-bottom: var(--space-4);">
                ${miniStat('🔢', usage.calls, 'طلبات')}
                ${miniStat('💵', '$' + cost.usd.toFixed(3), '~' + cost.sar.toFixed(2) + ' ر.س')}
                ${miniStat('⬇️', fmtNum(usage.totalInput),  'توكنز مُدخَلة')}
                ${miniStat('⬆️', fmtNum(usage.totalOutput), 'توكنز مُخرَجة')}
            </div>
            ${entries.length ? `
                <div class="table-wrapper">
                    <table class="students-table">
                        <thead><tr><th>النوع</th><th>الطلبات</th><th>مُدخَل</th><th>مُخرَج</th></tr></thead>
                        <tbody>
                            ${entries.map(([k, s]) => `
                                <tr><td>${KIND_LABELS[k] || k}</td><td class="num">${s.calls}</td><td class="num">${fmtNum(s.in)}</td><td class="num">${fmtNum(s.out)}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}
            <div class="flex gap-3" style="margin-top: var(--space-4); flex-wrap: wrap;">
                <a href="https://console.anthropic.com/settings/usage" target="_blank"
                   class="btn btn-secondary btn-sm">🔗 لوحة Anthropic (الدقيقة)</a>
                <button class="btn btn-ghost btn-sm" id="btn-reset-usage">↺ تصفير العدّاد</button>
            </div>
        `;
    }
    function bindUsage(container) {
        container.querySelector('#btn-reset-usage')?.addEventListener('click', async () => {
            if (!global.confirm('تصفير عدّاد استهلاك الذكاء الاصطناعي؟')) return;
            await global.AI.clearUsage();
            global.TeacherApp.toast('تم التصفير.', 'info');
            await render(container);
        });
    }

    function backupBody(prefs) {
        return `
            <p class="text-muted" style="font-size:var(--fs-sm); margin-top: 0; margin-bottom:var(--space-4);">
                آخر نسخة احتياطية:
                <strong>${prefs.last_backup ? fmtDate(prefs.last_backup) : 'لم يتم من قبل'}</strong>
            </p>
            <div class="flex gap-3" style="flex-wrap: wrap;">
                <button class="btn btn-primary" id="btn-export">📤 تصدير جميع البيانات</button>
                <button class="btn btn-secondary" id="btn-import">📥 استيراد نسخة</button>
                <input type="file" id="import-file" accept=".json" hidden>
            </div>
        `;
    }
    function bindBackup(container) {
        container.querySelector('#btn-export')?.addEventListener('click', async () => {
            try {
                const dump = await global.TeacherDB.exportAll();
                const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `teacher_backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                await setPref('last_backup', new Date().toISOString());
                global.TeacherApp.toast('تم التصدير ✅', 'success');
                await render(container);
            } catch (err) {
                global.TeacherApp.toast('فشل التصدير: ' + err.message, 'error');
            }
        });
        const importFile = container.querySelector('#import-file');
        container.querySelector('#btn-import')?.addEventListener('click', () => importFile?.click());
        importFile?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!global.confirm('استيراد النسخة سيستبدل البيانات الحالية. متابعة؟')) return;
            try {
                const text = await file.text();
                const dump = JSON.parse(text);
                await global.TeacherDB.importAll(dump);
                global.TeacherApp.toast('تم الاستيراد ✅', 'success');
                setTimeout(() => location.reload(), 600);
            } catch (err) {
                global.TeacherApp.toast('فشل الاستيراد: ' + err.message, 'error');
            }
        });
    }

    function subscriptionBody(prefs) {
        return `
            <div class="card" style="background: linear-gradient(135deg, rgba(30,64,175,0.06), rgba(59,130,246,0.03)); margin: 0;">
                <div class="flex gap-3" style="align-items: center; flex-wrap: wrap;">
                    <div style="flex:1; min-width: 200px;">
                        <div style="font-weight: var(--fw-bold); font-size: var(--fs-lg);">
                            ${prefs.plan === 'pro' ? '⭐ خطة محترف' : '✨ الخطة الأساسية'}
                        </div>
                        <div class="text-muted" style="font-size: var(--fs-sm);">
                            ${prefs.plan === 'pro' ? '٨٩ ر.س / شهر · حدود أكبر + أولوية' : '٤٥ ر.س / شهر · ١٠٠ طلب AI'}
                        </div>
                    </div>
                    <span class="badge badge-success">نشط</span>
                </div>
            </div>
            <div class="text-muted" style="font-size: var(--fs-xs); margin-top: var(--space-3);">
                💡 الاشتراكات غير مُفعّلة بعد في النموذج الأولي.
            </div>
        `;
    }

    function inviteBody() {
        const link = `${global.location.origin}/?ref=${encodeURIComponent('teacher-' + Date.now())}`;
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0; margin-bottom: var(--space-3);">
                شارك التطبيق مع زميلك — عند اشتراكه تحصل أنت وهو على شهر مجاني.
            </p>
            <div class="field">
                <label class="label">رابط الدعوة</label>
                <div class="flex gap-2">
                    <input class="input" id="invite-link" readonly value="${link}">
                    <button class="btn btn-secondary" id="btn-copy-invite">📋 نسخ</button>
                </div>
            </div>
            <div class="text-muted" style="font-size: var(--fs-xs);">
                💡 المكافآت غير مُفعّلة بعد.
            </div>
        `;
    }
    function bindInvite(container) {
        container.querySelector('#btn-copy-invite')?.addEventListener('click', async () => {
            const link = container.querySelector('#invite-link').value;
            try {
                await navigator.clipboard.writeText(link);
                global.TeacherApp.toast('تم نسخ الرابط ✅', 'success');
            } catch { container.querySelector('#invite-link').select(); }
        });
    }

    function aboutBody() {
        return `
            <table class="info-table-compact" style="margin-bottom: var(--space-4);">
                <tbody>
                    <tr><th>الإصدار</th><td>${APP_VERSION}</td></tr>
                    <tr><th>تاريخ الإصدار</th><td>${APP_RELEASE_DATE}</td></tr>
                    <tr><th>الاسم</th><td>تطبيق المعلم الذكي</td></tr>
                    <tr><th>الدعم</th><td><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></td></tr>
                </tbody>
            </table>
            <h4 style="margin-bottom: var(--space-2);">📝 سجل التحديثات</h4>
            ${CHANGELOG.map((log) => `
                <div style="margin-bottom: var(--space-3);">
                    <strong>${log.v}</strong>
                    <span class="text-muted" style="font-size: var(--fs-sm);"> — ${log.date}</span>
                    <ul style="margin: var(--space-1) 0 0; padding-right: var(--space-5); line-height: 1.8;">
                        ${log.items.map((x) => `<li>${x}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        `;
    }

    function legalBody(stats) {
        const dataSummary = `${stats.classes} فصل · ${stats.students} طالب · ${stats.exams + stats.worksheets + stats.homework} مستند تعليمي`;
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                جميع بياناتك محفوظة <strong>محلياً</strong> في متصفحك (IndexedDB).
                لا نرسل بياناتك لأي خادم عدا طلبات AI التي تذهب لـ Anthropic.
            </p>
            <table class="info-table-compact" style="margin-bottom: var(--space-4);">
                <tbody>
                    <tr><th>بياناتك المحفوظة</th><td>${dataSummary}</td></tr>
                    <tr><th>مكان التخزين</th><td>متصفحك فقط</td></tr>
                    <tr><th>البيانات المُرسَلة</th><td>نصوص الأسئلة فقط إلى Anthropic</td></tr>
                </tbody>
            </table>
            <details>
                <summary style="cursor: pointer; font-weight: var(--fw-medium);">📄 سياسة الخصوصية</summary>
                <p style="margin-top: var(--space-3); font-size: var(--fs-sm); line-height: 1.8;">
                    نحن نحترم خصوصيتك. لا نجمع أي بيانات عنك أو عن طلابك على خوادمنا.
                    جميع المعلومات تبقى في متصفحك فقط.
                </p>
            </details>
            <details style="margin-top: var(--space-2);">
                <summary style="cursor: pointer; font-weight: var(--fw-medium);">📜 شروط الاستخدام</summary>
                <p style="margin-top: var(--space-3); font-size: var(--fs-sm); line-height: 1.8;">
                    هذا التطبيق نموذج أولي. المعلم مسؤول عن مراجعة المحتوى المُولَّد بالـ AI.
                </p>
            </details>
        `;
    }

    function supportBody() {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                إذا واجهت مشكلة أو لديك اقتراح، تواصل معنا:
            </p>
            <table class="info-table-compact">
                <tbody>
                    <tr><th>البريد</th><td><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></td></tr>
                    <tr><th>ساعات الدعم</th><td>الأحد — الخميس · ٩ص — ٥م</td></tr>
                </tbody>
            </table>
        `;
    }

    function dangerBody() {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0;">
                سيتم حذف <strong>كل</strong> بياناتك (الفصول، الطلاب، الاختبارات، ملف الإنجاز...) ولا يمكن التراجع.
                <br>يُنصح بـ<a href="#" id="link-backup-first">تصدير نسخة احتياطية</a> أولاً.
            </p>
            <button class="btn btn-danger btn-block" id="btn-wipe">🔥 حذف جميع البيانات</button>
        `;
    }
    function bindDanger(container) {
        container.querySelector('#link-backup-first')?.addEventListener('click', (e) => {
            e.preventDefault();
            state.page = 'backup';
            render(container);
        });
        container.querySelector('#btn-wipe')?.addEventListener('click', async () => {
            if (!global.confirm('حذف جميع البيانات نهائياً؟')) return;
            if (!global.confirm('تأكيد أخير — لا يمكن التراجع.')) return;
            try {
                for (const s of global.TeacherDB.STORES) await global.TeacherDB.clear(s);
                global.TeacherApp.toast('تم الحذف.', 'info');
                setTimeout(() => { location.hash = '#/login'; location.reload(); }, 600);
            } catch (err) {
                global.TeacherApp.toast('فشل: ' + err.message, 'error');
            }
        });
    }

    /* ==========================================================================
       Theme / font application (exposed so app.js can apply on boot)
       ========================================================================== */

    function applyTheme(theme) {
        const body = document.body;
        body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        body.classList.add('theme-' + (theme || 'light'));
    }
    function applyFontSize(size) {
        const body = document.body;
        body.classList.remove('font-small', 'font-medium', 'font-large');
        body.classList.add('font-' + (size || 'medium'));
    }
    async function applyStoredPrefs() {
        try {
            applyTheme(await getPref('theme', 'light'));
            applyFontSize(await getPref('font_size', 'medium'));
            await refreshPrintCache();
        } catch { /* ignore */ }
    }

    async function refreshPrintCache() {
        const logo = await getPref('school_logo', null);
        global.PrintPrefs = {
            academicYear: await getPref('academic_year', ''),
            principal:    await getPref('principal_name', ''),
            logoDataUrl:  logo instanceof Blob ? await blobToDataUrl(logo) : null
        };
    }
    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    /** Reset to the menu when re-entering /settings from elsewhere. */
    function resetState() { state.page = null; }

    global.SettingsView = {
        render, applyStoredPrefs, applyTheme, applyFontSize,
        refreshPrintCache, resetState
    };
})(window);
