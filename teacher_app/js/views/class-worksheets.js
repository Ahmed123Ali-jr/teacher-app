/* ==========================================================================
   views/class-worksheets.js — أوراق العمل، بنفس نمط الاختبارات.

   كانت الورقة تمارينَ نصّيةً حرّة لا أنواع لها، ولا تُنشأ إلا بتوليدٍ
   آلي. صارت أسئلةً كأسئلة الاختبار (اختيار من متعدد · صح وخطأ ·
   إكمال · مقالي) يكتبها المعلّم بنفسه في QuestionEditor نفسه، وتُطبع
   بمحرّك PDF نفسه. ولا توليد آلي في الشاشتين.

   والفارق الباقي عن الاختبار اثنان: لا درجات، ولها سطر تعليمات يكتبه
   المعلّم بنفسه. وما حُفظ بالنمط القديم (exercises) يُقرأ ويُحوَّل عند
   الفتح، فلا تضيع ورقةٌ سابقة.
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    const escapeAttr = escapeHtml;
    const QE = () => global.QuestionEditor;

    function countWord(n, one, two, few, many) {
        const ar = QE().arDigits;
        if (n === 1) return one;
        if (n === 2) return two;
        if (n <= 10) return ar(n) + ' ' + few;
        return ar(n) + ' ' + many;
    }
    const qWord = (n) => countWord(n, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً');

    const state = {};

    /* ==========================================================================
       القائمة
       ========================================================================== */

    /* والمعرّفاتُ نصٌّ لا رقم: صارت `uuid` يوم انتقلت القاعدةُ إلى
       Supabase، و`Number(uuid)` يعطي `NaN` — فكان الفتحُ والطباعةُ والحذفُ
       من القائمة يموت صامتاً بلا رسالةٍ ولا أثر. */
    async function render(panel, cls) {
        const sheets = (await global.TeacherDB.getAllByIndex('worksheets', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        /* زرُّ الإضافة أسفلَ القائمة لا فوقها (بطلب المعلّم)، وكان قبلها في الحالة الفارغة وحدَها: فمن أنشأ ورقةً لم يجد
           سبيلاً إلى ثانية. (بلاغُ المعلّم، ٢٠ أغسطس ٢٠٢٦.) */
        panel.innerHTML = `
            ${sheets.length === 0 ? empty() : `
                ${list(sheets)}
                <div class="ws-addbar">
                    <button class="btn btn-primary" id="btn-manual-sheet">+ ورقة عمل جديدة</button>
                </div>`}
        `;

        panel.querySelector('#btn-manual-sheet')?.addEventListener('click', () => startManual(cls, panel));
        panel.querySelectorAll('[data-empty-add]').forEach((b) =>
            b.addEventListener('click', () => startManual(cls, panel)));

        panel.querySelectorAll('[data-ws-open]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = await global.TeacherDB.get('worksheets', btn.dataset.wsOpen);
                if (!row) return;
                state[cls.id] = { cls, step: 2, sheet: normalize(row) };
                renderWizard(panel, cls);
            });
        });
        panel.querySelectorAll('[data-ws-print]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const row = await global.TeacherDB.get('worksheets', btn.dataset.wsPrint);
                if (!row) return;
                global.PrintWorksheet.savePdf(
                    { sheet: normalize(row), cls, teacher: await global.Auth.currentTeacher() });
            });
        });
        panel.querySelectorAll('[data-ws-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!global.confirm('حذف هذه الورقة؟')) return;
                await global.TeacherDB.remove('worksheets', btn.dataset.wsDelete);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    /** يضمن وجود questions مهما كان عمر الصفّ المحفوظ. */
    function normalize(row) {
        if (!row.questions || !row.questions.length) {
            row.questions = QE().fromExercises(row.exercises);
        }
        return row;
    }
    const countOf = (r) => (r.questions?.length || r.exercises?.length || 0);

    function empty() {
        return `
            <div class="empty-state">
                <p>اكتب أوراق العمل بنفسك، وتخرج الورقة بالتصميم الرسمي جاهزةً للطباعة.</p>
                <button class="btn btn-primary" data-empty-add>+ إضافة ورقة عمل</button>
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
                                ${qWord(countOf(r))} ·
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

    /* ==========================================================================
       الإنشاء
       ========================================================================== */

    /** إنشاء ورقة: محرّر الأسئلة مباشرةً بورقةٍ فارغة. */
    function startManual(cls, panel) {
        state[cls.id] = {
            cls, step: 2,
            sheet: {
                class_id: cls.id,
                title: 'ورقة عمل — ' + (cls.subject || ''),
                topic: '',
                instructions: '',
                questions: [],
                created_at: new Date().toISOString()
            }
        };
        renderWizard(panel, cls);
    }

    function renderWizard(panel, cls) {
        const s = state[cls.id];
        if (!s) return render(panel, cls);
        step2(panel, cls);
    }

    /* ---------- المحرّر ---------- */

    function step2(panel, cls) {
        const s = state[cls.id];
        const sh = s.sheet;

        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    <button class="btn btn-ghost btn-sm" id="back-list">← القائمة</button>
                </div>
                <h3 class="wizard-title">أسئلة ورقة العمل</h3>

                ${QE().editorHtml(sh.title, sh.questions, {
                    points: false, titleLabel: 'عنوان ورقة العمل'
                })}

                <div class="field" style="margin-top:var(--space-4);">
                    <label class="label">التعليمات (تُطبع أعلى الورقة)</label>
                    <textarea class="textarea" id="ws-inst" rows="2"
                              placeholder="مثلاً: أجب عن الأسئلة الآتية مستعيناً بكتابك.">${escapeHtml(sh.instructions || '')}</textarea>
                </div>

                <div class="wizard-footer">
                    <button class="btn btn-secondary" id="ws-save">💾 حفظ</button>
                    <button class="btn btn-primary" id="ws-print">🖨️ حفظ وطباعة</button>
                </div>
            </div>
        `;

        panel.querySelector('#ws-inst').addEventListener('input', (e) => { sh.instructions = e.target.value; });

        QE().bind(panel, sh.questions, {
            points: false,
            rerender: () => step2(panel, cls),
            onTitle: (v) => { sh.title = v; }
        });

        panel.querySelector('#back-list').addEventListener('click', async () => {
            if (sh.questions.length && !sh.id
                && !global.confirm('سيتم فقدان الأسئلة غير المحفوظة. متابعة؟')) return;
            delete state[cls.id];
            await render(panel, cls);
        });

        panel.querySelector('#ws-save').addEventListener('click', async (e) => {
            await guard(e.currentTarget, async () => {
                await save(sh);
                global.TeacherApp.toast('تم الحفظ ✅', 'success');
            });
        });

        panel.querySelector('#ws-print').addEventListener('click', async (e) => {
            const bad = QE().validate(sh.questions);
            if (bad) return global.TeacherApp.toast(bad, 'warning', 4000);
            await guard(e.currentTarget, async () => {
                await save(sh);
                await global.PrintWorksheet.savePdf(
                    { sheet: sh, cls, teacher: await global.Auth.currentTeacher() });
            });
        });

        /* تحميل محرّك PDF بالخلفية: إيماءة المستخدم في iOS تضيع لو
           انتظرت المكتبتين، فلا تفتح ورقة المشاركة. */
        global.PrintWorksheet.preloadPdfEngine().catch(() => {});
    }

    /* رفضٌ غير ملتقَط داخل مستمع نقرٍ يموت صامتاً، فيبدو الزرّ معطّلاً
       بلا سبب. انظر النظير في class-exams.js. */
    async function guard(btn, fn) {
        const label = btn ? btn.innerHTML : null;
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ لحظة…'; }
        try {
            await fn();
        } catch (err) {
            console.warn('[class-worksheets] action failed:', err);
            global.TeacherApp.toast(
                'تعذّر إتمام العملية: ' + ((err && err.message) || 'خطأ غير معروف'), 'error', 6000);
        } finally {
            if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
        }
    }

    async function save(sh) {
        sh.updated_at = new Date().toISOString();
        /* التمارين القديمة تُحذف بعد التحويل، فلا يبقى مصدران للحقيقة. */
        delete sh.exercises;
        sh.id = await global.TeacherDB.put('worksheets', sh);
        return sh;
    }

    global.ClassWorksheetsTab = { render };
})(window);
