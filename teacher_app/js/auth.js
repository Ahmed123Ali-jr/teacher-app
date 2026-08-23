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

    /* التسجيل حسابٌ فقط: المدرسة والمواد والجوال تُجمع في شاشة التهيئة
       مرتّبةً — «عنك» ثم «مدرستك». وكانت المدرسة تُطلب في الشاشتين معاً. */
    async function register({ name, email, password }) {
        email = normalizeEmail(email);
        if (!name || !email || !password) {
            throw new Error('يرجى تعبئة جميع الحقول المطلوبة.');
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

        if (current && current.is_anonymous) {
            const { data: up, error: upErr } = await sb.auth.updateUser({
                email, password, data: { full_name: name.trim() }
            });
            if (upErr) {
                if (/already|registered|exists/i.test(upErr.message || '')) {
                    throw new Error('هذا البريد مسجّل مسبقاً — استخدم تسجيل الدخول.');
                }
                throw new Error(upErr.message || 'تعذّر إنشاء الحساب.');
            }
            const me = (up && up.user) || current;
            invalidateTeacher();
            /* الملفُّ موجودٌ منذ كان زائراً — يُحدَّث اسمُه لا يُنشأ. */
            await ensureProfile(me.id, { full_name: name.trim() });
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

        await ensureProfile(user.id, { full_name: name.trim() });

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
        invalidateTeacher();
        if (global.TeacherDB) {
            try { await global.TeacherDB.clearLocalCache(global.TeacherDB.LOCAL_ONLY); }
            catch (e) { console.warn('[Auth] تعذّر مسح المخبأ:', e && e.message); }
            try { global.TeacherDB.resetHydration(); } catch (e) { /* لا يوقف الخروج */ }
        }
        await sb.auth.signOut();
    }

    /* حذف الحساب نهائياً — تشترطه آبل على كل تطبيق يُنشئ حسابات.
       الترتيب مقصود: ملفات التخزين أولاً لأن حذف الحساب لا يتتالى إليها
       (السطر في storage.objects ليس ابناً للمعلم في قاعدة البيانات)، فلو
       حذفنا الحساب أولاً لبقيت كتبه على الخادم بلا صاحب ولا صلاحية تمسحها. */
    async function deleteAccount() {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('لست مسجّل الدخول.');

        try {
            /* كل مخزن يُمسح على حدة: شواهد الاستراتيجيات فيها صور طلاب،
               وبقاؤها بعد حذف الحساب خرق للخصوصية لا مجرّد ملفات يتيمة. */
            /* حلقةُ ترقيمٍ حتى يفرغ المجلد: `list()` حدُّها الافتراضيّ
               **مئة ملف**، فمعلّمٌ عنده مئةٌ وعشرون شاهداً كانت تبقى صورُ
               طلابه في الخادم إلى الأبد — خرقُ خصوصيةٍ لا ملفاتٌ يتيمة،
               ومخالفةٌ لشرط آبل ٥٫١٫١(v). (ق٫٣) */
            const PAGE = 100;
            for (const bucket of ['books', 'evidence']) {
                for (let guard = 0; guard < 200; guard++) {
                    const { data: files, error } = await sb.storage.from(bucket)
                        .list(user.id, { limit: PAGE });
                    if (error) throw error;
                    if (!files || !files.length) break;
                    const { error: rmErr } = await sb.storage.from(bucket)
                        .remove(files.map((f) => user.id + '/' + f.name));
                    if (rmErr) throw rmErr;
                    /* دفعةٌ أقصرُ من الصفحة تعني أنّ المجلد فرغ. */
                    if (files.length < PAGE) break;
                }
            }
        } catch (e) {
            /* تعذّر مسح الملفات لا يمنع حذف الحساب — الحساب أولى بالحذف،
               والملفات تبقى بلا صلاحية وصول لأحد. */
            console.warn('[Auth] storage cleanup failed:', e);
        }

        const { error } = await sb.rpc('delete_own_account');
        if (error) throw new Error(error.message || 'تعذّر حذف الحساب.');

        invalidateTeacher();
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

    async function currentTeacher() {
        const now = Date.now();
        if (_teacherCache && (now - _teacherCacheAt) < TEACHER_TTL) return _teacherCache;
        // getSession() reads from localStorage (no network) → instant.
        // getUser() would hit /auth/v1/user every time, which slows navigation.
        const { data } = await sb.auth.getSession();
        const user = data && data.session ? data.session.user : null;
        if (!user) { invalidateTeacher(); return null; }
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

    function beginGuest() {
        if (_guestPending) return _guestPending;
        _guestPending = guestLogin().finally(() => { _guestPending = null; });
        return _guestPending;
    }

    /** هل تسجيلُ زائرٍ جارٍ الآن؟ — يقرؤها الموجّه فلا يطرد شاشةً تنتظر. */
    function guestPending() { return !!_guestPending; }

    /** ينتظر تمامَ تسجيل الزائر إن كان جارياً — للحفظ وما يحتاج حساباً. */
    async function whenGuestReady() {
        if (_guestPending) { try { await _guestPending; } catch (e) { /* يُبلَّغ في مكانه */ } }
    }

    async function guestLogin() {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) {
            throw new Error(error.message || 'تعذّر الدخول كزائر.');
        }
        const user = data.user;

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
        register, login, logout, logoutLocal, deleteAccount, currentTeacher, guestLogin,
        beginGuest, guestPending, whenGuestReady,
        changePassword, updateProfile, onAuthChange
    };
})(window);
