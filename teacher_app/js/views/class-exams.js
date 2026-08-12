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

    /* دالّةٌ لا نصّ: البطاقة تمرّر ترتيب السؤال، فيُبنى الزرّ بمعرّفه. */
    const regenBtn = (i) =>
        `<button class="btn btn-ghost btn-sm" data-q-regen="${i}" title="إعادة توليد">🔄</button>`;

    /* ==========================================================================
       LIST
       ========================================================================== */

    async function render(panel, cls) {
        const exams = (await global.TeacherDB.getAllByIndex('exams', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        panel.innerHTML = `
            <div class="section-header">
                <h3 class="section-title">📝 اختبارات الفصل</h3>
                <div class="flex gap-2">
                    <button class="btn btn-ghost btn-sm" id="btn-gen-exam">⚡ توليد</button>
                    <button class="btn btn-primary" id="btn-manual-exam">+ اختبار جديد</button>
                </div>
            </div>

            ${exams.length === 0 ? emptyState() : listHtml(exams)}
        `;

        /* البابان: الكتابة بنفسه هي الأصل، والتوليد بابٌ ثانٍ. كان
           المحرّر اليدوي محبوساً خلف التوليد — لا يبلغه المعلّم إلا بعد
           المرور به، وهو ما لا يريده من لا يريد الذكاء الاصطناعي. */
        panel.querySelector('#btn-manual-exam')?.addEventListener('click', () => startManual(cls, panel));
        panel.querySelectorAll('[data-empty-add]').forEach((b) =>
            b.addEventListener('click', () => startManual(cls, panel)));
        panel.querySelector('#btn-gen-exam')?.addEventListener('click', () => startWizard(cls, panel));

        panel.querySelectorAll('[data-exam-open]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.examOpen;
                const exam = await global.TeacherDB.get('exams', id);
                if (exam) {
                    /* اختبارٌ محفوظ يُفتح على الأسئلة بلا مسوّدة خلفه —
                       فيسلك مسلك اليدوي، وإلّا قاد «رجوع» إلى خطوةٍ
                       تقرأ s.draft وهي غير موجودة. */
                    state[cls.id] = { cls, exam, step: 3, manual: true };
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
                const id = Number(btn.dataset.examDelete);
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
                <div class="icon">📝</div>
                <h3>لم تنشئ أي اختبار بعد</h3>
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

    /** الإنشاء اليدوي: يبدأ من محرّر الأسئلة مباشرةً بورقةٍ فارغة. */
    function startManual(cls, panel) {
        state[cls.id] = {
            cls,
            step: 3,
            manual: true,
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

    async function startWizard(cls, panel) {
        const books = await global.TeacherDB.getAllByIndex('books', 'class_id', cls.id);
        const bookWithContext = books.find((b) => b.context && b.context.length > 50);

        state[cls.id] = {
            cls,
            step: 1,
            draft: {
                source: bookWithContext ? 'book' : 'general',
                book_id: bookWithContext?.id || null,
                pageRange: '',
                topic: '',
                context: bookWithContext?.context || '',
                types: ['mcq'],
                count: 10,
                difficulty: 'medium',
                notes: ''
            },
            exam: null,
            books
        };
        renderWizard(panel, cls);
    }

    function renderWizard(panel, cls) {
        const s = state[cls.id];
        if (!s) return render(panel, cls);

        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    <button class="btn btn-ghost btn-sm" id="wiz-back-list">← قائمة الاختبارات</button>
                    ${stepDots(s.step, s.manual)}
                </div>
                <div id="wiz-body"></div>
            </div>
        `;

        panel.querySelector('#wiz-back-list').addEventListener('click', async () => {
            if (s.step === 3 && !s.exam?.id &&
                !global.confirm('سيتم فقدان الأسئلة غير المحفوظة. متابعة؟')) return;
            delete state[cls.id];
            await render(panel, cls);
        });

        const body = panel.querySelector('#wiz-body');
        if (s.step === 1) step1(body, cls);
        else if (s.step === 2) step2(body, cls);
        else if (s.step === 3) step3(body, cls);
        else if (s.step === 4) step4(body, cls);
    }

    function stepDots(current, manual) {
        /* المسار اليدوي خطوتان لا أربع: خطوتا المصدر والتفاصيل للتوليد
           وحده، وعرضهما مطفأتين يوهم المعلّم أنه تخطّى شيئاً. */
        const steps = manual
            ? [{ n: 3, label: 'الأسئلة' }, { n: 4, label: 'الطباعة' }]
            : [
                { n: 1, label: 'المصدر' },
                { n: 2, label: 'التفاصيل' },
                { n: 3, label: 'المراجعة' },
                { n: 4, label: 'الطباعة' }
            ];
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

    /* ---------- Step 1: source ---------- */

    function step1(body, cls) {
        const s = state[cls.id];
        const d = s.draft;

        body.innerHTML = `
            <h3 class="wizard-title">الخطوة ١ من ٤: اختيار مصدر الأسئلة</h3>
            <p class="text-muted" style="margin-bottom: var(--space-5);">
                من أين تريد توليد الأسئلة؟
            </p>

            <div class="source-options">
                <label class="source-option ${d.source === 'book' ? 'active' : ''}">
                    <input type="radio" name="source" value="book" ${d.source === 'book' ? 'checked' : ''}>
                    <div>
                        <div class="source-title">📖 من كتاب الطالب</div>
                        <div class="source-desc">استخرج الأسئلة من النص المحفوظ في تبويب "الكتب" لهذا الفصل.</div>
                    </div>
                </label>

                <label class="source-option ${d.source === 'general' ? 'active' : ''}">
                    <input type="radio" name="source" value="general" ${d.source === 'general' ? 'checked' : ''}>
                    <div>
                        <div class="source-title">🧠 من معرفة عامة</div>
                        <div class="source-desc">بدون الاعتماد على كتاب — أسئلة عامة في الموضوع الذي تختاره.</div>
                    </div>
                </label>
            </div>

            <div id="source-details" style="margin-top: var(--space-5);"></div>

            <div class="wizard-footer">
                <button class="btn btn-ghost" id="btn-cancel">إلغاء</button>
                <button class="btn btn-primary" id="btn-next">التالي ←</button>
            </div>
        `;

        const detailsEl = body.querySelector('#source-details');
        function repaintDetails() {
            if (d.source === 'book') {
                if (s.books.length === 0) {
                    detailsEl.innerHTML = `
                        <div class="callout callout-warn">
                            ⚠️ لا توجد كتب في هذا الفصل. ارفع كتاباً من تبويب "الكتب" أو الصق النص هنا.
                            <div class="field" style="margin-top: var(--space-3);">
                                <label class="label">نص من الكتاب (الفصل / الدرس)</label>
                                <textarea class="textarea" id="ctx-text" rows="6"
                                          placeholder="ألصق هنا نص الدرس...">${escapeHtml(d.context)}</textarea>
                            </div>
                        </div>
                    `;
                    detailsEl.querySelector('#ctx-text').addEventListener('input', (e) => { d.context = e.target.value; });
                } else {
                    detailsEl.innerHTML = `
                        <div class="field">
                            <label class="label">اختر الكتاب</label>
                            <select class="select" id="book-sel">
                                ${s.books.map((b) => `
                                    <option value="${b.id}" ${d.book_id === b.id ? 'selected' : ''}>
                                        ${escapeHtml(b.title)} ${b.context ? '✓ (به سياق)' : '(بلا سياق)'}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label class="label">النص المستخدم (يمكن تعديله)</label>
                            <textarea class="textarea" id="ctx-text" rows="6"
                                      placeholder="نص من الكتاب...">${escapeHtml(d.context)}</textarea>
                            <div class="field-hint">هذا هو النص الذي سيستند إليه الذكاء الاصطناعي.</div>
                        </div>
                        <div class="field">
                            <label class="label">الصفحات (اختياري)</label>
                            <input class="input" id="pages" type="text" placeholder="45 - 60"
                                   value="${escapeAttr(d.pageRange)}">
                        </div>
                    `;
                    const bookSel = detailsEl.querySelector('#book-sel');
                    const ctxText = detailsEl.querySelector('#ctx-text');
                    bookSel.addEventListener('change', () => {
                        d.book_id = Number(bookSel.value);
                        const book = s.books.find((b) => b.id === d.book_id);
                        d.context = book?.context || '';
                        ctxText.value = d.context;
                    });
                    ctxText.addEventListener('input', (e) => { d.context = e.target.value; });
                    detailsEl.querySelector('#pages').addEventListener('input', (e) => { d.pageRange = e.target.value; });
                }
            } else {
                detailsEl.innerHTML = `
                    <div class="field">
                        <label class="label">الموضوع أو الدرس *</label>
                        <input class="input" id="topic" type="text" required
                               placeholder="مثال: جمع الأعداد بالحمل"
                               value="${escapeAttr(d.topic)}">
                    </div>
                `;
                detailsEl.querySelector('#topic').addEventListener('input', (e) => { d.topic = e.target.value; });
            }
        }
        repaintDetails();

        body.querySelectorAll('input[name="source"]').forEach((r) =>
            r.addEventListener('change', () => {
                d.source = r.value;
                body.querySelectorAll('.source-option').forEach((o) => o.classList.toggle('active', o.contains(r) && r.checked));
                repaintDetails();
            }));

        body.querySelector('#btn-cancel').addEventListener('click', () => {
            delete state[cls.id];
            render(body.closest('#tab-panel'), cls);
        });
        body.querySelector('#btn-next').addEventListener('click', () => {
            if (d.source === 'general' && !d.topic.trim()) {
                return global.TeacherApp.toast('أدخل الموضوع.', 'warning');
            }
            if (d.source === 'book' && !d.context.trim()) {
                return global.TeacherApp.toast('أضف نصاً من الكتاب أو اختر "معرفة عامة".', 'warning');
            }
            s.step = 2;
            renderWizard(body.closest('#tab-panel'), cls);
        });
    }

    /* ---------- Step 2: details ---------- */

    function step2(body, cls) {
        const s = state[cls.id];
        const d = s.draft;

        body.innerHTML = `
            <h3 class="wizard-title">الخطوة ٢ من ٤: تفاصيل الاختبار</h3>

            <div class="field">
                <label class="label">أنواع الأسئلة (اختر واحداً أو أكثر) *</label>
                <div class="types-grid">
                    ${Object.entries(TYPE_LABELS).map(([k, v]) => `
                        <label class="type-chip">
                            <input type="checkbox" value="${k}" ${d.types.includes(k) ? 'checked' : ''}>
                            <span>${v}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <div class="grid grid-2">
                <div class="field">
                    <label class="label">عدد الأسئلة</label>
                    <select class="select" id="q-count">
                        ${[5, 10, 15, 20, 25].map((n) =>
                            `<option value="${n}" ${d.count === n ? 'selected' : ''}>${n} سؤال</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="field">
                    <label class="label">مستوى الصعوبة</label>
                    <select class="select" id="q-diff">
                        <option value="easy"   ${d.difficulty === 'easy'   ? 'selected' : ''}>سهل</option>
                        <option value="medium" ${d.difficulty === 'medium' ? 'selected' : ''}>متوسط</option>
                        <option value="hard"   ${d.difficulty === 'hard'   ? 'selected' : ''}>صعب</option>
                        <option value="mixed"  ${d.difficulty === 'mixed'  ? 'selected' : ''}>متنوع</option>
                    </select>
                </div>
            </div>

            <div class="field">
                <label class="label">ملاحظات خاصة للذكاء الاصطناعي (اختياري)</label>
                <textarea class="textarea" id="q-notes" rows="3"
                          placeholder="مثلاً: ركّز على التطبيق العملي، أو تجنّب الأسئلة الحسابية الطويلة...">${escapeHtml(d.notes)}</textarea>
            </div>

            <div class="card" style="background: rgba(15,44,92,0.05); margin-top: var(--space-4); padding: var(--space-3);">
                <div style="font-size: var(--fs-sm); color: var(--text-muted); margin-bottom: 2px;">المادة التي سيُولّد الاختبار لها:</div>
                <div style="font-weight: var(--fw-bold); color: var(--primary); font-size: var(--fs-lg);">
                    📚 ${escapeHtml(cls.subject)} — ${escapeHtml(cls.grade)} / ${escapeHtml(cls.section)}
                </div>
                ${d.source === 'book' && !d.context.trim()
                    ? '<div style="color:#B45309; font-size: var(--fs-sm); margin-top: var(--space-2);">⚠️ خانة "السياق النصي" فاضية — الذكاء الاصطناعي سيعتمد على المنهج العام للمادة.</div>'
                    : ''}
            </div>

            <div class="wizard-footer">
                <button class="btn btn-ghost" id="btn-back">← رجوع</button>
                <button class="btn btn-primary" id="btn-generate">⚡ توليد الاختبار</button>
            </div>
        `;

        body.querySelectorAll('.type-chip input').forEach((cb) => {
            cb.addEventListener('change', () => {
                d.types = [...body.querySelectorAll('.type-chip input:checked')].map((i) => i.value);
            });
        });
        body.querySelector('#q-count').addEventListener('change', (e) => { d.count = Number(e.target.value); });
        body.querySelector('#q-diff').addEventListener('change',  (e) => { d.difficulty = e.target.value; });
        body.querySelector('#q-notes').addEventListener('input',  (e) => { d.notes = e.target.value; });

        body.querySelector('#btn-back').addEventListener('click', () => {
            s.step = 1;
            renderWizard(body.closest('#tab-panel'), cls);
        });
        body.querySelector('#btn-generate').addEventListener('click', async () => {
            if (d.types.length === 0) return global.TeacherApp.toast('اختر نوع سؤال واحد على الأقل.', 'warning');
            const btn = body.querySelector('#btn-generate');
            btn.disabled = true;
            btn.innerHTML = '⏳ جارٍ القراءة والتوليد...';
            try {
                const result = await global.AI.generateExam({
                    subject: cls.subject,
                    grade:   `${cls.grade} / ${cls.section}`,
                    topic:   d.topic || d.context.slice(0, 120),
                    source:  d.source,
                    context: d.context,
                    pageRange: d.pageRange,
                    types: d.types,
                    count: d.count,
                    difficulty: d.difficulty,
                    notes: d.notes
                });
                s.exam = {
                    class_id: cls.id,
                    title: 'اختبار ' + (d.topic || cls.subject) + ' — ' + new Date().toLocaleDateString('ar-SA'),
                    source_type: d.source,
                    source_details: d.pageRange || d.topic || '',
                    questions: result.questions,
                    settings: {
                        types: d.types, count: d.count, difficulty: d.difficulty,
                        include_school: true, include_teacher: true,
                        include_date: true, include_name: true,
                        include_grade: true, include_instructions: true,
                        include_answers: false
                    },
                    created_at: new Date().toISOString()
                };
                s.step = 3;
                renderWizard(body.closest('#tab-panel'), cls);
            } catch (err) {
                global.TeacherApp.toast('فشل التوليد: ' + err.message, 'error', 5000);
                btn.disabled = false;
                btn.innerHTML = '⚡ توليد الاختبار';
            }
        });
    }

    /* ---------- Step 3: review ---------- */

    function step3(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;
        if (!exam) { s.step = 1; return renderWizard(body.closest('#tab-panel'), cls); }

        body.innerHTML = `
            <h3 class="wizard-title">${s.manual
                ? 'الخطوة ١ من ٢: أسئلة الاختبار'
                : 'الخطوة ٣ من ٤: المراجعة والتعديل'}</h3>

            ${global.QuestionEditor.editorHtml(exam.title, exam.questions, {
                points: true,
                actions: s.manual ? null : regenBtn
            })}

            <div class="wizard-footer">
                <button class="btn btn-ghost" id="btn-back">← رجوع</button>
                <button class="btn btn-secondary" id="btn-save">💾 حفظ</button>
                <button class="btn btn-primary" id="btn-to-print">الطباعة ←</button>
            </div>
        `;

        bindQuestions(body, cls);

        body.querySelector('#btn-back').addEventListener('click', async () => {
            /* في المسار اليدوي ليس خلف هذه الخطوة خطوة — الرجوع خروجٌ
               إلى القائمة، وما لم يُحفظ يُنبَّه عليه. */
            if (s.manual) {
                const dirty = exam.questions.length && !exam.id;
                if (dirty && !global.confirm('سيتم فقدان الأسئلة غير المحفوظة. متابعة؟')) return;
                const panel = body.closest('#tab-panel');
                delete state[cls.id];
                return render(panel, cls);
            }
            if (!global.confirm('الرجوع سيُبقي الأسئلة. متابعة؟')) return;
            s.step = 2;
            renderWizard(body.closest('#tab-panel'), cls);
        });
        body.querySelector('#btn-save').addEventListener('click', async () => {
            await saveExam(exam);
            global.TeacherApp.toast('تم الحفظ ✅', 'success');
        });
        body.querySelector('#btn-to-print').addEventListener('click', async () => {
            const bad = global.QuestionEditor.validate(exam.questions);
            if (bad) return global.TeacherApp.toast(bad, 'warning', 4000);
            await saveExam(exam);
            s.step = 4;
            renderWizard(body.closest('#tab-panel'), cls);
        });
    }

    async function saveExam(exam) {
        exam.updated_at = new Date().toISOString();
        const id = await global.TeacherDB.put('exams', exam);
        exam.id = id;
        return exam;
    }

    /* المحرّر مشترك مع أوراق العمل في QuestionEditor — ولا يبقى هنا
       إلا «إعادة التوليد»، فهو وحده المرتبط بالذكاء الاصطناعي. */
    function bindQuestions(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;

        global.QuestionEditor.bind(body, exam.questions, {
            points: true,
            rerender: () => step3(body, cls),
            onTitle: (v) => { exam.title = v; }
        });

        body.querySelectorAll('[data-q-regen]').forEach((btn) =>
            btn.addEventListener('click', async () => {
                const i = Number(btn.dataset.qRegen);
                btn.disabled = true; btn.innerHTML = '⏳';
                try {
                    const d = s.draft;
                    const newQ = await global.AI.regenerateQuestion({
                        subject: cls.subject,
                        grade: `${cls.grade} / ${cls.section}`,
                        topic: d.topic || d.context.slice(0, 120),
                        source: d.source, context: d.context,
                        types: [exam.questions[i].type],
                        count: 1, difficulty: d.difficulty, notes: d.notes
                    }, i, exam.questions.filter((_, j) => j !== i));
                    exam.questions[i] = newQ;
                    step3(body, cls);
                    global.TeacherApp.toast('تم توليد سؤال بديل.', 'success');
                } catch (err) {
                    global.TeacherApp.toast(err.message, 'error');
                    btn.disabled = false; btn.innerHTML = '🔄';
                }
            }));
    }

    /* ---------- Step 4: print options ---------- */

    function step4(body, cls) {
        const s = state[cls.id];
        const exam = s.exam;
        const settings = exam.settings;

        body.innerHTML = `
            <h3 class="wizard-title">${s.manual ? 'الخطوة ٢ من ٢' : 'الخطوة ٤ من ٤'}: خيارات الطباعة</h3>

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
                <button class="btn btn-ghost" id="btn-back">← رجوع ${s.manual ? 'للأسئلة' : 'للمراجعة'}</button>
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
        body.querySelector('#btn-print').addEventListener('click', async () => {
            await saveExam(exam);
            const teacher = await global.Auth.currentTeacher();
            global.PrintExam.savePdf({ exam, cls, teacher },
                { includeAnswers: !!settings.include_answers });
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
