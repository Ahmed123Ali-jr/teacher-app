/* ==========================================================================
   views/portfolio-strategies.js — Teaching strategies section (AI-powered).
   Add strategy → AI generates a polished report → edit → save → print.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'short', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }

    async function render(body, ctx) {
        const strategies = ctx.strategies.slice().sort((a, b) =>
            (b.date || '').localeCompare(a.date || ''));

        body.innerHTML = `
            <button class="btn btn-primary" id="add-strategy">+ إضافة استراتيجية</button>
            <div style="margin-top: var(--space-4);">
                ${strategies.length === 0
                    ? `<p class="text-muted">لا توجد استراتيجيات بعد. أضف أول استراتيجية طبّقتها مع صور التنفيذ وسيصنع الذكاء الاصطناعي تقريراً احترافياً.</p>`
                    : strategies.map((s) => card(s)).join('')}
            </div>
        `;

        body.querySelector('#add-strategy').addEventListener('click', () => openForm(ctx));

        body.querySelectorAll('[data-strat-view]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.stratView;
                const row = await global.TeacherDB.get('strategies', id);
                if (row) openPreview(row, ctx);
            });
        });
        body.querySelectorAll('[data-strat-edit]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.stratEdit;
                const row = await global.TeacherDB.get('strategies', id);
                if (row) openForm(ctx, row);
            });
        });
        body.querySelectorAll('[data-strat-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!global.confirm('حذف هذه الاستراتيجية؟')) return;
                await global.TeacherDB.remove('strategies', btn.dataset.stratDel);
                global.TeacherApp.toast('تم الحذف.', 'info');
                ctx.refresh();
            });
        });
    }

    function card(s) {
        const imgs = Array.isArray(s.images) ? s.images.length : 0;
        return `
            <article class="portfolio-card">
                <div class="portfolio-card-header">
                    <h4>${escapeHtml(s.name)}</h4>
                    <div class="flex gap-2">
                        <button class="btn btn-ghost btn-sm" data-strat-view="${s.id}" title="عرض التقرير">👁️</button>
                        <button class="btn btn-ghost btn-sm" data-strat-edit="${s.id}" title="تعديل">✏️</button>
                        <button class="btn btn-ghost btn-sm" data-strat-del="${s.id}" title="حذف">🗑️</button>
                    </div>
                </div>
                <div class="portfolio-card-meta">
                    <span>📅 ${formatDate(s.date)}</span>
                    ${s.class_label ? `<span>📚 ${escapeHtml(s.class_label)}</span>` : ''}
                    ${s.lesson ? `<span>📖 ${escapeHtml(s.lesson)}</span>` : ''}
                    ${imgs ? `<span>🖼️ ${imgs} صور</span>` : ''}
                    ${s.report ? '<span class="badge badge-success">✓ تقرير جاهز</span>' : '<span class="badge badge-warning">بلا تقرير</span>'}
                </div>
            </article>
        `;
    }

    async function openForm(ctx, existing) {
        const form = document.createElement('div');
        const draft = existing
            ? JSON.parse(JSON.stringify({ ...existing, images: [] })) // clone meta, keep images separate
            : { name: '', date: '', class_id: '', lesson: '', description: '', images: [], report: null };
        if (existing) draft.images = existing.images || [];

        let step = existing ? 2 : 1;

        paint();

        function paint() {
            if (step === 1) paintStep1();
            else            paintStep2();
        }

        function paintStep1() {
            form.innerHTML = `
                <div class="field">
                    <label class="label">اسم الاستراتيجية *</label>
                    <input class="input" id="s-name" required
                           placeholder="مثلاً: التعلم التعاوني، خرائط المفاهيم..."
                           value="${escapeAttr(draft.name)}">
                </div>
                <div class="grid grid-2">
                    <div class="field">
                        <label class="label">تاريخ التنفيذ *</label>
                        <input class="input" id="s-date" type="date" required
                               value="${draft.date || ''}">
                    </div>
                    <div class="field">
                        <label class="label">الفصل</label>
                        <select class="select" id="s-class">
                            <option value="">— اختياري —</option>
                            ${ctx.classes.map((c) => `
                                <option value="${c.id}" ${draft.class_id == c.id ? 'selected' : ''}>
                                    ${escapeHtml(c.grade)} / ${escapeHtml(c.section)} — ${escapeHtml(c.subject)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="field">
                    <label class="label">الدرس / الموضوع</label>
                    <input class="input" id="s-lesson" placeholder="اسم الدرس المطبّقة فيه"
                           value="${escapeAttr(draft.lesson || '')}">
                </div>
                <div class="field">
                    <label class="label">وصف مختصر (اختياري — يُساعد في توليد تقرير أدق)</label>
                    <textarea class="textarea" id="s-desc" rows="3"
                              placeholder="كيف طبّقت الاستراتيجية باختصار؟">${escapeHtml(draft.description)}</textarea>
                </div>
                <div class="field">
                    <label class="label">صور التنفيذ (اختياري — حتى ٥)</label>
                    <input class="input" id="s-images" type="file" accept="image/*" multiple>
                    <div class="field-hint">الصور موجودة حالياً: ${draft.images.length}</div>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button class="btn btn-primary" id="gen">${existing?.report ? 'إعادة توليد التقرير' : '✨ توليد التقرير'}</button>
                    ${existing ? '<button class="btn btn-secondary" id="save-only">حفظ بدون توليد</button>' : ''}
                    <button class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;

            form.querySelector('#s-images').addEventListener('change', async (e) => {
                const files = Array.from(e.target.files).slice(0, 5);
                for (const f of files) {
                    if (f.size > 5 * 1024 * 1024) {
                        global.TeacherApp.toast(`صورة "${f.name}" كبيرة (تخطت 5MB) — تخطيها.`, 'warning');
                        continue;
                    }
                    draft.images.push(f);
                }
                form.querySelector('.field-hint').textContent = 'الصور موجودة حالياً: ' + draft.images.length;
            });

            form.querySelector('#gen').addEventListener('click', async () => {
                if (!collect()) return;
                const btn = form.querySelector('#gen');
                btn.disabled = true; btn.innerHTML = '⏳ جارٍ التوليد...';
                try {
                    const cls = ctx.classes.find((c) => c.id == draft.class_id);
                    const report = await global.AI.generateStrategyReport({
                        name: draft.name,
                        date: draft.date,
                        class_label: cls ? `${cls.grade} / ${cls.section}` : '',
                        subject: cls?.subject || '',
                        lesson: draft.lesson,
                        description: draft.description,
                        image_count: draft.images.length
                    });
                    draft.report = report;
                    step = 2;
                    paint();
                } catch (err) {
                    global.TeacherApp.toast(err.message, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '✨ توليد التقرير';
                }
            });

            form.querySelector('#save-only')?.addEventListener('click', async () => {
                if (!collect()) return;
                await persist();
            });
        }

        function collect() {
            draft.name    = form.querySelector('#s-name').value.trim();
            draft.date    = form.querySelector('#s-date').value;
            draft.class_id = form.querySelector('#s-class').value || null;
            draft.lesson  = form.querySelector('#s-lesson').value.trim();
            draft.description = form.querySelector('#s-desc').value.trim();
            if (!draft.name || !draft.date) {
                global.TeacherApp.toast('الاسم والتاريخ مطلوبان.', 'warning');
                return false;
            }
            const cls = ctx.classes.find((c) => c.id == draft.class_id);
            draft.class_label = cls ? `${cls.grade} / ${cls.section} — ${cls.subject}` : '';
            return true;
        }

        function paintStep2() {
            const r = draft.report || {};
            form.innerHTML = `
                <p class="text-muted" style="font-size:var(--fs-sm); margin-bottom:var(--space-4);">
                    راجع التقرير المُولَّد وعدّله حسب الحاجة.
                </p>

                <div class="field">
                    <label class="label">المقدمة</label>
                    <textarea class="textarea" data-r="introduction" rows="3">${escapeHtml(r.introduction || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">الوصف</label>
                    <textarea class="textarea" data-r="description" rows="3">${escapeHtml(r.description || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">خطوات التنفيذ (كل خطوة في سطر)</label>
                    <textarea class="textarea" data-r="steps" rows="5">${escapeHtml((r.steps || []).join('\n'))}</textarea>
                </div>
                <div class="field">
                    <label class="label">الأثر التعليمي</label>
                    <textarea class="textarea" data-r="impact" rows="3">${escapeHtml(r.impact || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">التوصيات</label>
                    <textarea class="textarea" data-r="recommendations" rows="3">${escapeHtml(r.recommendations || '')}</textarea>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button class="btn btn-primary" id="save-final">💾 حفظ في الملف</button>
                    <button class="btn btn-ghost" id="back-step1">← رجوع للبيانات</button>
                    <button class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;

            form.querySelector('#save-final').addEventListener('click', async () => {
                const r = {};
                form.querySelectorAll('[data-r]').forEach((el) => {
                    const k = el.dataset.r;
                    r[k] = el.value.trim();
                });
                r.steps = String(r.steps || '').split('\n').map((s) => s.trim()).filter(Boolean);
                draft.report = r;
                await persist();
            });

            form.querySelector('#back-step1').addEventListener('click', () => { step = 1; paint(); });
        }

        async function persist() {
            const row = {
                ...draft,
                teacher_id: ctx.teacher.id,
                updated_at: new Date().toISOString(),
                created_at: existing?.created_at || new Date().toISOString()
            };
            if (existing) row.id = existing.id;
            await global.TeacherDB.put('strategies', row);
            global.Modal.close();
            global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تمت الإضافة ✅', 'success');
            ctx.refresh();
        }

        global.Modal.open({
            title: existing ? 'تعديل استراتيجية' : 'إضافة استراتيجية تدريس',
            body: form
        });
    }

    function openPreview(s, ctx) {
        const r = s.report || {};
        const box = document.createElement('div');
        box.innerHTML = `
            <h3 style="margin-top:0; color: var(--primary);">${escapeHtml(s.name)}</h3>
            <div class="text-muted" style="font-size:var(--fs-sm); margin-bottom:var(--space-4);">
                📅 ${formatDate(s.date)}
                ${s.class_label ? ' · 📚 ' + escapeHtml(s.class_label) : ''}
                ${s.lesson ? ' · 📖 ' + escapeHtml(s.lesson) : ''}
            </div>

            ${r.introduction    ? sectionBlock('المقدمة', r.introduction) : ''}
            ${r.description     ? sectionBlock('الوصف', r.description) : ''}
            ${Array.isArray(r.steps) && r.steps.length
                ? `<h4>خطوات التنفيذ</h4><ol>${r.steps.map((st) => `<li>${escapeHtml(st)}</li>`).join('')}</ol>`
                : ''}
            ${r.impact          ? sectionBlock('الأثر التعليمي', r.impact) : ''}
            ${r.recommendations ? sectionBlock('التوصيات', r.recommendations) : ''}

            ${(s.images || []).length ? `
                <h4>صور التنفيذ</h4>
                <div class="image-grid">
                    ${s.images.map((blob) => {
                        const url = URL.createObjectURL(blob);
                        return `<img src="${url}" alt="" loading="lazy">`;
                    }).join('')}
                </div>
            ` : ''}

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button class="btn btn-ghost" data-modal-close>إغلاق</button>
            </div>
        `;
        global.Modal.open({ title: 'عرض الاستراتيجية', body: box });
    }

    function sectionBlock(title, text) {
        return `<h4>${title}</h4><p>${String(text || '').split('\n').map(escapeHtml).join('<br>')}</p>`;
    }

    global.PortfolioStrategies = { render };
})(window);
