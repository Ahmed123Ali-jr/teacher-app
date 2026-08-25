/* ==========================================================================
   views/login.js — Login + Register view (toggled by internal state).
   ========================================================================== */

(function (global) {
    'use strict';


    function render(container) {
        /* الوضعُ من المسار لا من متغيّرٍ عابر: `#/reset-password` يصمد عبر
           إعادةِ رسمٍ أو تحديثِ صفحة، والمتغيّرُ يُستهلك مرّةً ويضيع. */
        let mode = /reset-password/.test(global.location.hash) ? 'reset' : 'login';

        function html() {
            if (mode === 'login') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🎓</div>
                        <h2 class="auth-title">إنجاز المعلم</h2>
                        <p class="auth-subtitle">منظومة متكاملة لإدارة الطلاب وإنجاز المعلم</p>

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

                            <!-- فوق الزرّ لا تحته: المعلّم الذي فشلت كلمتُه
                                 ينظر إلى الخانة التي فشلت، لا إلى أسفل الشاشة. -->
                            <p class="auth-forgot">
                                <button type="button" id="btn-forgot">نسيت كلمة المرور؟</button>
                            </p>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                تسجيل الدخول
                            </button>
                        </form>

                        <div class="auth-divider">أو</div>

                        <button type="button" class="auth-guest" id="btn-guest">
                            الدخول كزائر
                        </button>

                        <p class="auth-switch">
                            ليس لديك حساب؟
                            <button type="button" id="btn-switch-register">إنشاء حساب جديد</button>
                        </p>
                    </div>
                `;
            }

            if (mode === 'forgot') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🔑</div>
                        <h2 class="auth-title">نسيت كلمة المرور</h2>
                        <p class="auth-subtitle">اكتب بريدك، ونرسل لك رابطاً تختار به كلمةً جديدة</p>

                        <form id="form-forgot" novalidate>
                            <div class="field">
                                <label class="label" for="fp-email">البريد الإلكتروني</label>
                                <input class="input" id="fp-email" type="email" required
                                       autocomplete="email" inputmode="email"
                                       placeholder="name@example.com">
                            </div>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                أرسل الرابط
                            </button>
                        </form>

                        <p class="auth-switch">
                            تذكّرتها؟ <button type="button" id="btn-switch-login">رجوع لتسجيل الدخول</button>
                        </p>
                    </div>
                `;
            }

            if (mode === 'reset') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🔑</div>
                        <h2 class="auth-title">كلمة مرور جديدة</h2>
                        <p class="auth-subtitle">اخترها ثم ادخل بها</p>

                        <form id="form-reset" novalidate>
                            <div class="field">
                                <label class="label" for="rp-new">كلمة المرور الجديدة</label>
                                <input class="input" id="rp-new" type="password" required
                                       autocomplete="new-password" minlength="6">
                                <div class="field-hint">٦ أحرف على الأقل</div>
                            </div>

                            <div class="field">
                                <label class="label" for="rp-confirm">تأكيد كلمة المرور</label>
                                <input class="input" id="rp-confirm" type="password" required
                                       autocomplete="new-password">
                            </div>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                حفظ والدخول
                            </button>
                        </form>
                    </div>
                `;
            }

            return `
                <div class="auth-card">
                    <div class="auth-logo">🎓</div>
                    <h2 class="auth-title">إنشاء حساب</h2>
                    <p class="auth-subtitle">حسابك أولاً — ونسألك عن مدرستك بعد الدخول</p>

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

            const forgot = container.querySelector('#btn-forgot');
            if (forgot) forgot.addEventListener('click', () => { mode = 'forgot'; paint(); });

            const fpForm = container.querySelector('#form-forgot');
            if (fpForm) fpForm.addEventListener('submit', onForgot);

            const rpForm = container.querySelector('#form-reset');
            if (rpForm) rpForm.addEventListener('submit', onReset);
        }

        async function onForgot(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = '⏳ جارٍ الإرسال…';
            try {
                await global.Auth.requestPasswordReset(container.querySelector('#fp-email').value);
                /* جوابٌ واحدٌ سواءٌ وُجد البريد أم لا — راجع `requestPasswordReset`. */
                global.TeacherApp.toast(
                    'إن كان لديك حساب بهذا البريد فستصلك رسالة خلال دقائق. '
                    + 'تحقّق من «المهملات» إن لم تجدها.', 'success', 9000);
                mode = 'login';
                paint();
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'أرسل الرابط';
                global.TeacherApp.toast(err.message || 'تعذّر الإرسال.', 'error', 6000);
            }
        }

        async function onReset(e) {
            e.preventDefault();
            const pw = container.querySelector('#rp-new').value;
            const ok = container.querySelector('#rp-confirm').value;
            if (pw !== ok) return global.TeacherApp.toast('الكلمتان غير متطابقتين.', 'error', 4000);
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = '⏳ جارٍ الحفظ…';
            try {
                await global.Auth.setNewPassword(pw);
                global.TeacherApp.toast('حُفظت كلمتك الجديدة. أهلاً بعودتك!', 'success', 4000);
                global.location.hash = '#/dashboard';
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'حفظ والدخول';
                global.TeacherApp.toast(err.message || 'تعذّر الحفظ.', 'error', 7000);
            }
        }

        /* الزرّ يُعطَّل حتى يعود الخادم — بلا كلمةٍ تُكتب ولا رمزٍ يظهر.
           التعطيلُ يمنع ضغطتين تفتحان حسابين، والنصُّ يبقى كما هو فلا
           يشعر المعلّم أن شيئاً «يُحمَّل». */
        /* لا انتظارَ بين الضغطة والشاشة: التسجيلُ يبدأ وتُفتح التهيئةُ في
           النَّفَس نفسه. وإن فشل التسجيل رجع المعلّم إلى هنا مع سبب. */
        function onGuest() {
            global.Auth.beginGuest().catch((err) => {
                global.TeacherApp.toast(err.message || 'تعذّر الدخول كزائر.', 'error', 5000);
                global.location.hash = '#/login';
            });
            global.location.hash = '#/setup';
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
                /* المدرسة والمواد والجوال تُسأل في التهيئة مرتّبةً — «عنك»
                   ثم «مدرستك». وكانت المدرسة تُسأل هنا وهناك معاً. */
                await global.Auth.register({
                    name:     container.querySelector('#reg-name').value,
                    email:    container.querySelector('#reg-email').value,
                    password: container.querySelector('#reg-password').value
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
