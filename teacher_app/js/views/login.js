/* ==========================================================================
   views/login.js — Login + Register view (toggled by internal state).
   ========================================================================== */

(function (global) {
    'use strict';

    /* ══ رقمُ واتساب الدعم ══
       بصيغة الدوليّة بلا «+» ولا فراغات — مثل: 9665xxxxxxxx.
       وإن تُرك فارغاً، لا يُعرض زرُّ الاستعادة أصلاً: بابٌ لا يفتح على شيء
       أسوأُ من بابٍ لا يظهر.

       ⚠️ وهو رقمٌ **علنيّ**: يقرؤه كلُّ من فتح شيفرة الصفحة. فليكن رقمَ
       دعمٍ لا رقماً شخصيّاً. */
    const SUPPORT_WA = '';


    function render(container) {
        /* الوضعُ من المسار لا من متغيّرٍ عابر: `#/reset-password` يصمد عبر
           إعادةِ رسمٍ أو تحديثِ صفحة، والمتغيّرُ يُستهلك مرّةً ويضيع. */
        let mode = /reset-password/.test(global.location.hash) ? 'reset' : 'login';

        function html() {
            if (mode === 'login') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🎓</div>
                        <h2 class="auth-title">فصول</h2>
                        <p class="auth-subtitle">فصولك وطلابك وحضورهم ودرجاتهم في مكان واحد</p>

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
                                <button type="button" id="btn-forgot">نسيت كلمة المرور أو البريد؟</button>
                            </p>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                تسجيل الدخول
                            </button>
                        </form>

                        <div class="auth-divider">أو</div>

                        <!-- اسمٌ واحدٌ لا اسمان: جُرّب أن يتبدّل إلى «العودة إلى
                             بياناتي» لمن له حسابٌ على الجهاز، فرُدّ — الزرُّ عَلَمٌ
                             يعرفه المعلّم بمكانه وشكله، وتبدُّلُ اسمه يجعله زرّاً
                             آخر يُقرأ من جديد. والفرقُ في السلوك لا في الاسم. -->
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

            if (mode === 'guest') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">🔒</div>
                        <h2 class="auth-title">قبل أن تبدأ</h2>
                        <p class="auth-subtitle">هذا ما نفعله ببياناتك — وأين تُحفظ</p>

                        <p class="gc-warn">
                            بالدخول كزائر، <b>بياناتك تُحفظ على جهازك فقط</b>.
                            وللحفاظ عليها ومزامنتها —
                            <button type="button" class="gc-link" id="btn-guest-register">أنشئ حسابك الآن</button>
                        </p>

                        <label class="auth-consent">
                            <input type="checkbox" id="guest-agree">
                            <span>أوافق على
                                <a href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>
                                و<a href="terms.html" target="_blank" rel="noopener">شروط الاستخدام</a>
                            </span>
                        </label>

                        <button type="button" class="btn btn-primary btn-lg btn-block"
                                id="btn-guest-go" disabled>
                            متابعة كزائر
                        </button>

                        <p class="auth-switch">
                            <button type="button" id="btn-switch-login">رجوع</button>
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

                        ${SUPPORT_WA ? `
                        <p class="auth-switch">
                            نسيتَ بريدك أيضاً؟
                            <button type="button" id="btn-switch-recover">استعِدْه برقم جوالك</button>
                        </p>` : ''}
                        <p class="auth-switch">
                            تذكّرتها؟ <button type="button" id="btn-switch-login">رجوع لتسجيل الدخول</button>
                        </p>
                    </div>
                `;
            }

            /* ══ استعادةُ البريد بالجوّال ══
               من نسي كلمةَ مروره يُرسَل إليه رابط. ومن نسي **بريدَه** لا
               يملك ما يُرسَل إليه شيء — فلا بابَ له في التطبيق كلِّه.

               فالبابُ رقمُه: يكتبه، فتُفتح واتساب برسالةٍ جاهزةٍ إلى الدعم،
               ويُعاد إليه بريده بيدٍ بشريّة.

               ولا يسأل التطبيقُ القاعدةَ عن الرقم، ولا يقول «موجود» أو
               «غير موجود»: ذاك بابُ عَدٍّ — يُجرَّب فيه ألفُ رقمٍ لتُعرف
               حساباتُ الناس. والتحقّقُ يجري عند الدعم لا هنا. */
            if (mode === 'recover') {
                return `
                    <div class="auth-card">
                        <div class="auth-logo">📱</div>
                        <h2 class="auth-title">نسيت بريدك؟</h2>
                        <p class="auth-subtitle">
                            اكتب رقم جوالك الذي سجّلتَ به، وتُفتح واتساب برسالةٍ جاهزة.
                            نتحقّق منك ونُعيد إليك بريدك.
                        </p>

                        <form id="form-recover" novalidate>
                            <div class="field">
                                <label class="label" for="rc-name">اسمك الكامل</label>
                                <input class="input" id="rc-name" type="text"
                                       autocomplete="name" placeholder="محمد بن عبدالله">
                            </div>

                            <div class="field">
                                <label class="label" for="rc-phone">رقم الجوال *</label>
                                <input class="input" id="rc-phone" type="tel" required
                                       autocomplete="tel" inputmode="tel" maxlength="20"
                                       placeholder="05xxxxxxxx">
                            </div>

                            <button type="submit" class="btn btn-primary btn-lg btn-block">
                                استعادة عبر واتساب
                            </button>
                        </form>

                        <!-- شرطُ التحقّق يُقال للمعلّم صراحةً: من أرسل من رقمٍ
                             غير رقمه لن يُجاب، فلا يُتعب نفسه ولا يظنّ الخللَ
                             فينا. وهو نفسُه ما يحمي حسابَه من غيره. -->
                        <p class="auth-note">
                            أرسِلْ من الجوال نفسِه المسجَّل في حسابك — لا نُجيب رسالةً
                            تأتي من رقمٍ آخر.
                        </p>

                        <p class="auth-switch">
                            <button type="button" id="btn-switch-login">رجوع لتسجيل الدخول</button>
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

                        <!-- الجوّالُ مِرساةُ الاستعادة: من نسي بريدَه لا يملك ما
                             يُعرَف به إلّا رقمَه.

                             **واختياريٌّ هنا لا مطلوب** (قرارُ المستخدم «ج»،
                             ٣٠ أغسطس ٢٠٢٦): شاشةُ التسجيل أغلى لحظةٍ في
                             التطبيق، ومن تردّد أمام حقلٍ إلزاميٍّ قد لا يعود
                             — ولم يرَ بعدُ ما يستحقّ رقمَه. وآبل تدقّق في
                             الحقول الإلزاميّة (‎5.1.1(v)‎).
                             فيُطلب بعد أن يبني فصلَه الأوّل — راجع
                             phone-prompt.js. ولا شَرَطاتٍ مائلةً هنا:
                             هذا التعليق داخل قالبٍ نصّيّ، وهي تكسر الملفّ. -->
                        <div class="field">
                            <label class="label" for="reg-phone">رقم الجوال</label>
                            <input class="input" id="reg-phone" type="tel"
                                   autocomplete="tel" inputmode="tel" maxlength="20"
                                   placeholder="05xxxxxxxx">
                            <div class="field-hint">
                                به نستعيد بريدك إن نسيته — ويمكنك إضافته لاحقاً.
                            </div>
                        </div>

                        <div class="field">
                            <label class="label" for="reg-password">كلمة المرور *</label>
                            <input class="input" id="reg-password" type="password" required
                                   autocomplete="new-password" minlength="6">
                            <div class="field-hint">٦ أحرف على الأقل</div>
                        </div>

                        <!-- موافقةٌ صريحةٌ لا سطرٌ تحت الزرّ (اختيار المستخدم «أ»):
                             التطبيقُ يحمل أسماءَ طلابٍ ودرجاتِهم، وسيأخذ اشتراكاً —
                             والصريحُ أحوطُ في الاثنين. والزرُّ مقفولٌ حتى يُعلَّم. -->
                        <label class="auth-consent">
                            <input type="checkbox" id="reg-agree">
                            <span>أوافق على
                                <a href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>
                                و<a href="terms.html" target="_blank" rel="noopener">شروط الاستخدام</a>
                            </span>
                        </label>

                        <button type="submit" class="btn btn-primary btn-lg btn-block"
                                id="btn-register" disabled>
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

            const switchRec = container.querySelector('#btn-switch-recover');
            if (switchRec) switchRec.addEventListener('click', () => { mode = 'recover'; paint(); });

            const recForm = container.querySelector('#form-recover');
            if (recForm) recForm.addEventListener('submit', onRecover);

            const loginForm = container.querySelector('#form-login');
            if (loginForm) loginForm.addEventListener('submit', onLogin);

            const regForm = container.querySelector('#form-register');
            if (regForm) regForm.addEventListener('submit', onRegister);

            /* الزرُّ يفتح بالموافقة ويُقفل بسحبها — لا مرّةً واحدة. */
            const agree = container.querySelector('#reg-agree');
            const regBtn = container.querySelector('#btn-register');
            if (agree && regBtn) {
                agree.addEventListener('change', function () {
                    regBtn.disabled = !agree.checked;
                });
            }

            /* الزرُّ يفتح شاشةَ التعريف ولا يُنشئ جلسةً — فالموافقةُ قبل
               الحساب لا بعده. وإنشاءُ الجلسة في `#btn-guest-go`.

               **إلّا العائد**: من له حسابُ زائرٍ على هذا الجهاز فقد وافق
               مرّةً عند أوّل دخول، ولا تُعاد عليه الموافقةُ كلّما رجع إلى
               بياناته — وإلّا صار الإقرارُ طقساً يُنقر بلا قراءة. */
            const guestBtn = container.querySelector('#btn-guest');
            if (guestBtn) guestBtn.addEventListener('click', function () {
                if (global.Auth && global.Auth.hasSavedGuest && global.Auth.hasSavedGuest()) {
                    return onGuest();
                }
                mode = 'guest'; paint();
            });

            const guestGo = container.querySelector('#btn-guest-go');
            if (guestGo) guestGo.addEventListener('click', function () {
                const ok = container.querySelector('#guest-agree');
                if (!ok || !ok.checked) {
                    return global.TeacherApp.toast(
                        'وافق على سياسة الخصوصية وشروط الاستخدام أولاً.', 'error', 5000);
                }
                onGuest();
            });

            const guestAgree = container.querySelector('#guest-agree');
            if (guestAgree && guestGo) {
                guestAgree.addEventListener('change', function () {
                    guestGo.disabled = !guestAgree.checked;
                });
            }

            const guestReg = container.querySelector('#btn-guest-register');
            if (guestReg) guestReg.addEventListener('click', function () {
                mode = 'register'; paint();
            });

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
                /* اللونُ يُطلى عند الدخول لا عند الإقلاع وحدَه: من دخل داخل الجلسة
                   نفسِها كان يرى الافتراضيَّ حتّى يُعيد فتحَ التطبيق. */
                if (global.ThemeColor) global.ThemeColor.applyStored();
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
        async function onGuest() {
            /* ══ الجديدُ يُهيّأ، والعائدُ يرجع إلى بياناته ══
               كان الزرُّ يقصد `#/setup` في الحالتين، فالعائدُ يُستقبل بشاشةِ
               «عرّفنا بنفسك» وقد عرّف مرّةً وحفظ مدرستَه وموادَّه — فيظنّ
               بياناتِه ضاعت.

               والفرقُ في الانتظار كذلك: **الجديدُ لا ينتظر** — شاشةُ التهيئة
               حقولُها فارغةٌ على أي حال، فتُفتح والتسجيلُ يمضي خلفها. أمّا
               العائدُ فوجهتُه تتوقّف على ما لديه، ولا يُعرف ما لديه قبل أن
               تُفتح جلستُه — فلو مضى قبلها حكم الموجّهُ على مخبأٍ مُسِح عند
               الخروج، فردّه إلى التهيئة من حيث فررنا. */
            const returning = !!(global.Auth.hasSavedGuest && global.Auth.hasSavedGuest());

            if (!returning) {
                global.Auth.beginGuest().catch((err) => {
                    global.TeacherApp.toast(err.message || 'تعذّر الدخول كزائر.', 'error', 5000);
                    global.location.hash = '#/login';
                });
                if (global.ThemeColor) global.ThemeColor.applyStored();
                global.location.hash = '#/setup';
                return;
            }

            const btn = container.querySelector('#btn-guest');
            const rest = () => { if (btn) { btn.disabled = false; btn.textContent = 'الدخول كزائر'; } };
            if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الدخول…'; }
            try {
                await global.Auth.beginGuest();
                /* اللونُ يُطلى عند الدخول لا عند الإقلاع وحدَه: من دخل داخل الجلسة
                   نفسِها كان يرى الافتراضيَّ حتّى يُعيد فتحَ التطبيق. */
                if (global.ThemeColor) global.ThemeColor.applyStored();
                global.location.hash = '#/dashboard';
            } catch (err) {
                rest();
                /* ══ جلسةٌ ماتت: يُسأل ولا يُنشأ في صمت ══
                   كان التطبيقُ يُنشئ حساباً جديداً ويردّه إلى التهيئة، فيجد
                   المعلّمُ نفسَه يملأ بياناته من جديدٍ ولا يدري لماذا —
                   وحسابُه القديمُ يبقى في القاعدة يتيماً لا يصله أحد.
                   (بلاغُ المعلّم ٢٩ أغسطس ٢٠٢٦.)
                   فصار يُقال له ما جرى، ولا يمضي إلّا بإقراره. */
                /* الشبكةُ غابت لا الحساب: يُقال ولا يُعرض إنشاءُ بديل —
                   والبديلُ يقتل القديم. */
                if (err && err.code === 'offline') {
                    global.TeacherApp.toast(err.message, 'warning', 7000);
                    return;
                }
                if (err && err.code === 'guest-session-lost') {
                    if (!(await global.TeacherApp.confirm({
                        title: 'حساب زائر جديد؟',
                        message: err.message,
                        ok: 'ابدأ من جديد'
                    }))) return;
                    if (btn) { btn.disabled = true; btn.textContent = '⏳ جارٍ الدخول…'; }
                    try {
                        await global.Auth.beginGuest({ allowNew: true });
                        if (global.ThemeColor) global.ThemeColor.applyStored();
                global.location.hash = '#/setup';
                    } catch (e2) {
                        rest();
                        global.TeacherApp.toast(e2.message || 'تعذّر الدخول كزائر.', 'error', 5000);
                    }
                    return;
                }
                global.TeacherApp.toast(err.message || 'تعذّر الدخول كزائر.', 'error', 5000);
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
                /* اللونُ يُطلى عند الدخول لا عند الإقلاع وحدَه: من دخل داخل الجلسة
                   نفسِها كان يرى الافتراضيَّ حتّى يُعيد فتحَ التطبيق. */
                if (global.ThemeColor) global.ThemeColor.applyStored();
                global.location.hash = '#/dashboard';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        }

        async function onRegister(e) {
            e.preventDefault();
            /* وتعطيلُ الزرّ وحده لا يكفي: يُرفع بأدوات المتصفّح في ثانية.
               فالموافقةُ تُفحص هنا أيضاً — حيث لا تُتجاوز. */
            const agreed = container.querySelector('#reg-agree');
            if (!agreed || !agreed.checked) {
                return global.TeacherApp.toast(
                    'وافق على سياسة الخصوصية وشروط الاستخدام أولاً.', 'error', 5000);
            }
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                /* المدرسة والمواد والجوال تُسأل في التهيئة مرتّبةً — «عنك»
                   ثم «مدرستك». وكانت المدرسة تُسأل هنا وهناك معاً. */
                await global.Auth.register({
                    name:     container.querySelector('#reg-name').value,
                    email:    container.querySelector('#reg-email').value,
                    phone:    container.querySelector('#reg-phone').value,
                    password: container.querySelector('#reg-password').value
                });
                global.TeacherApp.toast('تم إنشاء حسابك بنجاح. أهلاً بك!', 'success');
                /* اللونُ يُطلى عند الدخول لا عند الإقلاع وحدَه: من دخل داخل الجلسة
                   نفسِها كان يرى الافتراضيَّ حتّى يُعيد فتحَ التطبيق. */
                if (global.ThemeColor) global.ThemeColor.applyStored();
                global.location.hash = '#/dashboard';
            } catch (err) {
                global.TeacherApp.toast(err.message, 'error');
            } finally {
                btn.disabled = false;
            }
        }

        /* ── فتحُ واتساب برسالةٍ جاهزة ──
           `wa.me` رابطٌ رسميّ: يفتح التطبيقَ إن كان مثبَّتاً، وصفحةَ الويب
           إن لم يكن. ولا يُرسل شيئاً بنفسه — المعلّمُ يضغط «إرسال» بيده،
           وهذا هو المقصود: رسالتُه من رقمه، وذاك ما نتحقّق به. */
        async function onRecover(e) {
            e.preventDefault();
            const nameEl  = container.querySelector('#rc-name');
            const phoneEl = container.querySelector('#rc-phone');
            const A = global.Auth;
            const phone = A.normalizePhone(phoneEl.value);

            if (!A.validPhone(phone)) {
                return global.TeacherApp.toast(
                    'اكتب رقم جوالك كما سجّلتَ به — مثل ٠٥٠٠٠٠٠٠٠٠.', 'error', 5000);
            }
            if (!SUPPORT_WA) {
                return global.TeacherApp.toast(
                    'خدمةُ الاستعادة غير مفعّلة بعد. راسلنا من صفحة المساعدة.', 'error', 6000);
            }

            /* الرسالةُ تحمل ما يكفي للبحث والتحقّق، ولا تحمل سرّاً: لا بريدَ
               ولا كلمةَ مرور — وهي تمرّ بواتساب وبعين المعلّم قبل الإرسال. */
            const name = (nameEl && nameEl.value.trim()) || '';
            const text =
                'استعادة البريد الإلكتروني — تطبيق فصول\n\n' +
                'الاسم: ' + (name || '(لم يُكتب)') + '\n' +
                'رقم الجوال المسجَّل: ' + phone + '\n\n' +
                'نسيتُ بريدي الإلكتروني ولا أستطيع الدخول.';

            global.open('https://wa.me/' + SUPPORT_WA + '?text=' + encodeURIComponent(text),
                        '_blank', 'noopener');
        }

        paint();
    }

    global.LoginView = { render };
})(window);
