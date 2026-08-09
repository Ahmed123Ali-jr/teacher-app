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
    /* الشاشة كانت ١٤ بنداً في ٦ مجموعات فصارت ٧ في ٣: بطاقة الحساب أعلى تفتح
       الملف التعريفي، و«إحصائياتي» انتقلت إلى التقارير حيث كانت أرقامها مكرّرة
       أصلاً، والخصوصية والدعم داخل «عن التطبيق»، و«ادعُ معلماً» داخل
       «الاشتراك». وحُذف «استهلاك الذكاء الاصطناعي»، وحُذفت صفحة «التذكيرات»
       ومعها تفضيلاتها الخمسة — لم يكن أي كود يقرأها، فكانت أزرارها تُحفظ
       ولا تفعل شيئاً. */
    const MENU_GROUPS = [
        {
            title: 'الحساب والمدرسة',
            items: [
                { page: 'profile-link',  icon: '👤', label: 'بياناتي الشخصية',   sub: 'الاسم، التخصص، المواد', href: '#/profile' },
                { page: 'school',        icon: '🏫', label: 'بيانات المدرسة',    sub: 'الاسم، إدارة التعليم، العام' },
                { page: 'password',      icon: '🔐', label: 'تغيير كلمة المرور', sub: 'الحالية ثم الجديدة' }
            ]
        },
        {
            title: 'التطبيق',
            items: [
                { page: 'appearance',    icon: '🎨', label: 'المظهر',          sub: 'الوضع الفاتح والداكن' },
                { page: 'bell',          icon: '🔔', label: 'منبّه الحصص',      sub: 'جرس المدرسة وتنبيه حصتك' },
                { page: 'backup',        icon: '💾', label: 'النسخ الاحتياطي', sub: 'تصدير واستيراد بياناتك' },
                { page: 'invite',        icon: '👥', label: 'دعوة معلم',       sub: 'شارك التطبيق مع زميلك' }
            ]
        },
        {
            title: 'معلومات',
            items: [
                { page: 'about',         icon: 'ℹ️', label: 'عن التطبيق',       sub: 'الإصدار، التحديث، الخصوصية، الدعم' },
                { page: 'danger',        icon: '🔥', label: 'حذف البيانات أو الحساب', sub: 'لا يمكن التراجع', danger: true }
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

    /* كل كتابة في الإعدادات تمضي في الخلفية: الشاشة تستجيب فوراً والشبكة
       تلحق. الكتابة الواحدة تستغرق نحو ربع ثانية، وحفظ المدرسة كان خمس
       كتابات متتابعة — أي انتظاراً يقارب الثانية قبل أن يرى المعلم شيئاً.
       وإن فشلت الكتابة يُبلَّغ وتُستعاد الحقيقة من القاعدة. */
    function bgSave(fn, onFail) {
        return Promise.resolve().then(fn).catch((e) => {
            global.TeacherApp.toast(
                'تعذّر الحفظ: ' + (e && e.message ? e.message : 'خطأ غير معروف'),
                'error', 6000
            );
            if (onFail) onFail();
        });
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
            theme:            await getPref('theme',            'light'),
            last_backup:      await getPref('last_backup',      null),
            education_dept:   await getPref('education_dept',   '')
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
            renderMenu(container);
        } else {
            renderPage(container, teacher, state.page);
        }
    }

    /* ==========================================================================
       MAIN MENU (list)
       ========================================================================== */

    /* بلا بطاقة حساب كحلية أعلى الشاشة: كل البنود بمادة واحدة رصاصية،
       و«بياناتي الشخصية» صف كبقية الصفوف يفتح شاشة الملف التعريفي. */
    function renderMenu(container) {
        container.innerHTML = `
            <div class="container set-v2">
                <h2 class="set-title">⚙️ الإعدادات</h2>

                ${MENU_GROUPS.map(groupHtml).join('')}

                <button type="button" class="set-logout" id="btn-logout-settings">🚪 تسجيل الخروج</button>
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

        container.querySelector('#btn-logout-settings')?.addEventListener('click', async () => {
            if (!global.confirm('تسجيل الخروج من حسابك؟')) return;
            await global.Auth.logout();
            global.location.hash = '#/login';
        });
    }

    function groupHtml(group) {
        return `
            <div class="set-group">
                <div class="set-group-t">${group.title}</div>
                <div class="set-list">
                    ${group.items.map((it) => itemHtml(it)).join('')}
                </div>
            </div>
        `;
    }

    function itemHtml(it) {
        const tag = it.href ? 'a' : 'button';
        const hrefAttr = it.href ? ` href="${it.href}"` : ' type="button"';
        return `
            <${tag} class="set-row ${it.danger ? 'is-danger' : ''}"
                    data-settings-page="${it.page}"${hrefAttr}>
                <span class="ic">${it.icon}</span>
                <span class="tx">
                    <span class="t">${it.label}</span>
                    <span class="h">${it.sub || ''}</span>
                </span>
                <span class="chev">❯</span>
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
        /* صفحة تحمل بطاقاتها بنفسها لا تُلفّ ببطاقة أخرى — إطاران متداخلان. */
        let bare = false;

        switch (page) {
            case 'password':
                title = '🔐 تغيير كلمة المرور'; body = passwordBody(); bindFn = bindPassword; break;
            case 'school':
                title = '🏫 بيانات المدرسة';
                body = schoolBody(teacher, prefs); bindFn = bindSchool; bare = true; break;
            case 'appearance':
                title = '🎨 مظهر التطبيق'; body = appearanceBody(prefs); bindFn = bindAppearance; break;
            case 'bell':
                title = '🔔 منبّه الحصص';
                body = bellBody(await global.Bell.loadPrefs());
                bindFn = bindBell;
                break;
            case 'backup':
                title = '💾 النسخ الاحتياطي';
                body = backupBody(prefs) + storageNote(await computeQuickStats(teacher));
                bindFn = bindBackup;
                break;
            case 'invite':
                title = '👥 دعوة معلم'; body = inviteBody(); bindFn = bindInvite; break;
            /* «الخصوصية» و«الدعم الفني» صارتا قسمين مطويّين داخل «عن التطبيق». */
            case 'about':
                title = 'ℹ️ عن التطبيق';
                body = aboutBody()
                     + `<details class="set-fold"><summary>📜 الخصوصية والقانون</summary>
                            ${legalBody(await computeQuickStats(teacher))}
                        </details>
                        <details class="set-fold"><summary>💬 الدعم الفني</summary>
                            ${supportBody()}
                        </details>`;
                bindFn = bindAbout;
                break;
            case 'danger':
                title = '🔥 حذف البيانات أو الحساب'; body = dangerBody(); bindFn = bindDanger; break;
            default:
                state.page = null; render(container); return;
        }

        container.innerHTML = `
            <div class="container" style="max-width: 720px;">
                <div class="settings-page-header">
                    <button type="button" class="btn-back-box" id="btn-back-settings" aria-label="رجوع"></button>
                    <h2 class="section-title" style="margin: 0 var(--space-3);">${title}</h2>
                </div>

                ${bare
                    ? body
                    : `<div class="card" style="margin-bottom: var(--space-8);">${body}</div>`}
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

    /* بطاقة رسمية كحلية أعلى الشاشة (النموذج أ) ثم صفوف تُلمس فتفتح للكتابة —
       نفس أسلوب «بياناتي». «إدارة التعليم» و«المنطقة» تعيشان هنا لأنهما بيانا
       مدرسة لا بيانا معلّم. */
    function schoolBody(teacher, prefs) {
        const rows = [
            { k: 'school_name',    label: 'اسم المدرسة',   value: teacher.school_name,   req: true },
            /* الإدارة تُنتقى من قائمة لا تُكتب — pick: true يفتح المنتقي بدل
               حقل الكتابة، والمنطقة تُشتقّ منها فلا يكتبها المعلم أصلاً. */
            { k: 'education_dept', label: 'إدارة التعليم', value: prefs.education_dept,  req: true,
              pick: true },
            { k: 'region',         label: 'المنطقة',       value: teacher.region,        readonly: true }
        ];
        const yearRows = [
            { k: 'academic_year',  label: 'العام الدراسي', value: prefs.academic_year,  ph: '١٤٤٧/١٤٤٨' },
            { k: 'principal_name', label: 'مدير المدرسة',  value: prefs.principal_name, ph: 'للخطابات الرسمية' }
        ];

        return `
            <div class="idc">
                <div class="idc-top">
                    <span class="ph">${prefs.school_logo instanceof Blob
                        ? `<img src="${URL.createObjectURL(prefs.school_logo)}" alt="">`
                        : '🏫'}</span>
                    <span class="tx">
                        <span class="nm">${escapeHtml(teacher.school_name || 'اسم مدرستك')}</span>
                        <span class="rl">${escapeHtml(schoolLine(teacher, prefs))}</span>
                    </span>
                </div>
                <div class="idc-rule"></div>
                <div class="idc-strip">
                    <div class="cell"><b class="num">${escapeHtml(prefs.academic_year || '—')}</b><span>العام الدراسي</span></div>
                    <div class="cell"><b>${escapeHtml(teacher.region || '—')}</b><span>المنطقة</span></div>
                </div>
            </div>

            <div class="fgrp-t">التعريف</div>
            <div class="flist">${rows.map(fieldRow).join('')}</div>

            <div class="fgrp-t">العام الدراسي</div>
            <div class="flist">${yearRows.map(fieldRow).join('')}</div>

            <div class="flogo">
                <span class="box">${prefs.school_logo instanceof Blob
                    ? `<img src="${URL.createObjectURL(prefs.school_logo)}" alt="">`
                    : '🏫'}</span>
                <span class="tx">
                    <span class="t">شعار المدرسة</span>
                    <span class="h">يظهر في ترويسة المطبوعات</span>
                </span>
                <button type="button" class="fchip" id="btn-upload-logo">📷 ${prefs.school_logo ? 'تغيير' : 'رفع'}</button>
                ${prefs.school_logo ? '<button type="button" class="fchip" id="btn-remove-logo">🗑️</button>' : ''}
                <input type="file" id="logo-input" accept="image/*" hidden>
            </div>

            <button type="button" class="fsave" id="btn-save-school">💾 حفظ بيانات المدرسة</button>
        `;
    }

    /** سطر تحت اسم المدرسة: إدارة التعليم والمنطقة، وما توفّر منهما فقط. */
    function schoolLine(teacher, prefs) {
        const bits = [prefs.education_dept, teacher.region].filter(Boolean);
        return bits.length ? bits.join(' · ') : 'أكمل بيانات مدرستك';
    }

    /* الصف يعرض القيمة، وضغطه يحوّله إلى حقل كتابة — فتبقى الشاشة قصيرة
       ومقروءة بدل عشرة حقول مفتوحة دفعةً واحدة. */
    function fieldRow(f) {
        const empty = !f.value;
        return `
            <button type="button" class="frow${f.readonly ? ' is-readonly' : ''}" data-field="${f.k}"
                    ${f.pick ? 'data-pick="1"' : ''}${f.readonly ? ' data-readonly="1"' : ''}
                    data-ph="${escapeAttr(f.ph || '')}">
                <span class="lb">${f.label}</span>
                <span class="vl ${empty ? 'is-empty' : ''}">${escapeHtml(f.value || 'لم يُضف')}</span>
                ${f.req && empty ? '<span class="dot"></span>' : ''}
            </button>
        `;
    }

    /* تحويل الصف إلى حقل كتابة والعكس — مشترك بين شاشتي المدرسة والملف. */
    function bindFieldRows(scope) {
        scope.querySelectorAll('.frow[data-field]').forEach((row) => {
            row.addEventListener('click', () => {
                if (row.dataset.readonly) return;
                if (row.dataset.pick) {
                    const cur = row.querySelector('.vl');
                    const now = cur.classList.contains('is-empty') ? '' : cur.textContent.trim();
                    global.DeptPicker.open(now, (full) => {
                        cur.textContent = full;
                        cur.classList.remove('is-empty');
                        row.querySelector('.dot')?.remove();
                        /* المنطقة تتبع الإدارة فوراً أمام عين المعلم. */
                        const rg = scope.querySelector('.frow[data-field="region"] .vl');
                        const derived = global.EduDepts.regionOf(full) || '';
                        if (rg) {
                            rg.textContent = derived || 'لم يُضف';
                            rg.classList.toggle('is-empty', !derived);
                        }
                    });
                    return;
                }
                if (row.querySelector('input')) return;
                const val  = row.querySelector('.vl');
                const cur  = val.classList.contains('is-empty') ? '' : val.textContent.trim();
                const inp  = document.createElement('input');
                inp.type   = row.dataset.field === 'phone' ? 'tel'
                           : row.dataset.field === 'email' ? 'email'
                           : row.dataset.field === 'experience_years' ? 'number' : 'text';
                inp.className   = 'frow-input';
                inp.value       = cur;
                inp.placeholder = row.dataset.ph || '';
                val.replaceWith(inp);
                row.querySelector('.dot')?.remove();
                inp.focus();

                const close = () => {
                    const v = inp.value.trim();
                    const span = document.createElement('span');
                    span.className = 'vl' + (v ? '' : ' is-empty');
                    span.textContent = v || 'لم يُضف';
                    inp.replaceWith(span);
                };
                inp.addEventListener('blur', close);
                inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
            });
        });
    }

    /** قراءة قيمة صف — سواء كان مفتوحاً للكتابة أو مغلقاً. */
    function readField(scope, key) {
        const row = scope.querySelector(`.frow[data-field="${key}"]`);
        if (!row) return '';
        const inp = row.querySelector('input');
        if (inp) return inp.value.trim();
        const val = row.querySelector('.vl');
        return val.classList.contains('is-empty') ? '' : val.textContent.trim();
    }

    /** يعرض الشعار (أو رمزه) في البطاقة العلوية ومربّع الشعار معاً. */
    function showLogo(container, url) {
        container.querySelectorAll('.idc-top .ph, .flogo .box').forEach((box) => {
            box.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="">` : '🏫';
        });
        const btn = container.querySelector('#btn-upload-logo');
        if (btn) btn.textContent = url ? '📷 تغيير' : '📷 رفع';
        const rm = container.querySelector('#btn-remove-logo');
        if (rm) rm.hidden = !url;
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
            /* الشعار يظهر فوراً من الملف المحلي، والرفع والترويسة في الخلفية. */
            showLogo(container, URL.createObjectURL(file));
            global.TeacherApp.toast('تم رفع الشعار ✅', 'success', 1200);
            bgSave(async () => {
                await setPref('school_logo', file);
                await refreshPrintCache();
            }, () => render(container));
        });
        container.querySelector('#btn-remove-logo')?.addEventListener('click', () => {
            if (!global.confirm('حذف الشعار؟')) return;
            showLogo(container, null);
            global.TeacherApp.toast('تم الحذف.', 'info', 1200);
            bgSave(async () => {
                await global.TeacherDB.Settings.unset('school_logo');
                await refreshPrintCache();
            }, () => render(container));
        });
        bindFieldRows(container);

        container.querySelector('#btn-save-school')?.addEventListener('click', () => {
            /* الحقل المفتوح للكتابة قد لا يكون فقد التركيز بعد، فنقرأ من الحقل
               نفسه لا من الصف المعروض وإلا ضاعت آخر كلمة كتبها المعلم. */
            const dept      = readField(container, 'education_dept');
            const year      = readField(container, 'academic_year');
            const principal = readField(container, 'principal_name');
            teacher.school_name = readField(container, 'school_name');
            teacher.region      = readField(container, 'region');
            teacher.updated_at  = new Date().toISOString();

            /* ترويسة المطبوعات تُحدَّث من القيم التي بين أيدينا لا بقراءة
               القاعدة من جديد — فلا تسبق القراءةُ الكتابةَ الجارية. */
            global.PrintPrefs = Object.assign({}, global.PrintPrefs, {
                academicYear: year, principal, educationDept: dept
            });

            /* نُحدّث البطاقة في مكانها بدل إعادة رسم الصفحة: إعادة الرسم تقرأ
               التفضيلات من القاعدة، وكتابتُها لم تصل بعد فتعود بالقيم القديمة. */
            const idc = container.querySelector('.idc');
            if (idc) {
                idc.querySelector('.nm').textContent = teacher.school_name || 'اسم مدرستك';
                idc.querySelector('.rl').textContent =
                    schoolLine(teacher, { education_dept: dept });
                const cells = idc.querySelectorAll('.idc-strip .cell b');
                if (cells[0]) cells[0].textContent = year || '—';
                if (cells[1]) cells[1].textContent = teacher.region || '—';
            }
            global.TeacherApp.toast('تم الحفظ ✅', 'success', 1200);

            bgSave(() => Promise.all([
                global.TeacherDB.put('teachers', teacher),
                setPref('education_dept', dept),
                setPref('academic_year',  year),
                setPref('principal_name', principal)
            ]), () => render(container));
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
        `;
    }
    /* المنبّه: مفتاح عام ثم خياران وصوتان للتجربة. القيد مكتوب في الأعلى
       صراحةً — التطبيق بلا خادم إشعارات فلا يرنّ وهو مغلق. */
    function bellBody(b) {
        const on = !!b.enabled;
        return `
            <label class="bell-main">
                <span class="tx">
                    <span class="t">تشغيل المنبّه</span>
                    <span class="h">يرنّ على أوقات الحصص المحفوظة عندك</span>
                </span>
                <input type="checkbox" id="bell-enabled" ${on ? 'checked' : ''}>
                <span class="sw"></span>
            </label>

            <div id="bell-opts" style="${on ? '' : 'opacity:.45; pointer-events:none;'}">
                <label class="bell-row">
                    <input type="checkbox" id="bell-school" ${b.schoolBell ? 'checked' : ''}>
                    <span class="tx">
                        <span class="t">🔔 جرس المدرسة</span>
                        <span class="h">عند بداية كل حصة ونهايتها</span>
                    </span>
                    <button type="button" class="fchip" data-try="bell">▶︎ جرّب</button>
                </label>

                <label class="bell-row">
                    <input type="checkbox" id="bell-class" ${b.classAlert ? 'checked' : ''}>
                    <span class="tx">
                        <span class="t">⏰ تنبيه حصتك</span>
                        <span class="h">قبل حصصك أنت فقط — لا كل الحصص</span>
                    </span>
                    <button type="button" class="fchip" data-try="alert">▶︎ جرّب</button>
                </label>

                <div class="fgrp-t" style="margin-top:var(--space-4)">التنبيه قبل الحصة بـ</div>
                <div class="fchips">
                    ${[3, 5, 10, 15].map((m) => `
                        <button type="button" class="fchip ${b.preMinutes === m ? 'on' : ''}"
                                data-pre="${m}">${m} دقائق</button>
                    `).join('')}
                </div>
            </div>

            <p class="bell-note">
                ⚠️ المنبّه يعمل <strong>والتطبيق مفتوح</strong> فقط. التطبيق صفحة ويب بلا خادم
                إشعارات، فلا يرنّ وجوالك مقفل أو التطبيق مغلق.
            </p>
            <button type="button" class="fchip" id="bell-notif" style="width:100%; margin-top:var(--space-3)">
                🔕 السماح بالإشعارات (يظهر تنبيه والتطبيق في الخلفية)
            </button>
        `;
    }

    function bindBell(container) {
        const opts = container.querySelector('#bell-opts');
        const sync = async (patch) => {
            const next = await global.Bell.savePrefs(patch);
            if (opts) opts.style.cssText = next.enabled ? '' : 'opacity:.45; pointer-events:none;';
        };

        container.querySelector('#bell-enabled')?.addEventListener('change', (e) => {
            /* أول تشغيل: نُسمعه الجرس ليعرف الصوت ويفتح مسار الصوت في
               المتصفح بلمسته هذه. */
            if (e.target.checked) global.Bell.playBell();
            sync({ enabled: e.target.checked });
        });
        container.querySelector('#bell-school')?.addEventListener('change', (e) =>
            sync({ schoolBell: e.target.checked }));
        container.querySelector('#bell-class')?.addEventListener('change', (e) =>
            sync({ classAlert: e.target.checked }));

        container.querySelectorAll('[data-pre]').forEach((btn) => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('[data-pre]').forEach((b) => b.classList.toggle('on', b === btn));
                sync({ preMinutes: Number(btn.dataset.pre) });
            });
        });

        container.querySelectorAll('[data-try]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (btn.dataset.try === 'bell') global.Bell.playBell();
                else global.Bell.playAlert();
            });
        });

        container.querySelector('#bell-notif')?.addEventListener('click', async () => {
            const r = await global.Bell.requestNotifications();
            const msg = r === 'granted' ? 'تم السماح بالإشعارات ✅'
                      : r === 'unsupported' ? 'متصفحك لا يدعم الإشعارات.'
                      : 'لم يُسمح بالإشعارات.';
            global.TeacherApp.toast(msg, r === 'granted' ? 'success' : 'info', 3000);
        });
    }

    function themeChip(value, icon, label, current) {
        const active = (current || 'light') === value;
        return `<button type="button" class="chip ${active ? 'active' : ''}" data-theme="${value}"
                        style="flex:1; min-width:100px;">${icon} ${label}</button>`;
    }
    function bindAppearance(container) {
        container.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.addEventListener('click', () => {
                /* الوضع يتبدّل في اللحظة نفسها؛ حفظ التفضيل يمضي في الخلفية. */
                applyTheme(btn.dataset.theme);
                container.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('active', b === btn));
                global.TeacherApp.toast('تم تغيير الوضع.', 'success', 1200);
                bgSave(() => setPref('theme', btn.dataset.theme));
            });
        });
    }

    /* «إحصائياتي» حُذفت — أرقامها كانت مكرّرة حرفياً في شاشة التقارير. الرقم
       الوحيد الذي انفردت به هو حجم الملفات المرفوعة، ومكانه الطبيعي هنا مع
       النسخ الاحتياطي لأنه عن بياناتك لا عن إنتاجك. */
    function storageNote(stats) {
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin: var(--space-5) 0 0;">
                💾 ملفاتك المرفوعة تشغل <strong>${fmtBytes(stats.storageBytes)}</strong>
                — و<strong>${stats.classes}</strong> فصلاً و<strong>${stats.students}</strong> طالباً
                محفوظة في حسابك. التفاصيل الكاملة في شاشة التقارير.
            </p>
        `;
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

    /* النص كان يَعِد بشهر مجاني عند الاشتراك، والاشتراكات حُذفت من التطبيق —
       فصار وعداً لا يقابله شيء. الرابط الآن رابط التطبيق نفسه بلا وسم إحالة
       لأن لا شيء يقرأ ذلك الوسم. */
    function inviteBody() {
        const link = `${global.location.origin}${global.location.pathname}`;
        return `
            <p class="text-muted" style="font-size: var(--fs-sm); margin-top: 0; margin-bottom: var(--space-3);">
                انسخ الرابط وأرسله لزميلك ليجرّب التطبيق.
            </p>
            <div class="field">
                <label class="label">رابط التطبيق</label>
                <div class="flex gap-2">
                    <input class="input" id="invite-link" readonly value="${link}">
                    <button class="btn btn-secondary" id="btn-copy-invite">📋 نسخ</button>
                </div>
            </div>
            <button type="button" class="btn btn-primary btn-block" id="btn-share-invite"
                    style="margin-top: var(--space-3);">📤 مشاركة</button>
        `;
    }
    function bindInvite(container) {
        /* مشاركة الجوال الأصلية إن توفّرت — أسرع من النسخ واللصق يدوياً. */
        const shareBtn = container.querySelector('#btn-share-invite');
        if (shareBtn) {
            if (!navigator.share) shareBtn.hidden = true;
            else shareBtn.addEventListener('click', async () => {
                try {
                    await navigator.share({
                        title: 'تطبيق إنجاز المعلم',
                        text: 'جرّب تطبيق إنجاز المعلم',
                        url: container.querySelector('#invite-link').value
                    });
                } catch { /* أغلق المعلم لوحة المشاركة — لا شيء نفعله */ }
            });
        }

        container.querySelector('#btn-copy-invite')?.addEventListener('click', async () => {
            const link = container.querySelector('#invite-link').value;
            try {
                await navigator.clipboard.writeText(link);
                global.TeacherApp.toast('تم نسخ الرابط ✅', 'success');
            } catch { container.querySelector('#invite-link').select(); }
        });
    }

    /* يقارن نسخة الملفات المحمّلة فعلاً في هذه الجلسة بأحدث نسخة على الخادم،
       فيكشف ما إذا كان التطبيق المثبَّت يعمل على نسخة قديمة من الذاكرة المؤقتة.
       زر التحديث يمسح كل الـcaches ويلغي تسجيل الـservice worker ثم يعيد
       التحميل — بيانات IndexedDB لا تُمس. */
    const VER_RE = /js\/views\/schedule\.js\?v=([A-Za-z0-9]+)/;

    function bindAbout(container) {
        const slot = container.querySelector('#build-id');
        if (slot) {
            const runningEl = [...global.document.scripts].find((s) => VER_RE.test(s.src));
            const running = runningEl ? runningEl.src.match(VER_RE)[1] : '؟';
            slot.textContent = running;
            fetch('index.html?nocache=' + Number(new Date()), { cache: 'no-store' })
                .then((r) => r.text())
                .then((txt) => {
                    const m = txt.match(VER_RE);
                    if (!m) return;
                    slot.textContent = m[1] === running
                        ? running + ' (أحدث نسخة ✅)'
                        : running + ' ← يتوفر تحديث: ' + m[1];
                })
                .catch(() => {});
        }

        container.querySelector('#force-update')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '⏳ جارٍ التحديث…';
            try {
                if (global.navigator.serviceWorker) {
                    const regs = await global.navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map((r) => r.unregister()));
                }
                if (global.caches) {
                    const keys = await global.caches.keys();
                    await Promise.all(keys.map((k) => global.caches.delete(k)));
                }
            } catch (err) {
                global.TeacherApp.toast('تعذّر المسح: ' + (err && err.message), 'error', 5000);
            }
            const base = global.location.href.split('#')[0].split('?')[0];
            global.location.replace(base + '?u=' + Number(new Date()));
        });
    }

    function aboutBody() {
        return `
            <table class="info-table-compact" style="margin-bottom: var(--space-4);">
                <tbody>
                    <tr><th>الإصدار</th><td>${APP_VERSION}</td></tr>
                    <tr><th>تاريخ الإصدار</th><td>${APP_RELEASE_DATE}</td></tr>
                    <tr><th>الاسم</th><td>تطبيق إنجاز المعلم</td></tr>
                    <tr><th>الدعم</th><td><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></td></tr>
                    <tr><th>رقم البناء</th><td><code id="build-id" style="font-size:11px;">…</code></td></tr>
                </tbody>
            </table>
            <button type="button" class="btn btn-secondary btn-block" id="force-update"
                    style="margin-bottom: var(--space-4);">🔄 تحديث التطبيق الآن</button>
            <p class="text-muted" style="font-size: var(--fs-sm); margin: calc(-1 * var(--space-3)) 0 var(--space-4);">
                يمسح النسخة المخزّنة ويعيد تحميل أحدث إصدار. بياناتك لا تتأثر.
            </p>
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

    /* قسم واحد لفعلين خطرين مختلفين: مسح البيانات يُبقي الحساب ليبدأ المعلم
       من جديد، وحذف الحساب يمحو كل شيء ولا رجعة. الفصل بينهما ضروري — من
       يريد بداية نظيفة لا يريد فقدان حسابه. */
    function dangerBody() {
        return `
            <div class="dz">
                <div class="dz-t">🧹 مسح البيانات</div>
                <p class="dz-h">
                    تُحذف فصولك و${global.Words.studentsBare()} واختباراتك وملف إنجازك،
                    <strong>ويبقى حسابك</strong> فتبدأ من جديد بالبريد نفسه.
                </p>
                <p class="dz-h">يُنصح بـ<a href="#" id="link-backup-first">تصدير نسخة احتياطية</a> أولاً.</p>
                <button type="button" class="dz-btn" id="btn-wipe">مسح جميع البيانات</button>
            </div>

            <div class="dz is-final">
                <div class="dz-t">🗑️ حذف الحساب نهائياً</div>
                <p class="dz-h">
                    يُحذف حسابك وبريدك وكل بياناتك من الخوادم، ولن تستطيع الدخول بعدها.
                    <strong>لا يمكن التراجع ولا استعادة شيء.</strong>
                </p>
                <label class="dz-ack">
                    <input type="checkbox" id="del-ack">
                    <span>أفهم أن حسابي وكل بياناتي ستُحذف نهائياً</span>
                </label>
                <button type="button" class="dz-btn is-final" id="btn-delete-account" disabled>
                    حذف حسابي نهائياً
                </button>
            </div>
        `;
    }

    function bindDanger(container) {
        container.querySelector('#link-backup-first')?.addEventListener('click', (e) => {
            e.preventDefault();
            state.page = 'backup';
            render(container);
        });

        container.querySelector('#btn-wipe')?.addEventListener('click', async () => {
            if (!global.confirm('مسح جميع بياناتك؟ حسابك يبقى.')) return;
            if (!global.confirm('تأكيد أخير — لا يمكن التراجع.')) return;
            try {
                for (const s of global.TeacherDB.STORES) await global.TeacherDB.clear(s);
                global.TeacherApp.toast('تم مسح البيانات.', 'info');
                setTimeout(() => { location.hash = '#/login'; location.reload(); }, 600);
            } catch (err) {
                global.TeacherApp.toast('فشل: ' + err.message, 'error');
            }
        });

        /* الزرّ مقفول حتى يُقرّ المعلم بما سيحدث — الحذف لا رجعة فيه، فلا
           يُترك خلف ضغطة واحدة عابرة. */
        const ack = container.querySelector('#del-ack');
        const del = container.querySelector('#btn-delete-account');
        ack?.addEventListener('change', () => { del.disabled = !ack.checked; });

        del?.addEventListener('click', async () => {
            if (!ack.checked) return;
            if (!global.confirm('حذف حسابك نهائياً؟ لن تستطيع الدخول بعدها.')) return;
            if (!global.confirm('تأكيد أخير — سيُحذف الحساب وكل بياناته من الخوادم.')) return;
            del.disabled = true;
            del.textContent = '⏳ جارٍ الحذف…';
            try {
                await global.Auth.deleteAccount();
                global.TeacherApp.toast('تم حذف حسابك.', 'info', 3000);
                setTimeout(() => { location.hash = '#/login'; location.reload(); }, 900);
            } catch (err) {
                del.disabled = false;
                del.textContent = 'حذف حسابي نهائياً';
                global.TeacherApp.toast('تعذّر الحذف: ' + err.message, 'error', 6000);
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
    async function applyStoredPrefs() {
        try {
            applyTheme(await getPref('theme', 'light'));
            await refreshPrintCache();
        } catch { /* ignore */ }
    }

    async function refreshPrintCache() {
        const logo = await getPref('school_logo', null);
        global.PrintPrefs = {
            academicYear:  await getPref('academic_year', ''),
            principal:     await getPref('principal_name', ''),
            educationDept: await getPref('education_dept', ''),
            logoDataUrl:   logo instanceof Blob ? await blobToDataUrl(logo) : null
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
        render, applyStoredPrefs, applyTheme,
        refreshPrintCache, resetState
    };
})(window);
