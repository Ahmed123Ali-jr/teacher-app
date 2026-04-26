/* ==========================================================================
   views/class-curriculum.js — Curriculum distribution per class.
   Simple file upload (PDF / image / Word). Stored as cls.curriculum_files = [...]
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function formatSize(bytes) {
        if (!bytes) return '';
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(0) + ' KB';
        return (kb / 1024).toFixed(1) + ' MB';
    }

    function formatDate(iso) {
        if (!iso) return '';
        try { return new Intl.DateTimeFormat('ar-SA', { day:'numeric', month:'short', year:'numeric' }).format(new Date(iso)); }
        catch { return iso; }
    }

    function iconFor(file) {
        const t = (file?.type || '').toLowerCase();
        if (t.startsWith('image/')) return '🖼️';
        if (t === 'application/pdf') return '📕';
        if (t.includes('word') || t.includes('document')) return '📄';
        return '📎';
    }

    function ensureList(cls) {
        if (!Array.isArray(cls.curriculum_files)) cls.curriculum_files = [];
        return cls.curriculum_files;
    }

    async function render(panel, cls) {
        const files = ensureList(cls);

        panel.innerHTML = `
            <div class="section-header">
                <h3 class="section-title">🗓️ توزيع المنهج</h3>
                <button class="btn btn-primary" id="btn-upload">+ رفع ملف</button>
            </div>

            ${files.length === 0 ? empty() : list(files)}

            <div class="card" style="margin-top: var(--space-6); background: rgba(59,130,246,0.06);">
                <h4 style="margin-top:0">💡 ملاحظة</h4>
                <p style="margin: 0; font-size: var(--fs-sm);">
                    ارفع ملف التوزيع كما هو من الإدارة أو الإشراف التربوي (PDF / صورة / Word).
                    الملفات تظهر تلقائياً في ملف الإنجاز عند الطباعة.
                </p>
            </div>
        `;

        panel.querySelector('#btn-upload')?.addEventListener('click', () => openForm(cls, panel));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openForm(cls, panel));

        panel.querySelectorAll('[data-f-view]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fView);
                const f = files[i];
                if (!f?.file) return;
                const url = URL.createObjectURL(f.file);
                global.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            });
        });

        panel.querySelectorAll('[data-f-download]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fDownload);
                const f = files[i];
                if (!f?.file) return;
                const url = URL.createObjectURL(f.file);
                const a = document.createElement('a');
                a.href = url; a.download = f.filename || f.name;
                a.click();
                URL.revokeObjectURL(url);
            });
        });

        panel.querySelectorAll('[data-f-edit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.fEdit);
                openForm(cls, panel, i);
            });
        });

        panel.querySelectorAll('[data-f-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fDel);
                if (!global.confirm('حذف هذا الملف؟')) return;
                cls.curriculum_files.splice(i, 1);
                cls.updated_at = new Date().toISOString();
                await global.TeacherDB.put('classes', cls);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    function empty() {
        return `
            <div class="empty-state">
                <div class="icon">🗓️</div>
                <h3>لا يوجد توزيع منهج بعد</h3>
                <p>ارفع ملف التوزيع الرسمي للفصل (PDF أو صورة أو Word).</p>
                <button class="btn btn-primary" data-empty-add>+ رفع ملف</button>
            </div>
        `;
    }

    function list(files) {
        return `
            <div class="file-list">
                ${files.map((f, i) => `
                    <div class="file-card">
                        <div class="file-icon">${iconFor(f.file)}</div>
                        <div class="file-body">
                            <div class="file-name">${escapeHtml(f.name)}</div>
                            <div class="file-meta">
                                ${f.file ? `<span>${formatSize(f.file.size)}</span>` : ''}
                                ${f.uploaded_at ? `<span>📅 ${formatDate(f.uploaded_at)}</span>` : ''}
                                ${f.notes ? `<span class="text-muted">• ${escapeHtml(f.notes.slice(0, 60))}${f.notes.length > 60 ? '…' : ''}</span>` : ''}
                            </div>
                        </div>
                        <div class="file-actions">
                            ${f.file ? `<button class="btn btn-ghost btn-sm" data-f-view="${i}" title="فتح">👁️</button>` : ''}
                            ${f.file ? `<button class="btn btn-ghost btn-sm" data-f-download="${i}" title="تحميل">⬇️</button>` : ''}
                            <button class="btn btn-ghost btn-sm" data-f-edit="${i}" title="تعديل">✏️</button>
                            <button class="btn btn-ghost btn-sm" data-f-del="${i}" title="حذف">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function openForm(cls, panel, editIndex) {
        const list = ensureList(cls);
        const existing = editIndex !== undefined ? list[editIndex] : null;

        const form = document.createElement('form');
        form.innerHTML = `
            <div class="field">
                <label class="label">اسم الملف *</label>
                <input class="input" id="f-name" type="text" required
                       placeholder="مثال: توزيع منهج الرياضيات — الفصل الأول"
                       value="${existing ? escapeAttr(existing.name) : ''}">
            </div>
            <div class="field">
                <label class="label">الملف (PDF / صورة / Word)</label>
                <input class="input" id="f-file" type="file"
                       accept=".pdf,.doc,.docx,image/*">
                <div class="field-hint">
                    ${existing?.file ? `ملف موجود: ${existing.filename || existing.name}. اختر ملفاً جديداً للاستبدال.` : 'الحد الأقصى ~20 MB'}
                </div>
            </div>
            <div class="field">
                <label class="label">ملاحظات (اختياري)</label>
                <textarea class="textarea" id="f-notes" rows="2"
                          placeholder="مصدر الملف، فترة التوزيع، أي تفاصيل...">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ التعديل' : 'رفع'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const fileInput = form.querySelector('#f-file');
                const file = fileInput.files[0];

                const row = {
                    id:          existing?.id || ('cf_' + Date.now()),
                    name:        form.querySelector('#f-name').value.trim(),
                    notes:       form.querySelector('#f-notes').value.trim(),
                    file:        existing?.file || null,
                    filename:    existing?.filename || '',
                    uploaded_at: existing?.uploaded_at || new Date().toISOString()
                };

                if (file) {
                    if (file.size > 50 * 1024 * 1024) throw new Error('حجم الملف كبير (أقصى ~50 MB).');
                    row.file = file;
                    row.filename = file.name;
                    row.uploaded_at = new Date().toISOString();
                }

                if (!row.file && !existing?.file) {
                    throw new Error('اختر ملفاً.');
                }

                if (existing !== null && editIndex !== undefined) {
                    cls.curriculum_files[editIndex] = row;
                } else {
                    cls.curriculum_files.push(row);
                }
                cls.updated_at = new Date().toISOString();
                await global.TeacherDB.put('classes', cls);

                global.Modal.close();
                global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تم الرفع ✅', 'success');
                await render(panel, cls);
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
                btn.disabled = false;
            }
        });

        global.Modal.open({
            title: existing ? 'تعديل ملف التوزيع' : 'رفع ملف توزيع',
            body: form
        });
    }

    global.ClassCurriculumTab = { render };
})(window);
