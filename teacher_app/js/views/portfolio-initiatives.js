/* ==========================================================================
   views/portfolio-initiatives.js — Initiatives section (AI-powered).
   Same pattern as strategies, different fields and report shape.
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
        const items = ctx.initiatives.slice().sort((a, b) =>
            (b.date || '').localeCompare(a.date || ''));

        body.innerHTML = `
            <button class="btn btn-primary" id="add-init">+ إضافة مبادرة</button>
            <div style="margin-top: var(--space-4);">
                ${items.length === 0
                    ? `<p class="text-muted">لا توجد مبادرات بعد. أضف مبادرتك التربوية وسيصنع الذكاء الاصطناعي تقريراً احترافياً لها.</p>`
                    : items.map((s) => card(s)).join('')}
            </div>
        `;

        body.querySelector('#add-init').addEventListener('click', () => openForm(ctx));

        body.querySelectorAll('[data-init-view]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.initView;
                const row = await global.TeacherDB.get('initiatives', id);
                if (row) openPreview(row);
            });
        });
        body.querySelectorAll('[data-init-edit]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.initEdit;
                const row = await global.TeacherDB.get('initiatives', id);
                if (row) openForm(ctx, row);
            });
        });
        body.querySelectorAll('[data-init-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!global.confirm('حذف هذه المبادرة؟')) return;
                await global.TeacherDB.remove('initiatives', btn.dataset.initDel);
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
                        <button class="btn btn-ghost btn-sm" data-init-view="${s.id}">👁️</button>
                        <button class="btn btn-ghost btn-sm" data-init-edit="${s.id}">✏️</button>
                        <button class="btn btn-ghost btn-sm" data-init-del="${s.id}">🗑️</button>
                    </div>
                </div>
                <div class="portfolio-card-meta">
                    <span>📅 ${formatDate(s.date)}</span>
                    ${s.audience ? `<span>🎯 ${escapeHtml(s.audience)}</span>` : ''}
                    ${s.beneficiaries ? `<span>👥 ${escapeHtml(String(s.beneficiaries))} مستفيد</span>` : ''}
                    ${imgs ? `<span>🖼️ ${imgs}</span>` : ''}
                    ${s.report ? '<span class="badge badge-success">✓ تقرير</span>' : ''}
                </div>
            </article>
        `;
    }

    function openForm(ctx, existing) {
        const form = document.createElement('div');
        const draft = existing
            ? JSON.parse(JSON.stringify({ ...existing, images: [] }))
            : { name: '', date: '', audience: '', beneficiaries: '', description: '', images: [], report: null };
        if (existing) draft.images = existing.images || [];

        let step = existing ? 2 : 1;
        paint();

        function paint() { step === 1 ? paintStep1() : paintStep2(); }

        function paintStep1() {
            form.innerHTML = `
                <div class="field">
                    <label class="label">اسم المبادرة *</label>
                    <input class="input" id="i-name" required
                           placeholder="مثلاً: مبادرة قارئ الشهر"
                           value="${escapeAttr(draft.name)}">
                </div>
                <div class="grid grid-2">
                    <div class="field">
                        <label class="label">تاريخ التنفيذ *</label>
                        <input class="input" id="i-date" type="date" required
                               value="${draft.date || ''}">
                    </div>
                    <div class="field">
                        <label class="label">عدد المستفيدين</label>
                        <input class="input" id="i-ben" type="text"
                               placeholder="مثلاً: 30"
                               value="${escapeAttr(String(draft.beneficiaries || ''))}">
                    </div>
                </div>
                <div class="field">
                    <label class="label">الفئة المستهدفة</label>
                    <input class="input" id="i-aud" placeholder="طلاب الصف الثاني / أولياء الأمور / ..."
                           value="${escapeAttr(draft.audience || '')}">
                </div>
                <div class="field">
                    <label class="label">وصف المبادرة (اختياري)</label>
                    <textarea class="textarea" id="i-desc" rows="4">${escapeHtml(draft.description)}</textarea>
                </div>
                <div class="field">
                    <label class="label">الصور (حتى ٥)</label>
                    <input class="input" id="i-images" type="file" accept="image/*" multiple>
                    <div class="field-hint">الصور حالياً: ${draft.images.length}</div>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button class="btn btn-primary" id="gen">${existing?.report ? 'إعادة توليد' : '✨ توليد التقرير'}</button>
                    ${existing ? '<button class="btn btn-secondary" id="save-only">حفظ فقط</button>' : ''}
                    <button class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;

            form.querySelector('#i-images').addEventListener('change', (e) => {
                const files = Array.from(e.target.files).slice(0, 5);
                for (const f of files) {
                    if (f.size > 5 * 1024 * 1024) continue;
                    draft.images.push(f);
                }
                form.querySelector('.field-hint').textContent = 'الصور حالياً: ' + draft.images.length;
            });

            form.querySelector('#gen').addEventListener('click', async () => {
                if (!collect()) return;
                const btn = form.querySelector('#gen');
                btn.disabled = true; btn.innerHTML = '⏳ جارٍ التوليد...';
                try {
                    draft.report = await global.AI.generateInitiativeReport({
                        name: draft.name, date: draft.date,
                        audience: draft.audience, beneficiaries: draft.beneficiaries,
                        description: draft.description, image_count: draft.images.length
                    });
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
            draft.name    = form.querySelector('#i-name').value.trim();
            draft.date    = form.querySelector('#i-date').value;
            draft.audience= form.querySelector('#i-aud').value.trim();
            draft.beneficiaries = form.querySelector('#i-ben').value.trim();
            draft.description = form.querySelector('#i-desc').value.trim();
            if (!draft.name || !draft.date) {
                global.TeacherApp.toast('الاسم والتاريخ مطلوبان.', 'warning');
                return false;
            }
            return true;
        }

        function paintStep2() {
            const r = draft.report || {};
            form.innerHTML = `
                <p class="text-muted" style="font-size:var(--fs-sm); margin-bottom:var(--space-4);">
                    راجع التقرير المُولَّد وعدّله.
                </p>
                <div class="field">
                    <label class="label">المقدمة</label>
                    <textarea class="textarea" data-r="introduction" rows="3">${escapeHtml(r.introduction || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">الأهداف (كل هدف في سطر)</label>
                    <textarea class="textarea" data-r="goals" rows="4">${escapeHtml((r.goals || []).join('\n'))}</textarea>
                </div>
                <div class="field">
                    <label class="label">التنفيذ</label>
                    <textarea class="textarea" data-r="execution" rows="3">${escapeHtml(r.execution || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">النتائج</label>
                    <textarea class="textarea" data-r="results" rows="3">${escapeHtml(r.results || '')}</textarea>
                </div>
                <div class="field">
                    <label class="label">الأثر</label>
                    <textarea class="textarea" data-r="impact" rows="3">${escapeHtml(r.impact || '')}</textarea>
                </div>

                <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                    <button class="btn btn-primary" id="save-final">💾 حفظ في الملف</button>
                    <button class="btn btn-ghost" id="back-step1">← رجوع</button>
                    <button class="btn btn-ghost" data-modal-close>إلغاء</button>
                </div>
            `;

            form.querySelector('#save-final').addEventListener('click', async () => {
                const r = {};
                form.querySelectorAll('[data-r]').forEach((el) => { r[el.dataset.r] = el.value.trim(); });
                r.goals = String(r.goals || '').split('\n').map((s) => s.trim()).filter(Boolean);
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
            await global.TeacherDB.put('initiatives', row);
            global.Modal.close();
            global.TeacherApp.toast(existing ? 'تم الحفظ.' : 'تمت الإضافة ✅', 'success');
            ctx.refresh();
        }

        global.Modal.open({
            title: existing ? 'تعديل المبادرة' : 'إضافة مبادرة جديدة',
            body: form
        });
    }

    function openPreview(s) {
        const r = s.report || {};
        const box = document.createElement('div');
        box.innerHTML = `
            <h3 style="margin-top:0; color: var(--primary);">${escapeHtml(s.name)}</h3>
            <div class="text-muted" style="font-size:var(--fs-sm); margin-bottom:var(--space-4);">
                📅 ${formatDate(s.date)}
                ${s.audience ? ' · 🎯 ' + escapeHtml(s.audience) : ''}
                ${s.beneficiaries ? ' · 👥 ' + escapeHtml(String(s.beneficiaries)) + ' مستفيد' : ''}
            </div>

            ${r.introduction ? block('المقدمة', r.introduction) : ''}
            ${Array.isArray(r.goals) && r.goals.length
                ? `<h4>الأهداف</h4><ul>${r.goals.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
                : ''}
            ${r.execution ? block('التنفيذ', r.execution) : ''}
            ${r.results   ? block('النتائج', r.results) : ''}
            ${r.impact    ? block('الأثر', r.impact) : ''}

            ${(s.images || []).length ? `
                <h4>الصور</h4>
                <div class="image-grid">
                    ${s.images.map((blob) => `<img src="${URL.createObjectURL(blob)}" alt="" loading="lazy">`).join('')}
                </div>
            ` : ''}

            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button class="btn btn-ghost" data-modal-close>إغلاق</button>
            </div>
        `;
        global.Modal.open({ title: 'عرض المبادرة', body: box });
    }

    function block(title, text) {
        return `<h4>${title}</h4><p>${String(text || '').split('\n').map(escapeHtml).join('<br>')}</p>`;
    }

    global.PortfolioInitiatives = { render };
})(window);
