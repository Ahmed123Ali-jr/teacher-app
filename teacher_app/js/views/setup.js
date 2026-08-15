/* ==========================================================================
   views/setup.js — التهيئة على خطوتين: «عنك» ثم «مدرستك».

   كانت خطوةً واحدة تسأل عن المدرسة وحدها، بينما تُسأل المواد في شاشة
   التسجيل — **واسم المدرسة يُسأل في الشاشتين معاً**. فالمعلّم يكتبه مرّتين
   ولا يدري لماذا.

   فصار التسجيل حساباً فقط (اسم وبريد وكلمة مرور)، والتهيئة تجمع الباقي
   مرتّباً كما يفكّر المعلّم: **من هو أولاً، ثم أين يعمل.**

   والمواد ليست بياناً شكلياً: عليها تتوقّف قائمة «موادك» في نافذة إضافة
   الفصل — فمعلّم الرياضيات يجدها أول ما يفتحها لا بين ست عشرة مادة.

   ونوع المدرسة كذلك: عليه تتوقّف كلمة «طالب/طالبة» في التطبيق كله.
   ========================================================================== */

(function (global) {
    'use strict';

    const GENDERS = [
        { k: 'boys',  icon: '👦', label: 'بنين' },
        { k: 'girls', icon: '👧', label: 'بنات' }
    ];
    /* فصلان لا ثلاثة — عادت الوزارة للفصلين. */
    const TERMS = [
        { k: 1, label: 'الفصل الأول' },
        { k: 2, label: 'الفصل الثاني' }
    ];

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    /** هل أكمل المعلم التهيئة؟ — يُستدعى من الموجّه قبل أي شاشة. */
    async function isDone(teacher) {
        try {
            if (await global.TeacherDB.Settings.get('onboarded')) return true;
            /* حسابات أُنشئت قبل هذه الشاشة: نعدّها مهيّأة إن كانت تملك
               الحقول الجديدة كلها، وإلا مرّت بالتهيئة مرة واحدة مملوءةً
               مسبقاً بما لديها — فلا تضيع بياناتها ولا تنقص. */
            const gender = await global.TeacherDB.Settings.get('school_gender');
            const term   = await global.TeacherDB.Settings.get('academic_term');
            const dept   = await global.TeacherDB.Settings.get('education_dept');
            const subs   = global.Subjects ? global.Subjects.ofTeacher(teacher) : [];
            return !!(teacher && teacher.school_name && gender && term && dept && subs.length);
        } catch { return true; }   // خطأ في القراءة لا يحبس المعلم خارج تطبيقه
    }

    /* أسماءٌ ليست أسماء: حسابُ الزائر يُنشأ باسم «معلم زائر»، فيرى المعلّم
       حقلَ الاسم مملوءاً بما ليس اسمَه — فإمّا حفظه وإمّا مسحه بيده. فيبدأ
       الحقلُ فارغاً بتلميحٍ يدلّه، ومن سجّل باسمه الحقيقي يجده كما كتبه. */
    const PLACEHOLDER_NAMES = ['معلم زائر', 'معلّم زائر', 'معلم', 'معلّم'];
    function realName(n) {
        const v = String(n || '').trim();
        return PLACEHOLDER_NAMES.indexOf(v) >= 0 ? '' : v;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const S = global.Subjects;
        const pick = {
            name:     realName(teacher.name),
            subjects: S ? S.ofTeacher(teacher).slice() : [],
            phone:    teacher.phone || '',
            school:   teacher.school_name || '',
            dept:     (await global.TeacherDB.Settings.get('education_dept')) || '',
            gender:   (await global.TeacherDB.Settings.get('school_gender')) || '',
            term:     (await global.TeacherDB.Settings.get('academic_term')) || 1
        };
        let step = 0;          // 0 = عنك · 1 = مدرستك
        let saving = false;

        /* ------------------------------------------------------------------
           الرسم
           ------------------------------------------------------------------ */

        function head() {
            return `
                <div class="setup-steps">
                    <span class="dot ${step === 0 ? 'on' : 'done'}"></span>
                    <span class="bar ${step === 1 ? 'on' : ''}"></span>
                    <span class="dot ${step === 1 ? 'on' : ''}"></span>
                    <span class="lbl">الخطوة ${step === 0 ? '١' : '٢'} من ٢</span>
                </div>`;
        }

        function stepYou() {
            return `
                <div class="setup-hero">
                    <span class="t">أهلاً بك</span>
                    <span class="h">أخبرنا عنك أولاً — دقيقة واحدة ولن نسألك مرة أخرى.</span>
                </div>
                ${head()}

                <div class="fgrp-t">اسمك *</div>
                <input class="setup-fld" id="su-name" type="text" maxlength="60"
                       placeholder="اكتب اسمك" value="${escapeAttr(pick.name)}">

                <div class="fgrp-t">التخصص *
                    <span class="fgrp-h">تظهر لك أول القائمة عند إضافة فصل</span>
                </div>
                <div id="su-subs"></div>

                <div class="fgrp-t">رقم الجوال <span class="fgrp-h">اختياري</span></div>
                <input class="setup-fld" id="su-phone" type="tel" maxlength="20"
                       placeholder="05xxxxxxxx" value="${escapeAttr(pick.phone)}">

                <button type="button" class="fsave" id="su-next">التالي ←</button>`;
        }

        function stepSchool() {
            return `
                <div class="setup-hero">
                    <span class="t">🏫 والآن مدرستك</span>
                    <span class="h">تقدر تعدّلها كلها لاحقاً من الإعدادات.</span>
                </div>
                ${head()}

                <div class="fgrp-t">اسم المدرسة *</div>
                <input class="setup-fld" id="su-school" type="text" maxlength="80"
                       placeholder="ثانوية الملك فهد" value="${escapeAttr(pick.school)}">

                <div class="fgrp-t">نوع المدرسة *</div>
                <div class="fchips" id="su-gender">
                    ${GENDERS.map((g) => `
                        <button type="button" class="fchip ${pick.gender === g.k ? 'on' : ''}"
                                data-gender="${g.k}">${g.icon} ${g.label}</button>
                    `).join('')}
                </div>

                <div class="fgrp-t">إدارة التعليم *</div>
                <button type="button" class="dept-pick" id="su-dept-btn">
                    <span class="v" id="su-dept-v">${pick.dept ? escapeHtml(pick.dept) : 'اختر إدارة التعليم'}</span>
                    <span class="chev">❯</span>
                </button>

                <div class="fgrp-t">الفصل الدراسي *</div>
                <div class="fchips" id="su-term">
                    ${TERMS.map((t) => `
                        <button type="button" class="fchip ${Number(pick.term) === t.k ? 'on' : ''}"
                                data-term="${t.k}">${t.label}</button>
                    `).join('')}
                </div>

                <button type="button" class="fsave" id="su-go">ابدأ ←</button>
                <button type="button" class="setup-back" id="su-back">→ رجوع</button>`;
        }

        function paint() {
            container.innerHTML = `<div class="container setup-v1">${step === 0 ? stepYou() : stepSchool()}</div>`;
            bind();
        }

        /* ------------------------------------------------------------------
           الربط — يُعاد بعد كل رسم، فلا مستمعَ يتراكم
           ------------------------------------------------------------------ */

        /** يحفظ ما في الحقول قبل أيّ إعادة رسم — وإلا ضاع ما كتبه. */
        function harvest() {
            const g = (id) => container.querySelector(id);
            if (step === 0) {
                if (g('#su-name'))  pick.name  = g('#su-name').value;
                if (g('#su-phone')) pick.phone = g('#su-phone').value;
            } else if (g('#su-school')) {
                pick.school = g('#su-school').value;
            }
        }

        function bind() {
            const q = (s) => container.querySelector(s);

            /* المكوّن يملك عرض المواد وحالتَها، ويردّ إلينا النتيجة — فلا
               تُعاد الشاشةُ كلُّها عند كل اختيار. */
            const subsEl = q('#su-subs');
            if (subsEl) {
                global.SubjectPicker.mount(subsEl, {
                    chosen: pick.subjects,
                    all: S ? S.merge(pick.subjects, S.ALL) : pick.subjects,
                    onChange: (arr) => { pick.subjects = arr; }
                });
            }

            q('#su-next')?.addEventListener('click', () => {
                harvest();
                if (!pick.name.trim())    return global.TeacherApp.toast('اكتب اسمك.', 'warning', 3000);
                if (!pick.subjects.length) return global.TeacherApp.toast('اختر مادةً واحدة على الأقل.', 'warning', 3000);
                step = 1; paint();
                global.scrollTo(0, 0);
            });

            q('#su-back')?.addEventListener('click', () => {
                harvest(); step = 0; paint(); global.scrollTo(0, 0);
            });

            const chips = (wrap, attr, onPick) => {
                q(wrap)?.addEventListener('click', (e) => {
                    const b = e.target.closest('[' + attr + ']');
                    if (!b) return;
                    container.querySelectorAll(wrap + ' [' + attr + ']')
                        .forEach((x) => x.classList.toggle('on', x === b));
                    onPick(b.getAttribute(attr));
                });
            };
            chips('#su-gender', 'data-gender', (v) => { pick.gender = v; });
            chips('#su-term',   'data-term',   (v) => { pick.term = Number(v); });

            q('#su-dept-btn')?.addEventListener('click', () => {
                global.DeptPicker.open(pick.dept, (full) => {
                    pick.dept = full;
                    const el = q('#su-dept-v');
                    if (el) { el.textContent = full; el.classList.remove('is-empty'); }
                });
            });

            q('#su-go')?.addEventListener('click', finish);
        }

        /* ------------------------------------------------------------------
           الحفظ
           ------------------------------------------------------------------ */

        async function finish() {
            if (saving) return;
            harvest();
            const school = pick.school.trim();
            const dept   = pick.dept;
            /* المنطقة تُشتقّ من الإدارة لا يكتبها المعلم: «إدارة تعليم جدة»
               تعني منطقة مكة المكرمة — فلا حقل ثالث ولا خطأ إملائي. */
            const region = (global.EduDepts.regionOf(dept) || '');

            if (!school)       return global.TeacherApp.toast('اكتب اسم المدرسة.', 'warning', 3000);
            if (!pick.gender)  return global.TeacherApp.toast('اختر نوع المدرسة.', 'warning', 3000);
            if (!dept)         return global.TeacherApp.toast('اختر إدارة التعليم.', 'warning', 3000);

            saving = true;
            const btn = container.querySelector('#su-go');
            if (btn) { btn.disabled = true; btn.textContent = '… جارٍ الحفظ'; }

            teacher.name        = pick.name.trim();
            teacher.phone       = pick.phone.trim();
            teacher.subjects    = pick.subjects.slice();
            teacher.subject     = pick.subjects[0] || '';
            teacher.school_name = school;
            teacher.region      = region;
            teacher.updated_at  = new Date().toISOString();

            try {
                /* كلها معاً لا واحدةً تلو الأخرى: خمس رحلات متتابعة تعني
                   ثانيةً ونصفاً ينتظرها المعلم على أول شاشة يراها. */
                await Promise.all([
                    global.TeacherDB.put('teachers', teacher),
                    global.TeacherDB.Settings.set('education_dept', dept),
                    global.TeacherDB.Settings.set('school_gender',  pick.gender),
                    global.TeacherDB.Settings.set('academic_term',  pick.term),
                    global.TeacherDB.Settings.set('onboarded',      true)
                ]);
            } catch (err) {
                saving = false;
                if (btn) { btn.disabled = false; btn.textContent = 'ابدأ ←'; }
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }

            if (global.Words) await global.Words.reload();
            if (global.SettingsView && global.SettingsView.refreshPrintCache) {
                global.SettingsView.refreshPrintCache().catch(() => {});
            }
            global.TeacherApp.toast('تمت التهيئة ✅', 'success', 1400);
            global.location.hash = '#/dashboard';
        }

        paint();
    }

    global.SetupView = { render, isDone };
})(window);
