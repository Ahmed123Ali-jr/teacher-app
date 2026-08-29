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
    const pWord = (n) => countWord(n, 'فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة');
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
        panel.classList.remove('has-qe-dock');
        const exams = (await global.TeacherDB.getAllByIndex('exams', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        /* الحالةُ الفارغة تأخذ نمطَ «و» في الرئيسية كما أخذته الكتب:
           لافتةٌ تقول ما ينقص، وفراغٌ، وزرٌّ عريضٌ في متناول الإبهام.
           و`is-empty-tab` هي التي تجعل اللوحةَ عموداً مرناً يملأ الشاشة. */
        panel.classList.toggle('is-empty-tab', exams.length === 0);

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
            <div class="start-note">
                <b>لا اختبارات بعد</b>
                <span>اكتب أسئلتك، وتخرج الورقة بالتصميم الرسمي جاهزةً للطباعة</span>
            </div>
            <div class="start-gap"></div>
            <button type="button" class="start-cta" data-empty-add>+ اختبار جديد</button>
        `;
    }


    /* أيقونتان مرسومتان لا رمزين تعبيريّين: الرمزُ يأخذ لونَ خطِّ النظام
       الملوّن فلا يتبع لونَ الزرّ، والمرسومةُ تتبع `currentColor`.
       (النظيرُ في question-editor.js.) */
    const SVG = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    const ICON_EDIT  = SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
    const ICON_TRASH = SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');

    /* أمُّ القرى صريحةً لا `ar-SA` المجرّدة: تلك تتبع تقويم الجهاز فتُخرج
       ميلاديّاً على متصفّحٍ وهجريّاً على آخر — والمدرسةُ هجريّة.
       (النظيرُ في academic-calendar.js.) */
    function shortHijri(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
                { day: 'numeric', month: 'long' }).format(new Date(iso));
        } catch (e) { return ''; }
    }

    /* الشكلُ «ب»: صفٌّ كصفِّ الطالب. والنصُّ نفسُه يفتح كزرِّ التعديل،
       فالإصبعُ تبلغ أيَّهما سبق. والفاصلُ شرطةٌ لا نقطة: النقطةُ بين
       الأرقام العربية تُقرأ صفراً. */
    function listHtml(exams) {
        return exams.map((e, i) => `
            <div class="st-card doc-row">
                <div class="stc-av num">${arDigits(i + 1)}</div>
                <div class="doc-tx" data-exam-open="${e.id}">
                    <span class="doc-tt">${escapeHtml(e.title)}</span>
                    <span class="doc-ss">${pWord(e.questions?.length || 0)}
                        — ${shortHijri(e.created_at)}</span>
                </div>
                <div class="doc-acts">
                    <button type="button" class="doc-ib p" data-exam-print="${e.id}">طباعة</button>
                    <button type="button" class="doc-ib" data-exam-open="${e.id}"
                            title="تعديل" aria-label="تعديل">${ICON_EDIT}</button>
                    <button type="button" class="doc-ib" data-exam-delete="${e.id}"
                            title="حذف" aria-label="حذف">${ICON_TRASH}</button>
                </div>
            </div>
        `).join('');
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
        /* المحرّرُ ليس حالةً فارغة: لولا نزعُها لبقيت اللوحةُ عموداً مرناً
           بارتفاعٍ أدنى، فتتمدّد تحت الأسئلة. */
        panel.classList.remove('has-qe-dock', 'is-empty-tab');

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

        /* لا عنوانَ للشاشة: نقاطُ الخطوات فوقها تقول «الأسئلة» فيكفي.
           والأفعالُ في شريطٍ ثابتٍ أسفل الشاشة كورقة العمل — الاختبارُ
           يطول بالفقرات، فلا يُطلب من المعلّم أن ينزل إلى آخره ليحفظ. */
        body.closest('#tab-panel')?.classList.add('has-qe-dock');
        body.innerHTML = `
            ${global.QuestionEditor.editorHtml(exam.title, exam.questions, {
                points: true,
                /* مادّةٌ إنجليزيّةٌ ← حقولُ الكتابة من اليسار. */
                ltr: /إنجليزي|انجليزي|english/i.test(String(cls.subject || ''))
            })}

            <div class="qe-dock">
                ${global.QuestionEditor.addBtnHtml()}
                <div class="wizard-footer">
                    <button class="btn btn-secondary" id="btn-save">حفظ</button>
                    <button class="btn btn-primary" id="btn-to-print">الطباعة ←</button>
                </div>
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
                    ${dateFieldHtml(settings)}
                    ${checkbox('include_name',         'خانة اسم الطالب', settings.include_name)}
                    ${checkbox('include_grade',        'الدرجة الكلية', settings.include_grade)}
                    ${checkbox('include_instructions', 'تعليمات الاختبار', settings.include_instructions)}
                    ${checkbox('include_answers',      'طباعة نموذج الإجابة (صفحة منفصلة)', settings.include_answers)}
                    ${/* الورقةُ تتبع مادّةَ الفصل بلا سؤال — والترويسةُ وحدَها
                          خيار، لأنّ عُرفَ المدارس فيها يختلف. ولا يظهر إلّا
                          لمن مادّتُه إنجليزيّة، فلا يُربك غيرَه. */
                      /إنجليزي|انجليزي|english/i.test(String(cls.subject || ''))
                        ? checkbox('header_ar', 'ترويسة المدرسة بالعربية (الورقة إنجليزية)', settings.header_ar)
                        : ''}
                </div>
            </div>

            <div class="wizard-footer">
                <button class="btn btn-ghost" id="btn-back">← رجوع للأسئلة</button>
                <button class="btn btn-primary" id="btn-print">🖨️ معاينة وطباعة</button>
            </div>
        `;

        body.querySelectorAll('.checkbox-list input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                settings[cb.name] = cb.checked;
                if (cb.name === 'include_date') step4(body, cls);
            });
        });
        bindDateField(body, settings);

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

    /* ---------- التاريخ: يكتبه المعلّم ---------- */

    /* كان التطبيق يطبع تاريخ اليوم بلا سؤال، والاختبارُ يُعدُّ قبل موعده
       بأيّام — فتخرج الورقةُ بتاريخٍ خاطئ. (بلاغُ المعلّم، ٢٢ أغسطس
       ٢٠٢٦: «المفروض المعلم يحط التاريخ بيده».)

       فصار حقلاً نصّياً لا مُنتقيَ تقويم: المدارسُ تكتب بالهجريّ،
       و`input[type=date]` ميلاديٌّ لا يُبدَّل. وزرُّ «اليوم» يملؤه
       بضغطةٍ لمن أراد. وإن تُرك فارغاً خرجت على الورق نقاطٌ يكتب عليها
       بالقلم — وهو ما يفعله كثيرٌ من المعلّمين أصلاً. */
    function dateFieldHtml(settings) {
        if (!settings.include_date) return '';
        return `
            <div class="cb-sub">
                <input class="input" id="exam-date" inputmode="text"
                       value="${escapeAttr(settings.exam_date || '')}"
                       placeholder="اكتب التاريخ… أو اتركه فراغاً ليُكتب بالقلم">
                <button type="button" class="btn btn-secondary btn-sm" id="exam-date-today">اليوم</button>
            </div>`;
    }

    /* أمُّ القرى صريحةً لا `toLocaleDateString('ar-SA')`: تلك تتبع تقويم
       الجهاز فتُخرج ميلاديّاً على بعض المتصفّحات وهجريّاً على غيرها —
       والمدرسةُ تكتب بالهجريّ دائماً. (والنمطُ نفسُه في
       academic-calendar.js.) */
    function todayHijri() {
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
                { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
        } catch (e) {
            return new Date().toLocaleDateString('ar-SA');
        }
    }

    function bindDateField(body, settings) {
        const inp = body.querySelector('#exam-date');
        if (!inp) return;
        inp.addEventListener('input', () => { settings.exam_date = inp.value; });
        body.querySelector('#exam-date-today').addEventListener('click', () => {
            inp.value = todayHijri();
            settings.exam_date = inp.value;
            inp.focus();
        });
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
