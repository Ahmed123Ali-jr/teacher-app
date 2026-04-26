/* ==========================================================================
   views/login.js — Login + Register view (toggled by internal state).
   ========================================================================== */

(function (global) {
    'use strict';

    const SUBJECTS = [
        'القرآن الكريم', 'التربية الإسلامية', 'اللغة العربية', 'اللغة الإنجليزية',
        'الرياضيات', 'العلوم', 'الأحياء', 'الفيزياء', 'الكيمياء',
        'الاجتماعيات', 'التاريخ', 'الجغرافيا',
        'الحاسب وتقنية المعلومات', 'التربية الفنية', 'التربية البدنية', 'أخرى'
    ];

    function subjectCheckboxes() {
        return SUBJECTS.map((s, i) => `
            <label class="subject-chip">
                <input type="checkbox" name="subjects" value="${s}" id="sub-${i}">
                <span>${s}</span>
            </label>
        `).join('');
    }

    function render(container) {
        let mode = 'login'; // or 'register'

        function html() {
            if (mode === 'login') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🎓</div>
                        <h2 class="auth-title">تطبيق المعلم الذكي</h2>
                        <p class="auth-subtitle">سجّل دخولك للمتابعة</p>

                        <form id="form-login" novalidate>
                            <div class="field">
                                <label class="label" for="login-email">البريد الإلكتروني</label>
                                <input class="input" id="login-email" type="email"
                                       autocomplete="email" required placeholder="name@example.com">
                            </div>

                            <div class="field">
                                <label class="label" for="login-password">كلمة المرور</label>
                                <input class="input" id="login-password" type="password"
                                       autocomplete="current-password" required>
                            </div>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                تسجيل الدخول
                            </button>
                        </form>

                        <div class="auth-divider">أو</div>

                        <button type="button" class="btn btn-secondary btn-lg btn-block" id="btn-guest">
                            👤 دخول كزائر (لتجربة التطبيق)
                        </button>

                        <p class="auth-switch">
                            ليس لديك حساب؟
                            <button type="button" id="btn-switch-register">إنشاء حساب جديد</button>
                        </p>
                    </div>
                `;
            }

            return `
                <div class="auth-card">
                    <div class="auth-logo">🎓</div>
                    <h2 class="auth-title">إنشاء حساب</h2>
                    <p class="auth-subtitle">معلومات أساسية تظهر في المطبوعات</p>

                    <form id="form-register" novalidate>
                        <div class="field">
                            <label class="label" for="reg-name">الاسم الكامل *</label>
                            <input class="input" id="reg-name" type="text" required
                                   autocomplete="name" placeholder="محمد بن عبدالله">
                        </div>

                        <div class="field">
                            <label class="label" for="reg-email">البريد الإلكتروني *</label>
                            <input class="input" id="reg-email" type="email" required
                                   autocomplete="email" placeholder="name@example.com">
                        </div>

                        <div class="field">
                            <label class="label" for="reg-password">كلمة المرور *</label>
                            <input class="input" id="reg-password" type="password" required
                                   autocomplete="new-password" minlength="6">
                            <div class="field-hint">٦ أحرف على الأقل</div>
                        </div>

                        <div class="field">
                            <label class="label" for="reg-school">اسم المدرسة *</label>
                            <input class="input" id="reg-school" type="text" required
                                   placeholder="مدرسة الأمير سلطان الابتدائية">
                        </div>

                        <div class="field">
                            <label class="label">المواد التي تدرّسها * <span class="field-hint" style="display:inline">(يمكن اختيار أكثر من مادة)</span></label>
                            <div class="subject-grid" id="reg-subjects">
                                ${subjectCheckboxes()}
                            </div>
                        </div>

                        <div class="field">
                            <label class="label" for="reg-phone">رقم الجوال (اختياري)</label>
                            <input class="input" id="reg-phone" type="tel"
                                   autocomplete="tel" placeholder="05xxxxxxxx">
                        </div>

                        <button type="submit" class="btn btn-primary btn-lg btn-block">
                            إنشاء الحساب
                        </button>
                    </form>

                    <p class="auth-switch">
                        لديك حساب؟
                        <button type="button" id="btn-switch-login">تسجيل الدخول</button>
                    </p>
                </div>
            `;
        }

        function paint() {
            container.innerHTML = html();
            bind();
        }

        function bind() {
            const switchReg = container.querySelector('#btn-switch-register');
            if (switchReg) switchReg.addEventListener('click', () => { mode = 'register'; paint(); });

            const switchLog = container.querySelector('#btn-switch-login');
            if (switchLog) switchLog.addEventListener('click', () => { mode = 'login'; paint(); });

            const loginForm = container.querySelector('#form-login');
            if (loginForm) loginForm.addEventListener('submit', onLogin);

            const regForm = container.querySelector('#form-register');
            if (regForm) regForm.addEventListener('submit', onRegister);

            const guestBtn = container.querySelector('#btn-guest');
            if (guestBtn) guestBtn.addEventListener('click', onGuest);
        }

        async function onGuest() {
            try {
                await global.Auth.guestLogin();
                global.TeacherApp.toast('أهلاً بك كزائر 👋 (بيانات تجريبية)', 'info');
                global.location.hash = '#/dashboard';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            }
        }

        async function onLogin(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                await global.Auth.login({
                    email:    container.querySelector('#login-email').value,
                    password: container.querySelector('#login-password').value
                });
                global.TeacherApp.toast('أهلاً بعودتك!', 'success');
                global.location.hash = '#/dashboard';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        }

        async function onRegister(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const subjects = Array.from(
                    container.querySelectorAll('#reg-subjects input[type="checkbox"]:checked')
                ).map((el) => el.value);

                await global.Auth.register({
                    name:        container.querySelector('#reg-name').value,
                    email:       container.querySelector('#reg-email').value,
                    password:    container.querySelector('#reg-password').value,
                    school_name: container.querySelector('#reg-school').value,
                    subjects,
                    phone:       container.querySelector('#reg-phone').value
                });
                global.TeacherApp.toast('تم إنشاء حسابك بنجاح. أهلاً بك!', 'success');
                global.location.hash = '#/dashboard';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        }

        paint();
    }

    global.LoginView = { render };
})(window);
