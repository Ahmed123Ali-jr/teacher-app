/* ==========================================================================
   views/profile.js — "بياناتي" screen.
   Single source of truth for all teacher fields. Portfolio reads from here.
   All fields are editable inline; one "حفظ" button at the bottom commits
   everything. Photo upload still saves immediately (it's a binary action).
   ========================================================================== */

(function (global) {
    'use strict';

    const SUBJECTS = [
        'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
        'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
        'الاجتماعيات', 'التاريخ', 'الجغرافيا',
        'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
    ];

    const FIELDS = [
        { key: 'name',             label: 'الاسم الكامل',       type: 'text',     required: true  },
        { key: 'email',            label: 'البريد الإلكتروني',  type: 'email',    required: false },
        { key: 'school_name',      label: 'اسم المدرسة',        type: 'text',     required: true  },
        { key: 'region',           label: 'اسم المنطقة',        type: 'text',     required: false },
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

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/);
        return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)) || '👤';
    }

    function avatarInner(teacher, revoke) {
        if (teacher.photo instanceof Blob) {
            const url = URL.createObjectURL(teacher.photo);
            if (revoke) global.setTimeout(() => URL.revokeObjectURL(url), 30000);
            return `<img src="${url}" alt="">`;
        }
        // Saved photo (photo_url data-URL) — what the row looks like after a
        // reload/hydrate, when the in-session Blob is gone.
        if (typeof teacher.photo_url === 'string' && teacher.photo_url) {
            return `<img src="${escapeAttr(teacher.photo_url)}" alt="">`;
        }
        return `<span>${escapeHtml(initials(teacher.name))}</span>`;
    }

    function hasPhoto(teacher) {
        return (teacher.photo instanceof Blob)
            || (typeof teacher.photo_url === 'string' && !!teacher.photo_url);
    }

    /** Downscale the picked image to an avatar-sized JPEG (max 512px):
     *  a 3MB camera photo becomes ~40KB, so saving/sync/rendering stay fast. */
    function compressPhoto(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const MAX = 512;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
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
                    <button type="button" class="btn-back-box" id="btn-profile-back" aria-label="رجوع"></button>
                    <h2 class="section-title" style="display:inline-block; margin-right: var(--space-3);">
                        👤 بياناتي
                    </h2>
                </div>

                <div class="card profile-photo-block">
                    <div class="profile-avatar-lg">${avatarInner(teacher, true)}</div>
                    <div class="profile-photo-actions">
                        <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-photo">
                            📷 ${hasPhoto(teacher) ? 'تغيير الصورة' : 'إضافة صورة شخصية'}
                        </button>
                        ${hasPhoto(teacher) ? `
                            <button type="button" class="btn btn-ghost btn-sm" id="btn-remove-photo">
                                🗑️ حذف
                            </button>` : ''}
                        <input type="file" accept="image/*" id="photo-input" hidden>
                        <div class="field-hint" style="margin-top: var(--space-2);">
                            الصورة تظهر في الرئيسية والدرج وملف الإنجاز.
                        </div>
                    </div>
                </div>

                <form id="profile-form" class="card profile-fields" novalidate>
                    ${FIELDS.map((f) => rowHtml(f, teacher)).join('')}
                </form>

                <div class="profile-save-bar" style="display:flex; gap: var(--space-3); justify-content:flex-end; margin-top: var(--space-4);">
                    <button type="button" class="btn btn-ghost" id="btn-profile-reset">تراجع</button>
                    <button type="button" class="btn btn-primary" id="btn-profile-save">💾 حفظ</button>
                </div>

                <button type="button" class="set-row set-row-solo" id="btn-change-pass"
                        style="margin: var(--space-5) 0 var(--space-8);">
                    <span class="ic">🔐</span>
                    <span class="tx">
                        <span class="t">تغيير كلمة المرور</span>
                        <span class="h">كلمة المرور الحالية ثم الجديدة</span>
                    </span>
                    <span class="chev">❯</span>
                </button>
            </div>
        `;

        bind(container, teacher);
    }

    function rowHtml(field, teacher) {
        const value = teacher[field.key];
        return `
            <div class="profile-row is-editing" data-field="${field.key}">
                <div class="pr-label">${field.label}${field.required ? ' <span class="pr-req">*</span>' : ''}</div>
                <div class="pr-value pr-editing">${inputHtml(field, value)}</div>
            </div>
        `;
    }

    function inputHtml(field, value) {
        if (field.type === 'subjects') {
            const arr = Array.isArray(value) ? value : (value ? [value] : []);
            const selected = new Set(arr);
            const STD = SUBJECTS.filter((s) => s !== 'أخرى');
            // Custom subjects the teacher already added (kept as their own chips).
            const custom = arr.filter((s) => !STD.includes(s) && s !== 'أخرى');
            const chip = (s) => `
                <label class="subject-chip">
                    <input type="checkbox" value="${escapeAttr(s)}" ${selected.has(s) ? 'checked' : ''}>
                    <span>${escapeHtml(s)}</span>
                </label>`;
            return `
                <div class="subject-grid" style="max-height: 260px;">
                    ${STD.map(chip).join('')}
                    ${custom.map(chip).join('')}
                    <label class="subject-chip subject-other-toggle">
                        <input type="checkbox" id="subj-other-toggle">
                        <span>➕ أخرى</span>
                    </label>
                </div>
                <input type="text" class="input subj-other-input" id="subj-other-input"
                       placeholder="اكتب اسم المادة…" hidden
                       style="margin-top: var(--space-2);">
            `;
        }
        const safe = (value === null || value === undefined) ? '' : escapeAttr(String(value));
        return `<input class="input input-sm pr-input" data-key="${field.key}" type="${field.type}" value="${safe}">`;
    }

    function bind(container, teacher) {
        container.querySelector('#btn-change-pass')?.addEventListener('click', () => {
            global.SettingsView.openPage('password');
        });

        // «أخرى» toggle → reveal the custom-subject text box.
        const otherToggle = container.querySelector('#subj-other-toggle');
        const otherInput  = container.querySelector('#subj-other-input');
        if (otherToggle && otherInput) {
            otherToggle.addEventListener('change', () => {
                otherInput.hidden = !otherToggle.checked;
                if (otherToggle.checked) otherInput.focus();
                else otherInput.value = '';
            });
        }

        container.querySelector('#btn-profile-back')?.addEventListener('click', () => {
            if (global.history.length > 1) global.history.back();
            else global.location.hash = '#/dashboard';
        });

        // Photo upload — saves immediately (binary action, doesn't fit form-flow)
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
                // Show the ORIGINAL instantly (zero processing), then compress
                // and sync in the background — the UI never waits for the
                // JPEG encoder (~1s) or the network.
                teacher.photo = file;
                teacher.updated_at = new Date().toISOString();
                paint(container, teacher);
                global.TeacherApp.toast('تم حفظ الصورة ✅', 'success', 1500);
                (async () => {
                    teacher.photo = await compressPhoto(file);
                    await global.TeacherDB.put('teachers', teacher);
                })().catch((err) => {
                    global.TeacherApp.toast('تعذّرت مزامنة الصورة: ' + err.message, 'error');
                });
            });
        }

        const removeBtn = container.querySelector('#btn-remove-photo');
        if (removeBtn) removeBtn.addEventListener('click', async () => {
            if (!global.confirm('حذف الصورة الشخصية؟')) return;
            teacher.photo = null;
            teacher.photo_url = null;
            teacher.updated_at = new Date().toISOString();
            paint(container, teacher);
            global.TeacherApp.toast('تم الحذف.', 'info', 1500);
            global.TeacherDB.put('teachers', teacher).catch((err) => {
                global.TeacherApp.toast('تعذّرت مزامنة الحذف: ' + err.message, 'error');
            });
        });

        // Enter on any single-line field commits the whole form
        container.querySelectorAll('.pr-input').forEach((inp) => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAll(container, teacher);
                }
            });
        });

        container.querySelector('#btn-profile-save')?.addEventListener('click',
            () => saveAll(container, teacher));
        container.querySelector('#btn-profile-reset')?.addEventListener('click',
            () => paint(container, teacher));
    }

    /** Read every field from the form into a draft object, validate, then save once. */
    async function saveAll(container, teacher) {
        const draft = {};

        for (const field of FIELDS) {
            const row = container.querySelector(`[data-field="${field.key}"]`);
            if (!row) continue;
            let v;

            if (field.type === 'subjects') {
                v = Array.from(row.querySelectorAll('.subject-grid input[type="checkbox"]:checked'))
                    .filter((c) => c.id !== 'subj-other-toggle')
                    .map((c) => c.value);
                // Append the custom subject typed under «أخرى».
                const otherInput = row.querySelector('#subj-other-input');
                const custom = otherInput ? otherInput.value.trim() : '';
                if (custom) v.push(custom);
                v = Array.from(new Set(v.filter((s) => s && s !== 'أخرى')));
            } else {
                const inp = row.querySelector('.pr-input');
                const raw = (inp.value || '').trim();
                if (field.type === 'number') {
                    if (raw === '') { v = null; }
                    else {
                        const n = Number(raw);
                        if (isNaN(n) || n < 0) {
                            return global.TeacherApp.toast(field.label + ': قيمة غير صحيحة.', 'warning');
                        }
                        v = n;
                    }
                } else if (field.type === 'email') {
                    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
                        return global.TeacherApp.toast('بريد إلكتروني غير صحيح.', 'warning');
                    }
                    v = raw.toLowerCase();
                } else {
                    v = raw;
                }
            }

            if (field.required) {
                const empty = v === '' || v === null || v === undefined
                           || (Array.isArray(v) && v.length === 0);
                if (empty) return global.TeacherApp.toast(field.label + ' مطلوب.', 'warning');
            }

            draft[field.key] = v;
        }

        // Email uniqueness — best-effort
        if (draft.email) {
            try {
                const existing = await global.TeacherDB.getAllByIndex('teachers', 'email', draft.email);
                const conflict = (existing || []).find((t) => t.id !== teacher.id);
                if (conflict) return global.TeacherApp.toast('هذا البريد مستخدم من قبل.', 'error');
            } catch (e) { /* index may not exist; ignore */ }
        }

        // Apply onto teacher and persist once
        Object.assign(teacher, draft);
        teacher.subject = Array.isArray(draft.subjects) && draft.subjects.length ? draft.subjects[0] : '';
        teacher.updated_at = new Date().toISOString();

        const saveBtn = container.querySelector('#btn-profile-save');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '… جاري الحفظ'; }

        try {
            await global.TeacherDB.put('teachers', teacher);
            global.TeacherApp.toast('تم حفظ البيانات ✅', 'success', 1500);
            paint(container, teacher);
        } catch (err) {
            console.error('[Profile] save failed:', err);
            global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ'; }
        }
    }

    global.ProfileView = { render, avatarInner, initials };
})(window);
