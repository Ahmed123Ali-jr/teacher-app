/* ==========================================================================
   views/class-books.js — كتب الفصل: رفعٌ وتصفّح، لا غير.

   كانت الشاشة تستخرج نصّ الكتاب آلياً وتطلب «سياقاً» يُلصقه المعلّم،
   وكلاهما بُني ليغذّي توليد الاختبارات. وقد سقط ذلك بقرار المنتج: الكتاب
   يُرفع ليُقرأ في التطبيق (BookReader) لا ليُقرأ آلياً.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    /* بأرقامٍ عربيّةٍ ووحدةٍ عربيّة: «2.3 MB» لاتينيٌّ داخل سطرٍ عربيّ،
       فيقلبه ترتيبُ الاتّجاهين إلى «MB 2.3» — الوحدةُ قبل الرقم. */
    function formatSize(bytes) {
        if (!bytes) return '';
        const kb = bytes / 1024;
        const n = (v) => v.toFixed(1).replace('.', '٫')
            .replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
        return kb < 1024 ? n(kb) + ' ك.ب' : n(kb / 1024) + ' م.ب';
    }

    const TYPE_LABELS = {
        student: 'كتاب الطالب',
        activity: 'كتاب النشاط',
        teacher: 'دليل المعلم',
        other: 'أخرى'
    };

    async function render(panel, cls) {
        const books = await global.TeacherDB.getAllByIndex('books', 'class_id', cls.id);

        /* الحالةُ الفارغة تأخذ نمطَ «و» في الرئيسية: لافتةٌ تقول ما ينقص،
           وفراغٌ، وزرٌّ عريضٌ في متناول الإبهام. */
        panel.classList.toggle('is-empty-tab', books.length === 0);
        /* زرُّ الإضافة أسفلَ القائمة لا فوقها (بطلب المعلّم)، وكان قبلها في الحالة الفارغة وحدَها: فمن أضاف واحداً لم
           يجد سبيلاً إلى ثانٍ، والمعالِجُ أدناه ينتظر زرّاً لم يُرسم قطّ.
           (العطبُ نفسُه في الاختبارات وأوراق العمل والواجبات والتوزيع.) */
        panel.innerHTML = `
            ${books.length === 0 ? emptyState() : `
                ${bookGrid(books)}
                <div class="ws-addbar">
                    <button class="btn btn-primary" id="btn-add-book">+ ارفع كتاباً</button>
                </div>`}
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
                // Remove the local PDF blob too (best-effort).
                try { await global.TeacherDB.BookFiles.remove(id); }
                catch (e) { console.warn('[books] local file cleanup failed:', e.message); }
                await global.TeacherDB.remove('books', id);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });

        panel.querySelectorAll('[data-book-read]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const book = books.find((b) => String(b.id) === btn.dataset.bookRead);
                if (!book) return;
                btn.disabled = true;
                try {
                    await global.BookReader.open(book);
                } catch (err) {
                    console.warn('[books] open failed:', err);
                    global.TeacherApp.toast(
                        'تعذّر فتح الكتاب: ' + (err.message || 'خطأ غير معروف'), 'error', 6000);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        /* مكتبة العرض تُحمّل بالخلفية فور فتح الشاشة: أول لمسة على «تصفّح»
           تجد المكتبة جاهزة، فلا ينتظر المعلّم أمام شاشةٍ سوداء. */
        global.PdfCore.ensurePdfJs().catch(() => {});
    }

    /* نمطُ «و» — كنمط «فصولٌ بلا جدول» في الرئيسية بعينه. */
    function emptyState() {
        return `
            <div class="start-note">
                <b>لا كتب بعد</b>
                <span>ارفع كتاب الفصل أو دليل المعلّم لتقرأه هنا</span>
            </div>
            <div class="start-gap"></div>
            <button type="button" class="start-cta" data-empty-add>+ ارفع كتاباً</button>
        `;
    }


    /* أيقونتان مرسومتان لا رمزين تعبيريّين — النظيرُ في class-exams.js. */
    const SVG = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    const ICON_EDIT  = SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
    const ICON_TRASH = SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* الشكلُ «ب» كالاختبارات وأوراق العمل — شرحُه في class-exams.js.
       والفعلُ الرئيسُ هنا «تصفّح» لا «طباعة»: الكتابُ يُقرأ. */
    function bookGrid(books) {
        return books.map((b, i) => `
            <div class="st-card doc-row">
                <div class="stc-av num">${arDigits(i + 1)}</div>
                <div class="doc-tx" data-book-read="${b.id}">
                    <span class="doc-tt">${escapeHtml(b.title || 'كتاب')}</span>
                    <span class="doc-ss">${TYPE_LABELS[b.type] || 'أخرى'}${
                        b.size_bytes ? ' — ' + formatSize(b.size_bytes) : ''}</span>
                </div>
                <div class="doc-acts">
                    <button type="button" class="doc-ib p" data-book-read="${b.id}">تصفّح</button>
                    <button type="button" class="doc-ib" data-book-edit="${b.id}"
                            title="تعديل" aria-label="تعديل">${ICON_EDIT}</button>
                    <button type="button" class="doc-ib" data-book-delete="${b.id}"
                            title="حذف" aria-label="حذف">${ICON_TRASH}</button>
                </div>
            </div>
        `).join('');
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
                    ${existing && existing.storage_path
                        ? `ملف محفوظ: ${existing.filename || 'book.pdf'}. اختر ملفاً جديداً للاستبدال.`
                        : 'الملف يُحفظ على جهازك، وتتصفّحه داخل التطبيق بلا إنترنت.'}
                </div>
            </div>

            <div class="field" style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius-sm); padding: var(--space-3);">
                <label style="display: flex; gap: var(--space-2); align-items: flex-start; cursor: pointer; line-height: 1.5;">
                    <input type="checkbox" id="b-ownership" ${existing?.ownership_confirmed_at ? 'checked' : ''} style="margin-top: 4px; flex-shrink: 0;">
                    <span style="font-size: var(--fs-sm);">
                        أُقرّ بأنني أملك نسخة شرعية من هذا الكتاب، وأرفعه لاستخدامي الشخصي والتعليمي فقط.
                        أتحمّل المسؤولية القانونية الكاملة لرفعه.
                    </span>
                </label>
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

                const ownershipBox = form.querySelector('#b-ownership');
                const ownsBook = !!(ownershipBox && ownershipBox.checked);
                if (!ownsBook) {
                    throw new Error('يجب الإقرار بأنك تملك نسخة شرعية من الكتاب قبل الرفع.');
                }

                const fileInput = form.querySelector('#b-file');
                const file = fileInput && fileInput.files[0];

                const row = {
                    class_id: cls.id,
                    title,
                    type:     form.querySelector('#b-type').value,
                    filename:     existing?.filename     || '',
                    storage_path: existing?.storage_path || null,
                    size_bytes:   existing?.size_bytes   || null,
                    mime_type:    existing?.mime_type    || null,
                    ownership_confirmed_at: existing?.ownership_confirmed_at || new Date().toISOString(),
                    created_at:   existing?.created_at   || new Date().toISOString(),
                    updated_at:   new Date().toISOString()
                };
                if (existing) row.id = existing.id;

                if (file) {
                    // No size cap — IndexedDB can hold hundreds of MB easily.
                    if (!row.id) {
                        row.id = (global.crypto && crypto.randomUUID)
                            ? crypto.randomUUID()
                            : ('b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
                    }
                    row.size_bytes   = file.size;
                    row.mime_type    = file.type || 'application/pdf';
                    row.filename     = file.name;
                    row.storage_path = 'local';
                }

                if (btn) btn.textContent = '⏳ جارٍ الحفظ...';
                await global.TeacherDB.put('books', row);
                // Save the actual PDF locally AFTER the row insert so we know
                // the final book id.
                if (file) {
                    await global.TeacherDB.BookFiles.save(row.id, file);
                }
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
