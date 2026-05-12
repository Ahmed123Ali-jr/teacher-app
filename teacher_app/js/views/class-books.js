/* ==========================================================================
   views/class-books.js — Books tab (upload PDF + optional text context).
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function formatSize(bytes) {
        if (!bytes) return '—';
        const kb = bytes / 1024;
        if (kb < 1024) return kb.toFixed(1) + ' KB';
        return (kb / 1024).toFixed(1) + ' MB';
    }

    const TYPE_LABELS = {
        student: 'كتاب الطالب',
        activity: 'كتاب النشاط',
        teacher: 'دليل المعلم',
        other: 'أخرى'
    };

    async function render(panel, cls) {
        const books = await global.TeacherDB.getAllByIndex('books', 'class_id', cls.id);

        panel.innerHTML = `
            <div class="section-header">
                <h3 class="section-title">📖 كتب الفصل</h3>
                <button class="btn btn-primary" id="btn-add-book">+ رفع كتاب</button>
            </div>

            ${books.length === 0 ? emptyState() : bookGrid(books)}

            <div class="card" style="margin-top: var(--space-6); background: rgba(59,130,246,0.06);">
                <h4 style="margin-top:0">💡 كيف تستفيد من الكتب؟</h4>
                <ul style="padding-right: var(--space-5); line-height: 1.9; margin: 0;">
                    <li>ارفع ملف PDF لكتاب الطالب أو كتاب النشاط.</li>
                    <li>أضف <strong>نصاً من صفحات معينة</strong> في خانة "السياق" — الذكاء الاصطناعي يستخدمه لتوليد اختبارات مطابقة.</li>
                    <li>كلما كان السياق أدق، كانت الأسئلة أقرب للمنهج.</li>
                </ul>
            </div>
        `;

        panel.querySelector('#btn-add-book')?.addEventListener('click', () => openForm(cls, panel));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => openForm(cls, panel));

        panel.querySelectorAll('[data-book-edit]').forEach((btn) => {
            const id = btn.dataset.bookEdit;
            btn.addEventListener('click', async () => {
                const book = books.find((b) => b.id === id);
                openForm(cls, panel, book);
            });
        });

        panel.querySelectorAll('[data-book-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.bookDelete;
                if (!global.confirm('حذف هذا الكتاب؟')) return;
                await global.TeacherDB.remove('books', id);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });

        panel.querySelectorAll('[data-book-download]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.bookDownload;
                const book = await global.TeacherDB.get('books', id);
                if (!book?.file) return;
                const url = URL.createObjectURL(book.file);
                const a = document.createElement('a');
                a.href = url;
                a.download = book.filename || 'book.pdf';
                a.click();
                URL.revokeObjectURL(url);
            });
        });
    }

    function emptyState() {
        return `
            <div class="empty-state">
                <div class="icon">📚</div>
                <h3>لا توجد كتب بعد</h3>
                <p>ارفع كتاب الطالب أو كتاب النشاط كملف PDF، وأضف نصاً من الفصل لتوليد اختبارات دقيقة.</p>
                <button class="btn btn-primary" data-empty-add>+ رفع كتاب</button>
            </div>
        `;
    }

    function bookGrid(books) {
        return `
            <div class="grid grid-3">
                ${books.map((b) => `
                    <div class="card book-card">
                        <div class="book-icon">📘</div>
                        <div class="book-body">
                            <h4 style="margin:0 0 var(--space-1)">${escapeHtml(b.title || 'كتاب')}</h4>
                            <div class="text-muted" style="font-size: var(--fs-sm);">
                                <span class="badge badge-info">${TYPE_LABELS[b.type] || '—'}</span>
                                ${b.file ? `<span style="margin-right: var(--space-2);">${formatSize(b.file.size)}</span>` : ''}
                            </div>
                            ${b.context ? `<p class="text-muted" style="font-size:var(--fs-sm); margin-top:var(--space-2); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">📝 ${escapeHtml(b.context.slice(0, 140))}${b.context.length > 140 ? '…' : ''}</p>` : ''}
                        </div>
                        <div class="book-actions">
                            ${b.file ? `<button class="btn btn-ghost btn-sm" data-book-download="${b.id}" title="تحميل">⬇️</button>` : ''}
                            <button class="btn btn-ghost btn-sm" data-book-edit="${b.id}" title="تعديل">✏️</button>
                            <button class="btn btn-ghost btn-sm" data-book-delete="${b.id}" title="حذف">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function openForm(cls, panel, existing) {
        const form = document.createElement('form');
        form.setAttribute('novalidate', '');
        form.innerHTML = `
            <div class="field">
                <label class="label" for="b-title">اسم الكتاب *</label>
                <input class="input" id="b-title" type="text" required
                       placeholder="مثلاً: الرياضيات — الفصل الدراسي الأول"
                       value="${existing ? escapeHtml(existing.title) : ''}">
            </div>

            <div class="field">
                <label class="label" for="b-type">النوع</label>
                <select class="select" id="b-type">
                    ${Object.entries(TYPE_LABELS).map(([k, v]) =>
                        `<option value="${k}" ${existing && existing.type === k ? 'selected' : ''}>${v}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="field">
                <label class="label" for="b-file">ملف PDF (اختياري)</label>
                <input class="input" id="b-file" type="file" accept="application/pdf">
                <div class="field-hint">
                    ${existing && existing.file ? `ملف موجود: ${existing.filename || 'book.pdf'}. اختر ملفاً جديداً للاستبدال.` : 'حجم أقصى موصى به: 150 MB'}
                </div>
            </div>

            <div class="field">
                <label class="label" for="b-context">السياق النصي من الكتاب (اختياري — مفيد لتوليد اختبارات دقيقة)</label>
                <textarea class="textarea" id="b-context" rows="6"
                          placeholder="ألصق هنا نص الفصل أو الوحدة أو الدرس الذي تريد توليد أسئلة منه...">${existing ? escapeHtml(existing.context || '') : ''}</textarea>
                <div class="field-hint">كلما كان النص أدق، جاءت أسئلة الذكاء الاصطناعي أقرب للمنهج.</div>
            </div>

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="submit" class="btn btn-primary">${existing ? 'حفظ التعديل' : 'رفع الكتاب'}</button>
                <button type="button" class="btn btn-ghost" data-modal-close>إلغاء</button>
            </div>
        `;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const origLabel = btn ? btn.textContent : '';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ جارٍ الرفع...';
            }
            try {
                const title = form.querySelector('#b-title').value.trim();
                if (!title) throw new Error('اسم الكتاب مطلوب.');

                const fileInput = form.querySelector('#b-file');
                const file = fileInput && fileInput.files[0];

                const row = {
                    class_id: cls.id,
                    title,
                    type:     form.querySelector('#b-type').value,
                    context:  form.querySelector('#b-context').value.trim(),
                    filename: existing?.filename || '',
                    file:     existing?.file || null,
                    created_at: existing?.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                if (existing) row.id = existing.id;

                if (file) {
                    if (file.size > 25 * 1024 * 1024) {
                        throw new Error('الملف كبير (أقصى 25 MB). اختر نسخة أصغر.');
                    }
                    row.file = file;
                    row.filename = file.name;
                }

                console.info('[books] uploading', {
                    has_file: !!file,
                    size_kb:  file ? Math.round(file.size / 1024) : 0
                });

                await global.TeacherDB.put('books', row);
                global.Modal.close();
                global.TeacherApp.toast(existing ? 'تم حفظ التعديل.' : 'تم رفع الكتاب ✅', 'success', 2000);
                await render(panel, cls);
            } catch (err) {
                console.error('[books] upload failed:', err);
                global.TeacherApp.toast('تعذّر الرفع: ' + (err.message || 'خطأ غير معروف'), 'error', 6000);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = origLabel;
                }
            }
        });

        global.Modal.open({
            title: existing ? 'تعديل الكتاب' : 'رفع كتاب جديد',
            body: form
        });
    }

    global.ClassBooksTab = { render };
})(window);
