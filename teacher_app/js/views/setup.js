/* ==========================================================================
   views/setup.js — تهيئة المدرسة (النموذج أ: خطوة واحدة).
   تظهر مرة واحدة بعد إنشاء الحساب قبل دخول التطبيق، وتجمع ما تحتاجه بقية
   الشاشات: اسم المدرسة ونوعها وإدارة التعليم والمنطقة والفصل الدراسي.

   نوع المدرسة ليس بياناً شكلياً — عليه تتوقّف كلمة «طالب/طالبة» في
   التطبيق كله.
   ========================================================================== */

(function (global) {
    'use strict';

    const GENDERS = [
        { k: 'boys',  icon: '👦', label: 'بنين' },
        { k: 'girls', icon: '👧', label: 'بنات' }
    ];
    const TERMS = [
        { k: 1, label: 'الأول' },
        { k: 2, label: 'الثاني' },
        { k: 3, label: 'الثالث' }
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
            return !!(teacher && teacher.school_name && gender && term && dept);
        } catch { return true; }   // خطأ في القراءة لا يحبس المعلم خارج تطبيقه
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        const pick = {
            school: teacher.school_name || '',
            region: teacher.region || '',
            dept:   (await global.TeacherDB.Settings.get('education_dept')) || '',
            gender: (await global.TeacherDB.Settings.get('school_gender')) || '',
            term:   (await global.TeacherDB.Settings.get('academic_term')) || 1
        };
        let saving = false;

        const first = String(teacher.name || '').trim().split(/\s+/)[0] || 'معلّم';

        container.innerHTML = `
            <div class="container setup-v1">
                <div class="setup-hero">
                    <span class="t">🎓 أهلاً بك يا أستاذ ${escapeHtml(first)}</span>
                    <span class="h">أخبرنا عن مدرستك — دقيقة واحدة ولن نسألك مرة أخرى.</span>
                </div>

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
                <input class="setup-fld" id="su-dept" type="text" maxlength="60"
                       placeholder="إدارة تعليم عسير" value="${escapeAttr(pick.dept)}">

                <div class="fgrp-t">المنطقة</div>
                <input class="setup-fld" id="su-region" type="text" maxlength="40"
                       placeholder="أبها" value="${escapeAttr(pick.region)}">

                <div class="fgrp-t">الفصل الدراسي *</div>
                <div class="fchips" id="su-term">
                    ${TERMS.map((t) => `
                        <button type="button" class="fchip ${Number(pick.term) === t.k ? 'on' : ''}"
                                data-term="${t.k}">${t.label}</button>
                    `).join('')}
                </div>

                <button type="button" class="fsave" id="su-go">ابدأ ←</button>
                <p class="setup-note">تقدر تعدّلها كلها لاحقاً من الإعدادات ← بيانات المدرسة.</p>
            </div>
        `;

        const chips = (wrap, attr, onPick) => {
            container.querySelector(wrap)?.addEventListener('click', (e) => {
                const b = e.target.closest('[' + attr + ']');
                if (!b) return;
                container.querySelectorAll(wrap + ' [' + attr + ']')
                    .forEach((x) => x.classList.toggle('on', x === b));
                onPick(b.getAttribute(attr));
            });
        };
        chips('#su-gender', 'data-gender', (v) => { pick.gender = v; });
        chips('#su-term',   'data-term',   (v) => { pick.term = Number(v); });

        container.querySelector('#su-go').addEventListener('click', async () => {
            if (saving) return;
            const school = container.querySelector('#su-school').value.trim();
            const dept   = container.querySelector('#su-dept').value.trim();
            const region = container.querySelector('#su-region').value.trim();

            if (!school) return global.TeacherApp.toast('اكتب اسم المدرسة.', 'warning', 3000);
            if (!pick.gender) return global.TeacherApp.toast('اختر نوع المدرسة.', 'warning', 3000);
            if (!dept)   return global.TeacherApp.toast('اكتب إدارة التعليم.', 'warning', 3000);

            saving = true;
            const btn = container.querySelector('#su-go');
            btn.disabled = true;
            btn.textContent = '… جارٍ الحفظ';

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
                btn.disabled = false;
                btn.textContent = 'ابدأ ←';
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }

            if (global.Words) await global.Words.reload();
            if (global.SettingsView && global.SettingsView.refreshPrintCache) {
                global.SettingsView.refreshPrintCache().catch(() => {});
            }
            global.TeacherApp.toast('تمت التهيئة ✅', 'success', 1400);
            global.location.hash = '#/dashboard';
        });
    }

    global.SetupView = { render, isDone };
})(window);
