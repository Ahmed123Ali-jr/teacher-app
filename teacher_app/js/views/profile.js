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

    /* «اسم المدرسة» و«المنطقة» خرجتا من هنا إلى شاشة «معلومات المدرسة» —
       بيانا مدرسة لا بيانا معلّم، وكان اسم المدرسة يُحرَّر من مكانين. */
    const GROUPS = [
        {
            title: 'الأساسية',
            fields: [
                { key: 'name',     label: 'الاسم الكامل',    type: 'text',  required: true },
                { key: 'civil_id', label: 'السجل المدني',    type: 'text',  ph: '١٠…' },
                { key: 'phone',    label: 'الجوال',          type: 'tel',   ph: '٠٥…' },
                { key: 'email',    label: 'البريد',          type: 'email', ph: 'name@example.com' }
            ]
        },
        {
            title: 'المهنية',
            fields: [
                { key: 'specialization',   label: 'التخصص',       type: 'text',   ph: 'رياضيات' },
                { key: 'qualification',    label: 'المؤهل',       type: 'text',   ph: 'بكالوريوس' },
                { key: 'experience_years', label: 'سنوات الخبرة', type: 'number', ph: '٠' }
            ]
        }
    ];

    const TEXT_FIELDS = GROUPS.flatMap((g) => g.fields);

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

                <div class="idc">
                    <div class="idc-top">
                        <span class="ph">${avatarInner(teacher, true)}</span>
                        <span class="tx">
                            <span class="nm">${escapeHtml(teacher.name || 'اسمك')}</span>
                            <span class="rl">${escapeHtml(roleLine(teacher))}</span>
                        </span>
                    </div>
                    <div class="idc-rule"></div>
                    <div class="idc-strip">
                        <div class="cell"><b class="num">${escapeHtml(String(teacher.experience_years || '—'))}</b><span>سنوات خبرة</span></div>
                        <div class="cell"><b>${escapeHtml(teacher.qualification || '—')}</b><span>المؤهل</span></div>
                        <div class="cell"><b class="num">${subjectsOf(teacher).length || '—'}</b><span>مواد</span></div>
                    </div>
                </div>

                <div class="flogo">
                    <span class="box">${avatarInner(teacher, true)}</span>
                    <span class="tx">
                        <span class="t">صورتك الشخصية</span>
                        <span class="h">تظهر في الرئيسية والدرج وملف الإنجاز</span>
                    </span>
                    <button type="button" class="fchip" id="btn-upload-photo">📷 ${hasPhoto(teacher) ? 'تغيير' : 'إضافة'}</button>
                    ${hasPhoto(teacher) ? '<button type="button" class="fchip" id="btn-remove-photo">🗑️</button>' : ''}
                    <input type="file" accept="image/*" id="photo-input" hidden>
                </div>

                <form id="profile-form" novalidate>
                    ${GROUPS.map((g) => `
                        <div class="fgrp-t">${g.title}</div>
                        <div class="flist">${g.fields.map((f) => fieldRowHtml(f, teacher)).join('')}</div>
                    `).join('')}

                    <div class="fgrp-t">المواد التي تدرّسها</div>
                    <div class="fsubj">${subjectChipsHtml(teacher)}</div>
                </form>

                <button type="button" class="fsave" id="btn-profile-save">💾 حفظ بياناتي</button>

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

    function subjectsOf(teacher) {
        const v = teacher.subjects;
        const arr = Array.isArray(v) ? v : (v ? [v] : []);
        return arr.filter((s) => s && s !== 'أخرى');
    }

    /** السطر تحت الاسم في البطاقة: المادة الأولى والمدرسة، وما توفّر منهما. */
    function roleLine(teacher) {
        const subs = subjectsOf(teacher);
        const bits = [];
        if (subs.length) bits.push('معلّم ' + subs[0]);
        if (teacher.school_name) bits.push(teacher.school_name);
        return bits.length ? bits.join(' · ') : 'أكمل بياناتك';
    }

    /* صف يعرض قيمته، وضغطه يحوّله إلى حقل كتابة — والنقطة الذهبية تعني حقلاً
       مطلوباً ما زال فارغاً. */
    function fieldRowHtml(f, teacher) {
        const raw   = teacher[f.key];
        const value = (raw === null || raw === undefined || raw === '') ? '' : String(raw);
        return `
            <button type="button" class="frow" data-field="${f.key}" data-type="${f.type}"
                    data-ph="${escapeAttr(f.ph || '')}">
                <span class="lb">${f.label}</span>
                <span class="vl ${value ? '' : 'is-empty'}">${escapeHtml(value || 'لم يُضف')}</span>
                ${f.required && !value ? '<span class="dot"></span>' : ''}
            </button>
        `;
    }

    function subjectChipsHtml(teacher) {
        const selected = new Set(subjectsOf(teacher));
        const STD    = SUBJECTS.filter((s) => s !== 'أخرى');
        const custom = subjectsOf(teacher).filter((s) => !STD.includes(s));
        const chip = (s) => `
            <button type="button" class="fchip subj ${selected.has(s) ? 'on' : ''}"
                    data-subj="${escapeAttr(s)}">${escapeHtml(s)}</button>`;
        return `
            <div class="fchips">
                ${STD.map(chip).join('')}
                ${custom.map(chip).join('')}
                <button type="button" class="fchip subj-other" id="subj-other-toggle">✎ أخرى</button>
            </div>
            <input type="text" class="input" id="subj-other-input"
                   placeholder="اكتب اسم المادة ثم احفظ" hidden
                   style="margin-top: var(--space-3);">
        `;
    }

    /* تحويل الصف إلى حقل كتابة والعكس. */
    function bindFieldRows(scope, onEnter) {
        scope.querySelectorAll('.frow[data-field]').forEach((row) => {
            row.addEventListener('click', () => {
                if (row.querySelector('input')) return;
                const val = row.querySelector('.vl');
                const cur = val.classList.contains('is-empty') ? '' : val.textContent.trim();
                const inp = document.createElement('input');
                inp.type        = row.dataset.type || 'text';
                inp.className   = 'frow-input';
                inp.value       = cur;
                inp.placeholder = row.dataset.ph || '';
                val.replaceWith(inp);
                row.querySelector('.dot')?.remove();
                inp.focus();

                inp.addEventListener('blur', () => {
                    const v = inp.value.trim();
                    const span = document.createElement('span');
                    span.className = 'vl' + (v ? '' : ' is-empty');
                    span.textContent = v || 'لم يُضف';
                    inp.replaceWith(span);
                });
                inp.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    inp.blur();
                    if (onEnter) onEnter();
                });
            });
        });
    }

    /** قراءة قيمة صف سواء كان مفتوحاً للكتابة أو مغلقاً. */
    function readRow(scope, key) {
        const row = scope.querySelector(`.frow[data-field="${key}"]`);
        if (!row) return '';
        const inp = row.querySelector('input');
        if (inp) return inp.value.trim();
        const val = row.querySelector('.vl');
        return val.classList.contains('is-empty') ? '' : val.textContent.trim();
    }

    function bind(container, teacher) {
        container.querySelector('#btn-change-pass')?.addEventListener('click', () => {
            global.SettingsView.openPage('password');
        });

        bindFieldRows(container, () => saveAll(container, teacher));

        container.querySelectorAll('.fchip.subj').forEach((chip) => {
            chip.addEventListener('click', () => chip.classList.toggle('on'));
        });

        // «أخرى» → إظهار حقل كتابة مادة ليست في القائمة.
        const otherToggle = container.querySelector('#subj-other-toggle');
        const otherInput  = container.querySelector('#subj-other-input');
        if (otherToggle && otherInput) {
            otherToggle.addEventListener('click', () => {
                const show = otherInput.hidden;
                otherInput.hidden = !show;
                otherToggle.classList.toggle('on', show);
                if (show) otherInput.focus(); else otherInput.value = '';
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

        container.querySelector('#btn-profile-save')?.addEventListener('click',
            () => saveAll(container, teacher));
    }

    /** Read every field from the form into a draft object, validate, then save once. */
    async function saveAll(container, teacher) {
        const draft = {};

        for (const field of TEXT_FIELDS) {
            const raw = readRow(container, field.key);
            let v;

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

            if (field.required && (v === '' || v === null)) {
                return global.TeacherApp.toast(field.label + ' مطلوب.', 'warning');
            }
            draft[field.key] = v;
        }

        // المواد: الرقائق المحدَّدة + ما كُتب تحت «أخرى»
        const picked = Array.from(container.querySelectorAll('.fchip.subj.on'))
            .map((c) => c.dataset.subj);
        const typed = (container.querySelector('#subj-other-input')?.value || '').trim();
        if (typed) picked.push(typed);
        draft.subjects = Array.from(new Set(picked.filter((s) => s && s !== 'أخرى')));
        if (!draft.subjects.length) {
            return global.TeacherApp.toast('اختر مادة واحدة على الأقل.', 'warning');
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
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 حفظ بياناتي'; }
        }
    }

    global.ProfileView = { render, avatarInner, initials };
})(window);
