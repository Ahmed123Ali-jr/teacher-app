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
    const pWord = (n) => countWord(n, 'فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة');

    const state = {};

    /* ==========================================================================
       القائمة
       ========================================================================== */

    /* والمعرّفاتُ نصٌّ لا رقم: صارت `uuid` يوم انتقلت القاعدةُ إلى
       Supabase، و`Number(uuid)` يعطي `NaN` — فكان الفتحُ والطباعةُ والحذفُ
       من القائمة يموت صامتاً بلا رسالةٍ ولا أثر. */
    async function render(panel, cls) {
        panel.classList.remove('has-qe-dock');
        const sheets = (await global.TeacherDB.getAllByIndex('worksheets', 'class_id', cls.id))
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        /* الحالةُ الفارغة بنمط الكتب — انظر النظير في class-exams.js. */
        panel.classList.toggle('is-empty-tab', sheets.length === 0);

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
                if (!(await global.TeacherApp.confirm({ title: 'حذف هذه الورقة؟', ok: 'حذف', danger: true }))) return;
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
            <div class="start-note">
                <b>لا أوراق عمل بعد</b>
                <span>اكتب الورقة بنفسك، وتخرج بالتصميم الرسمي جاهزةً للطباعة</span>
            </div>
            <div class="start-gap"></div>
            <button type="button" class="start-cta" data-empty-add>+ ورقة عمل جديدة</button>
        `;
    }


    /* أيقونتان مرسومتان لا رمزين تعبيريّين — النظيرُ في class-exams.js. */
    const SVG = (d) => '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    const ICON_EDIT  = SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
    const ICON_TRASH = SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');

    /* أمُّ القرى صريحةً — النظيرُ في class-exams.js. */
    function shortHijri(iso) {
        if (!iso) return '';
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
                { day: 'numeric', month: 'long' }).format(new Date(iso));
        } catch (e) { return ''; }
    }

    /* الشكلُ «ب» — النظيرُ في class-exams.js، وشرحُه هناك. */
    function list(rows) {
        return rows.map((r, i) => `
            <div class="st-card doc-row">
                <div class="stc-av num">${QE().arDigits(i + 1)}</div>
                <div class="doc-tx" data-ws-open="${r.id}">
                    <span class="doc-tt">${escapeHtml(r.title)}</span>
                    <span class="doc-ss">${pWord(countOf(r))} — ${shortHijri(r.created_at)}</span>
                </div>
                <div class="doc-acts">
                    <button type="button" class="doc-ib p" data-ws-print="${r.id}">طباعة</button>
                    <button type="button" class="doc-ib" data-ws-open="${r.id}"
                            title="تعديل" aria-label="تعديل">${ICON_EDIT}</button>
                    <button type="button" class="doc-ib" data-ws-delete="${r.id}"
                            title="حذف" aria-label="حذف">${ICON_TRASH}</button>
                </div>
            </div>
        `).join('');
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
                settings: {},
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

        /* شاشةٌ بلا حشو: شكا المعلّم من كثرة ما تعرضه (٢١ أغسطس ٢٠٢٦).
           فسقط عنوانُ الشاشة — بطاقةُ العنوان تحته تقول ما هي — وطُوِيت
           التعليماتُ في زرٍّ يفتحها من يحتاجها. والأفعالُ الثلاثة نزلت
           إلى شريطٍ ثابتٍ أسفل الشاشة، كزرّ إضافة الاختبار. */
        panel.classList.add('has-qe-dock');
        panel.classList.remove('is-empty-tab');
        panel.innerHTML = `
            <div class="wizard">
                <div class="wizard-header">
                    <button class="btn btn-ghost btn-sm" id="back-list">← القائمة</button>
                </div>

                ${QE().editorHtml(sh.title, sh.questions, {
                    points: false, titleLabel: 'عنوان ورقة العمل',
                    /* كالاختبار: مادّةٌ إنجليزيّةٌ ← حقولُ الكتابة من اليسار. */
                    ltr: /إنجليزي|انجليزي|english/i.test(String(cls.subject || ''))
                })}

                ${extrasHtml(sh)}

                <div class="qe-dock">
                    ${QE().addBtnHtml()}
                    <div class="wizard-footer">
                        <button class="btn btn-secondary" id="ws-save">حفظ</button>
                        <button class="btn btn-primary" id="ws-print">حفظ وطباعة</button>
                    </div>
                </div>
            </div>
        `;

        bindExtras(panel, sh, () => step2(panel, cls));

        QE().bind(panel, sh.questions, {
            points: false,
            rerender: () => step2(panel, cls),
            onTitle: (v) => { sh.title = v; }
        });

        panel.querySelector('#back-list').addEventListener('click', async () => {
            if (sh.questions.length && !sh.id
                && !(await global.TeacherApp.confirm({
                    title: 'الخروج بلا حفظ؟',
                    message: 'ستُفقد الأسئلة التي كتبتها.',
                    ok: 'اخرج', danger: true
                }))) return;
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

    /* ---------- زيادتان مطويّتان: التعليماتُ والتاريخ ----------
       كلتاهما تُستعمل أحياناً لا دائماً، فلا تشغلان الشاشةَ حتى تُطلبا —
       وهو ما شكا منه المعلّم أوّلاً. وهما زرّان في سطرٍ واحد لا سطرين. */

    const instOn = (sh) => sh.instOpen || !!String(sh.instructions || '').trim();
    /* وجودُ المفتاح هو السؤال، لا قيمتُه: تاريخٌ فارغٌ مطلوبٌ يعني نقاطاً
       على الورق، فيجب أن يبقى ظاهراً في المحرّر أيضاً. وبهذا تتّفق
       الشاشةُ والورقةُ على شرطٍ واحد. */
    const dateOn = (sh) => !!(sh.settings && sh.settings.sheet_date !== undefined);

    function extrasHtml(sh) {
        const folds = [
            instOn(sh) ? '' : '<button type="button" class="qe-instfold" id="ws-inst-open">'
                             + '+ تعليمات تُطبع أعلى الورقة</button>',
            dateOn(sh) ? '' : '<button type="button" class="qe-instfold" id="ws-date-open">'
                             + '+ تاريخ يُطبع في الترويسة</button>'
        ].filter(Boolean).join('');

        return (folds ? `<div class="qe-folds">${folds}</div>` : '')
            + (instOn(sh) ? `
            <div class="field" style="margin-top:var(--space-4);">
                <label class="label">التعليمات (تُطبع أعلى الورقة)</label>
                <textarea class="textarea" id="ws-inst" rows="2"
                          placeholder="مثلاً: أجب عن الأسئلة الآتية مستعيناً بكتابك."
                          >${escapeHtml(sh.instructions || '')}</textarea>
            </div>` : '')
            + (dateOn(sh) ? `
            <div class="field" style="margin-top:var(--space-4);">
                <label class="label">التاريخ (يُطبع في ترويسة الورقة)</label>
                <div class="cb-sub" style="margin:0;">
                    <input class="input" id="ws-date"
                           value="${escapeAttr(sh.settings.sheet_date || '')}"
                           placeholder="اكتب التاريخ… أو اتركه فراغاً ليُكتب بالقلم">
                    <button type="button" class="btn btn-secondary btn-sm" id="ws-date-today">اليوم</button>
                    <button type="button" class="btn btn-ghost btn-sm" id="ws-date-off"
                            aria-label="إزالة سطر التاريخ">إزالة</button>
                </div>
            </div>` : '');
    }

    /* أمُّ القرى صريحةً لا تقويمُ الجهاز — النظيرُ في class-exams.js. */
    function todayHijri() {
        try {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
                { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
        } catch (e) {
            return new Date().toLocaleDateString('ar-SA');
        }
    }

    function bindExtras(panel, sh, rerender) {
        panel.querySelector('#ws-inst')
            ?.addEventListener('input', (e) => { sh.instructions = e.target.value; });
        panel.querySelector('#ws-inst-open')?.addEventListener('click', () => {
            /* راية عرضٍ لا حقلَ يُحفظ: تُنزع قبل الحفظ في `save`. */
            sh.instOpen = true;
            rerender();
            panel.querySelector('#ws-inst')?.focus();
        });

        const dt = panel.querySelector('#ws-date');
        if (dt) {
            dt.addEventListener('input', () => { sh.settings.sheet_date = dt.value; });
            panel.querySelector('#ws-date-today').addEventListener('click', () => {
                dt.value = todayHijri();
                sh.settings.sheet_date = dt.value;
                dt.focus();
            });
            panel.querySelector('#ws-date-off').addEventListener('click', () => {
                delete sh.settings.sheet_date;
                rerender();
            });
        }
        /* الفتحُ يُنشئ المفتاحَ فارغاً، فتُطبع نقاطٌ حتى لو لم يكتب شيئاً —
           فمن طلب سطرَ تاريخٍ يريده على الورق. */
        panel.querySelector('#ws-date-open')?.addEventListener('click', () => {
            sh.settings = sh.settings || {};
            sh.settings.sheet_date = '';
            rerender();
            panel.querySelector('#ws-date')?.focus();
        });
    }

    /* رفضٌ غير ملتقَط داخل مستمع نقرٍ يموت صامتاً، فيبدو الزرّ معطّلاً
       بلا سبب. انظر النظير في class-exams.js. */
    async function guard(btn, fn) {
        const label = btn ? btn.innerHTML : null;
        if (btn) { btn.disabled = true; btn.innerHTML = Icons.svg('clock') + ' لحظة…'; }
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
        /* التمارين القديمة تُحذف بعد التحويل، فلا يبقى مصدران للحقيقة.
           و`instOpen` رايةُ عرضٍ لا عمودَ لها في القاعدة — بخلاف
           `settings.sheet_date` فله عمودُه. */
        delete sh.exercises;
        delete sh.instOpen;
        sh.id = await global.TeacherDB.put('worksheets', sh);
        return sh;
    }

    global.ClassWorksheetsTab = { render };
})(window);
