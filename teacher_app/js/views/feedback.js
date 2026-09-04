/* ==========================================================================
   views/feedback.js — «ملاحظاتكم»
   ==========================================================================
   حلّت محلّ «الإعدادات» في قائمة الثلاث نقاط بقراره (٤ سبتمبر ٢٠٢٦):
   «خلّ مكان الإعدادات شيءٌ اسمه ملاحظاتكم». والإعداداتُ لا تضيع — لها
   حبّةٌ ثابتةٌ في الشريط السفليّ وزرٌّ في ترويسة الشاشات العريضة، فوجودُها
   في القائمة كان تكراراً. وهذا المكانُ يُشترى بغيره: ما يُوضع فيه يُرى.

   ══ ثلاثةُ قراراتٍ في هذه الشاشة ══

   ١) **لا حقلَ مجهولٌ ولا اسمَ يُطلب.** المعلّمُ داخلٌ بحسابه، فبريدُه
      معنا. ونعرضه عليه ليعرف بمن سنردّ، ولا نسأله إيّاه ثانيةً.

   ٢) **الإرسالُ يقول الحقيقة.** لا «تم الإرسال» قبل أن يصل. وإن سقطت
      الشبكةُ تُحفظ المسوّدةُ في الجهاز ويُقال له صراحةً إنّها لم تُرسل —
      لا وعدَ صامتٌ يضيع معه كلامُه. وهذا خلافُ بقيّة التطبيق (الصندوقُ
      الصادرُ يرسل وحدَه) عن قصد: الصندوقُ لبياناته هو، والملاحظةُ رسالةٌ
      إلينا — ومن كتب رسالةً يريد أن يعرف أوصلت أم لا.

   ٣) **المسوّدةُ تُحفظ عند كل حرف.** من يكتب شكواه ثم يُغلق التطبيقَ
      بالخطأ لا يكتبها مرّةً ثانية — يجدها كما تركها.

   ══ ما يلزم قبل أن يعمل الإرسال ══
   جدولُ `feedback` في سوبابيس مع سياسةِ إدخالٍ للمُصادَقين — الملفُّ
   `supabase/migrations/20260904120000_feedback.sql`. وقبل تشغيله يقول
   الزرُّ إنّ الإرسال غيرُ مفعّلٍ بعد، ولا يبتلع الكلام.
   ========================================================================== */

(function (global) {
    'use strict';

    const I = (n) => (global.Icons ? global.Icons.svg(n) : '');
    const DRAFT = 'fb_draft';
    const MAX = 1200;

    /* أربعةٌ لا أكثر: كلَّما طالت القائمةُ طال التردّد. و«شكر» ليست حشواً —
       من أراد أن يشكر لن يفتح البريد، وهو أصدقُ ما نقرأ. */
    const KINDS = [
        { k: 'idea',  t: 'اقتراح', ic: 'bulb' },
        { k: 'bug',   t: 'مشكلة',  ic: 'warning' },
        { k: 'ask',   t: 'سؤال',   ic: 'question' },
        { k: 'thanks', t: 'شكر',   ic: 'star' }
    ];

    const state = { kind: 'idea', sending: false };

    /* أرقامٌ عربيّةٌ هنديّة كبقيّة التطبيق. و«من» بدل الشرطة المائلة عن
       قصد: «٠ / ١٢٠٠» في سطرٍ من اليمين إلى اليسار يُقلب فيُقرأ «١٢٠٠ / ٠»
       — والجملةُ العربيّةُ لا تُقلب. */
    const AR = '٠١٢٣٤٥٦٧٨٩';
    function num(n) { return String(n).replace(/\d/g, (d) => AR[+d]); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function readDraft() {
        try { return JSON.parse(global.localStorage.getItem(DRAFT) || '{}'); }
        catch (e) { return {}; }
    }
    function writeDraft(d) {
        try { global.localStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) {}
    }
    function clearDraft() {
        try { global.localStorage.removeItem(DRAFT); } catch (e) {}
    }

    async function render(container) {
        let teacher = null;
        try { teacher = await global.Auth.currentTeacher(); } catch (e) {}
        const email = (teacher && teacher.email) || '';
        const draft = readDraft();
        if (draft.kind && KINDS.some((k) => k.k === draft.kind)) state.kind = draft.kind;

        container.innerHTML = `
            <div class="container fb-wrap">

                <header class="fb-hero">
                    <span class="fb-hero-ic">${I('thought')}</span>
                    <b>ملاحظاتكم</b>
                    <span>هذا تطبيقُ معلّمين، ويُبنى بما تقولونه. اكتب ما نقص أو ما أزعجك — تُقرأ كلُّها.</span>
                </header>

                <div class="fb-kinds" role="group" aria-label="نوع الملاحظة">
                    ${KINDS.map((k) => `
                        <button type="button" class="fb-kind ${k.k === state.kind ? 'on' : ''}"
                                data-kind="${k.k}" aria-pressed="${k.k === state.kind}">
                            ${I(k.ic)}<span>${k.t}</span>
                        </button>`).join('')}
                </div>

                <label class="fb-lbl" for="fb-text">ملاحظتك</label>
                <textarea id="fb-text" class="fb-text" rows="7" maxlength="${MAX}"
                          placeholder="اكتب هنا…">${esc(draft.text || '')}</textarea>
                <div class="fb-count"><span id="fb-n">${num((draft.text || '').length)}</span> من ${num(MAX)} حرفاً</div>

                <div class="fb-who">
                    ${I('mail')}
                    <span>${email
                        ? 'سنردّ على <b>' + esc(email) + '</b>'
                        : 'أنت تجرّب كزائر — اربط حسابك لنستطيع الردّ عليك'}</span>
                </div>

                <button type="button" class="fb-send" id="fb-send">إرسال</button>
                <p class="fb-note" id="fb-note"></p>

            </div>
        `;

        bind(container, teacher);
    }

    function bind(container, teacher) {
        const ta    = container.querySelector('#fb-text');
        const n     = container.querySelector('#fb-n');
        const send  = container.querySelector('#fb-send');
        const note  = container.querySelector('#fb-note');

        function save() {
            writeDraft({ kind: state.kind, text: ta.value });
        }

        container.querySelectorAll('[data-kind]').forEach((b) => {
            b.addEventListener('click', () => {
                state.kind = b.getAttribute('data-kind');
                container.querySelectorAll('[data-kind]').forEach((x) => {
                    const on = x === b;
                    x.classList.toggle('on', on);
                    x.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                save();
            });
        });

        ta.addEventListener('input', () => {
            n.textContent = num(ta.value.length);
            save();
        });

        send.addEventListener('click', async () => {
            const text = ta.value.trim();
            if (text.length < 5) {
                note.className = 'fb-note is-bad';
                note.textContent = 'اكتب ملاحظتك أوّلاً.';
                ta.focus();
                return;
            }
            if (state.sending) return;
            state.sending = true;
            send.disabled = true;
            send.textContent = 'جارٍ الإرسال…';
            note.className = 'fb-note';
            note.textContent = '';

            const res = await submit(state.kind, text, teacher);

            state.sending = false;
            send.disabled = false;
            send.textContent = 'إرسال';

            if (res.ok) {
                clearDraft();
                ta.value = '';
                n.textContent = num(0);
                note.className = 'fb-note is-good';
                note.textContent = 'وصلَتنا — شكراً لك.';
                return;
            }
            note.className = 'fb-note is-bad';
            note.textContent = res.msg;
        });
    }

    /** يُرجع {ok} أو {ok:false, msg} — ولا يقول «تمّ» إلّا إذا تمّ. */
    async function submit(kind, text, teacher) {
        if (!global.SB) {
            return { ok: false, msg: 'تعذّر الاتّصال. حاول بعد قليل — وملاحظتُك محفوظة.' };
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { ok: false, msg: 'لا يوجد اتّصال. ملاحظتُك محفوظةٌ هنا — أرسلها حين تعود الشبكة.' };
        }
        /* المُعرّفُ من الجلسة لا من `teacher`: السياسةُ تقارنه بـ`auth.uid()`،
           فلو تأخّر ملفُّ المعلّم أو سقطت قراءتُه أُرسل `null` فرُفض الصفُّ
           وقيل للمعلّم «الخللُ عندنا» — وهو ليس خللاً بل مُعرّفٌ ضائع.
           و`getSession()` تقرأ من التخزين المحليّ بلا شبكة. */
        let uid = (teacher && teacher.id) || null;
        if (!uid) {
            try {
                const { data } = await global.SB.auth.getSession();
                uid = (data && data.session && data.session.user && data.session.user.id) || null;
            } catch (e) { /* يبقى `null` فيُقال له إنّها لم تُرسل */ }
        }

        try {
            const { error } = await global.SB.from('feedback').insert({
                teacher_id: uid,
                kind: kind,
                body: text.slice(0, MAX),
                app_version: (global.TeacherApp && global.TeacherApp.version) || null,
                agent: (navigator.userAgent || '').slice(0, 300)
            });
            if (error) {
                console.warn('[Feedback]', error.message);
                return {
                    ok: false,
                    msg: 'لم تُرسل — والخلل عندنا لا عندك. ملاحظتُك محفوظةٌ هنا، أعد المحاولة لاحقاً.'
                };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, msg: 'لم تصل — تحقّق من الشبكة. ملاحظتُك محفوظةٌ هنا.' };
        }
    }

    global.FeedbackView = { render };
})(window);
