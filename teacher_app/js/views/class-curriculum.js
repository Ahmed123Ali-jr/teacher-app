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

    /* ── لماذا لا يُحفظ الملفُّ في الصفّ ──
       كان `row.file` كائنَ `File` يُرسل ضمن JSON فيصير `{}`، والعمودُ
       نفسُه لم يكن في أيّ هجرة — فكلُّ حفظٍ يُردّ بـ«Could not find the
       'curriculum_files' column». تبويبٌ يبتلع عمل المعلّم منذ وُلد.

       فصار كالكتب بقرار المستخدم: **بياناتٌ في القاعدة، والملفُّ على
       الجهاز** بمعرّفٍ يربط بينهما. */
    const uuid = () => (global.crypto && global.crypto.randomUUID)
        ? global.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });

    /** يجلب ملفّاً محلياً بمعرّفه — أو `null` إن مُسح مع بيانات المتصفّح. */
    async function localFile(id) {
        if (!id) return null;
        try { return await global.TeacherDB.BookFiles.get(id); }
        catch (e) { return null; }
    }

    async function render(panel, cls) {
        const files = ensureList(cls);

        /* زرُّ الرفع كان في الحالة الفارغة وحدَها، والمعالِجُ أدناه ينتظر
           زرّاً لم يُرسم قطُّ حين توجد ملفّات. */
        /* الحالةُ الفارغة بنمط الكتب — انظر النظير في class-exams.js. */
        panel.classList.toggle('is-empty-tab', files.length === 0);

        /* وبطاقةُ الملاحظة تسقط في الحالة الفارغة: الحالةُ عمودٌ مرنٌ
           زرُّه في القاع، فبطاقةٌ تحته تدفعه إلى الوسط وتنقض الغرض. وما
           فيها من إرشادٍ انتقل إلى سطر اللافتة، فلا يضيع.

           وفي الحالة العامرة تسبق الشريطَ لا تتبعه، للسبب عينِه: الشريطُ
           في قاع اللوحة، وما بعده يقع تحته. */
        panel.innerHTML = `
            ${files.length === 0 ? empty() : `
                ${list(files)}

                <div class="card" style="margin-top: var(--space-6); background: rgba(59,130,246,0.06);">
                    <h4 style="margin-top:0">ملاحظة</h4>
                    <p style="margin: 0; font-size: var(--fs-sm);">
                        ارفع ملف التوزيع كما هو من الإدارة أو الإشراف التربوي (PDF / صورة / Word).
                        الملفات تظهر تلقائياً في ملف الإنجاز عند الطباعة.
                    </p>
                    <p style="margin: var(--space-3) 0 0; font-size: var(--fs-sm);">
                        📱 والملفّات محفوظةٌ على <b>هذا الجهاز وحده</b> — قد تضيع إن
                        مسحتَ بيانات المتصفّح أو غيّرتَ جهازك.
                    </p>
                </div>

                <div class="ws-addbar">
                    <button class="btn btn-primary" id="btn-upload">+ ارفع ملفاً</button>
                </div>`}
        `;

        panel.querySelector('#btn-upload')?.addEventListener('click', () => openForm(cls, panel));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openForm(cls, panel));

        panel.querySelectorAll('[data-f-view]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fView);
                const f = files[i];
                const blob = await localFile(f && f.id);
                if (!blob) return global.TeacherApp.toast(
                    'الملفُّ غير موجودٍ على هذا الجهاز.', 'warning', 4000);
                const url = URL.createObjectURL(blob);
                global.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            });
        });

        panel.querySelectorAll('[data-f-download]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.fDownload);
                const f = files[i];
                const blob = await localFile(f && f.id);
                if (!blob) return global.TeacherApp.toast(
                    'الملفُّ غير موجودٍ على هذا الجهاز.', 'warning', 4000);
                const url = URL.createObjectURL(blob);
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
                /* الصفُّ والملفُّ معاً — وإلّا بقي الملفُّ يتيماً يشغل
                   مساحةَ الجهاز بلا شيءٍ يشير إليه. */
                const gone = cls.curriculum_files[i];
                cls.curriculum_files.splice(i, 1);
                if (gone && gone.id) {
                    try { await global.TeacherDB.BookFiles.remove(gone.id); }
                    catch (e) { /* الصفُّ أولى بالحذف */ }
                }
                cls.updated_at = new Date().toISOString();
                await global.TeacherDB.put('classes', cls);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    function empty() {
        return `
            <div class="start-note">
                <b>لا ملفّ توزيع بعد</b>
                <span>ارفعه كما هو من الإدارة (PDF أو صورة أو Word)،
                      ويظهر تلقائياً في ملف الإنجاز</span>
            </div>
            <div class="start-gap"></div>
            <button type="button" class="start-cta" data-empty-add>+ ارفع ملفاً</button>
        `;
    }

    function list(files) {
        return `
            <div class="file-list">
                ${files.map((f, i) => `
                    <div class="file-card">
                        <div class="file-icon">${iconFor({ type: f.mime })}</div>
                        <div class="file-body">
                            <div class="file-name">${escapeHtml(f.name)}</div>
                            <div class="file-meta">
                                ${f.size ? `<span>${formatSize(f.size)}</span>` : ''}
                                ${f.uploaded_at ? `<span>📅 ${formatDate(f.uploaded_at)}</span>` : ''}
                                ${f.notes ? `<span class="text-muted">• ${escapeHtml(f.notes.slice(0, 60))}${f.notes.length > 60 ? '…' : ''}</span>` : ''}
                            </div>
                        </div>
                        <div class="file-actions">
                            <button class="btn btn-ghost btn-sm" data-f-view="${i}" title="فتح">👁️</button>
                            <button class="btn btn-ghost btn-sm" data-f-download="${i}" title="تحميل">⬇️</button>
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
                    ${existing ? `ملف موجود: ${existing.filename || existing.name}. اختر ملفاً جديداً للاستبدال.` : 'الحد الأقصى ~50 MB — يُحفظ على هذا الجهاز'}
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
                    id:          existing?.id || uuid(),
                    filename:    existing?.filename || '',
                    size:        existing?.size || 0,
                    mime:        existing?.mime || '',
                    uploaded_at: existing?.uploaded_at || new Date().toISOString()
                };

                if (file) {
                    if (file.size > 50 * 1024 * 1024) throw new Error('حجم الملف كبير (أقصى ~50 MB).');
                    row.filename    = file.name;
                    row.size        = file.size;
                    row.mime        = file.type || '';
                    row.uploaded_at = new Date().toISOString();
                    /* الملفُّ أولاً: لو فشل الحفظُ المحليّ لم يُكتب صفٌّ
                       يشير إلى ملفٍّ لا وجود له. */
                    await global.TeacherDB.BookFiles.save(row.id, file);
                }

                if (!file && !existing) throw new Error('اختر ملفاً.');

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
