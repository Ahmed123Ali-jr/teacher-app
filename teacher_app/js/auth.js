/**
 * Auth — Supabase-backed.
 * Public API kept compatible with the old IndexedDB version so views
 * and other modules don't need to change:
 *     register, login, logout, currentTeacher, guestLogin, changePassword,
 *     onAuthChange, updateProfile
 *
 * Teacher object shape returned (matches the old shape):
 *   { id, email, name, school_name, subject, subjects, phone,
 *     photo_url, message, vision, created_at, is_guest }
 */
(function (global) {
    'use strict';

    const sb = global.SB;

    /* ══════════════════════════════════════════════════════════════════
       حسابُ الزائر يعود إلى صاحبه — لا يُنشأ ثانٍ في كلّ دخول
       ══════════════════════════════════════════════════════════════════
       كان كلُّ ضغطةٍ على «دخول كزائر» تُنشئ حساباً جديداً. فمن خرج ثمّ عاد
       وجد تطبيقاً فارغاً، **وحسابُه القديم لا سبيلَ إليه أبداً**: لا بريدَ
       له ولا كلمةَ مرور، والجلسةُ كانت مفتاحَه الوحيد. فيفقد فصولَه
       وطلابَه وجدولَه بضغطةٍ ظنّها عودةً.

       ومن ذلك تراكم في القاعدة **٣٧٤ حساباً يتيماً** (قياسُ ٢٦ أغسطس
       ٢٠٢٦) — كلٌّ منها يحمل بياناتِ معلّمٍ لا يصل إليها هو ولا غيرُه.

       **وبابٌ ثانٍ يُغلق معه:** حصّةُ الاستيراد أربعون شهرياً **لكلّ
       حساب** — فمن بلغها كان يخرج ويدخل فيأخذ أربعين جديدة. صار الجهازُ
       حساباً واحداً، فالحصّةُ حصّةٌ واحدة.

       والوسيلةُ أنّ الزائرَ **لا يُخرَج أصلاً**: تُرفع رايةُ طيٍّ محلّيّةٌ
       وتبقى جلستُه حيّةً في مكانها، فيعود إليها. (وحفظُ رمز التجديد جُرّب
       أوّلاً ففشل — سوبابيس تُبطله على الخادم حتى في الخروج المحلّيّ.
       التفصيلُ في `logout` أدناه.)

       ── وحدُّ هذه الوسيلة، وقد وقع ──
       تبقى الجلسةُ ما بقي `localStorage`. فإن ذهب — بانتهاء الرمز، أو
       بمسحِ بيانات الموقع، أو بإخلاء المتصفّح للتخزين — ماتت الجلسةُ ولا
       تُحيا. وكان `guestLogin` عندها **يُنشئ حساباً جديداً في صمت**،
       فيجد المعلّمُ تطبيقاً فارغاً ويظنّه عطلاً، ويتراكم في القاعدة حسابٌ
       يتيمٌ آخر. (بلاغُ المعلّم ٢٩ أغسطس ٢٠٢٦ — وقع له.)

       فصار لا يُنشئ شيئاً في صمت: إن قالت رايةُ الجهاز «هنا حسابُ زائر»
       ولم تُفتح جلسةٌ حيّة، **يتوقّف ويرفع خطأً باسمه**، ولا يمضي إلّا
       بضغطةٍ ثانيةٍ من المعلّم بعد أن يُقال له إنّ القديمَ لا يعود.

       ── وما يبقى بيد المعلّم ──
       • «مسح جميع البيانات» في الإعدادات: يمحو المحتوى **ويُبقي الحساب**،
         فيعود إليه فارغاً.
       • «حذف حسابي نهائياً»: يزول الحساب، ويُنسى الرمز — والدخولُ بعده
         بدايةٌ جديدة.
       • وربطُ الحساب ببريد: لم يعد زائراً، فيُنسى الرمزُ كذلك.

       ── وحدُّه الذي يُقال ──
       الجهازُ المشترك: من يمسك الجهازَ بعده يدخل كزائرٍ فيرى بياناته.
       ولذلك يبقى «مسح جميع البيانات» في متناوله — وهو قرارُ المستخدم بعد
       عرض الأمرين (٢٦ أغسطس ٢٠٢٦).
       ══════════════════════════════════════════════════════════════════ */
    const GUEST_KEY   = 'teacher-app-guest';         /* علامةُ «لهذا الجهاز حسابُ زائر» */
    const GUEST_PAUSE = 'teacher-app-guest-paused';  /* خرج محلّياً وجلستُه حيّة */

    const flag = {
        set(k)   { try { global.localStorage.setItem(k, '1'); } catch (e) {} },
        has(k)   { try { return global.localStorage.getItem(k) === '1'; } catch (e) { return false; } },
        clear(k) { try { global.localStorage.removeItem(k); } catch (e) {} }
    };

    function markGuest()   { flag.set(GUEST_KEY); }
    function forgetGuest() { flag.clear(GUEST_KEY); flag.clear(GUEST_PAUSE); }
    function pauseGuest()  { flag.set(GUEST_PAUSE); }
    function resumeGuest() { flag.clear(GUEST_PAUSE); }

    /** هل لهذا الجهاز حسابُ زائر؟ — تسأله شاشةُ الدخول لتغيّر كلامها. */
    function hasSavedGuest() { return flag.has(GUEST_KEY); }

    /* دالّةُ الحافّة التي تحذف الحساب وملفاتِه بمفتاح الخدمة.
       العنوانُ يُشتقّ من عنوان المشروع نفسِه فلا يُكتب مرّتين. */
    const DELETE_ACCOUNT_URL =
        (global.SUPABASE_URL || 'https://rbsfpsmolxldmwcclhlc.supabase.co')
        + '/functions/v1/delete-account';
    if (!sb) {
        console.error('[Auth] Supabase client (window.SB) not initialised.');
        return;
    }

    /* ---------- helpers ---------- */

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function mapProfile(user, profile) {
        if (!user) return null;
        const p = profile || {};
        return {
            id: user.id,
            email: p.email || user.email || '',
            name: p.full_name || '',
            school_name: p.school || '',
            subject: p.subject || (Array.isArray(p.subjects) ? p.subjects[0] : '') || '',
            subjects: Array.isArray(p.subjects) ? p.subjects : [],
            phone: p.phone || '',
            specialization:   p.specialization   || '',
            qualification:    p.qualification    || '',
            /* null لا '' — العمود عدد صحيح في القاعدة، والسلسلة الفارغة
               تُرفض بـ«invalid input syntax for type integer». كانت تمنع كل
               معلّم لم يملأ سنوات خبرته من حفظ بياناته أو إكمال التهيئة. */
            experience_years: (p.experience_years === undefined || p.experience_years === '')
                ? null : p.experience_years,
            civil_id:         p.civil_id         || '',
            region:           p.region           || '',
            photo_url: p.photo_url || '',
            message: p.message || '',
            vision: p.vision || '',
            created_at: p.created_at || user.created_at,
            is_guest: !!user.is_anonymous
        };
    }

    async function fetchProfile(userId) {
        // Cache-first: if TeacherDB cache has the profile, return it (instant).
        if (global.TeacherDB && global.TeacherDB.get) {
            try {
                const cached = await global.TeacherDB.get('teachers', userId);
                if (cached) {
                    return {
                        id:               cached.id,
                        full_name:        cached.full_name || cached.name || '',
                        school:           cached.school || cached.school_name || '',
                        subject:          cached.subject,
                        subjects:         cached.subjects,
                        phone:            cached.phone,
                        email:            cached.email,
                        specialization:   cached.specialization,
                        qualification:    cached.qualification,
                        experience_years: cached.experience_years,
                        civil_id:         cached.civil_id,
                        region:           cached.region,
                        photo_url:        cached.photo_url,
                        message:          cached.message,
                        vision:           cached.vision,
                        created_at:       cached.created_at
                    };
                }
            } catch (e) {}
        }
        const { data, error } = await sb
            .from('teachers')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            console.warn('[Auth] fetchProfile error:', error.message);
            return null;
        }
        return data;
    }

    /** Ensure a teacher profile row exists. Trigger usually creates it,
     *  but we upsert defensively in case of timing/edge cases. */
    async function ensureProfile(userId, fields) {
        const payload = Object.assign({ id: userId }, fields || {});
        const { error } = await sb
            .from('teachers')
            .upsert(payload, { onConflict: 'id' });
        if (error) console.warn('[Auth] ensureProfile error:', error.message);
    }

    /* ---------- public API ---------- */

    /** يُنقّي رقمَ الجوّال: أرقامٌ لاتينيّةٌ لا غير، وتُحفظ كما كُتبت بلا
     *  فراغاتٍ ولا شَرَطات. والعربيّةُ تُحوَّل — المعلّم يكتب «٠٥…» ولوحةُ
     *  مفاتيحه عربيّة، والبحثُ في القاعدة يقارن نصّاً بنصّ. */
    function normalizePhone(v) {
        return String(v == null ? '' : v)
            .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
            .replace(/[^\d+]/g, '');
    }

    /** جوّالٌ سعوديٌّ مقبول: ‎05xxxxxxxx‎ أو ‎9665xxxxxxxx‎ أو ‎+9665…‎ */
    function validPhone(v) {
        const p = normalizePhone(v);
        return /^05\d{8}$/.test(p) || /^(\+?966)5\d{8}$/.test(p);
    }

    /* ══ الجوّالُ مِرساةُ الاستعادة ══
       من نسي بريدَه لا يملك ما يُعرَف به إلّا رقمَه — راجع شاشة `recover`
       في `views/login.js`.

       ويُجمع **اختياريّاً** عند التسجيل، ثمّ يُطلب مرّةً بعد أن يبني
       المعلّم فصلَه الأوّل (`phone-prompt.js`). وكان مطلوباً في شاشة
       التسجيل يوماً واحداً، فرُدَّ: الإلزامُ عند الباب يُخسر مسجّلين،
       وآبل تدقّق فيه. */
    async function register({ name, email, password, phone }) {
        email = normalizeEmail(email);
        if (!name || !email || !password) {
            throw new Error('يرجى تعبئة جميع الحقول المطلوبة.');
        }
        /* اختياريٌّ — ويُفحص إن كُتب وحدَه: رقمٌ مشوّهٌ أسوأُ من لا رقم،
           إذ يُظنّ البابُ مفتوحاً وهو مسدود. راجع `phone-prompt.js`. */
        if (phone && String(phone).trim() && !validPhone(phone)) {
            throw new Error('اكتب رقم جوالك — مثل ٠٥٠٠٠٠٠٠٠٠. به نستعيد بريدك إن نسيته.');
        }
        if (password.length < 6) {
            throw new Error('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');
        }

        /* ── الزائرُ يُرقّى ولا يُستبدل (قرار المستخدم ٢١ أغسطس) ──
           `signUp` تُنشئ **معرّفاً جديداً كلّياً**، فتبقى فصولُ الزائر
           وطلابُه وجدولُه تحت المعرّف القديم — يتيمةً لا سبيل إليها،
           لأنّ حساب الزائر بلا بريدٍ ولا كلمةِ مرور: الجلسةُ كانت مفتاحَه
           الوحيد. فمن جرّب وبنى ثم سجّل يخسر كلَّ شيءٍ بصمت.

           و`updateUser` تربط البريد بالحساب المجهول **في مكانه**: المعرّف
           نفسه، فلا ينتقل صفٌّ واحد — وهو أأمنُ بكثيرٍ من نسخ تسعةَ عشرَ
           مخزناً وترميم النسب بينها. */
        let session = await sb.auth.getSession().catch(() => ({ data: {} }));
        const current = session && session.data && session.data.session
            ? session.data.session.user : null;

        /* ══ الزائرُ المطويُّ لا يُرقّى ══
           جلستُه حيّةٌ بعد «الخروج» (طيٌّ لا خروج)، فمن سجّل حساباً على
           جهازٍ طواه غيرُه كان يرث بياناته — أسماءَ طلابِ معلّمٍ آخر
           وحضورَهم. فالطيُّ يعني «لستُ أنا»: تُغلق جلستُه ويُبدأ حسابٌ
           نظيف. أمّا من ربط حسابه قبل أن يخرج فيُرقّى كما كان. */
        if (current && current.is_anonymous && flag.has(GUEST_PAUSE)) {
            try { await sb.auth.signOut(); } catch (e) { /* المضيُّ أولى */ }
            forgetGuest();
            invalidateTeacher();
            session = { data: {} };
        }
        const active = (session && session.data && session.data.session)
            ? session.data.session.user : null;

        if (active && active.is_anonymous) {
            const { data: up, error: upErr } = await sb.auth.updateUser({
                email, password, data: { full_name: name.trim() }
            });
            if (upErr) {
                if (/already|registered|exists/i.test(upErr.message || '')) {
                    throw new Error('هذا البريد مسجّل مسبقاً — استخدم تسجيل الدخول.');
                }
                throw new Error(upErr.message || 'تعذّر إنشاء الحساب.');
            }
            const me = (up && up.user) || active;
            /* صار له بريدٌ وكلمةُ مرور — فلا يعود «دخول كزائر» إليه. */
            forgetGuest();
            invalidateTeacher();
            /* الملفُّ موجودٌ منذ كان زائراً — يُحدَّث اسمُه لا يُنشأ. */
            await ensureProfile(me.id, { full_name: name.trim(), phone: normalizePhone(phone) });
            const prof = await fetchProfile(me.id);
            return mapProfile(me, prof);
        }

        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: { data: { full_name: name.trim() } }
        });
        if (error) {
            if (/already.*registered/i.test(error.message)) {
                throw new Error('هذا البريد مسجّل مسبقاً — استخدم تسجيل الدخول.');
            }
            throw new Error(error.message || 'تعذّر إنشاء الحساب.');
        }
        const user = data.user;
        if (!user) throw new Error('تعذّر إنشاء الحساب.');

        /* ولا جلسةَ يعني أنّ «تأكيد البريد» مفعَّلٌ في لوحة Supabase:
           فالحسابُ أُنشئ ولم يُدخَل. وبلا هذا الفحص تبقى جلسةُ الزائر
           حيّةً وتقول الشاشةُ «تم إنشاء حسابك» — تسجيلٌ يكذب. */
        if (!data.session) {
            throw new Error('أُنشئ حسابك — افتح بريدك وأكّده ثم سجّل الدخول.');
        }
        invalidateTeacher();   // معلّمٌ آخر — انظر التعليق في `guestLogin`

        await ensureProfile(user.id, { full_name: name.trim(), phone: normalizePhone(phone) });

        if (global.TeacherDB && global.TeacherDB.hydrate) {
            global.TeacherDB.resetHydration();
            await global.TeacherDB.hydrate();
        }
        const profile = await fetchProfile(user.id);
        return mapProfile(user, profile);
    }

    async function login({ email, password }) {
        email = normalizeEmail(email);
        if (!email || !password) {
            throw new Error('البريد وكلمة المرور مطلوبان.');
        }
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
            if (/invalid.*credentials/i.test(error.message)) {
                throw new Error('البريد أو كلمة المرور غير صحيحة.');
            }
            throw new Error(error.message || 'تعذّر تسجيل الدخول.');
        }
        forgetGuest();         // دخل بحسابه — لم يعد زائرَ هذا الجهاز
        invalidateTeacher();   // معلّمٌ آخر — انظر التعليق في `guestLogin`
        /* الترطيبُ يُطلق ولا يُنتظر: كان الدخولُ يقف حتى تصل جداولُ الطبقة
           الأولى (٦٣٣ ملّي ثانية مقيسة) قبل أن يرى المعلّم شيئاً. وكلُّ
           قراءةٍ تنتظر مخزنَها بنفسها (`awaitStore` في database.js)، فلا
           شاشةَ تُرسم بفراغ. */
        if (global.TeacherDB && global.TeacherDB.hydrate) {
            global.TeacherDB.resetHydration();
            global.TeacherDB.hydrate();
        }
        const profile = await fetchProfile(data.user.id);
        return mapProfile(data.user, profile);
    }

    /** خروجٌ محلّيٌّ سريع: يمسح الجلسة من الجهاز بلا ذهابٍ إلى الخادم.
     *  لشاشة التهيئة — المعلّم لم يبدأ بعد، ورجوعُه إلى شاشة الدخول يجب
     *  أن يكون فورياً. والخروجُ الكامل (`logout`) يبقى للإعدادات: هو الذي
     *  يُبطل الجلسة في الخادم أيضاً. */
    async function logoutLocal() {
        invalidateTeacher();
        if (global.TeacherDB) {
            /* وملفاتُ الكتب تبقى هنا كما تبقى في `logout` — التراجعُ عن
               التهيئة خروجٌ لا حذف. */
            try { await global.TeacherDB.clearLocalCache(global.TeacherDB.LOCAL_ONLY); }
            catch (e) { console.warn('[Auth] تعذّر مسح المخبأ:', e && e.message); }
            try { global.TeacherDB.resetHydration(); } catch (e) { /* لا يوقف الخروج */ }
        }
        /* ══ وحسابُ الزائر يُطوى هنا أيضاً ══
           هذا هو خروجُ زرّ «رجوع» في شاشة التهيئة. وكان يُغلق الجلسةَ —
           **والجلسةُ مفتاحُ حساب الزائر الوحيد**، لا بريدَ له ولا كلمةَ
           مرور. فمن تراجع خطوةً فقد حسابَه إلى الأبد، وترك في القاعدة
           حساباً يتيماً، وأخذ عند دخوله التالي حصّةَ استيرادٍ جديدة.

           فالقاعدةُ واحدةٌ في كلّ أبواب الخروج: **الزائرُ يُطوى ولا يُتلف،
           و«حذف الحساب» وحده هو الذي يُنهيه.** ومن تراجع ثم عاد وجد
           تهيئتَه حيث تركها. */
        if (await isAnonymousNow()) { pauseGuest(); return; }
        try {
            await sb.auth.signOut({ scope: 'local' });
        } catch (e) {
            /* نسخةٌ لا تعرف `scope` — يُخرَج بالطريقة الكاملة. */
            try { await sb.auth.signOut(); } catch (e2) {}
        }
    }

    /**
     * خروجٌ يمسح المخبأ — **إلا ملفاتِ الكتب**.
     *
     * `book_files` ليست مخبأً بل ملفاتُ المعلّم نفسُها: تُحفظ محلياً
     * وحدها بلا نسخةٍ على الخادم. فمسحُها عند الخروج كان **فقداً نهائياً
     * بلا سؤالٍ ولا تحذير** — ورفعُ كتابٍ بثلاثمئة صفحةٍ يضيع بضغطةٍ
     * يوميّة. وتبقى محفوظةً حتى يدخل معلّمٌ **مختلف**، فتُمسح حينها.
     *
     * والمسحُ يُنتظر الآن: التعليقُ القديم قال «الدخولُ التالي يمسح على
     * أي حال»، ولم يعد ذلك صحيحاً بعد إصلاح ق٫١ — فلو سبق الدخولُ المسحَ
     * لقرأ الحسابُ الجديد مخبأَ من قبله.
     */
    async function logout() {
        /* ══ خروجُ الزائر طيٌّ لا خروج ══
           جُرّب حفظُ رمز التجديد لتُستعاد الجلسةُ بعد الخروج، **فلم ينفع**:
           سوبابيس تُبطل الرمزَ على الخادم حتى في الخروج المحلّيّ
           (`scope=local`) — قيس بالنداء الخام يوم ٢٦ أغسطس ٢٠٢٦:
               تجديدٌ قبل الخروج → 200 · وبعده → 400 Refresh Token Not Found
           وحسابُ الزائر بلا بريدٍ ولا كلمة مرور، فلا وسيلةَ أخرى للعودة.

           فخروجُه **لا يمسّ الخادم**: تُمسح شاشاتُه ويُرفع عَلَمُ الطيّ،
           فتراه الشاشاتُ خارجاً وجلستُه حيّةٌ في مكانها. و«العودة إلى
           بياناتي» تُنزل العَلَم فيعود كما كان.

           وصاحبُ البريد خروجُه كامل: له وسيلةُ عودةٍ، وإبطالُ جلسته أحفظُ
           لحسابه. */
        const guest = await isAnonymousNow();
        invalidateTeacher();
        if (global.TeacherDB) {
            try { await global.TeacherDB.clearLocalCache(global.TeacherDB.LOCAL_ONLY); }
            catch (e) { console.warn('[Auth] تعذّر مسح المخبأ:', e && e.message); }
            try { global.TeacherDB.resetHydration(); } catch (e) { /* لا يوقف الخروج */ }
        }
        if (guest) { pauseGuest(); return; }
        await sb.auth.signOut();
    }

    /**
     * خروجٌ من **كلّ الأجهزة** — لا من هذا وحده.
     *
     * ── لماذا يحتاجها المعلّم ──
     * من نسي حسابه مفتوحاً على حاسب المدرسة، أو أعار جواله، أو شكّ أنّ
     * أحداً دخل عليه — لا يملك اليوم إلّا تغييرَ كلمة المرور. وهو يعمل
     * (قيس ٢٦ أغسطس: تغييرُ الكلمة يقتل جلساتِ بقيّة الأجهزة فوراً) لكنّه
     * يفرض عليه اختراعَ كلمةٍ جديدةٍ وحفظَها لأجل خروجٍ من جهازٍ نسيه.
     *
     * و`scope: 'global'` تُبطل الجلساتِ كلَّها في الخادم — بما فيها هذه.
     * فرمزُ الوصول يموت في حينه لا بعد ساعة: سوبابيس تُطابق الجلسةَ في
     * كلّ نداء، فالمسروقُ يصير ورقةً بلا قيمة (قيس: `403 Session from
     * session_id claim in JWT does not exist`).
     *
     * ── ولا تُعرض على الزائر ──
     * جلستُه **مفتاحُ حسابه الوحيد** — لا بريدَ له ولا كلمةَ مرور. فخروجٌ
     * شاملٌ يعني ضياعَ حسابه إلى الأبد، وهي نفسُ الحفرة التي سُدّت في
     * `logout` و`logoutLocal`. فتُرفض هنا صراحةً، ولا يُكتفى بإخفاء الزرّ.
     */
    async function logoutEverywhere() {
        if (await isAnonymousNow()) {
            throw new Error('حساب الزائر جلستُه مفتاحُه الوحيد — اربط حسابك ببريدك أوّلاً.');
        }
        invalidateTeacher();
        if (global.TeacherDB) {
            try { await global.TeacherDB.clearLocalCache(global.TeacherDB.LOCAL_ONLY); }
            catch (e) { console.warn('[Auth] تعذّر مسح المخبأ:', e && e.message); }
            try { global.TeacherDB.resetHydration(); } catch (e) { /* لا يوقف الخروج */ }
        }
        const { error } = await sb.auth.signOut({ scope: 'global' });
        if (error) throw new Error(error.message || 'تعذّر تسجيل الخروج من الأجهزة.');
        return true;
    }

    /** أصاحبُ الجلسة الحاليّةِ زائرٌ مجهول؟ — سؤالٌ محلّيٌّ لا يمسّ الشبكة. */
    async function isAnonymousNow() {
        try {
            /* المحفوظةُ تُقرأ هنا أيضاً: لو ظُنّ الزائرُ غيرَ زائرٍ لأنّ
               الشبكةَ غابت، لخرج خروجاً كاملاً — وذاك يقتل حسابه. */
            const { session } = await readSession();
            return !!(session && session.user && session.user.is_anonymous);
        } catch (e) { return false; }
    }

    /* حذف الحساب نهائياً — تشترطه آبل على كل تطبيق يُنشئ حسابات.
       الترتيب مقصود: ملفات التخزين أولاً لأن حذف الحساب لا يتتالى إليها
       (السطر في storage.objects ليس ابناً للمعلم في قاعدة البيانات)، فلو
       حذفنا الحساب أولاً لبقيت كتبه على الخادم بلا صاحب ولا صلاحية تمسحها. */
    /**
     * يُفرغ مجلّدَي المعلّم في التخزين: الكتب والشواهد.
     *
     * كلُّ مخزنٍ يُمسح على حدة، وشواهدُ الاستراتيجيات فيها **صورُ طلاب** —
     * فبقاؤها بعد أن يمسح المعلّم بياناته خرقُ خصوصيةٍ لا ملفاتٌ يتيمة،
     * ومخالفةٌ لشرط آبل ٥٫١٫١(v).
     *
     * وحلقةُ الترقيم لازمة: حدُّ `list()` الافتراضيُّ **مئةُ ملف**، فمعلّمٌ
     * عنده مئةٌ وعشرون شاهداً كانت تبقى صورُ طلابه في الخادم إلى الأبد.
     * (ق٫٣)
     *
     * @param {string} uid معرّفُ المعلّم — مجلّدُه في كلّ مخزن.
     */
    /* مخازنُ ملفات المعلّم — والقائمةُ نفسُها في دالّتَي الحافّة
       (`delete-account` و`purge-user-files`) وفي مكنسة `tools/`.
       مخزنٌ جديدٌ يُضاف في الأربعة.

       و`books` ليس منها: أُقفل ثمّ حُذف (٢٦ أغسطس ٢٠٢٦) — الكتبُ تُحفظ على
       جهاز المعلّم منذ ١٢ مايو، فلم يبقَ ما يُرفع إليه. */
    const USER_BUCKETS = ['evidence', 'portfolio'];

    /**
     * يمسح ملفات المعلّم من المخازن قبل حذف حسابه.
     *
     * **وفشلُ مخزنٍ لا يُسقط ما بعده.** كان `throw` داخل الحلقة يقطع
     * المسحَ كلَّه عند أوّل تعثّر، فتعذُّرُ `books` يمنع مسحَ `evidence`
     * أصلاً — وهي ملفاتٌ لا يستطيع أحدٌ حذفَها بعد زوال الحساب. فصار كلُّ
     * مخزنٍ يُحاوَل وحده، ويُبلَّغ عن الفشل بعد المحاولة الأخيرة لا قبلها.
     *
     * @returns {Promise<string[]>} أسماءُ ما تعذّر مسحُه (فارغةٌ عند النجاح).
     */
    async function purgeStorage(uid) {
        const PAGE = 100;
        const failed = [];
        for (const bucket of USER_BUCKETS) {
            try {
                /* غوصٌ في المجلّدات الفرعيّة: `list` تُرجع مستوىً واحداً،
                   والمجلّدُ يأتي مدخلاً بـ`id = null` لا ملفاً — وتمريرُه إلى
                   `remove` لا يحذفه ولا ما تحته. فمن رفع في `uid/sub/x.jpg`
                   بقيت ملفاتُه بعد زوال حسابه بلا سبيلٍ لأحدٍ إليها. */
                const walk = async (prefix, depth = 0) => {
                    if (depth > 8) return;
                    for (let guard = 0; guard < 200; guard++) {
                        const { data: entries, error } = await sb.storage.from(bucket)
                            .list(prefix, { limit: PAGE, offset: guard * PAGE });
                        if (error) throw error;
                        if (!entries || !entries.length) break;
                        const files = entries.filter((e) => e.id !== null)
                                             .map((e) => prefix + '/' + e.name);
                        if (files.length) {
                            const { error: rmErr } = await sb.storage.from(bucket).remove(files);
                            if (rmErr) throw rmErr;
                        }
                        for (const e of entries.filter((e) => e.id === null)) {
                            await walk(prefix + '/' + e.name, depth + 1);
                        }
                        /* دفعةٌ أقصرُ من الصفحة تعني أنّ المجلد فرغ. */
                        if (entries.length < PAGE) break;
                    }
                };
                await walk(uid);
            } catch (e) {
                console.warn('[Auth] تعذّر مسحُ مخزن ' + bucket + ':', e && e.message);
                failed.push(bucket);
            }
        }
        return failed;
    }

    /* ==========================================================================
       استرجاع كلمة المرور
       ==========================================================================
       لم يكن في التطبيق كلُّه سبيلٌ لاستعادة كلمةٍ منسيّة — فمعلّمٌ ينساها
       يفقد حسابه وكلَّ ما فيه، تماماً كالزائر الذي مُسح تخزينُه. وهذا يصير
       أشدَّ مع الاشتراك: يفقد حساباً **دفع** فيه.

       ثلاثُ خطوات: يطلب رابطاً، فيصله بريدٌ، فيفتحه فيختار كلمةً جديدة.
       ========================================================================== */

    /**
     * يُرسل رابطَ الاستعادة.
     * **ولا يقول هل البريد مسجَّلٌ أم لا** — ولا حتى بالخطأ الراجع: لو
     * فرّقنا بين «أُرسل» و«غير موجود» لصار بإمكان أيّ غريبٍ أن يجرّب
     * بريداً بريداً ليعرف من سجّل في التطبيق. فالجوابُ واحدٌ في الحالتين.
     */
    async function requestPasswordReset(email) {
        const clean = String(email || '').trim();
        if (!clean) throw new Error('اكتب بريدك الإلكتروني.');
        /* يعود إلى صفحة التطبيق نفسِها؛ ويلتقط `consumeRecoveryLink` الرمزَ
           من العنوان عند الإقلاع. */
        const redirectTo = global.location.origin + global.location.pathname;
        const { error } = await sb.auth.resetPasswordForEmail(clean, { redirectTo });
        if (error) {
            /* حدُّ الإرسال يُقال صراحةً — وهو الخطأ الوحيد الذي يفيد المعلّمَ
               علمُه، ولا يكشف عن أحد. */
            if (/rate|limit|seconds|frequency/i.test(error.message || '')) {
                throw new Error('طُلب الرابط قبل قليل. انتظر دقيقةً ثمّ أعد المحاولة.');
            }
            console.warn('[Auth] reset request failed:', error.message);
        }
        return true;
    }

    /**
     * يلتقط رمزَ الاستعادة من عنوان الصفحة إن وُجد، ويفتح به جلسةً مؤقّتة.
     *
     * والعميلُ مضبوطٌ على `detectSessionInUrl: false` لأنّ التطبيق يتنقّل
     * بالـhash — فلو التقطها بنفسه لتضاربت مع مسارات الشاشات. فتُلتقط هنا
     * **قبل أن يعمل الموجّه**، ويُمسح العنوان بعدها فلا يبقى رمزٌ في شريط
     * المتصفّح ولا في سجلّ التصفّح.
     *
     * @returns {Promise<'recovery'|'error'|null>}
     */
    async function consumeRecoveryLink() {
        const raw = String(global.location.hash || '').replace(/^#/, '');
        if (!raw || raw.indexOf('=') < 0) return null;
        const q = new URLSearchParams(raw);

        if (q.get('error') || q.get('error_description')) {
            const d = q.get('error_description') || q.get('error');
            clearHash();
            console.warn('[Auth] recovery link error:', d);
            return 'error';
        }
        if (q.get('type') !== 'recovery') return null;

        const access_token  = q.get('access_token');
        const refresh_token = q.get('refresh_token');
        if (!access_token || !refresh_token) { clearHash(); return 'error'; }

        const { error } = await sb.auth.setSession({ access_token, refresh_token });
        clearHash();
        if (error) {
            console.warn('[Auth] setSession from recovery failed:', error.message);
            return 'error';
        }
        invalidateTeacher();
        return 'recovery';
    }

    function clearHash() {
        try {
            global.history.replaceState(null, '',
                global.location.pathname + global.location.search);
        } catch (e) { global.location.hash = ''; }
    }

    /** يحفظ الكلمة الجديدة للجلسة المفتوحة بالرابط. */
    async function setNewPassword(password) {
        const pw = String(password || '');
        if (pw.length < 6) throw new Error('كلمة المرور ٦ أحرف على الأقل.');
        const { data, error } = await sb.auth.updateUser({ password: pw });
        if (error) {
            if (/same|different from the old/i.test(error.message || '')) {
                throw new Error('هذه كلمتك الحالية — اختر كلمةً غيرها.');
            }
            if (/session|expired|invalid|token/i.test(error.message || '')) {
                throw new Error('انتهت صلاحية الرابط. اطلب رابطاً جديداً.');
            }
            throw new Error(error.message || 'تعذّر حفظ كلمة المرور.');
        }
        if (!data || !data.user) throw new Error('تعذّر حفظ كلمة المرور.');
        invalidateTeacher();
        return true;
    }

    async function deleteAccount() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('لست مسجّل الدخول.');
        const { data: { session } } = await sb.auth.getSession();
        if (!session || !session.access_token) throw new Error('انتهت جلستك — سجّل الدخول ثمّ أعد المحاولة.');

        /* ══ مساران: الخادمُ أولاً، والعميلُ احتياطاً ══
           الأوّل دالّةُ حافّةٍ تحمل مفتاح الخدمة: تمسح الملفات عبر واجهة
           التخزين ثمّ تحذف الحساب — **خطوةٌ واحدةٌ على الخادم لا تنقطع في
           منتصفها بانقطاع شبكة الجوّال**، فلا تبقى ملفاتٌ بلا مالكٍ يصل
           إليها أحد.

           والثاني هو المسار القديم كما كان: مسحٌ من الجهاز ثمّ نداءُ الدالّة
           في القاعدة. يبقى لأنّ الحسابَ أولى بالحذف من كلّ شيء: دالّةٌ لم
           تُنشر بعد، أو خطأٌ عارضٌ فيها، أو شبكةٌ ردّت خطأً — لا يجوز أن
           تترك المعلّمَ حبيسَ حسابٍ طلب حذفَه. (وهو شرطُ آبل 5.1.1(v).) */
        let deleted = false;
        try {
            const res = await fetch(DELETE_ACCOUNT_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token }
            });
            const body = await res.json().catch(() => null);
            if (res.ok && body && body.ok) {
                deleted = true;
                if (body.failed && body.failed.length) {
                    console.warn('[Auth] مخازنُ لم تُمسح على الخادم: ' + body.failed.join('، '));
                }
            } else {
                console.warn('[Auth] دالّةُ الحذف ردّت ' + res.status + ' — يُسلك المسار الاحتياطيّ.');
            }
        } catch (e) {
            console.warn('[Auth] تعذّر بلوغُ دالّة الحذف — يُسلك المسار الاحتياطيّ:', e && e.message);
        }

        if (!deleted) {
            try {
                const failed = await purgeStorage(user.id);
                if (failed.length) console.warn('[Auth] مخازنُ لم تُمسح: ' + failed.join('، '));
            } catch (e) {
                console.warn('[Auth] storage cleanup failed:', e);
            }
            const { error } = await sb.rpc('delete_own_account');
            if (error) throw new Error(error.message || 'تعذّر حذف الحساب.');
        }

        invalidateTeacher();
        /* الحسابُ زال، فلا شيءَ يُعاد إليه. */
        forgetGuest();
        if (global.TeacherDB) {
            /* هنا تُمحى ملفاتُ الكتب أيضاً — الحسابُ ذهب، ولا معنى
               لإبقاء ملفاته على الجهاز. وهو عكسُ `logout` عن قصد. */
            try { await global.TeacherDB.clearLocalCache(); } catch (e) { /* الحساب أولى */ }
            try { global.TeacherDB.resetHydration(); } catch (e) { /* لا يوقف الحذف */ }
        }
        /* الجلسة صارت لحساب محذوف — نُسقطها محلياً ولو رفض الخادم. */
        try { await sb.auth.signOut(); } catch (e) { /* متوقّع */ }
    }

    /* ذاكرة قصيرة لبيانات المعلم: التنقّل بين التبويبات يستدعي currentTeacher()
       مرّتين-ثلاثاً في كل مرة (حارس المصادقة + اسم الهيدر + رسم الصفحة)، وكل
       استدعاء كان يعيد getSession() + قراءة IndexedDB للملف — فيتباطأ التنقّل.
       نخزّن النتيجة لثوانٍ قليلة، ونبطلها فوراً عند أي تغيّر (خروج/دخول/تعديل الملف). */
    let _teacherCache = null;
    let _teacherCacheAt = 0;
    const TEACHER_TTL = 3000;

    function invalidateTeacher() { _teacherCache = null; _teacherCacheAt = 0; }

    /* ══════════════════════════════════════════════════════════════════
       الجلسةُ لا تموت لأنّ الشبكةَ غابت

       `getSession` تُعيد الجلسةَ من التخزين، فإن انتهت صلاحيّةُ رمزها
       (ساعةٌ واحدة) جدّدته من الخادم. **وإن سقط التجديد سقوطَ شبكةٍ
       أعادت `null` — كأنّ المعلّم خرج.** فالموجّهُ يطرده إلى شاشة الدخول،
       ويضغط «الدخول كزائر» فتقول له: «انتهت جلسةُ حسابك ولا سبيل إليه».

       **وحسابُه لم يمسّه شيء.** الرمزُ ما زال في جهازه، والحسابُ قائمٌ في
       الخادم بكلّ فصوله. قِيس يوم ٣٠ أغسطس ٢٠٢٦ (رمزٌ منتهٍ + شبكةٌ
       مقطوعة): `getSession` تُعيد NULL و`Failed to fetch`، والرمزُ
       **باقٍ في التخزين**، و`currentTeacher` تُعيد `null`.

       فالقاعدةُ هنا: **تُصدَّق الجلسةُ الميّتةُ إن رفضها الخادم، لا إن
       عجزنا عن سؤاله.** ومع سقوط الشبكة تُقرأ الجلسةُ من التخزين ويمضي
       المعلّم على مخبئه — والكتابةُ تنتظر في الصندوق الصادر.
       ══════════════════════════════════════════════════════════════════ */

    /** أسقوطُ شبكةٍ هذا أم رفضٌ من الخادم؟ الفرقُ هو الفرقُ بين
     *  «اعمل بلا اتصال» و«حسابك انتهى». */
    function isNetErr(e) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        const m = String((e && e.message) || '').toLowerCase();
        return /failed to fetch|networkerror|load failed|network request failed|fetch failed|connection|timeout|offline/.test(m);
    }

    /** الجلسةُ المخزَّنةُ في الجهاز كما كتبها العميل، أو `null`. */
    function storedSession() {
        try {
            const raw = global.localStorage.getItem('teacher-app-auth');
            if (!raw) return null;
            const o = JSON.parse(raw);
            const sess = o && (o.currentSession || o.session || o);
            return (sess && sess.user && sess.user.id) ? sess : null;
        } catch (e) { return null; }
    }

    /**
     * الجلسةُ من الخادم، وإلّا من الجهاز حين تسقط الشبكةُ لا الجلسة.
     * @returns {Promise<{session:object|null, stale:boolean}>}
     *          و`stale` تعني: هذه من الجهاز، لم يؤكّدها الخادمُ الآن.
     */
    async function readSession() {
        let res = null;
        try { res = await sb.auth.getSession(); }
        catch (e) { res = { error: e }; }

        const live = res && res.data && res.data.session;
        if (live) return { session: live, stale: false };

        /* رفضٌ صريحٌ من الخادم: الجلسةُ ماتت فعلاً. */
        if (res && res.error && !isNetErr(res.error)) return { session: null, stale: false };
        /* لا خطأَ ولا جلسة: لم يدخل أحدٌ أصلاً. */
        if (!res || !res.error) return { session: null, stale: false };

        const kept = storedSession();
        return kept ? { session: kept, stale: true } : { session: null, stale: false };
    }

    async function currentTeacher() {
        const now = Date.now();
        if (_teacherCache && (now - _teacherCacheAt) < TEACHER_TTL) return _teacherCache;
        // getSession() reads from localStorage (no network) → instant.
        // getUser() would hit /auth/v1/user every time, which slows navigation.
        const { session } = await readSession();
        const user = session ? session.user : null;
        if (!user) { invalidateTeacher(); return null; }
        /* زائرٌ طوى جلستَه: حيٌّ عند الخادم، خارجٌ عند الشاشات. */
        if (user.is_anonymous && flag.has(GUEST_PAUSE)) { invalidateTeacher(); return null; }
        const profile = await fetchProfile(user.id);
        _teacherCache = mapProfile(user, profile);
        _teacherCacheAt = Date.now();
        return _teacherCache;
    }

    /* ══════════════════════════════════════════════════════════════════
       الزائر بلا انتظار

       التسجيلُ ذهابٌ إلى فرانكفورت — قرابةَ ١٥٠ ملّي ثانية في أحسن حال،
       ومئاتٌ في الشبكات الضعيفة. ولا سبيل إلى إنقاصه؛ السبيلُ ألّا يحبس
       الشاشة: تُفتح شاشةُ التهيئة فوراً — وهي لا تحتاج حساباً لتُرسم،
       حقولُها فارغةٌ لحسابٍ جديد على أي حال — والتسجيلُ يمضي خلفها.

       والحسابُ يُنتظر عند **الحفظ** وحده (`whenGuestReady`)، وقد تمّ
       قبله بزمنٍ طويل: المعلّم يكتب اسمه ومدرسته أولاً.
       ══════════════════════════════════════════════════════════════════ */
    let _guestPending = null;

    function beginGuest(opts) {
        if (_guestPending) return _guestPending;
        _guestPending = guestLogin(opts).finally(() => { _guestPending = null; });
        return _guestPending;
    }

    /** هل تسجيلُ زائرٍ جارٍ الآن؟ — يقرؤها الموجّه فلا يطرد شاشةً تنتظر. */
    function guestPending() { return !!_guestPending; }

    /** ينتظر تمامَ تسجيل الزائر إن كان جارياً — للحفظ وما يحتاج حساباً. */
    async function whenGuestReady() {
        if (_guestPending) { try { await _guestPending; } catch (e) { /* يُبلَّغ في مكانه */ } }
    }

    async function guestLogin(opts) {
        /* ══ عودةٌ إلى حساب هذا الجهاز ══
           الجلسةُ لم تُغلق أصلاً — رُفع عنها الطيُّ فحسب. */
        resumeGuest();
        try {
            const { session: cur } = await readSession();
            const live = cur ? cur.user : null;
            if (live && live.is_anonymous) {
                markGuest();
                invalidateTeacher();
                if (global.TeacherDB && global.TeacherDB.hydrate) {
                    global.TeacherDB.resetHydration();
                    global.TeacherDB.hydrate();
                }
                const prof = await fetchProfile(live.id);
                return mapProfile(live, prof || { full_name: 'معلم زائر' });
            }
        } catch (e) { /* لا جلسة — يُنظر أدناه هل يجوز إنشاءُ حساب */ }

        /* ══ لا يُنشأ حسابٌ ثانٍ في صمت ══
           رايةُ الجهاز تقول إنّ له حسابَ زائرٍ، ولم تُفتح جلسةٌ حيّة: فهي
           ماتت. وإنشاءُ حسابٍ الآن يعني أنّ القديمَ لا سبيلَ إليه أبداً —
           لا بريدَ له ولا كلمةَ مرور. فيُرفع الخبرُ إلى الشاشة، ولا يمضي
           إلّا بطلبٍ صريحٍ منها (`allowNew`). */
        if (hasSavedGuest() && !(opts && opts.allowNew)) {
            /* ── وقبل أن نقول «ضاع» نسأل: أغائبةٌ الشبكةُ أم الجلسة؟ ──
               رمزُ الجهاز ما زال في مكانه وإنّما عجزنا عن تجديده. فيُقال
               «لا اتصال» ويُترك الحسابُ كما هو — ولا يُعرض عليه أن يُنشئ
               بديلاً يقتل القديم. (بلاغُ المعلّم ٣٠ أغسطس ٢٠٢٦.) */
            if (storedSession() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
                const off = new Error(
                    'لا اتصال بالشبكة الآن — حسابك على هذا الجهاز كما هو. '
                  + 'أعد المحاولة حين تعود الشبكة.');
                off.code = 'offline';
                throw off;
            }
            const err = new Error(
                'انتهت جلسةُ حساب الزائر على هذا الجهاز، ولا سبيل إلى استعادتها — '
              + 'الجلسةُ كانت مفتاحَه الوحيد. وإن أنشأتَ حساباً جديداً فلن تعود '
              + 'بيانات القديم.');
            err.code = 'guest-session-lost';
            throw err;
        }

        const { data, error } = await sb.auth.signInAnonymously();
        if (error) {
            throw new Error(error.message || 'تعذّر الدخول كزائر.');
        }
        const user = data.user;
        markGuest();

        /* إبطالُ ذاكرة المعلّم هنا لا في مُستمع الجلسة وحده: المستمعُ يعمل
           في دورةٍ لاحقة، فبين الدخول ونداء `currentTeacher` قد تُعاد
           بطاقةُ الحساب السابق — ثلاثُ ثوانٍ هي عمرُ الذاكرة. ومن كتب بها
           كتب صفّاً بمعرّفٍ ليس معرّفَه، فترفضه سياسةُ الحماية:
           «new row violates row-level security policy». وهذا ما كان يوقف
           `contrast.html` عند التجهيز. */
        invalidateTeacher();

        /* ══════════════════════════════════════════════════════════════
           دخولُ الزائر: طلبٌ واحدٌ ينتظره المعلّم لا أربعة.

           كان ينتظر: تسجيلاً، ثم إنشاءَ ملفٍّ، ثم ترطيبَ الجداول، ثم
           قراءةَ الملفّ — أربعةَ ذهاباتٍ إلى الخادم قبل أن يرى شيئاً.

           وثلاثةٌ منها لا يحتاجها: الحسابُ جديدٌ فارغٌ لا بيانات فيه
           تُقرأ، وملفُّه يُنشأ في الخلفية (ثم تكتبه التهيئةُ على أي حال
           حين يحفظ اسمه)، والجداولُ فارغةٌ كلُّها.

           فبقي التسجيلُ وحده، والباقي يمضي خلفه.
           ══════════════════════════════════════════════════════════════ */
        ensureProfile(user.id, { full_name: 'معلم زائر' }).catch(() => {});
        if (global.TeacherDB && global.TeacherDB.hydrate) {
            global.TeacherDB.resetHydration();
            global.TeacherDB.hydrate();
        }
        return mapProfile(user, { full_name: 'معلم زائر' });
    }

    async function changePassword(currentPassword, newPassword) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error('كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل.');
        }
        // Supabase doesn't require the current password to update,
        // but we re-verify it for UX parity with the old flow.
        const me = await currentTeacher();
        if (!me) throw new Error('غير مسجّل دخول.');
        if (!me.email) throw new Error('لا يمكن تغيير كلمة سر حساب الزائر.');

        const { error: vErr } = await sb.auth.signInWithPassword({
            email: me.email,
            password: currentPassword || ''
        });
        if (vErr) throw new Error('كلمة المرور الحالية غير صحيحة.');

        const { error } = await sb.auth.updateUser({ password: newPassword });
        if (error) throw new Error(error.message || 'تعذّر تحديث كلمة المرور.');
        return true;
    }

    /** Update profile fields (name, school, subject, subjects, phone, photo_url, message, vision). */
    async function updateProfile(fields) {
        const me = await currentTeacher();
        if (!me) throw new Error('غير مسجّل دخول.');

        const payload = {};
        if ('name' in fields)        payload.full_name = (fields.name || '').toString().trim();
        if ('school_name' in fields) payload.school    = (fields.school_name || '').toString().trim();
        if ('subject' in fields)     payload.subject   = (fields.subject || '').toString().trim();
        if ('subjects' in fields) {
            payload.subjects = Array.isArray(fields.subjects)
                ? fields.subjects.map((s) => String(s).trim()).filter(Boolean)
                : [];
        }
        if ('phone' in fields)     payload.phone     = (fields.phone || '').toString().trim();
        if ('photo_url' in fields) payload.photo_url = fields.photo_url || null;
        if ('message' in fields)   payload.message   = fields.message || '';
        if ('vision' in fields)    payload.vision    = fields.vision || '';

        const { error } = await sb
            .from('teachers')
            .update(payload)
            .eq('id', me.id);
        if (error) throw new Error(error.message || 'تعذّر حفظ التغييرات.');

        invalidateTeacher();          // بيانات الملف تغيّرت — أعد الجلب
        return await currentTeacher();
    }

    /** Subscribe to auth changes. Callback receives the mapped teacher (or null). */
    function onAuthChange(callback) {
        const { data } = sb.auth.onAuthStateChange(async (_event, session) => {
            invalidateTeacher();      // الجلسة تغيّرت — أبطل الذاكرة
            if (!session || !session.user) {
                callback(null);
                return;
            }
            const profile = await fetchProfile(session.user.id);
            callback(mapProfile(session.user, profile));
        });
        return data && data.subscription
            ? () => data.subscription.unsubscribe()
            : () => {};
    }

    global.Auth = {
        register, login, logout, logoutLocal, logoutEverywhere, deleteAccount, purgeStorage, currentTeacher, guestLogin,
        requestPasswordReset, consumeRecoveryLink, setNewPassword,
        beginGuest, guestPending, whenGuestReady, hasSavedGuest, forgetGuest,
        changePassword, updateProfile, onAuthChange,
        normalizePhone, validPhone
    };
})(window);
