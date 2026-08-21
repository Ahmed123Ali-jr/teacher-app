/* ==========================================================================
   views/class-exams.js — Exams tab with 4-step wizard (the star feature).
   ========================================================================== */

(function (global) {
    'use strict';

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }
    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    /* التصريف العربي يختلف بالعدد: «سؤالان» لا «٢ سؤال». */
    function countWord(n, one, two, few, many) {
        if (n === 1) return one;
        if (n === 2) return two;
        if (n <= 10) return arDigits(n) + ' ' + few;
        return arDigits(n) + ' ' + many;
    }
    const qWord = (n) => countWord(n, 'سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً');
    const mWord = (n) => countWord(n, 'درجة واحدة', 'درجتان', 'درجات', 'درجة');

    const TYPE_LABELS = {
        mcq: 'اختيار من متعدد',
        tf:  'صح/خطأ',
        fill: 'أكمل الفراغ',
        essay: 'مقالي',
        match: 'مطابقة'
    };

    const state = {}; // per-render working state (exam draft)

    /* ==========================================================================
       LIST
       ========================================================================== */

    async function render(panel, cls) {
        const exams = (await global.TeacherDB.getAllByIndex('exams', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        panel.innerHTML = `
            ${exams.length === 0 ? emptyState() : `
                ${listHtml(exams)}
                <div class="ws-addbar">
                    <button class="btn btn-primary" id="btn-manual-exam">+ اختبار جديد</button>
                </div>`}
        `;

        /* الإنشاء يدويّ بالكامل — لا توليد آلي. */
        panel.querySelector('#btn-manual-exam')?.addEventListener('click', () => startManual(cls, panel));
        panel.querySelectorAll('[data-empty-add]').forEach((b) =>
            b.addEventListener('click', () => startManual(cls, panel)));

        panel.querySelectorAll('[data-exam-open]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.examOpen;
                const exam = await global.TeacherDB.get('exams', id);
                if (exam) {
                    /* اختبارٌ محفوظ يُفتح على الأسئلة بلا مسوّدة خلفه —
                       فيسلك مسلك اليدوي، وإلّا قاد «رجوع» إلى خطوةٍ
                       تقرأ s.draft وهي غير موجودة. */
                    state[cls.id] = { cls, exam, step: 3 };
                    renderWizard(panel, cls);
                }
            });
        });

        panel.querySelectorAll('[data-exam-print]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.examPrint;
                const exam = await global.TeacherDB.get('exams', id);
                if (!exam) return;
                const teacher = await global.Auth.currentTeacher();
                global.PrintExam.savePdf({ exam, cls, teacher },
                    { includeAnswers: !!exam.settings?.include_answers });
            });
        });

        panel.querySelectorAll('[data-exam-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.examDelete;
                if (!global.confirm('حذف هذا الاختبار؟')) return;
                await global.TeacherDB.remove('exams', id);
                global.TeacherApp.toast('تم الحذف.', 'info');
                await render(panel, cls);
            });
        });
    }

    function emptyState() {
        return `
            <div class="empty-state">
                <p>اكتب أسئلتك بنفسك، وتخرج الورقة بالتصميم الرسمي جاهزةً للطباعة.</p>
                <button class="btn btn-primary" data-empty-add>+ اختبار جديد</button>
            </div>
        `;
    }

    function listHtml(exams) {
        return `
            <div class="grid grid-2">
                ${exams.map((e) => `
                    <div class="card exam-card">
                        <div>
                            <h4 style="margin:0 0 var(--space-1)">${escapeHtml(e.title)}</h4>
                            <div class="text-muted" style="font-size:var(--fs-sm);">
                                ${qWord(e.questions?.length || 0)} ·
                                ${formatShortDate(e.created_at)}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn btn-secondary btn-sm" data-exam-open="${e.id}">✏️ مراجعة</button>
                            <button class="btn btn-ghost btn-sm" data-exam-print="${e.id}">🖨️</button>
                            <button class="btn btn-ghost btn-sm" data-exam-delete="${e.id}">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function formatShortDate(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                day: 'numeric', month: 'short', year: 'numeric'
            }).format(new Date(iso));
        } catch { return iso; }
    }

    /* ==========================================================================
       WIZARD
       ========================================================================== */

    /** إنشاء اختبار: يبدأ من محرّر الأسئلة مباشرةً بورقةٍ فارغة. */
    function startManual(cls, panel) {
        state[cls.id] = {
            cls,
            step: 3,
            exam: {
                class_id: cls.id,
                title: 'اختبار ' + (cls.subject || '') ,
                source_type: 'manual',
                source_details: '',
                questions: [],
                settings: {
                    include_school: true, include_teacher: true,
                    include_date: false, include_name: true,
                    include_grade: true, include_instructions: true,
                    include_answers: false
                },
                created_at: new Date().toISOString()
            }
        };
        renderWizard(panel, cls);
    }

    function renderWizard(panel, cls) {
        const s = state[cls.id];
        if (!s) return render(panel, cls);

        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    ${stepDots(s.step)}
                </div>
                <div id="wiz-body"></div>
            </div>
        `;

        const body = panel.querySelector('#wiz-body');
        if (s.step === 4) step4(body, cls);
        else step3(body, cls);
    }

    function stepDots(current) {
        const steps = [{ n: 3, label: 'الأسئلة' }, { n: 4, label: 'الطباعة' }];
        return `
            <div class="wizard-steps">
                ${steps.map((st, i) => `
                    <div class="wiz-step ${st.n === current ? 'active' : ''} ${st.n < current ? 'done' : ''}">
                        <div class="wiz-step-dot">${arDigits(i + 1)}</div>
                        <div class="wiz-step-label">${st.label}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function step3(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;
        if (!exam) { s.step = 1; return renderWizard(body.closest('#tab-panel'), cls); }

        body.innerHTML = `
            <h3 class="wizard-title">الخطوة ١ من ٢: أسئلة الاختبار</h3>

            ${global.QuestionEditor.editorHtml(exam.title, exam.questions, {
                points: true
            })}

            <div class="wizard-footer">
                <button class="btn btn-secondary" id="btn-save">💾 حفظ</button>
                <button class="btn btn-primary" id="btn-to-print">الطباعة ←</button>
            </div>
        `;

        bindQuestions(body, cls);

        /* لا زرَّ رجوعٍ في هذه الشاشة: سهمُ الشريط العلوي يخرج بها، وهو
           مكانٌ واحدٌ للرجوع في التطبيق كلِّه. */
        body.querySelector('#btn-save').addEventListener('click', async (e) => {
            await guard(e.currentTarget, async () => {
                await saveExam(exam);
                global.TeacherApp.toast('تم الحفظ ✅', 'success');
            });
        });
        body.querySelector('#btn-to-print').addEventListener('click', async (e) => {
            const bad = global.QuestionEditor.validate(exam.questions);
            if (bad) return global.TeacherApp.toast(bad, 'warning', 4000);
            await guard(e.currentTarget, async () => {
                await saveExam(exam);
                s.step = 4;
                renderWizard(body.closest('#tab-panel'), cls);
            });
        });
    }

    /* أيّ رفضٍ داخل مستمع نقرٍ لا يُلتقط يموت صامتاً: لا رسالة ولا
       أثر، والزرّ يبدو كأنه لا يعمل. وهذا بالضبط ما يشتكي منه المعلّم
       حين يقول «ما يضغط». فليُعطَّل الزرّ أثناء العمل، ولتظهر الرسالة
       إن سقط — الصمت أسوأ من الخطأ. */
    async function guard(btn, fn) {
        const label = btn ? btn.innerHTML : null;
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ لحظة…'; }
        try {
            await fn();
        } catch (err) {
            console.warn('[class-exams] action failed:', err);
            global.TeacherApp.toast(
                'تعذّر إتمام العملية: ' + ((err && err.message) || 'خطأ غير معروف'), 'error', 6000);
        } finally {
            if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
        }
    }

    async function saveExam(exam) {
        exam.updated_at = new Date().toISOString();
        const id = await global.TeacherDB.put('exams', exam);
        exam.id = id;
        return exam;
    }

    /* المحرّر مشترك مع أوراق العمل في QuestionEditor. */
    function bindQuestions(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;

        global.QuestionEditor.bind(body, exam.questions, {
            points: true,
            rerender: () => step3(body, cls),
            onTitle: (v) => { exam.title = v; }
        });

    }

    /* ---------- Step 4: print options ---------- */

    function step4(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;
        const settings = exam.settings;

        body.innerHTML = `
            <h3 class="wizard-title">الخطوة ٢ من ٢: خيارات الطباعة</h3>

            <div class="card" style="margin-bottom: var(--space-4);">
                <div class="checkbox-list">
                    ${checkbox('include_school',       'ترويسة المدرسة', settings.include_school)}
                    ${checkbox('include_teacher',      'اسم المعلم', settings.include_teacher)}
                    ${checkbox('include_date',         'التاريخ', settings.include_date)}
                    ${checkbox('include_name',         'خانة اسم الطالب', settings.include_name)}
                    ${checkbox('include_grade',        'الدرجة الكلية', settings.include_grade)}
                    ${checkbox('include_instructions', 'تعليمات الاختبار', settings.include_instructions)}
                    ${checkbox('include_answers',      'طباعة نموذج الإجابة (صفحة منفصلة)', settings.include_answers)}
                </div>
            </div>

            <div class="wizard-footer">
                <button class="btn btn-ghost" id="btn-back">← رجوع للأسئلة</button>
                <button class="btn btn-primary" id="btn-print">🖨️ معاينة وطباعة</button>
            </div>
        `;

        body.querySelectorAll('.checkbox-list input').forEach((cb) => {
            cb.addEventListener('change', () => { settings[cb.name] = cb.checked; });
        });

        body.querySelector('#btn-back').addEventListener('click', () => {
            s.step = 3;
            renderWizard(body.closest('#tab-panel'), cls);
        });
        body.querySelector('#btn-print').addEventListener('click', async (e) => {
            await guard(e.currentTarget, async () => {
                await saveExam(exam);
                const teacher = await global.Auth.currentTeacher();
                await global.PrintExam.savePdf({ exam, cls, teacher },
                    { includeAnswers: !!settings.include_answers });
            });
        });

        /* تحميل محرّك PDF فور فتح الخطوة، لا عند الضغط: إيماءة المستخدم
           في iOS تضيع لو انتظرت تحميل المكتبتين، فلا تفتح ورقة المشاركة. */
        global.PrintExam.preloadPdfEngine().catch(() => {});
    }

    function checkbox(name, label, checked) {
        return `
            <label class="cb-row">
                <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
                <span>${label}</span>
            </label>
        `;
    }

    global.ClassExamsTab = { render };
})(window);
