/* ==========================================================================
   database.js — Supabase + local-IndexedDB cache wrapper.

   Reads return from a local IndexedDB cache (instant). Writes go to Supabase
   first, then update the local cache. The cache is hydrated in one bulk fetch
   on login so the rest of the session feels offline-fast.

   Public API (window.TeacherDB) is unchanged so views don't need to know.
   ========================================================================== */

(function (global) {
    'use strict';

    const sb = global.SB;
    if (!sb) {
        console.error('[TeacherDB] window.SB (Supabase client) not initialised.');
        return;
    }

    /* ---------- store name → table name map ---------- */
    const TABLE = {
        teachers:     'teachers',
        classes:      'classes',
        students:     'students',
        attendance:   'attendance',
        participation:'participation',
        assignments:  'assignments',
        exams:        'exams',
        worksheets:   'worksheets',
        books:        'books',
        strategies:   'strategies',
        strategy_logs:'strategy_logs',
        initiative_logs:'initiative_logs',
        initiatives:  'initiatives',
        schedule:     'schedule',
        reminders:    'reminders',
        portfolio:    'portfolio',
        settings:     'app_settings',
        ai_usage:     'ai_usage'
    };

    const STORE_NAMES = Object.keys(TABLE);

    /* ---------- IndexedDB cache layer ---------- */

    const CACHE_DB_NAME    = 'teacher_app_cache';
    const CACHE_DB_VERSION = 4;   // bumped: added `initiative_logs` store

    /** Cache store schema: keyPath + indexes for fast filtering. */
    const CACHE_STORES = [
        { name: 'teachers',      keyPath: 'id' },
        { name: 'classes',       keyPath: 'id',          indexes: [['teacher_id']] },
        { name: 'students',      keyPath: 'id',          indexes: [['class_id'], ['teacher_id']] },
        { name: 'attendance',    keyPath: 'id',          indexes: [['student_id'], ['class_id'], ['teacher_id']] },
        { name: 'participation', keyPath: 'id',          indexes: [['student_id'], ['class_id'], ['teacher_id']] },
        { name: 'assignments',   keyPath: 'id',          indexes: [['class_id'], ['teacher_id']] },
        { name: 'exams',         keyPath: 'id',          indexes: [['class_id'], ['teacher_id']] },
        { name: 'worksheets',    keyPath: 'id',          indexes: [['class_id'], ['teacher_id']] },
        { name: 'books',         keyPath: 'id',          indexes: [['class_id'], ['teacher_id']] },
        // Local-only PDF blobs for books. Kept here because Supabase Storage
        // free-tier caps each file at 50 MB; saving the binary in the
        // teacher's browser avoids the limit at the cost of single-device
        // availability.
        { name: 'book_files',    keyPath: 'id' },
        { name: 'strategies',    keyPath: 'id',          indexes: [['teacher_id']] },
        { name: 'strategy_logs', keyPath: 'id',          indexes: [['teacher_id'], ['class_id']] },
        { name: 'initiative_logs', keyPath: 'id',        indexes: [['teacher_id']] },
        { name: 'initiatives',   keyPath: 'id',          indexes: [['teacher_id']] },
        { name: 'schedule',      keyPath: 'id',          indexes: [['teacher_id']] },
        { name: 'reminders',     keyPath: 'id',          indexes: [['teacher_id'], ['date']] },
        { name: 'portfolio',     keyPath: 'teacher_id'  },
        { name: 'settings',      keyPath: 'key'          },
        { name: 'ai_usage',      keyPath: 'id',          indexes: [['teacher_id']] }
    ];

    let _cacheDbPromise = null;

    function openCache() {
        if (_cacheDbPromise) return _cacheDbPromise;
        _cacheDbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in global)) {
                resolve(null);  // graceful degradation: no cache
                return;
            }
            const req = global.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                CACHE_STORES.forEach((def) => {
                    if (db.objectStoreNames.contains(def.name)) return;
                    const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
                    (def.indexes || []).forEach(([col]) => store.createIndex(col, col));
                });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => resolve(null);
        });
        return _cacheDbPromise;
    }

    function cacheTx(storeName, mode, fn) {
        return openCache().then((db) => {
            if (!db) return null;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                let result;
                Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
                tx.oncomplete = () => resolve(result);
                tx.onerror    = () => reject(tx.error);
                tx.onabort    = () => reject(tx.error);
            });
        });
    }

    function reqAsPromise(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    const Cache = {
        async get(storeName, key) {
            return cacheTx(storeName, 'readonly', (s) => reqAsPromise(s.get(key)));
        },
        async getAll(storeName) {
            return (await cacheTx(storeName, 'readonly', (s) => reqAsPromise(s.getAll()))) || [];
        },
        async getAllByIndex(storeName, indexName, value) {
            return (await cacheTx(storeName, 'readonly', (s) => {
                if (!s.indexNames.contains(indexName)) return [];
                return reqAsPromise(s.index(indexName).getAll(value));
            })) || [];
        },
        async put(storeName, value) {
            return cacheTx(storeName, 'readwrite', (s) => reqAsPromise(s.put(value)));
        },
        async remove(storeName, key) {
            return cacheTx(storeName, 'readwrite', (s) => reqAsPromise(s.delete(key)));
        },
        async clearStore(storeName) {
            return cacheTx(storeName, 'readwrite', (s) => reqAsPromise(s.clear()));
        },
        /**
         * @param {string[]} [keep] أسماءُ مخازنَ لا تُمسح.
         *
         * `book_files` ملفاتُ المعلّم نفسِها لا مخبأً لها: مكتوبةٌ محلياً
         * وحدها (`storage_path='local'`). فمسحُها عند الخروج **فقدٌ لا
         * رجعةَ فيه** — كتابُ منهجٍ بثلاثمئة صفحةٍ يذهب بضغطةٍ يوميّة.
         */
        async clearAll(keep) {
            const skip = new Set(keep || []);
            for (const def of CACHE_STORES) {
                if (skip.has(def.name)) continue;
                await this.clearStore(def.name);
            }
        },
        async putMany(storeName, rows) {
            if (!rows || rows.length === 0) return;
            return cacheTx(storeName, 'readwrite', (s) => Promise.all(rows.map((r) => reqAsPromise(s.put(r)))));
        }
    };

    /* ---------- shape translation (legacy ↔ Supabase) ---------- */

    // Legacy app-shape key → DB column name. Only keys listed here (plus
    // the special `photo` Blob) are forwarded to Supabase. Unknown keys
    // (e.g. `is_guest`, `email` echoed from auth) are dropped so writes
    // don't fail with "column does not exist".
    const TEACHERS_OUT_MAP = {
        name:             'full_name',
        school_name:      'school',
        subject:          'subject',
        subjects:         'subjects',
        phone:            'phone',
        email:            'email',
        specialization:   'specialization',
        qualification:    'qualification',
        experience_years: 'experience_years',
        civil_id:         'civil_id',
        region:           'region',
        message:          'message',
        vision:           'vision',
        photo_url:        'photo_url',
        updated_at:       'updated_at'
    };

    function teachersIn(row) {
        if (!row) return row;
        const out = Object.assign({}, row);
        if ('full_name' in row) out.name = row.full_name;
        if ('school' in row)    out.school_name = row.school;
        return out;
    }

    /* أعمدة عددية في القاعدة: السلسلة الفارغة تُرفض بـ«invalid input syntax
       for type integer» وتُفشل الحفظ كله. نحوّلها إلى null عند حدّ الكتابة
       فلا يستطيع أي مسار في التطبيق أن يُعيد الخطأ. */
    const TEACHERS_NUMERIC = ['experience_years'];

    async function teachersOut(value) {
        const out = {};
        for (const k of Object.keys(value || {})) {
            if (k === 'photo') {
                if (value.photo instanceof Blob) out.photo_url = await blobToDataURL(value.photo);
                else if (value.photo === null) out.photo_url = null;
                continue;
            }
            const mapped = TEACHERS_OUT_MAP[k];
            if (!mapped) continue;
            let v = value[k];
            if (TEACHERS_NUMERIC.includes(mapped) && (v === '' || v === undefined)) v = null;
            out[mapped] = v;
        }
        return out;
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload  = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    /* Portfolio attachments are uploaded as Blobs but Supabase stores
       the section as JSON. Walk the known file-bearing arrays, swap each
       Blob → { file_data: dataURL, file_type } on the way out, and
       reconstruct the Blob on the way in. */
    const PORTFOLIO_FILE_FIELDS = ['certificates', 'schedules', 'extras'];

    async function encodeItemFile(item) {
        if (item && item.file instanceof Blob) {
            const dataUrl = await blobToDataURL(item.file);
            const out = Object.assign({}, item);
            out.file = null;
            out.file_data = dataUrl;
            out.file_type = item.file.type || 'application/octet-stream';
            return out;
        }
        return item;
    }

    function decodeItemFile(item) {
        if (item && typeof item.file_data === 'string' && item.file_data.startsWith('data:')) {
            try {
                const [meta, b64] = item.file_data.split(',');
                const mime = (meta.match(/data:([^;]+)/) || [])[1] || item.file_type || 'application/octet-stream';
                const bin  = atob(b64);
                const buf  = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                const out = Object.assign({}, item);
                out.file = new Blob([buf], { type: mime });
                return out;
            } catch (e) {
                return item;
            }
        }
        return item;
    }

    async function encodePortfolioFiles(portfolio) {
        const out = Object.assign({}, portfolio);
        for (const f of PORTFOLIO_FILE_FIELDS) {
            if (Array.isArray(out[f])) {
                out[f] = await Promise.all(out[f].map(encodeItemFile));
            }
        }
        if (Array.isArray(out.custom_sections)) {
            out.custom_sections = await Promise.all(out.custom_sections.map(async (sec) => {
                const items = Array.isArray(sec.items)
                    ? await Promise.all(sec.items.map(encodeItemFile))
                    : [];
                return Object.assign({}, sec, { items });
            }));
        }
        return out;
    }

    function decodePortfolioFiles(portfolio) {
        const out = Object.assign({}, portfolio);
        for (const f of PORTFOLIO_FILE_FIELDS) {
            if (Array.isArray(out[f])) out[f] = out[f].map(decodeItemFile);
        }
        if (Array.isArray(out.custom_sections)) {
            out.custom_sections = out.custom_sections.map((sec) => Object.assign({}, sec, {
                items: Array.isArray(sec.items) ? sec.items.map(decodeItemFile) : []
            }));
        }
        return out;
    }

    function portfolioIn(row) {
        if (!row) return null;
        const merged = Object.assign(
            { teacher_id: row.teacher_id, updated_at: row.updated_at },
            row.data || {}
        );
        return decodePortfolioFiles(merged);
    }

    async function portfolioOut(value, uid) {
        const teacher_id = value.teacher_id || uid;
        const encoded = await encodePortfolioFiles(value);
        const data = Object.assign({}, encoded);
        delete data.teacher_id;
        const updated_at = data.updated_at || new Date().toISOString();
        delete data.updated_at;
        return { teacher_id, data, updated_at };
    }

    /* ---------- helpers ---------- */

    let _cachedUid = null;

    async function currentUid() {
        if (_cachedUid) return _cachedUid;
        const { data } = await sb.auth.getSession();
        _cachedUid = data && data.session ? data.session.user.id : null;
        return _cachedUid;
    }

    function err(message, error) {
        console.warn('[TeacherDB] ' + message + ':', error && error.message);
        throw new Error(error && error.message ? error.message : message);
    }

    /* ---------- hydration ---------- */

    let _hydratePromise = null;
    const _storeHydration = {};   // اسم المخزن → وعدُ ترطيبه (أو null)

    /* ══════════════════════════════════════════════════════════════════
       الترطيب على طبقتين — لماذا

       كان الدخولُ ينتظر **ثمانية عشر طلباً** إلى الخادم قبل أن يرى المعلّم
       شيئاً: مخزناً لكل جدول. وقِيست على شبكةٍ سريعة فبلغت ١٧٨٨ ملّي ثانية،
       وستةَ عشرَ منها جداولُ فارغة — اختباراتٌ وأوراقٌ وكتبٌ ومبادراتٌ
       لحسابٍ جديد. وعلى شبكة الجوال تصير ثوانيَ يقف فيها أمام شاشةٍ بيضاء.

       والشاشةُ الأولى لا تقرأ منها إلا أربعة: المعلّم، والإعدادات، والفصول،
       والجدول، والتذكيرات. فتُنتظر هذه وحدها، ويمضي الباقي في الخلفية.

       ── وكيف لا تُعرض شاشةٌ فارغة ──
       كلُّ قراءةٍ من مخزنٍ تنتظر ترطيبَ **مخزنها هو** إن كان جارياً
       (`awaitStore`). فمن فتح «الاختبارات» قبل أن يصل جدولُها انتظرها
       وحدها — لا الثمانيةَ عشر. وإن كانت قد وصلت فلا انتظار أصلاً.
       ══════════════════════════════════════════════════════════════════ */
    const FIRST_PAINT_STORES = ['teachers', 'settings', 'classes', 'schedule', 'reminders'];

    /* ══ الفشلُ لا يمحو المخبأ ══
       كانت تقرأ `{ data }` وحده وتتجاهل `error`. ومكتبةُ Supabase لا ترمي
       عند فشل الشبكة — تُعيد `{ data: null, error }`. فكانت `rows` تصير
       مصفوفةً فارغةً، ثم يُمحى المخزنُ ولا يُملأ: يفتح المعلّم التطبيق في
       فصلٍ بلا واي-فاي فتفرغ شاشاتُه كلُّها. (بلاغ ١٧ أغسطس ٢٠٢٦.)

       والحرزُ هو نفسُه المستعمل في `remove()` و`clear()` أدناه: يُقرأ
       `error` ويُخرَج قبل لمس المخبأ. */
    async function hydrateStore(storeName, uid) {
        const table = TABLE[storeName];
        let rows, err;
        try {
            if (storeName === 'teachers') {
                const { data, error } = await sb.from(table).select('*').eq('id', uid);
                err = error; rows = (data || []).map(teachersIn);
            } else if (storeName === 'portfolio') {
                const { data, error } = await sb.from(table).select('*').eq('teacher_id', uid);
                err = error; rows = data || [];
            } else if (storeName === 'settings') {
                const { data, error } = await sb.from(table).select('key,value').eq('teacher_id', uid);
                err = error; rows = data || [];
            } else {
                const { data, error } = await sb.from(table).select('*');
                err = error; rows = data || [];
            }
        } catch (e) {
            console.warn('[TeacherDB] hydrate ' + storeName + ' threw:', e.message);
            return;
        }
        if (err) {
            console.warn('[TeacherDB] hydrate ' + storeName + ' failed:', err.message);
            return;   /* المخبأُ يبقى كما هو — أفضلُ من فراغٍ */
        }
        await Cache.clearStore(storeName);
        if (rows.length) await Cache.putMany(storeName, rows);
    }

    /** Pull the current teacher's rows from Supabase into the cache.
     *  Resolves once the first screen's stores are in; the rest keep loading. */
    function hydrate() {
        if (_hydratePromise) return _hydratePromise;
        const t0 = performance.now();

        /* الوعودُ تُحجز **قبل أيّ انتظار**: لو حُجزت بعد `await currentUid()`
           لوجدت شاشةٌ سبقتنا مخزنَها بلا وعدٍ فقرأته فارغاً وظنّته فارغاً.
           فتُبنى كلُّها الآن، وكلٌّ منها ينتظر المعرّف بنفسه. */
        const uidP = currentUid();

        /* ══ الطابور: خمسةٌ تسبق ثلاثةَ عشرَ ══
           كانت الثمانيةَ عشرَ تنطلق في اللحظة نفسِها. والمتصفّحُ لا يفتح
           للأصل الواحد إلا ستّ قنوات، فتُزاحم الخمسةُ التي تنتظرها الشاشةُ
           ثلاثةَ عشرَ لا تحتاجها — وقيس على جهاز المعلّم: أبطأُ نداءٍ **٣٤
           ثانية**، والشاشةُ تنتظره لأن `awaitStore('classes')` تنتظر مخزنَها
           وهو في الطابور. (بلاغ «تأخّر أكثر من دقيقة»، ١٧ أغسطس ٢٠٢٦.)

           فصار الترطيبُ على دفعتين: الخمسُ تنطلق الآن وحدَها، والباقيةُ
           تنتظرها ثم تمضي أربعاً أربعاً فلا تُغرق القنوات مرّةً أخرى.

           ولكنّ **الوعودَ كلَّها تُحجز في هذه اللحظة** لا عند انطلاقها:
           فلو حُجز وعدُ «الاختبارات» عند دورها لوجدته شاشةٌ سبقتها فارغاً
           بلا وعدٍ فظنّت المخزنَ فارغاً. فكلُّ مخزنٍ له وعدُه من أول تكّة،
           وإنما يتأخّر **نداؤه** لا وعدُه. */
        const reserve = (s, gate) => {
            const p = gate
                .then(() => uidP)
                .then((uid) => (uid ? hydrateStore(s, uid) : null));
            _storeHydration[s] = p;
            p.finally(() => { if (_storeHydration[s] === p) _storeHydration[s] = null; });
            return p;
        };

        const now = Promise.resolve();
        const first = FIRST_PAINT_STORES.filter((s) => TABLE[s]).map((s) => reserve(s, now));

        /* فشلُ إحداها لا يحبس البقية — `catch` على المجموع لا على كلٍّ. */
        const firstDone = Promise.all(first.map((p) => p.catch(() => {})));

        const rest = STORE_NAMES.filter((s) => FIRST_PAINT_STORES.indexOf(s) < 0);
        const LANES = 4;
        const lanes = Array.from({ length: LANES }, () => firstDone);
        rest.forEach((s, i) => {
            const lane = i % LANES;
            lanes[lane] = reserve(s, lanes[lane]).catch(() => {});
        });

        _hydratePromise = Promise.all(first).then(() => {
            console.info('[TeacherDB] first paint in ' + Math.round(performance.now() - t0)
                       + 'ms (' + first.length + ' من ' + STORE_NAMES.length + ')');
        });
        return _hydratePromise;
    }

    /** ينتظر ترطيبَ مخزنٍ واحدٍ إن كان جارياً — وإلا يعود فوراً. */
    async function awaitStore(storeName) {
        const p = _storeHydration[storeName];
        if (p) { try { await p; } catch (e) { /* الفشل لا يحبس القراءة */ } }
    }

    function resetHydration() {
        _hydratePromise = null;
        _cachedUid = null;
        _term = null;
        for (const k in _storeHydration) _storeHydration[k] = null;
    }

    /* ---------- الفصل الدراسي ----------
       أربعة عشر موضعاً في التطبيق تقرأ الفصول بصيغةٍ واحدة متطابقة، وستّةٌ
       تكتب في الجدول المدرسي. فالتصفية والوسم هنا — في مكانٍ واحد — بدل
       عشرين تعديلاً في أربعة عشر ملفاً، كلُّ واحدٍ منها فرصةُ خطأ.

       والقاعدة بسيطة: ما لا يحمل `term` فهو من الفصل الأول — فكلّ ما بُني
       قبل اليوم كذلك، ولا يحتاج هجرةَ بيانات.

       ولا يُصفَّى `getAll` — النسخة الاحتياطية تريد السنة كلّها لا فصلاً. */
    const TERM_SCOPED = { classes: true, schedule: true };

    /* الجداولُ التي فيها عمودُ `teacher_id` — وهي كلُّها إلا سجلَّي
       الاستراتيجيات والمبادرات، فهما يُنسبان عبر صفّهما الأمّ. */
    const TEACHER_OWNED = {
        classes: true, students: true, attendance: true, participation: true,
        assignments: true, exams: true, worksheets: true, strategies: true,
        initiatives: true, schedule: true, reminders: true, ai_usage: true
    };

    let _term = null;

    const termOf = (row) => {
        const n = Number(row && row.term);
        return (n >= 1 && n <= 3) ? n : 1;
    };

    /**
     * الفصل الدراسيّ الجاري.
     *
     * ── سباقٌ كان يُخفي فصول المعلّم (ق٫٥) ──
     * المخبأُ فارغٌ عند أول فتحٍ على جهازٍ جديد، فتُقرأ «الفصل الأول»
     * افتراضاً **وتُحفظ في المذكّرة إلى نهاية الجلسة**. فمعلّمُ الفصل
     * الثاني يفتح تطبيقه فيجد شاشاته فارغة — فصولُه موسومةٌ بالثاني
     * والتصفيةُ تسأل عن الأول — وكتاباتُه الجديدة تُوسم بفصلٍ ليس فصله.
     *
     * فصار: يُنتظر الترطيبُ إن كان جارياً، ولا تُحفظ المذكّرة إلا إن
     * قُرئت قيمةٌ فعلاً. وقراءةُ المخبأ رخيصةٌ فلا يضرّ تكرارها.
     */
    async function currentTerm() {
        if (_term != null) return _term;

        /* الترطيبُ يملأ `settings` — فانتظارُه قبل الحكم لا بعده. */
        if (_hydratePromise) {
            try { await _hydratePromise; } catch (e) { /* فشلُه لا يحبس */ }
        }

        /* من المخبأ رأساً: `get('settings')` يمرّ بمسارٍ يقرأ الفصول، فتدور. */
        let n = 1, found = false;
        try {
            const row = await Cache.get('settings', 'academic_term');
            if (row) { n = Number(row.value); found = true; }
        } catch (e) { /* قراءةٌ فاشلة لا تحبس المعلّم خارج فصوله */ }

        const val = (n >= 1 && n <= 3) ? n : 1;
        if (found) _term = val;   /* لا تُحفظ قيمةٌ لم تُقرأ */
        return val;
    }

    /* Books store the PDF in Supabase Storage (bucket "books"); the row
       only carries metadata + storage_path. Legacy rows uploaded before
       Storage was available kept a base64 data URL in file_data — we
       still decode those on read for backward compatibility. */
    async function booksOut(value) {
        const out = Object.assign({}, value);
        delete out.file;   // not a DB column; the binary is in Storage
        return out;
    }
    function booksIn(row) {
        if (!row) return row;
        const out = Object.assign({}, row);
        if (typeof out.file_data === 'string' && out.file_data.startsWith('data:')) {
            try {
                const [meta, b64] = out.file_data.split(',');
                const mime = (meta.match(/data:([^;]+)/) || [])[1] || out.file_type || 'application/pdf';
                const bin = atob(b64);
                const buf = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                out.file = new Blob([buf], { type: mime });
            } catch (e) { /* leave as-is */ }
        }
        return out;
    }

    /* ---------- CRUD primitives ---------- */

    async function add(storeName, value) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);

        if (storeName === 'teachers') {
            const uid = await currentUid();
            if (!uid) throw new Error('غير مسجّل دخول.');
            const row = await teachersOut(value);
            row.id = uid;
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
            if (error) err('teachers add', error);
            await Cache.put('teachers', teachersIn(data));
            return data.id;
        }

        if (storeName === 'portfolio') {
            const uid = await currentUid();
            const row = await portfolioOut(value, uid);
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id' }).select('*').single();
            if (error) err('portfolio add', error);
            await Cache.put('portfolio', data);
            return data.teacher_id;
        }

        if (storeName === 'settings') {
            const uid = await currentUid();
            const row = { teacher_id: uid, key: value.key, value: value.value };
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id,key' }).select('key,value').single();
            if (error) err('settings add', error);
            await Cache.put('settings', { key: data.key, value: data.value });
            return value.key;
        }

        if (storeName === 'books') {
            const uid = await currentUid();
            const row = await booksOut(value);
            if (!row.teacher_id) row.teacher_id = uid;
            delete row.id;
            const { data, error } = await sb.from(table).insert(row).select('*').single();
            if (error) err('books add', error);
            await Cache.put('books', booksIn(data));
            return data.id;
        }

        const row = Object.assign({}, value);
        delete row.id;
        if (TERM_SCOPED[storeName] && row.term == null) row.term = await currentTerm();
        const { data, error } = await sb.from(table).insert(row).select('*').single();
        if (error) err(storeName + ' add', error);
        await Cache.put(storeName, data);
        return data.id;
    }

    async function put(storeName, value) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);

        if (storeName === 'teachers') {
            const uid = await currentUid();
            if (!uid) throw new Error('غير مسجّل دخول.');
            const row = await teachersOut(value);
            row.id = value.id || uid;
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
            if (error) err('teachers put', error);
            await Cache.put('teachers', teachersIn(data));
            return row.id;
        }

        if (storeName === 'portfolio') {
            const uid = await currentUid();
            const row = await portfolioOut(value, uid);
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id' }).select('*').single();
            if (error) err('portfolio put', error);
            await Cache.put('portfolio', data);
            return row.teacher_id;
        }

        if (storeName === 'settings') {
            const uid = await currentUid();
            const row = { teacher_id: uid, key: value.key, value: value.value };
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id,key' }).select('key,value').single();
            if (error) err('settings put', error);
            await Cache.put('settings', { key: data.key, value: data.value });
            return value.key;
        }

        if (storeName === 'books') {
            const uid = await currentUid();
            const row = await booksOut(value);
            if (!row.teacher_id) row.teacher_id = uid;
            if (row.id == null) {
                delete row.id;
                const { data, error } = await sb.from(table).insert(row).select('*').single();
                if (error) err('books put(insert)', error);
                await Cache.put('books', booksIn(data));
                return data.id;
            }
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
            if (error) err('books put', error);
            await Cache.put('books', booksIn(data));
            return data.id;
        }

        const row = Object.assign({}, value);
        /* ══ صاحبُ الصفّ يُسند هنا لا في كل شاشة ══
           كلُّ جدولٍ (إلا سجلَّي الاستراتيجيات والمبادرات) فيه `teacher_id`،
           وسياسةُ الأمان ترفض صفّاً بلا صاحب. وكان الإسنادُ متروكاً لكلّ
           شاشةٍ تكتب — ففعلته «التذكيرات» ونسيته أوراقُ العمل والاختبارات،
           فكان كلُّ حفظٍ يُرفض بـ`row-level security policy` والزرُّ يبدو
           معطّلاً بلا سبب. (بلاغُ المعلّم، ٢٠ أغسطس ٢٠٢٦.)
           فصار هنا مرّةً واحدة: من كتب صفّاً بلا صاحبٍ نُسب إليه تلقائياً،
           ومن أسنده صراحةً بقي إسنادُه. */
        if (TEACHER_OWNED[storeName] && !row.teacher_id) {
            const uid = await currentUid();
            if (uid) row.teacher_id = uid;
        }
        if (TERM_SCOPED[storeName] && row.term == null) row.term = await currentTerm();
        if (row.id == null) {
            delete row.id;
            const { data, error } = await sb.from(table).insert(row).select('*').single();
            if (error) err(storeName + ' put(insert)', error);
            await Cache.put(storeName, data);
            return data.id;
        }
        const { data, error } = await sb.from(table).upsert(row, { onConflict: 'id' }).select('*').single();
        if (error) err(storeName + ' put', error);
        await Cache.put(storeName, data);
        return row.id;
    }

    /* ---------- reads (cache-first) ---------- */

    async function get(storeName, key) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);
        await awaitStore(storeName);

        if (storeName === 'portfolio') {
            const cached = await Cache.get('portfolio', key);
            if (cached) return portfolioIn(cached);
            return undefined;
        }
        if (storeName === 'settings') {
            const cached = await Cache.get('settings', key);
            return cached || undefined;
        }
        const cached = await Cache.get(storeName, key);
        if (cached) {
            if (storeName === 'books') return booksIn(cached);
            return cached;
        }
        return undefined;
    }

    async function getAll(storeName) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);
        await awaitStore(storeName);

        const rows = await Cache.getAll(storeName);
        if (storeName === 'portfolio') return rows.map(portfolioIn);
        if (storeName === 'books')     return rows.map(booksIn);
        return rows;
    }

    async function getAllByIndex(storeName, indexName, value) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);
        await awaitStore(storeName);

        if (storeName === 'teachers' && indexName === 'email') return [];

        let rows = await Cache.getAllByIndex(storeName, indexName, value);
        // Some legacy callers query an index that wasn't declared on the cache; fall back to filter.
        if (rows.length === 0) {
            const all = await Cache.getAll(storeName);
            rows = all.filter((r) => r[indexName] === value);
        }
        if (TERM_SCOPED[storeName]) {
            const t = await currentTerm();
            rows = rows.filter((r) => termOf(r) === t);
        }
        if (storeName === 'books') return rows.map(booksIn);
        return rows;
    }

    /* ══════════════════════════════════════════════════════════════════
       كتابةٌ محلّيةٌ فورية

       `put` يكتب في الخادم أولاً ثم في المخبأ — وهو الصواب: ما لم يصل
       الخادمَ لم يُحفظ. لكنّ شاشةً واحدةً لا تحتمل هذا الانتظار: التهيئة.
       المعلّم يضغط «ابدأ» فينتظر خمسَ كتاباتٍ قبل أن يرى تطبيقه.

       فتُكتب محلّياً أولاً — فيمضي هو — ثم تُدفع إلى الخادم خلفه. وإن
       فشلت أُعيد وأُخبِر. ولا تُستعمل هذه إلا حيث يُحرَس الفشلُ صراحةً.
       ══════════════════════════════════════════════════════════════════ */
    async function putLocal(storeName, value) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);
        return Cache.put(storeName, value);
    }

    /** كلّ الفصول بلا تصفية — لشاشة التبديل وحدها، فهي تعرض ما ليس فيه. */
    async function allClasses() {
        await awaitStore('classes');
        return Cache.getAll('classes');
    }

    async function remove(storeName, key) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);

        if (storeName === 'settings') {
            const uid = await currentUid();
            const { error } = await sb.from(table).delete().eq('teacher_id', uid).eq('key', key);
            if (error) err('settings remove', error);
            await Cache.remove('settings', key);
            return;
        }
        if (storeName === 'portfolio') {
            const { error } = await sb.from(table).delete().eq('teacher_id', key);
            if (error) err('portfolio remove', error);
            await Cache.remove('portfolio', key);
            return;
        }

        const { error } = await sb.from(table).delete().eq('id', key);
        if (error) err(storeName + ' remove', error);
        await Cache.remove(storeName, key);

        /* ── تتالي المخبأ (ق٫٦) ──
           القاعدةُ تتتالى على الخادم بمفاتيحها الأجنبية، **والمخبأُ لا
           يعلم**. فتبقى حصصُ الجدول والواجباتُ والاختباراتُ محليّاً، وترسم
           الرئيسيةُ حصصَ فصلٍ ميّتٍ حتى يُعاد التحميل.
           وشواهدُ الاستراتيجيات صورُ طلابٍ في التخزين — بقاؤها بعد حذف
           الفصل خرقُ خصوصيةٍ لا ملفاتٌ يتيمة. */
        if (storeName === 'classes') await cascadeClassCache(key);
    }

    /** يمسح من المخبأ كلَّ ما كان معلّقاً بفصلٍ حُذف، ويُزيل شواهده. */
    async function cascadeClassCache(classId) {
        const CHILDREN = ['students', 'attendance', 'participation', 'assignments',
                          'exams', 'worksheets', 'books', 'schedule', 'strategy_logs'];
        const evidence = [];
        for (const child of CHILDREN) {
            let rows = [];
            try { rows = await Cache.getAll(child); } catch (e) { continue; }
            for (const r of rows) {
                if (!r || r.class_id !== classId) continue;
                if (child === 'strategy_logs' && Array.isArray(r.evidence)) {
                    r.evidence.forEach((path) => { if (path) evidence.push(path); });
                }
                try { await Cache.remove(child, r.id); } catch (e) { /* لا يوقف الباقي */ }
            }
        }
        if (evidence.length) {
            try { await sb.storage.from('evidence').remove(evidence); }
            catch (e) { console.warn('[TeacherDB] تعذّر مسح شواهد الفصل المحذوف:', e.message); }
        }
    }

    async function clear(storeName) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);
        const uid = await currentUid();
        if (!uid) return;
        if (storeName === 'teachers') return;

        const { error } = await sb.from(table).delete().eq('teacher_id', uid);
        if (error) err(storeName + ' clear', error);
        await Cache.clearStore(storeName);
    }

    async function count(storeName) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);
        const all = await Cache.getAll(storeName);
        return all.length;
    }

    async function destroy() {
        for (const name of STORE_NAMES) {
            if (name === 'teachers') continue;
            try { await clear(name); } catch (e) { console.warn(e); }
        }
        return true;
    }

    async function exportAll() {
        const dump = { exported_at: new Date().toISOString(), version: 'sb1', data: {} };
        for (const name of STORE_NAMES) {
            try { dump.data[name] = await getAll(name); }
            catch (e) { dump.data[name] = []; }
        }
        return dump;
    }

    /**
     * يستعيد نسخةً احتياطية.
     *
     * ── ثلاثةُ عيوبٍ كانت تجتمع فتُفقد البيانات برسالة نجاح (ق٫٤) ──
     * • `clear()` يمسح المخزن **قبل** أي إدراج، فلا رجعة إن فشل ما بعده.
     * • والصفوف تحمل `teacher_id` صاحبِ النسخة، فترفضها RLS في حسابٍ آخر.
     * • و`catch` يبتلع كلَّ فشلٍ صامتاً، ثم تُعاد `true` فتقول الواجهة
     *   «تم الاستيراد ✅» — والمعلّم قد فقد كلَّ شيء.
     *
     * فصار: تُهيَّأ الصفوف في الذاكرة بمعرّف الحساب الحاليّ، **ثم تُختبر
     * كتابةٌ واحدة قبل أن يُمسّ شيء**، ثم يُمسح ويُدرَج، ويُرمى الخطأ إن
     * فشل صفٌّ واحد — فلا تُقال «تمّ» إلا وقد تمّت.
     *
     * والمعرّفات تبقى كما هي عمداً: `students.class_id` يشير إلى
     * `classes.id`، فتغييرُها يقطع النسبَ بين الجداول.
     */
    async function importAll(dump) {
        if (!dump || !dump.data) throw new Error('نسخة احتياطية غير صالحة.');
        const uid = await currentUid();
        if (!uid) throw new Error('سجّل دخولك أولاً.');

        /* ١) لمن هذه النسخة؟ — الجوابُ يقرّر مصير المعرّفات.
              • **حسابُه هو:** تُبقى كما هي، فيُستبدل كلُّ صفٍّ بنظيره.
              • **حسابٌ آخر:** تُبدَّل كلُّها. وإبقاؤها كان يجعل الإدراج
                **تعديلاً على صفوف صاحبها الأصلي**، فترفضه RLS — قِيس
                حرفياً: «violates row-level security policy». */
        let owner = null;
        for (const name of STORE_NAMES) {
            const rows = dump.data[name];
            if (Array.isArray(rows) && rows.length && rows[0] && rows[0].teacher_id) {
                owner = rows[0].teacher_id; break;
            }
        }
        const mine = !owner || owner === uid;

        const newId = () => (global.crypto && global.crypto.randomUUID)
            ? global.crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = Math.random() * 16 | 0;
                  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
              });

        /* خريطةُ المعرّفات القديمة إلى الجديدة — تُبنى قبل أي كتابة كي
           تُحوَّل بها روابطُ الأبناء (`class_id` و`student_id`). فلولاها
           لصار كلُّ طالبٍ يتيماً من فصله. */
        const idMap = {};
        if (!mine) {
            for (const name of STORE_NAMES) {
                if (name === 'teachers' || name === 'portfolio' || name === 'settings') continue;
                (dump.data[name] || []).forEach((r) => {
                    if (r && r.id && !idMap[r.id]) idMap[r.id] = newId();
                });
            }
        }
        const LINKS = ['class_id', 'student_id'];

        /* ٢) التهيئة في الذاكرة — بلا لمس القاعدة. */
        const plan = [];
        for (const name of STORE_NAMES) {
            if (name === 'teachers') continue;
            const rows = dump.data[name];
            if (!Array.isArray(rows) || !rows.length) continue;
            plan.push([name, rows.map((r) => {
                const row = Object.assign({}, r);
                /* كلُّ صفٍّ يصير لصاحب الحساب الحاليّ لا لصاحب النسخة. */
                if (name === 'portfolio' || 'teacher_id' in row) row.teacher_id = uid;
                if (!mine) {
                    if (row.id && idMap[row.id]) row.id = idMap[row.id];
                    LINKS.forEach((k) => { if (row[k] && idMap[row[k]]) row[k] = idMap[row[k]]; });
                }
                return row;
            })]);
        }
        if (!plan.length) throw new Error('لا بيانات في هذه النسخة.');

        /* ٢) اختبارُ كتابةٍ واحدة قبل المسح: لو رفضتها القاعدة لأيّ سبب
              (صلاحيات، شبكة، مخطّطٌ تغيّر) نتوقّف والبياناتُ سليمة. */
        const [probeStore, probeRows] = plan[0];
        try {
            await put(probeStore, probeRows[0]);
        } catch (e) {
            throw new Error('تعذّر الكتابة — لم يُمسّ شيء من بياناتك. (' + e.message + ')');
        }

        /* ٣) المسح والإدراج، وكلُّ فشلٍ يُحصى ولا يُبتلع. */
        const failed = [];
        for (const [name, rows] of plan) {
            try { await clear(name); }
            catch (e) { failed.push(name + ': مسح — ' + e.message); continue; }
            for (const row of rows) {
                try { await put(name, row); }
                catch (e) { failed.push(name + ': ' + e.message); }
            }
        }
        if (failed.length) {
            console.warn('[TeacherDB] importAll failures:', failed);
            throw new Error('فشل استيراد ' + failed.length + ' صفّاً. أولها: ' + failed[0]);
        }
        return true;
    }

    /* ---------- Settings shorthand ---------- */
    const Settings = {
        async get(key) {
            const row = await get('settings', key);
            return row ? row.value : undefined;
        },
        async set(key, value) { return put('settings', { key, value }); },
        /** محلّيٌّ فوريّ — للتهيئة وحدها، ويُتبع بكتابةٍ حقيقيةٍ في الخلفية. */
        async setLocal(key, value) { return Cache.put('settings', { key, value }); },
        async unset(key) { return remove('settings', key); }
    };

    function open() { return openCache(); }

    /* ---------- Book-file local storage (IndexedDB, single-device) ---------- */
    const BookFiles = {
        async save(bookId, blob) {
            return cacheTx('book_files', 'readwrite', (s) =>
                reqAsPromise(s.put({ id: bookId, blob, size: blob.size, type: blob.type || 'application/pdf' }))
            );
        },
        async get(bookId) {
            const row = await cacheTx('book_files', 'readonly', (s) => reqAsPromise(s.get(bookId)));
            return row?.blob || null;
        },
        async remove(bookId) {
            return cacheTx('book_files', 'readwrite', (s) => reqAsPromise(s.delete(bookId)));
        },
        async has(bookId) {
            const row = await cacheTx('book_files', 'readonly', (s) => reqAsPromise(s.get(bookId)));
            return !!row;
        }
    };

    /* ---------- bulk writes (one network request for many rows) ----------
       For simple stores (attendance/participation/…) that need no special
       out-mapping. Used by «تحضير الكل» so 32 students = 1-2 requests, not 32. */
    async function bulkPut(storeName, rows) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);
        if (!rows || !rows.length) return [];
        const results = [];
        const existing = rows.filter((r) => r.id != null).map((r) => Object.assign({}, r));
        const fresh    = rows.filter((r) => r.id == null)
                             .map((r) => { const o = Object.assign({}, r); delete o.id; return o; });
        if (existing.length) {
            const { data, error } = await sb.from(table).upsert(existing, { onConflict: 'id' }).select('*');
            if (error) err(storeName + ' bulkPut', error);
            if (data && data.length) { results.push(...data); await Cache.putMany(storeName, data); }
        }
        if (fresh.length) {
            const { data, error } = await sb.from(table).insert(fresh).select('*');
            if (error) err(storeName + ' bulkAdd', error);
            if (data && data.length) { results.push(...data); await Cache.putMany(storeName, data); }
        }
        return results;
    }
    async function bulkRemove(storeName, ids) {
        const table = TABLE[storeName];
        if (!table) throw new Error('Unknown store: ' + storeName);
        if (!ids || !ids.length) return;
        const { error } = await sb.from(table).delete().in('id', ids);
        if (error) err(storeName + ' bulkRemove', error);
        for (const id of ids) await Cache.remove(storeName, id);
    }

    global.TeacherDB = {
        open,
        add, put, putLocal, get, getAll, getAllByIndex, remove, clear, count,
        bulkPut, bulkRemove,
        destroy, exportAll, importAll,
        Settings,
        BookFiles,
        Term: {
            current: currentTerm,
            /** يُبطل المذكّرة بعد تغيير `academic_term` — وإلّا ظلّت القراءات
             *  تُصفّى بفصلٍ تركه المعلّم. */
            forget: () => { _term = null; },
            allClasses,
            of: termOf
        },
        STORES: STORE_NAMES,
        VERSION: 'sb-cached-1',
        // Cache control
        hydrate,
        resetHydration,
        clearLocalCache: (keep) => Cache.clearAll(keep),
        /* أسماءُ المخازن التي تحمل ملفاتٍ لا نسخةَ لها على الخادم. */
        LOCAL_ONLY: ['book_files']
    };
})(window);
