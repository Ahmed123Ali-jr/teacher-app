/* ==========================================================================
   phone-prompt.js — يطلب رقمَ الجوّال مرّةً واحدة، بعد أن يصير للمعلّم
   ما يخاف عليه.

   ── لماذا لا يُطلب عند التسجيل ──
   كان مطلوباً في شاشة إنشاء الحساب، ثمّ رُدَّ اختياريّاً (قرارُ المستخدم
   «ج»، ٣٠ أغسطس ٢٠٢٦) لسببين:

   • **شاشةُ التسجيل أغلى لحظةٍ في التطبيق كلِّه.** من يتردّد أمام حقلٍ
     إلزاميٍّ قد لا يعود، ولم يرَ من التطبيق شيئاً بعدُ يستحقّ رقمَه.
   • **وآبل تدقّق في الحقول الإلزاميّة** (‎5.1.1(v)‎): لا تُطلب بياناتٌ
     شخصيّةٌ ليست لازمةً لجوهر التطبيق. والرقمُ مبرَّرٌ، لكنّه مِن أكثرِ
     ما يُسأل عنه في المراجعة.

   ── ومتى يُطلب إذن ──
   حين يكون للمعلّم **فصلٌ واحدٌ على الأقلّ**. وهذا مقصود: قبل ذلك لم
   يبنِ شيئاً، فلا معنى لقولنا «لنستعيد حسابك» — أيَّ حسابٍ يستعيد؟ وهو
   المنطقُ نفسُه الذي بُني عليه `guest-notice.js`: يُقال عند أوّل ما
   يُخاف عليه، لا عند الباب.

   ── ومرّةً واحدةً لا غير ──
   من ضغط «لاحقاً» لا يُسأل ثانية. والإلحاحُ يُفقد الثقةَ أكثرَ ممّا
   يجمع أرقاماً، والبابُ يبقى مفتوحاً في «حسابي» متى أراد.
   ========================================================================== */

(function (global) {
    'use strict';

    const KEY = 'teacher_app_phone_prompt';

    function asked(uid) {
        try { return global.localStorage.getItem(KEY) === uid; } catch (e) { return true; }
    }
    function remember(uid) {
        try { global.localStorage.setItem(KEY, uid); } catch (e) { /* لا يوقف شيئاً */ }
    }

    let busy = false;

    /**
     * تُنادى من الرئيسيّة بعد رسمها. لا تُنتظر، وأيُّ خطأٍ فيها يُبتلع —
     * تذكيرٌ لا يظهر أهونُ من شاشةٍ لا تُرسم.
     * @param {object} teacher  المعلّمُ كما قرأته الشاشة — فلا يُقرأ مرّتين.
     */
    async function maybeAsk(teacher) {
        if (busy) return;
        busy = true;
        try {
            if (!teacher || teacher.is_guest) return;
            if (String(teacher.phone || '').trim()) return;   /* عنده رقم */
            if (asked(teacher.id)) return;

            /* لا يُسأل من لم يبنِ شيئاً بعد. */
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
        const A = global.Auth;
        const form = document.createElement('div');
        form.innerHTML = `
            <p class="text-muted" style="font-size:14px; line-height:1.9; margin:0 0 var(--space-4)">
                إن نسيتَ بريدك يوماً، فرقمُ جوالك هو <b>الطريقُ الوحيد</b>
                لاستعادة حسابك. نحفظه لهذا وحدَه.
            </p>
            <div class="field">
                <label class="label" for="pp-phone">رقم الجوال</label>
                <input class="input" id="pp-phone" type="tel" autocomplete="tel"
                       inputmode="tel" maxlength="20" placeholder="05xxxxxxxx">
                <div class="field-hint">لن يُرسل إليه شيءٌ إلا إن طلبتَ الاستعادة.</div>
            </div>
            <div class="modal-footer" style="margin: var(--space-6) calc(var(--space-6) * -1) calc(var(--space-6) * -1);">
                <button type="button" class="btn btn-primary" id="pp-save">احفظ</button>
                <button type="button" class="btn btn-ghost" data-modal-close>لاحقاً</button>
            </div>`;

        const btn = form.querySelector('#pp-save');
        btn.addEventListener('click', async () => {
            const raw = form.querySelector('#pp-phone').value;
            if (!A.validPhone(raw)) {
                return global.TeacherApp.toast(
                    'اكتب رقم جوالك — مثل ٠٥٠٠٠٠٠٠٠٠.', 'error', 5000);
            }
            btn.disabled = true;
            try {
                /* يُقرأ الصفُّ ثمّ يُكتب: `put` تستبدل الصفَّ كلَّه، فلو
                   كُتب حقلٌ وحدَه لضاع ما سواه. */
                const me = await global.TeacherDB.get('teachers', teacher.id);
                me.phone = A.normalizePhone(raw);
                await global.TeacherDB.put('teachers', me);
                global.Modal.close();
                global.TeacherApp.toast('حُفظ رقمك', 'success');
            } catch (err) {
                btn.disabled = false;
                global.TeacherApp.toast(err.message || 'تعذّر الحفظ.', 'error', 6000);
            }
        });

        /* بلا تركيزٍ تلقائيّ: لوحةُ المفاتيح تقفز على الجوّال فتغطّي
           الشرحَ الذي يفسّر لماذا نسأل أصلاً. */
        global.Modal.open({ title: 'رقم جوالك', body: form, autofocus: false });
    }

    global.PhonePrompt = { maybeAsk };
})(window);
