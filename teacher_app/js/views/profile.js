/* ==========================================================================
   views/profile.js — "بياناتي" screen.
   Single source of truth for all teacher fields. Portfolio reads from here.
   Each field is view-only with a ✏️ icon that reveals inline input + 💾 / ✕.
   Photo is stored as a Blob on the teacher record.
   ========================================================================== */

(function (global) {
    'use strict';

    const SUBJECTS = [
        'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
        'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
        'الاجتماعيات', 'التاريخ', 'الجغرافيا',
        'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
    ];

    /** Definition of each editable row on the profile screen. */
    const FIELDS = [
        { key: 'name',             label: 'الاسم الكامل',       type: 'text',     required: true  },
        { key: 'email',            label: 'البريد الإلكتروني',  type: 'email',    required: true  },
        { key: 'school_name',      label: 'اسم المدرسة',        type: 'text',     required: true  },
        { key: 'subjects',         label: 'المواد التي تدرّسها', type: 'subjects', required: true  },
        { key: 'phone',            label: 'رقم الجوال',         type: 'tel',      required: false },
        { key: 'specialization',   label: 'التخصص',             type: 'text',     required: false },
        { key: 'qualification',    label: 'المؤهل العلمي',      type: 'text',     required: false },
        { key: 'experience_years', label: 'سنوات الخبرة',       type: 'number',   required: false },
        { key: 'civil_id',         label: 'رقم السجل المدني',    type: 'text',     required: false }
    ];

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    /** Return the 2-letter initials fallback for the avatar. */
    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)) || '👤';
    }

    /** Build avatar inner HTML — photo blob if present, else initials. */
    function avatarInner(teacher, revoke) {
        if (teacher.photo instanceof Blob) {
            const url = URL.createObjectURL(teacher.photo);
            if (revoke) global.setTimeout(() => URL.revokeObjectURL(url), 30000);
            return `<img src="${url}" alt="">`;
        }
        return `<span>${escapeHtml(initials(teacher.name))}</span>`;
    }

    function displayValue(field, value) {
        if (field.type === 'subjects') {
            return Array.isArray(value) && value.length
                ? escapeHtml(value.join('، '))
                : '<span class="text-muted">—</span>';
        }
        if (value === 0 || value === '0') return '<span>0</span>';
        if (!value) return '<span class="text-muted">—</span>';
        return escapeHtml(String(value));
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        paint(container, teacher);
    }

    function paint(container, teacher) {
        container.innerHTML = `
            <div class="container" style="max-width: 720px;">
                <div class="section-header" style="margin-top: var(--space-6);">
                    <button type="button" class="btn btn-ghost btn-sm" id="btn-profile-back">← رجوع</button>
                    <h2 class="section-title" style="display:inline-block; margin-right: var(--space-3);">
                        👤 بياناتي
                    </h2>
                </div>

                <div class="card profile-photo-block">
                    <div class="profile-avatar-lg">${avatarInner(teacher, true)}</div>
                    <div class="profile-photo-actions">
                        <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-photo">
                            📷 ${teacher.photo ? 'تغيير الصورة' : 'إضافة صورة شخصية'}
                        </button>
                        ${teacher.photo ? `
                            <button type="button" class="btn btn-ghost btn-sm" id="btn-remove-photo">
                                🗑️ حذف
                            </button>` : ''}
                        <input type="file" accept="image/*" id="photo-input" hidden>
                        <div class="field-hint" style="margin-top: var(--space-2);">
                            الصورة تظهر في الرئيسية والدرج وملف الإنجاز.
                        </div>
                    </div>
                </div>

                <div class="card profile-fields">
                    ${FIELDS.map((f) => rowHtml(f, teacher)).join('')}
                </div>

            </div>
        `;

        bind(container, teacher);
    }

    function rowHtml(field, teacher) {
        const value = teacher[field.key];
        return `
            <div class="profile-row" data-field="${field.key}">
                <div class="pr-label">${field.label}${field.required ? ' <span class="pr-req">*</span>' : ''}</div>
                <div class="pr-value">${displayValue(field, value)}</div>
                <button type="button" class="pr-edit" data-edit="${field.key}"
                        title="تعديل" aria-label="تعديل ${field.label}">✏️</button>
            </div>
        `;
    }

    function bind(container, teacher) {
        // Smart back: go back one step in history (to wherever the user came
        // from, e.g. Settings). Fallback to dashboard if history is empty.
        container.querySelector('#btn-profile-back')?.addEventListener('click', () => {
            if (global.history.length > 1) global.history.back();
            else global.location.hash = '#/dashboard';
        });

        // Edit buttons
        container.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const field = FIELDS.find((f) => f.key === btn.dataset.edit);
                if (field) enterEditMode(container, teacher, field);
            });
        });

        // Photo upload
        const photoInput = container.querySelector('#photo-input');
        const uploadBtn  = container.querySelector('#btn-upload-photo');
        if (uploadBtn && photoInput) {
            uploadBtn.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                    return global.TeacherApp.toast('الصورة كبيرة جداً (أقصى ٥ MB).', 'warning');
                }
                teacher.photo = file;
                teacher.updated_at = new Date().toISOString();
                await global.TeacherDB.put('teachers', teacher);
                global.TeacherApp.toast('تم حفظ الصورة ✅', 'success', 1500);
                paint(container, teacher);
            });
        }

        const removeBtn = container.querySelector('#btn-remove-photo');
        if (removeBtn) removeBtn.addEventListener('click', async () => {
            if (!global.confirm('حذف الصورة الشخصية؟')) return;
            teacher.photo = null;
            teacher.updated_at = new Date().toISOString();
            await global.TeacherDB.put('teachers', teacher);
            global.TeacherApp.toast('تم الحذف.', 'info', 1500);
            paint(container, teacher);
        });
    }

    function enterEditMode(container, teacher, field) {
        const row = container.querySelector(`[data-field="${field.key}"]`);
        if (!row) return;

        row.classList.add('is-editing');
        row.innerHTML = `
            <div class="pr-label">${field.label}${field.required ? ' <span class="pr-req">*</span>' : ''}</div>
            <div class="pr-value pr-editing">${inputHtml(field, teacher[field.key])}</div>
            <div class="pr-actions">
                <button type="button" class="pr-save" data-save title="حفظ">💾</button>
                <button type="button" class="pr-cancel" data-cancel title="إلغاء">✕</button>
            </div>
        `;

        row.querySelector('[data-save]').addEventListener('click', () => saveField(container, teacher, field, row));
        row.querySelector('[data-cancel]').addEventListener('click', () => paint(container, teacher));

        // Auto focus the first input
        const first = row.querySelector('input:not([type=checkbox]), select, textarea');
        if (first) { first.focus(); if (first.select) first.select(); }

        // Enter-to-save for single-line text inputs
        if (first && ['text', 'email', 'tel', 'number'].includes(first.type)) {
            first.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveField(container, teacher, field, row);
                }
                if (e.key === 'Escape') paint(container, teacher);
            });
        }
    }

    function inputHtml(field, value) {
        if (field.type === 'subjects') {
            const selected = new Set(Array.isArray(value) ? value : (value ? [value] : []));
            return `
                <div class="subject-grid" style="max-height: 220px;">
                    ${SUBJECTS.map((s) => `
                        <label class="subject-chip">
                            <input type="checkbox" value="${escapeAttr(s)}" ${selected.has(s) ? 'checked' : ''}>
                            <span>${escapeHtml(s)}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        }
        const safe = (value === null || value === undefined) ? '' : escapeAttr(String(value));
        return `<input class="input input-sm pr-input" type="${field.type}" value="${safe}">`;
    }

    async function saveField(container, teacher, field, row) {
        let newValue;

        if (field.type === 'subjects') {
            newValue = Array.from(row.querySelectorAll('input[type="checkbox"]:checked'))
                .map((c) => c.value);
        } else {
            const inp = row.querySelector('.pr-input');
            const raw = inp.value.trim();
            if (field.type === 'number') {
                newValue = raw === '' ? null : Number(raw);
                if (newValue !== null && (isNaN(newValue) || newValue < 0)) {
                    return global.TeacherApp.toast('القيمة غير صحيحة.', 'warning');
                }
            } else if (field.type === 'email') {
                if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
                    return global.TeacherApp.toast('بريد إلكتروني غير صحيح.', 'warning');
                }
                newValue = raw.toLowerCase();
            } else {
                newValue = raw;
            }
        }

        if (field.required) {
            const empty = newValue === '' || newValue === null || newValue === undefined
                       || (Array.isArray(newValue) && newValue.length === 0);
            if (empty) return global.TeacherApp.toast(field.label + ' مطلوب.', 'warning');
        }

        teacher[field.key] = newValue;

        // Keep legacy `subject` field in sync for back-compat
        if (field.key === 'subjects') {
            teacher.subject = Array.isArray(newValue) && newValue.length ? newValue[0] : '';
        }

        // Email uniqueness check
        if (field.key === 'email' && newValue) {
            const existing = await global.TeacherDB.getAllByIndex('teachers', 'email', newValue);
            const conflict = existing.find((t) => t.id !== teacher.id);
            if (conflict) return global.TeacherApp.toast('هذا البريد مستخدم من قبل.', 'error');
        }

        teacher.updated_at = new Date().toISOString();
        await global.TeacherDB.put('teachers', teacher);
        global.TeacherApp.toast('تم الحفظ ✅', 'success', 1500);
        paint(container, teacher);
    }

    global.ProfileView = { render, avatarInner, initials };
})(window);
