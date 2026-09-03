/* ==========================================================================
   save-account.js — يعرض على الزائر أن يحفظ حسابه، مرّةً واحدة.

   ── لماذا ──
   حسابُ الزائر **جلستُه مفتاحُه الوحيد**: لا بريدَ له ولا كلمةَ مرور.
   فإن ذهبت الجلسةُ ذهب الحسابُ وكلُّ ما فيه — ولا سبيل إلى استعادته،
   لا منّا ولا منه.

   وسُدَّت أبوابُ ذهابها واحداً واحداً (٣٠ أغسطس ٢٠٢٦): الشبكةُ الغائبة
   لم تعد تُعدّ خروجاً (`auth.js` → `readSession`)، ومهلةُ إعادة استعمال
   رمز التجديد رُفعت من عشر ثوانٍ إلى خمس دقائق في لوحة Supabase.

   **وبقي بابٌ لا تردّه شيفرة**: أن يمسح الجهازُ تخزينَه — سفاري تمسح
   بيانات المواقع غير المستعملة، والمعلّمُ قد يمسحها بيده.

   فالعلاجُ الأخير أن يخرج المعلّمُ من حال الزائر: بريدٌ وكلمةُ مرور
   تُلصقان بحسابه **في مكانه** — المعرّفُ نفسُه، وكلُّ فصوله وطلابه
   وحضورهم كما هي. لا نقلَ ولا نسخ. (راجع `Auth.register` — ترقّي
   الحساب المجهول ولا تستبدله.)

   ── ومتى يُسأل ──
   بعد أن يبني فصلَه الأوّل. قبل ذلك لم يبنِ شيئاً يخاف عليه، وقولُنا
   «لئلّا تضيع بياناتك» بلا معنى. وهو المنطقُ نفسُه في `phone-prompt.js`
   و`guest-notice.js`.

   ── ومرّةً واحدةً لا غير ──
   من ضغط «لاحقاً» لا يُسأل ثانية. والبابُ يبقى مفتوحاً في
   «الإعدادات ← احفظ حسابك».
   ========================================================================== */

(function (global) {
    'use strict';

    const KEY = 'teacher_app_save_account';

    function asked(uid) {
        try { return global.localStorage.getItem(KEY) === uid; } catch (e) { return true; }
    }
    function remember(uid) {
        try { global.localStorage.setItem(KEY, uid); } catch (e) { /* لا يوقف شيئاً */ }
    }

    let busy = false;

    /**
     * تُنادى من الرئيسيّة بعد رسمها. لا تُنتظر، وأيُّ خطأٍ فيها يُبتلع.
     * @param {object} teacher  المعلّمُ كما قرأته الشاشة.
     */
    async function maybeAsk(teacher) {
        if (busy) return;
        busy = true;
        try {
            if (!teacher || !teacher.is_guest) return;   /* لغير الزائر شاشتُه */
            if (asked(teacher.id)) return;

            const classes = await global.TeacherDB.getAll('classes');
            if (!classes || !classes.length) return;

            remember(teacher.id);          /* مرّةً واحدة، ولو أغلقها */
            open(teacher);
        } catch (e) {
            /* صامت. */
        } finally {
            busy = false;
        }
    }

    function open(teacher) {
        const form = document.createElement('div');
        form.innerHTML = `
            <p class="text-muted" style="font-size:14px; line-height:1.9; margin:0 0 var(--space-4)">
                بياناتك الآن على <b>هذا الجهاز وحده</b>. أضِفْ بريدك وكلمةَ مرور
                لتصل إليها من أيّ جهاز — ولا يضيع شيءٌ ممّا بنيت.
            </p>
            <div class="field">
                <label class="label" for="sa-email">البريد الإلكتروني</label>
                <input class="input" id="sa-email" type="email" autocomplete="email"
                       inputmode="email" placeholder="name@example.com">
            </div>
            <div class="field">
                <label class="label" for="sa-pass">كلمة المرور</label>
                <input class="input" id="sa-pass" type="password"
                       autocomplete="new-password" minlength="6" placeholder="٦ أحرف على الأقل">
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-primary" id="sa-go">احفظ حسابي</button>
                <button type="button" class="btn btn-ghost" data-modal-close>لاحقاً</button>
            </div>`;

        const btn = form.querySelector('#sa-go');
        btn.addEventListener('click', async () => {
            const email = form.querySelector('#sa-email').value.trim();
            const pass  = form.querySelector('#sa-pass').value;
            if (!email || email.indexOf('@') < 0) {
                return global.TeacherApp.toast('اكتب بريدك الإلكتروني.', 'error', 5000);
            }
            if (!pass || pass.length < 6) {
                return global.TeacherApp.toast('كلمة المرور ٦ أحرف على الأقل.', 'error', 5000);
            }
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'جارٍ الحفظ…';
            try {
                /* اسمُه يُمرَّر كما هو: `register` تكتبه في الملفّ، فلو
                   تُرك فارغاً لمُحي اسمٌ كتبه في التهيئة. */
                await global.Auth.register({
                    name: teacher.name || 'معلم',
                    email: email,
                    password: pass
                });
                global.Modal.close();
                global.TeacherApp.toast('حُفظ حسابك — بياناتك صارت معك في أيّ جهاز.',
                                        'success', 6000);
                /* الشاشةُ تُعاد لأنّ صفةَ «زائر» سقطت عن المعلّم. */
                if (global.location.hash === '#/dashboard') global.location.reload();
            } catch (err) {
                btn.disabled = false;
                btn.textContent = label;
                global.TeacherApp.toast(err.message || 'تعذّر حفظ الحساب.', 'error', 7000);
            }
        });

        /* بلا تركيزٍ تلقائيّ: لوحةُ المفاتيح تقفز على الجوّال فتغطّي
           الشرحَ الذي يفسّر لماذا نسأل أصلاً. */
        global.Modal.open({ title: 'احفظ حسابك', body: form, autofocus: false });
    }

    global.SaveAccount = { maybeAsk };
})(window);
