/* ==========================================================================
   views/class-worksheets.js — Worksheets tab (simpler wizard).
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    const state = {};

    async function render(panel, cls) {
        const sheets = (await global.TeacherDB.getAllByIndex('worksheets', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        panel.innerHTML = `
            <div class="section-header">
                <h3 class="section-title">📄 أوراق عمل الفصل</h3>
                <button class="btn btn-primary" id="btn-new-sheet">+ ورقة جديدة</button>
            </div>
            ${sheets.length === 0 ? empty() : list(sheets)}
        `;

        panel.querySelector('#btn-new-sheet')?.addEventListener('click', () => startWizard(cls, panel));
        panel.querySelector('[data-empty-add]')?.addEventListener('click', () => startWizard(cls, panel));

        panel.querySelectorAll('[data-ws-open]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = await global.TeacherDB.get('worksheets', Number(btn.dataset.wsOpen));
                if (row) {
                    state[cls.id] = { cls, step: 2, sheet: row };
                    renderWizard(panel, cls);
                }
            });
        });
        panel.querySelectorAll('[data-ws-print]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = await global.TeacherDB.get('worksheets', Number(btn.dataset.wsPrint));
                if (row) global.PrintWorksheet.print(row, cls, await global.Auth.currentTeacher());
            });
        });
        panel.querySelectorAll('[data-ws-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!global.confirm('حذف هذه الورقة؟')) return;
                await global.TeacherDB.remove('worksheets', Number(btn.dataset.wsDelete));
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    function empty() {
        return `
            <div class="empty-state">
                <div class="icon">📄</div>
                <h3>لا توجد أوراق بعد</h3>
                <p>ولّد ورقة عمل تدريبية حول أي درس بالذكاء الاصطناعي.</p>
                <button class="btn btn-primary" data-empty-add>+ ورقة جديدة</button>
            </div>
        `;
    }

    function list(rows) {
        return `
            <div class="grid grid-2">
                ${rows.map((r) => `
                    <div class="card exam-card">
                        <div>
                            <h4 style="margin:0 0 var(--space-1)">${escapeHtml(r.title)}</h4>
                            <div class="text-muted" style="font-size:var(--fs-sm);">
                                ${r.exercises?.length || 0} تمرين ·
                                ${new Date(r.created_at).toLocaleDateString('ar-SA')}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-secondary btn-sm" data-ws-open="${r.id}">✏️ مراجعة</button>
                            <button class="btn btn-ghost btn-sm" data-ws-print="${r.id}">🖨️</button>
                            <button class="btn btn-ghost btn-sm" data-ws-delete="${r.id}">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function startWizard(cls, panel) {
        state[cls.id] = {
            cls, step: 1,
            draft: { topic: '', count: 8, context: '', notes: '' },
            sheet: null
        };
        renderWizard(panel, cls);
    }

    function renderWizard(panel, cls) {
        const s = state[cls.id];
        if (!s) return render(panel, cls);

        if (s.step === 1) step1(panel, cls);
        else step2(panel, cls);
    }

    function step1(panel, cls) {
        const s = state[cls.id];
        const d = s.draft;
        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    <button class="btn btn-ghost btn-sm" id="back-list">← قائمة الأوراق</button>
                </div>
                <h3 class="wizard-title">ورقة عمل جديدة</h3>

                <div class="field">
                    <label class="label">الموضوع / الدرس *</label>
                    <input class="input" id="ws-topic" type="text" required
                           placeholder="مثال: جمع الكسور العشرية" value="${escapeAttr(d.topic)}">
                </div>
                <div class="field">
                    <label class="label">عدد التمارين</label>
                    <select class="select" id="ws-count">
                        ${[5, 8, 10, 12, 15].map((n) =>
                            `<option value="${n}" ${d.count === n ? 'selected' : ''}>${n} تمرين</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="field">
                    <label class="label">سياق من الكتاب (اختياري)</label>
                    <textarea class="textarea" id="ws-ctx" rows="4"
                              placeholder="ألصق نصاً من الكتاب ليكون أساس التمارين...">${escapeHtml(d.context)}</textarea>
                </div>
                <div class="field">
                    <label class="label">ملاحظات للذكاء الاصطناعي</label>
                    <textarea class="textarea" id="ws-notes" rows="2"
                              placeholder="مثلاً: اجعل التمارين متدرجة الصعوبة...">${escapeHtml(d.notes)}</textarea>
                </div>

                <div class="wizard-footer">
                    <button class="btn btn-primary" id="ws-gen">⚡ توليد الورقة</button>
                </div>
            </div>
        `;

        panel.querySelector('#ws-topic').addEventListener('input', (e) => { d.topic = e.target.value; });
        panel.querySelector('#ws-count').addEventListener('change', (e) => { d.count = Number(e.target.value); });
        panel.querySelector('#ws-ctx').addEventListener('input', (e) => { d.context = e.target.value; });
        panel.querySelector('#ws-notes').addEventListener('input', (e) => { d.notes = e.target.value; });

        panel.querySelector('#back-list').addEventListener('click', async () => {
            delete state[cls.id];
            await render(panel, cls);
        });

        panel.querySelector('#ws-gen').addEventListener('click', async () => {
            if (!d.topic.trim()) return global.TeacherApp.toast('أدخل الموضوع.', 'warning');
            const btn = panel.querySelector('#ws-gen');
            btn.disabled = true; btn.innerHTML = '⏳ جارٍ التوليد...';
            try {
                const result = await global.AI.generateWorksheet({
                    subject: cls.subject, grade: `${cls.grade} / ${cls.section}`,
                    topic: d.topic, context: d.context, count: d.count, notes: d.notes
                });
                s.sheet = {
                    class_id: cls.id,
                    title: result.title,
                    topic: d.topic,
                    instructions: result.instructions,
                    exercises: result.exercises,
                    created_at: new Date().toISOString()
                };
                s.step = 2;
                renderWizard(panel, cls);
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
                btn.disabled = false; btn.innerHTML = '⚡ توليد الورقة';
            }
        });
    }

    function step2(panel, cls) {
        const s = state[cls.id];
        const sh = s.sheet;

        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    <button class="btn btn-ghost btn-sm" id="back-list">← القائمة</button>
                </div>
                <h3 class="wizard-title">مراجعة وتعديل الورقة</h3>

                <div class="field">
                    <label class="label">العنوان</label>
                    <input class="input" id="ws-title" value="${escapeAttr(sh.title)}">
                </div>
                <div class="field">
                    <label class="label">التعليمات</label>
                    <textarea class="textarea" id="ws-inst" rows="2">${escapeHtml(sh.instructions)}</textarea>
                </div>

                <h4>التمارين (${sh.exercises.length})</h4>
                <div class="questions-list" id="ex-list">
                    ${sh.exercises.map((ex, i) => `
                        <article class="q-card">
                            <div class="q-header">
                                <span class="q-index">${i + 1}</span>
                                <button class="btn btn-ghost btn-sm" data-del="${i}">🗑️</button>
                            </div>
                            <textarea class="textarea" data-ex-text="${i}" rows="2">${escapeHtml(ex.text)}</textarea>
                        </article>
                    `).join('')}
                </div>
                <button class="btn btn-secondary btn-sm" id="add-ex" style="margin-top:var(--space-3);">+ تمرين</button>

                <div class="wizard-footer">
                    <button class="btn btn-secondary" id="ws-save">💾 حفظ</button>
                    <button class="btn btn-primary" id="ws-print">🖨️ حفظ وطباعة</button>
                </div>
            </div>
        `;

        panel.querySelector('#ws-title').addEventListener('input', (e) => { sh.title = e.target.value; });
        panel.querySelector('#ws-inst').addEventListener('input', (e) => { sh.instructions = e.target.value; });
        panel.querySelectorAll('[data-ex-text]').forEach((el) =>
            el.addEventListener('input', (e) => {
                sh.exercises[Number(el.dataset.exText)].text = e.target.value;
            }));
        panel.querySelectorAll('[data-del]').forEach((btn) =>
            btn.addEventListener('click', () => {
                if (!global.confirm('حذف هذا التمرين؟')) return;
                sh.exercises.splice(Number(btn.dataset.del), 1);
                step2(panel, cls);
            }));
        panel.querySelector('#add-ex').addEventListener('click', () => {
            sh.exercises.push({ id: 'ex_' + Date.now(), text: '', hint: '' });
            step2(panel, cls);
        });

        panel.querySelector('#back-list').addEventListener('click', async () => {
            delete state[cls.id];
            await render(panel, cls);
        });
        panel.querySelector('#ws-save').addEventListener('click', async () => {
            sh.updated_at = new Date().toISOString();
            sh.id = await global.TeacherDB.put('worksheets', sh);
            global.TeacherApp.toast('تم الحفظ ✅', 'success');
        });
        panel.querySelector('#ws-print').addEventListener('click', async () => {
            sh.updated_at = new Date().toISOString();
            sh.id = await global.TeacherDB.put('worksheets', sh);
            global.PrintWorksheet.print(sh, cls, await global.Auth.currentTeacher());
        });
    }

    global.ClassWorksheetsTab = { render };
})(window);
