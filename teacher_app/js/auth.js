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
            experience_years: p.experience_years ?? '',
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

    async function register({ name, email, password, school_name, subjects, phone }) {
        email = normalizeEmail(email);
        const subjectList = Array.isArray(subjects)
            ? subjects.map((s) => String(s).trim()).filter(Boolean)
            : [];
        if (!name || !email || !password || !school_name || subjectList.length === 0) {
            throw new Error('يرجى تعبئة جميع الحقول المطلوبة، واختيار مادة واحدة على الأقل.');
        }
        if (password.length < 6) {
            throw new Error('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');
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

        await ensureProfile(user.id, {
            full_name: name.trim(),
            school: school_name.trim(),
            subject: subjectList[0],
            subjects: subjectList,
            phone: (phone || '').trim()
        });

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
        if (global.TeacherDB && global.TeacherDB.hydrate) {
            global.TeacherDB.resetHydration();
            await global.TeacherDB.hydrate();
        }
        const profile = await fetchProfile(data.user.id);
        return mapProfile(data.user, profile);
    }

    async function logout() {
        if (global.TeacherDB) {
            try { await global.TeacherDB.clearLocalCache(); } catch (e) {}
            try { global.TeacherDB.resetHydration(); } catch (e) {}
        }
        await sb.auth.signOut();
    }

    async function currentTeacher() {
        // getSession() reads from localStorage (no network) → instant.
        // getUser() would hit /auth/v1/user every time, which slows navigation.
        const { data } = await sb.auth.getSession();
        const user = data && data.session ? data.session.user : null;
        if (!user) return null;
        const profile = await fetchProfile(user.id);
        return mapProfile(user, profile);
    }

    async function guestLogin() {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) {
            throw new Error(error.message || 'تعذّر الدخول كزائر.');
        }
        const user = data.user;
        await ensureProfile(user.id, {
            full_name: 'معلم زائر',
            school: 'مدرسة تجريبية',
            subject: 'الرياضيات',
            subjects: ['الرياضيات', 'العلوم']
        });
        if (global.TeacherDB && global.TeacherDB.hydrate) {
            global.TeacherDB.resetHydration();
            await global.TeacherDB.hydrate();
        }
        const profile = await fetchProfile(user.id);
        return mapProfile(user, profile);
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

        return await currentTeacher();
    }

    /** Subscribe to auth changes. Callback receives the mapped teacher (or null). */
    function onAuthChange(callback) {
        const { data } = sb.auth.onAuthStateChange(async (_event, session) => {
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
        register, login, logout, currentTeacher, guestLogin,
        changePassword, updateProfile, onAuthChange
    };
})(window);
