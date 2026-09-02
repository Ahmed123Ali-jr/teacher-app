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
    const CACHE_DB_VERSION = 6;   // bumped: added `outbox` store

    /** Cache store schema: keyPath + indexes for fast filtering. */
    const CACHE_STORES = [
        /* الصندوقُ الصادر: كتاباتٌ لم تصل الخادمَ بعد. مفتاحُه رقمٌ متصاعد
           ليُعاد تشغيلُها **بترتيب وقوعها** — طالبٌ يُضاف ثمّ يُعدَّل لا
           يجوز أن يُعدَّل قبل أن يُضاف. */
        { name: 'outbox',        keyPath: 'seq' },
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
        // مخبأُ مرفقات ملفّ الإنجاز: الملفُّ نفسُه في مخزن Supabase، وهذه
        // نسخةٌ محلّيةٌ منه ليُفتح بلا شبكةٍ وليُطبع الملفُّ دون تنزيلٍ
        // متكرّر. مفتاحُها مسارُ الملفّ في المخزن.
        // **وتُمسح عند الخروج** — بخلاف `book_files` — لأنّ لها أصلاً على
        // الخادم، ولأنّ ملفاتِ معلّمٍ لا تبقى على جهازٍ سلّمه لغيره.
        { name: 'portfolio_blobs', keyPath: 'path'       },
        { name: 'settings',      keyPath: 'key'          },
        { name: 'ai_usage',      keyPath: 'id',          indexes: [['teacher_id']] }
    ];

    let _cacheDbPromise = null;

    /* ── تعطّلُ المخزن المحلّي يجب أن يُسمَع ──
       كلُّ قراءةٍ في التطبيق تمرّ بالمخبأ، و`Cache.getAll` تُرجع `[]` حين لا
       مخزن. فمخزنٌ ميّتٌ يُري المعلّمَ **تطبيقاً فارغاً** — لا فصولَ ولا
       طلاب — وبياناتُه سليمةٌ على الخادم. وفارغٌ بلا تفسيرٍ يُقرأ «ضاع
       عملي»، وهو أسوأُ ممّا لو لم تُفتح الشاشةُ أصلاً.
       فيُعلَن السببُ صراحةً، وتلتقطه الواجهة. */
    let _cacheDown = null;

    function markCacheDown(reason) {
        if (_cacheDown === reason) return;
        _cacheDown = reason;
        console.warn('[TeacherDB] مخزنُ الجهاز غير متاح — ' + reason);
        try {
            global.dispatchEvent(new CustomEvent('teacherdb:cachedown', { detail: reason }));
        } catch (e) { /* بيئةٌ بلا أحداث */ }
    }

    /** وصلةٌ قامت بعد عطل: يُرفع الإعلانُ وإلّا أنذر التطبيقُ بعطلٍ زال. */
    function markCacheUp() {
        if (_cacheDown === null) return;
        _cacheDown = null;
        console.info('[TeacherDB] عاد مخزنُ الجهاز.');
        try { global.dispatchEvent(new CustomEvent('teacherdb:cacheup')); }
        catch (e) { /* بيئةٌ بلا أحداث */ }
    }

    function openCache() {
        if (_cacheDbPromise) return _cacheDbPromise;
        _cacheDbPromise = new Promise((resolve) => {
            if (!('indexedDB' in global)) {
                markCacheDown('هذا المتصفّح بلا مخزنٍ محلّي');
                resolve(null);
                return;
            }

            let settled = false;
            /** يُنهي الوعدَ مرّةً واحدة، ويُغلق وصلةً وصلت بعد فوات الأوان. */
            const finish = (db) => {
                if (settled) { if (db) { try { db.close(); } catch (e) {} } return; }
                settled = true;
                resolve(db);
            };

            const ready = (db) => {
                /* تبويبٌ آخر يطلب ترقيةَ المخزن: نُغلق وصلتَنا فوراً وإلّا
                   حبسناه أبداً — وهو بعينه ما يفعله بنا تبويبٌ قديم. ويُنسى
                   الوعدُ فتُفتح وصلةٌ جديدة عند أوّل طلبٍ بعدها. */
                db.onversionchange = () => {
                    try { db.close(); } catch (e) {}
                    _cacheDbPromise = null;
                    /* ولا يُعلن العطلُ قبل محاولةِ الوصل من جديد: الغالبُ أن
                       تنجح في الحال، وإنذارٌ يتراجع بعد لحظةٍ إنذارٌ كاذب —
                       وهو ما يُفقد الثقةَ بالإنذار الصادق. فلا يُقال شيءٌ
                       إلّا إن عجزت المحاولة. */
                    openCache().then((again) => {
                        if (!again) {
                            markCacheDown('نافذةٌ أخرى رقّت المخزن إلى نسخةٍ لا تُوافق هذه — أعد فتح التطبيق');
                        }
                    });
                };
                markCacheUp();
                finish(db);
            };

            /** @param {number} [version] رقمُ النسخة، أو لا شيءَ لفتح الموجود. */
            const attempt = (version) => {
                let req;
                try {
                    req = version === undefined
                        ? global.indexedDB.open(CACHE_DB_NAME)
                        : global.indexedDB.open(CACHE_DB_NAME, version);
                } catch (e) {
                    markCacheDown('تعذّر فتحُ المخزن — ' + (e.message || e.name));
                    finish(null);
                    return;
                }

                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    CACHE_STORES.forEach((def) => {
                        if (db.objectStoreNames.contains(def.name)) return;
                        const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
                        (def.indexes || []).forEach(([col]) => store.createIndex(col, col));
                    });
                };

                req.onsuccess = () => {
                    const db = req.result;
                    if (version === undefined) {
                        /* فُتح مخزنٌ أحدثُ ممّا تعرفه هذه النسخة. لا يُقبل إلّا
                           إن كان فيه كلُّ ما نقرأ منه — ومتجرٌ ناقصٌ يرمي عند
                           أوّل معاملة، فالرفضُ الصريحُ أسلم. */
                        const missing = CACHE_STORES
                            .filter((d) => !db.objectStoreNames.contains(d.name))
                            .map((d) => d.name);
                        if (missing.length) {
                            try { db.close(); } catch (e) {}
                            markCacheDown('مخزنُ الجهاز من نسخةٍ لا تُوافق هذه — ينقصه: ' + missing.join('، '));
                            finish(null);
                            return;
                        }
                    }
                    ready(db);
                };

                req.onerror = () => {
                    const name = req.error && req.error.name;
                    /* `VersionError`: على الجهاز مخزنٌ **أحدثُ** ممّا تطلبه هذه
                       النسخة — يقع حين يُرجَع التطبيق إلى إصدارٍ أقدم. فلا
                       يُترك المعلّم بلا مخبأ: يُعاد الفتحُ بلا رقمٍ فيُقبل ما
                       هو موجودٌ إن كان وافياً. */
                    if (name === 'VersionError' && version !== undefined) { attempt(undefined); return; }
                    markCacheDown('تعذّر فتحُ المخزن — ' + (name || 'خطأٌ غير معروف'));
                    finish(null);
                };

                /* وصلةٌ قديمةٌ في نافذةٍ أخرى تحبس الترقية: لا `onsuccess` يأتي
                   ولا `onerror` — فيبقى الوعدُ معلّقاً أبداً وتتجمّد كلُّ قراءةٍ
                   وكتابةٍ بشاشةٍ بيضاءَ بلا كلمة. فيُنهى صراحةً بلا مخبأ. */
                req.onblocked = () => {
                    markCacheDown('نافذةٌ أخرى من التطبيق تمنع تحديث المخزن — أغلقها ثمّ أعد فتح التطبيق');
                    finish(null);
                };
            };

            attempt(CACHE_DB_VERSION);
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

    /* ══════════════════════════════════════════════════════════════════
       مرفقاتُ ملفّ الإنجاز: الملفُّ في المخزن، وفي الوثيقة إشارةٌ إليه
       ══════════════════════════════════════════════════════════════════
       كان المرفقُ يُرمَّز نصّاً (base64) ويُحشى في `data` — فينتفخ ثلثاً،
       **ويُرفع وينزل مع الصفّ في كلّ حفظٍ وكلّ فتحة**. وقياسٌ على القاعدة
       (٢٦ أغسطس ٢٠٢٦): صفُّ معلّمٍ واحدٍ سبعةَ عشرَ ميجابايت، فتعديلُ كلمةٍ
       في الرؤية يرفع شهاداتِه كلَّها معها.

       فصار الملفُّ يصعد إلى مخزن `portfolio` مرّةً واحدة، ويبقى في الوثيقة
       `storage_path` مع اسمه وحجمه ونوعه. والصفُّ كيلوباياتٌ معدودة.

       **والقديمُ يُهاجر وحده:** صفٌّ فيه `file_data` يُفكّ إلى Blob عند
       القراءة كما كان، فإذا حُفظ بعدها صعد الملفُّ إلى المخزن وسقط النصُّ
       من الوثيقة. فلا هجرةَ يدويّةً ولا صفّاً يُترك خلفاً.

       **والمرفقُ لا يُنزَّل إلّا حين يُطلب** — عند فتحه أو طباعة الملفّ —
       ويُخبَّأ محلياً بعدها. */
    const PORTFOLIO_FILE_FIELDS = ['certificates', 'schedules', 'extras'];
    const PORTFOLIO_BUCKET = 'portfolio';

    /** امتدادُ الملفّ من اسمه، وإلّا فمن نوعه، وإلّا `bin`. */
    function fileExt(filename, type) {
        const m = String(filename || '').match(/\.([a-z0-9]{1,8})$/i);
        if (m) return m[1].toLowerCase();
        if (type === 'application/pdf') return 'pdf';
        const sub = String(type || '').split('/')[1];
        return (sub && /^[a-z0-9]{1,8}$/i.test(sub)) ? sub.toLowerCase() : 'bin';
    }

    function randomName() {
        if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    async function uploadPortfolioFile(uid, blob, filename) {
        if (!uid) throw new Error('غير مسجّل دخول.');
        const path = uid + '/' + randomName() + '.' + fileExt(filename, blob.type);
        const { error } = await sb.storage.from(PORTFOLIO_BUCKET).upload(path, blob, {
            contentType: blob.type || 'application/octet-stream',
            upsert: false
        });
        if (error) throw new Error('تعذّر رفع المرفق: ' + error.message);
        return path;
    }

    async function downloadPortfolioFile(path) {
        const cached = await PortfolioBlobs.get(path);
        if (cached) return cached;
        const { data, error } = await sb.storage.from(PORTFOLIO_BUCKET).download(path);
        if (error) throw new Error('تعذّر تحميل المرفق: ' + error.message);
        await PortfolioBlobs.save(path, data);
        return data;
    }

    /* حذفُ ملفٍّ لا يُفشل عمليّةَ المعلّم: العنصرُ زال من وثيقته وهذا ما
       طلبه. وملفٌّ باقٍ في المخزن بلا إشارةٍ إليه أهونُ من رسالةِ خطأٍ
       على عمليّةٍ نجحت. */
    async function removePortfolioFile(path) {
        if (!path) return;
        try { await PortfolioBlobs.remove(path); } catch (e) { /* مخبأٌ لا غير */ }
        try {
            const { error } = await sb.storage.from(PORTFOLIO_BUCKET).remove([path]);
            if (error) console.warn('[Portfolio] تعذّر حذفُ المرفق من المخزن:', error.message);
        } catch (e) {
            console.warn('[Portfolio] تعذّر حذفُ المرفق من المخزن:', e.message);
        }
    }

    /**
     * يُحضر ملفَّ العنصر: من يده، أو من المخبأ، أو من المخزن.
     * @returns {Promise<Blob|null>} `null` إن كان العنصرُ بلا ملفٍّ أصلاً.
     */
    async function ensurePortfolioFile(item) {
        if (!item) return null;
        if (item.file instanceof Blob && item.file.size > 0) return item.file;
        if (!item.storage_path) return null;
        const blob = await downloadPortfolioFile(item.storage_path);
        item.file = blob;
        return blob;
    }

    /**
     * @param {object} item
     * @param {{uid: string, uploaded: string[]}} ctx يُسجَّل فيه ما رُفع،
     *        فإن فشلت الكتابةُ بعده حُذف ولم يبقَ يتيماً في المخزن.
     */
    async function encodeItemFile(item, ctx) {
        if (!item) return item;
        const out = Object.assign({}, item);

        /* ملفٌّ في اليد بلا مسار: إمّا مرفقٌ جديد، وإمّا قديمٌ فُكَّ من
           `file_data` — وكلاهما يصعد الآن. */
        if (out.file instanceof Blob && out.file.size > 0 && !out.storage_path) {
            const path = await uploadPortfolioFile(ctx.uid, out.file, out.filename);
            ctx.uploaded.push(path);
            out.storage_path = path;
            out.file_type = out.file.type || out.file_type || '';
            out.size      = out.file.size;
            /* يُخبَّأ فورَ رفعه: المعلّم رفعه قبل ثانية، فلا يُنزَّل من جديد. */
            try { await PortfolioBlobs.save(path, out.file); } catch (e) { /* مخبأٌ لا غير */ }
        }

        out.file = null;                                  /* Blob لا يُكتب في JSON */
        if (out.storage_path) delete out.file_data;       /* صعد الملفُّ فسقط نصُّه */
        return out;
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

    /* الرفعُ **بالتتابع لا بالتوازي**: المعلّم قد يحفظ عشرين مرفقاً دفعةً
       واحدة في أوّل هجرةٍ لصفّه القديم، وعشرون رفعاً متزامناً من جوّالٍ على
       شبكةٍ ضعيفةٍ يخنق بعضُها بعضاً. والتتابعُ أبطأ قليلاً وأوثقُ كثيراً. */
    async function encodePortfolioFiles(portfolio, ctx) {
        const out = Object.assign({}, portfolio);
        for (const f of PORTFOLIO_FILE_FIELDS) {
            if (Array.isArray(out[f])) {
                const list = [];
                for (const it of out[f]) list.push(await encodeItemFile(it, ctx));
                out[f] = list;
            }
        }
        if (Array.isArray(out.custom_sections)) {
            const secs = [];
            for (const sec of out.custom_sections) {
                const items = [];
                if (Array.isArray(sec.items)) {
                    for (const it of sec.items) items.push(await encodeItemFile(it, ctx));
                }
                secs.push(Object.assign({}, sec, { items }));
            }
            out.custom_sections = secs;
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

    async function portfolioOut(value, uid, ctx) {
        const teacher_id = value.teacher_id || uid;
        const encoded = await encodePortfolioFiles(value, ctx || { uid, uploaded: [] });
        const data = Object.assign({}, encoded);
        delete data.teacher_id;
        const updated_at = data.updated_at || new Date().toISOString();
        delete data.updated_at;
        return { teacher_id, data, updated_at };
    }

    /* الكتابةُ فشلت بعد أن صعدت المرفقات: تُحذف: ملفٌّ في المخزن لا تشير
       إليه وثيقةٌ لا يراه أحدٌ ولا يحذفه أحد. */
    async function discardUploads(ctx) {
        if (!ctx || !ctx.uploaded || !ctx.uploaded.length) return;
        for (const p of ctx.uploaded) await removePortfolioFile(p);
        ctx.uploaded.length = 0;
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

    /* ══ مخازنُ تُحمَّل عند طلبها لا عند الإقلاع ══
       صفُّ ملفّ الإنجاز يحمل مرفقاته **داخله**: صورٌ ومستنداتٌ حتى ثلاثين
       ميجابايت مكتوبةً نصّاً في عمود `data`. وكان يُسحب في كلّ فتحةٍ باردة
       ولو لم يفتح المعلّم شاشةَ الإنجاز — وهي واحدةٌ من خمسٍ يفتحها أحياناً.
       فيدفع ثمنَ ملفِّه في كلّ مرّةٍ يفتح فيها التطبيق ليسجّل حضوراً.

       فيُؤجَّل: يُحمَّل أوّلَ ما تُطلب قراءته، مرّةً واحدةً في الجلسة. */
    const LAZY_STORES = ['portfolio'];

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

    /* ── بصمةُ المالك ──
       المخبأُ لا يحمل اسمَ صاحبه، فحسابُ «ب» يقرأ ما تركه «أ»: يرث
       `onboarded` فيتخطّى التهيئة كلَّها، ويرث `academic_term` فيكتب
       فصولاً موسومةً بفصلٍ ليس فصله، ثم يُصدّر نسخةً فيها صفوفُ «أ»
       فيُعيد الاستيرادُ نسبَها إليه ملكيةً دائمة.

       والمِعلمُ في `localStorage` لا في المخبأ: الترطيبُ يمسح مخزن
       `settings` ويملؤه من الخادم، فأيُّ مِعلمٍ بداخله يُمحى قبل أن يُقرأ. */
    const OWNER_KEY = 'teacher_app_cache_owner';

    function cacheOwner() {
        try { return global.localStorage.getItem(OWNER_KEY); } catch (e) { return null; }
    }

    /** يمسح المخبأ إن كان لغير صاحب الجلسة. @returns {boolean} هل مُسح؟ */
    async function claimCache(uid) {
        if (cacheOwner() === uid) return false;
        /* يُمسح كاملاً بما فيه الملفّات المحليّة: كتبُ معلّمٍ آخر لا تُترك
           على جهازٍ صار لغيره. ومسحُ مخبأٍ فارغٍ على جهازٍ جديدٍ لا يكلّف. */
        await Cache.clearAll();
        try { global.localStorage.setItem(OWNER_KEY, uid); } catch (e) { /* لا يوقف الإقلاع */ }
        console.info('[TeacherDB] مخبأُ معلّمٍ آخر — مُسح بالكامل.');
        return true;
    }

    /** Pull the current teacher's rows from Supabase into the cache.
     *  Resolves once the first screen's stores are in; the rest keep loading. */
    function hydrate() {
        if (_hydratePromise) return _hydratePromise;
        const t0 = performance.now();

        /* ما كُتب بلا شبكةٍ في جلسةٍ سابقة يُرسل الآن. ولا يُنتظر: الترطيبُ
           لا يتأخّر من أجله، والفشلُ يعيد المحاولةَ عند أوّل كتابةٍ ناجحة
           أو عند حدث `online`. */
        setTimeout(() => { drainOutbox(); }, 0);

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
        /* بوّابةٌ واحدةٌ يمرّ بها كلُّ مخزنٍ قبل ملئه: تُمسح إن كان
           المخبأُ لمعلّمٍ آخر. وتُحسب مرّةً ويُنتظرها الجميع. */
        const claimed = uidP.then((uid) => (uid ? claimCache(uid) : false));

        const reserve = (s, gate) => {
            const p = gate
                .then(() => claimed)
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

        const rest = STORE_NAMES.filter((s) => FIRST_PAINT_STORES.indexOf(s) < 0
                                              && LAZY_STORES.indexOf(s) < 0);
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

    /** المخازنُ المؤجَّلة: وعدُ تحميلها يُحفظ فلا تُحمَّل مرّتين في جلسة. */
    const _lazyLoaded = {};

    /**
     * ينتظر ترطيبَ مخزنٍ واحدٍ إن كان جارياً — وإلا يعود فوراً.
     * وإن كان مؤجَّلاً ولم يُحمَّل بعد، **حُمِّل الآن**: فالتأجيل تأخيرٌ إلى
     * وقت الحاجة لا إسقاطٌ للبيانات.
     */
    async function awaitStore(storeName) {
        if (LAZY_STORES.indexOf(storeName) >= 0 && !_lazyLoaded[storeName]) {
            _lazyLoaded[storeName] = (async () => {
                const uid = await currentUid();
                if (uid) await hydrateStore(storeName, uid);
            })().catch((e) => {
                /* الفشلُ لا يُخلّد: تُعاد المحاولةُ عند القراءة التالية. */
                _lazyLoaded[storeName] = null;
                console.warn('[TeacherDB] تأجيلُ ' + storeName + ' فشل:', e && e.message);
            });
        }
        const p = _storeHydration[storeName] || _lazyLoaded[storeName];
        if (p) { try { await p; } catch (e) { /* الفشل لا يحبس القراءة */ } }
    }

    function resetHydration() {
        _hydratePromise = null;
        _cachedUid = null;
        _term = null;
        for (const k in _storeHydration) _storeHydration[k] = null;
        /* والمؤجَّلةُ معها: معلّمٌ آخر لا يقرأ ملفَّ إنجاز من سبقه. */
        for (const k in _lazyLoaded) _lazyLoaded[k] = null;
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
            const ctx = { uid, uploaded: [] };
            const row = await portfolioOut(value, uid, ctx);
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id' }).select('*').single();
            if (error) { await discardUploads(ctx); err('portfolio add', error); }
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
            const ctx = { uid, uploaded: [] };
            const row = await portfolioOut(value, uid, ctx);
            const { data, error } = await sb.from(table).upsert(row, { onConflict: 'teacher_id' }).select('*').single();
            if (error) { await discardUploads(ctx); err('portfolio put', error); }
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

        /* صفُّ الفصل يُقرأ **قبل** مسحه: مرفقاتُ توزيع المنهج مسجّلةٌ فيه
           وحده، فبعد المسح لا يبقى ما يدلّ على ملفّاتها المحليّة. */
        let doomedClass = null;
        if (storeName === 'classes') {
            try { doomedClass = await Cache.get('classes', key); } catch (e) { /* المسحُ أولى */ }
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
        if (storeName === 'classes') await cascadeClassCache(key, doomedClass);
    }

    /**
     * يمسح من المخبأ كلَّ ما كان معلّقاً بفصلٍ حُذف، ويُزيل شواهده وملفّاته.
     * @param {object|null} [row] صفُّ الفصل كما كان قبل مسحه — منه تُعرف
     *        مرفقاتُ توزيع المنهج، إذ لا مخزنَ آخر يذكرها.
     */
    async function cascadeClassCache(classId, row) {
        const CHILDREN = ['students', 'attendance', 'participation', 'assignments',
                          'exams', 'worksheets', 'books', 'schedule', 'strategy_logs'];
        const evidence = [];
        /* ملفّاتُ الكتب والمنهج **لا تتتالى**: هي محليّةٌ لا صفوفٌ في
           القاعدة، فلا مفتاحَ أجنبيّاً يجرّها. وبقاؤها بعد حذف الفصل
           يأكل مساحةَ الجوال بما لا سبيل لرؤيته ولا لحذفه. */
        const files = [];
        for (const child of CHILDREN) {
            let rows = [];
            try { rows = await Cache.getAll(child); } catch (e) { continue; }
            for (const r of rows) {
                if (!r || r.class_id !== classId) continue;
                if (child === 'strategy_logs' && Array.isArray(r.evidence)) {
                    r.evidence.forEach((path) => { if (path) evidence.push(path); });
                }
                if (child === 'books') files.push(r.id);
                try { await Cache.remove(child, r.id); } catch (e) { /* لا يوقف الباقي */ }
            }
        }
        if (row && Array.isArray(row.curriculum_files)) {
            row.curriculum_files.forEach((f) => { if (f && f.id) files.push(f.id); });
        }
        for (const id of files) {
            try { await BookFiles.remove(id); } catch (e) { /* لا يوقف الباقي */ }
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
        /* محروستان لا خامّتان: كانتا تناديان `put`/`remove` مباشرةً، فكتابةُ
           إعدادٍ بلا إنترنت ترمي وتضيع — ولا تبلغ الصندوقَ الصادر. و`mirror`
           تعرف مخزنَ `settings` أصلاً، وليس في `OUTBOX_SKIP`. (قِيس ٢ سبتمبر
           ٢٠٢٦ عند بناء «ألوان التطبيق»: اللونُ يُطلى ثمّ يسقط حفظُه صامتاً.) */
        async set(key, value) {
            /* والملفُّ يبقى خارجَ الصندوق: شعارُ المدرسة يُحفظ Blobاً، ولو
               صُفّ لأُرسل لاحقاً إلى عمود jsonb فيصير `{}` — نجاحٌ كاذبٌ
               يمحو الشعار. فيبقى كما كان: يرمي بلا إنترنت ويُقال للمعلّم. */
            const isFile = (typeof Blob !== 'undefined' && value instanceof Blob);
            return isFile ? put('settings', { key, value })
                          : putGuarded('settings', { key, value });
        },
        /** محلّيٌّ فوريّ — للتهيئة وحدها، ويُتبع بكتابةٍ حقيقيةٍ في الخلفية. */
        async setLocal(key, value) { return Cache.put('settings', { key, value }); },
        async unset(key) { return removeGuarded('settings', key); }
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

    /* ---------- مخبأُ مرفقات ملفّ الإنجاز (نسخةٌ محلّيةٌ لأصلٍ في المخزن) ---- */
    const PortfolioBlobs = {
        async save(path, blob) {
            if (!path || !blob) return;
            return cacheTx('portfolio_blobs', 'readwrite', (s) =>
                reqAsPromise(s.put({ path, blob, size: blob.size, type: blob.type || '' }))
            );
        },
        async get(path) {
            if (!path) return null;
            const row = await cacheTx('portfolio_blobs', 'readonly', (s) => reqAsPromise(s.get(path)));
            return row?.blob || null;
        },
        async remove(path) {
            if (!path) return;
            return cacheTx('portfolio_blobs', 'readwrite', (s) => reqAsPromise(s.delete(path)));
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

    /* ══════════════════════════════════════════════════════════════════
       الصندوقُ الصادر — الكتابةُ بلا شبكة

       التطبيقُ يعمل بلا إنترنت في القراءة: المخبأُ يُرطَّب عند الدخول
       فتُقرأ الفصولُ والطلابُ والجدولُ من الجهاز. **أمّا الكتابةُ فكانت
       تذهب إلى الخادم مباشرةً** — فمعلّمٌ يرصد الحضورَ في فصلٍ بلا تغطية
       يخسر ما رصده، ويراه أمامَه في الشاشة لأنّها تُرسم من الذاكرة.
       (قيدُ المستخدم: «أبي التطبيق يشتغل بدون إنترنت عادي»، ٣٠ أغسطس.)

       ── كيف يعمل ──
       الكتابةُ تُجرَّب على الخادم أوّلاً كما كانت. فإن سقطت **سقوطَ شبكةٍ
       لا سقوطَ رفض**: تُكتب في المخبأ، ويُحفظ النداءُ في الصندوق، ويُعاد
       تشغيلُه حين تعود الشبكة.

       ── ثلاثةُ قراراتٍ تُقرأ قبل تعديل هذا ──

       ١) **يُحفظ نداؤك كما كتبتَه** (`op`, `store`, `arg`)، لا الصفُّ بعد
          تحويله. فالإعادةُ تمرّ بالمسار نفسِه: التحويلاتُ (`teachersOut`،
          إسنادُ المالك، الفصلُ الدراسيّ) تجري مرّةً واحدةً في مكانها، ولا
          تُنسخ هنا فتتباعد الشيفرتان بعد تعديلٍ يُنسى.

       ٢) **المعرّفُ يُولَّد على الجهاز** حين لا يكون. مفاتيحُ الجداول
          `uuid` بقيمةٍ افتراضيّةٍ من الخادم — فبلا معرّفٍ لا يمكن ربطُ
          الصفّ المحلّيّ بالذي سيُنشأ، ولا يمكن أن تكون الإعادةُ آمنة.
          وبالمعرّف تصير الإعادةُ `upsert` لا `insert`: تُعاد مئةَ مرّةٍ
          فلا تُنشئ إلّا صفّاً واحداً.

       ٣) **ما فيه ملفٌّ لا يُصفّ**: `portfolio` و`books` يرفعان إلى مخزن
          الملفّات، وذاك رفعٌ لا يُعاد تشغيلُه بسطرٍ في طابور. تبقى على
          حالها — تفشل وتُقال.
       ══════════════════════════════════════════════════════════════════ */

    /* ما يُصفّ: كلُّ ما هو صفوفٌ خالصة. وما استُثني ففيه ملفّ. */
    const OUTBOX_SKIP = ['portfolio', 'books', 'book_files', 'portfolio_blobs'];

    let _seq = 0;
    /** رقمٌ متصاعدٌ لا يتكرّر ولو كُتب ألفٌ في المللي ثانية الواحدة. */
    function nextSeq() {
        const now = Date.now() * 1000;
        _seq = now > _seq ? now : _seq + 1;
        return _seq;
    }

    /** أسقوطُ شبكةٍ هذا أم رفضٌ من الخادم؟
     *  والفرقُ جوهريّ: الشبكةُ تُعاد، والرفضُ يُقال للمعلّم — وصفٌّ
     *  يخالف قيداً يُعاد إلى الأبد لو خُلطا. */
    function isNetworkError(e) {
        /* بلا اتّصالٍ أصلاً: الطلبُ لم يبلغ الخادم، فأيُّ خطأٍ خطأُ شبكة. */
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
        const m = String((e && e.message) || '').toLowerCase();
        return /failed to fetch|networkerror|load failed|network request failed|fetch failed|connection|timeout|offline/.test(m);
    }

    /** يكتب الصفَّ في المخبأ كما كان سيُكتب لو نجح الخادم. */
    async function mirror(op, storeName, arg) {
        if (op === 'remove') { await Cache.remove(storeName, arg); return arg; }

        if (storeName === 'settings') {
            await Cache.put('settings', { key: arg.key, value: arg.value });
            return arg.key;
        }
        if (storeName === 'teachers') {
            const uid = await currentUid();
            const id = arg.id || uid;
            const old = (await Cache.get('teachers', id)) || {};
            await Cache.put('teachers', Object.assign({}, old, arg, { id }));
            return id;
        }
        const row = Object.assign({}, arg);
        if (TEACHER_OWNED[storeName] && !row.teacher_id) {
            const uid = await currentUid();
            if (uid) row.teacher_id = uid;
        }
        if (TERM_SCOPED[storeName] && row.term == null) row.term = await currentTerm();
        if (row.id == null) {
            row.id = (global.crypto && global.crypto.randomUUID)
                ? global.crypto.randomUUID()
                : 'off-' + nextSeq() + '-' + Math.random().toString(16).slice(2, 10);
        }
        await Cache.put(storeName, row);
        return row.id;
    }

    async function enqueue(op, storeName, arg, id) {
        const rec = { seq: nextSeq(), op, store: storeName, arg, id, at: new Date().toISOString() };
        await cacheTx('outbox', 'readwrite', (st) => reqAsPromise(st.put(rec)));
        notifyOutbox();
        return rec;
    }

    async function outboxAll() {
        const rows = (await cacheTx('outbox', 'readonly', (st) => reqAsPromise(st.getAll()))) || [];
        return rows.sort((a, b) => a.seq - b.seq);
    }

    async function outboxPending() {
        try { return (await outboxAll()).length; } catch (e) { return 0; }
    }

    function notifyOutbox() {
        try {
            outboxPending().then((n) => {
                global.dispatchEvent(new CustomEvent('teacherdb:outbox', { detail: { pending: n } }));
            });
        } catch (e) { /* إشعارٌ لا يوقف كتابة */ }
    }

    let _draining = false;
    /**
     * يُفرغ الصندوق بالترتيب. **يقف عند أوّل سقوطِ شبكة** — فما بعده قد
     * يعتمد على ما قبله، وتخطّيه يقلب الترتيب.
     * @returns {Promise<{sent:number, dropped:number, left:number}>}
     */
    async function drainOutbox() {
        if (_draining) return { sent: 0, dropped: 0, left: await outboxPending() };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { sent: 0, dropped: 0, left: await outboxPending() };
        }
        _draining = true;
        let sent = 0, dropped = 0;
        try {
            const rows = await outboxAll();
            for (const r of rows) {
                try {
                    if (r.op === 'remove')          await remove(r.store, r.arg);
                    else if (r.op === 'add')        await add(r.store, r.arg);
                    else if (r.op === 'bulkPut')    await bulkPut(r.store, r.arg);
                    else if (r.op === 'bulkRemove') await bulkRemove(r.store, r.arg);
                    else                            await put(r.store, r.arg);
                    await cacheTx('outbox', 'readwrite', (st) => reqAsPromise(st.delete(r.seq)));
                    sent++;
                } catch (e) {
                    if (isNetworkError(e)) break;      /* الشبكةُ ما زالت غائبة */
                    /* رفضٌ من الخادم: يُسقَط ولا يُعاد إلى الأبد. ويُقال —
                       فسكوتُه يعني بياناتٍ ظنّها المعلّم محفوظة. */
                    console.warn('[outbox] رُفض ولن يُعاد:', r.store, r.op, e && e.message);
                    await cacheTx('outbox', 'readwrite', (st) => reqAsPromise(st.delete(r.seq)));
                    dropped++;
                }
            }
        } catch (e) {
            console.warn('[outbox] تعذّر التفريغ:', e && e.message);
        } finally {
            _draining = false;
        }
        notifyOutbox();
        return { sent, dropped, left: await outboxPending() };
    }

    /** يلفّ كتابةً: تُجرَّب، وإن سقطت سقوطَ شبكةٍ صُفَّت. */
    function guarded(op, fn) {
        return async function (storeName, arg) {
            try {
                const out = await fn(storeName, arg);
                /* نجحت كتابةٌ: الشبكةُ حاضرةٌ، فما تأخّر يُرسل الآن. */
                outboxPending().then((n) => { if (n) drainOutbox(); }).catch(() => {});
                return out;
            } catch (e) {
                if (!isNetworkError(e) || OUTBOX_SKIP.indexOf(storeName) >= 0) throw e;
                const id = await mirror(op, storeName, arg);
                /* المعرَّفُ المولَّد يُثبَّت في النداء المحفوظ، وإلّا وُلِّد
                   غيرُه عند الإعادة فصار صفّان لشيءٍ واحد. */
                const kept = (op === 'remove' || !arg || typeof arg !== 'object')
                    ? arg : Object.assign({}, arg, { id: id });
                await enqueue(op, storeName, kept, id);
                return id;
            }
        };
    }

    const addGuarded    = guarded('add', add);
    const putGuarded    = guarded('put', put);
    const removeGuarded = guarded('remove', remove);

    /* ── والدفعاتُ كذلك، وهي أولى بها ──
       «تحضير الجميع» و«مسح حضور اليوم» يكتبان صفوفَ الفصل كلَّها دفعةً
       (`class.js`). وهما أكثرُ ما يُضغط في فصلٍ بلا تغطية — فلو بقيا خارج
       الصندوق لسقط أهمُّ ما بُني له. */
    function guardedBulk(op, fn) {
        return async function (storeName, rows) {
            try {
                const out = await fn(storeName, rows);
                outboxPending().then((n) => { if (n) drainOutbox(); }).catch(() => {});
                return out;
            } catch (e) {
                if (!isNetworkError(e) || OUTBOX_SKIP.indexOf(storeName) >= 0) throw e;
                const list = rows || [];
                const ids = [];
                for (const r of list) ids.push(await mirror(op === 'bulkRemove' ? 'remove' : 'put', storeName, r));
                /* الصفوفُ تُحفظ بمعرّفاتها المولَّدة — فإعادةُ التشغيل
                   `upsert` لا `insert`، ولو أُعيدت مرّتين لم تتضاعف. */
                const kept = op === 'bulkRemove'
                    ? ids
                    : list.map((r, i) => Object.assign({}, r, { id: ids[i] }));
                await enqueue(op, storeName, kept, ids);
                return ids;
            }
        };
    }
    const bulkPutGuarded    = guardedBulk('bulkPut', bulkPut);
    const bulkRemoveGuarded = guardedBulk('bulkRemove', bulkRemove);

    /* تعود الشبكةُ فيُفرَّغ الصندوق بلا أن يطلب أحد. */
    try {
        global.addEventListener('online', () => { drainOutbox(); });
    } catch (e) { /* بيئةٌ بلا نافذة */ }

    global.TeacherDB = {
        open,
        add: addGuarded, put: putGuarded, putLocal,
        get, getAll, getAllByIndex, remove: removeGuarded, clear, count,
        bulkPut: bulkPutGuarded, bulkRemove: bulkRemoveGuarded,
        destroy, exportAll, importAll,
        Settings,
        BookFiles,
        /** مرفقاتُ ملفّ الإنجاز: تُحضَر عند الحاجة، وتُحذف حين يحذفها المعلّم. */
        PortfolioFiles: {
            ensure: ensurePortfolioFile,
            remove: removePortfolioFile,
            /** هل للعنصر مرفقٌ أصلاً — في اليد أو في المخزن؟ */
            has: (item) => !!(item && ((item.file instanceof Blob && item.file.size > 0)
                                       || item.storage_path
                                       || (typeof item.file_data === 'string' && item.file_data)))
        },
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
        LOCAL_ONLY: ['book_files'],
        /** سببُ تعطّل المخزن المحلّي، أو `null` إن كان سليماً. */
        cacheDown: () => _cacheDown,
        /** الصندوقُ الصادر: كتاباتٌ تنتظر عودةَ الشبكة. */
        Outbox: { pending: outboxPending, drain: drainOutbox, all: outboxAll }
    };
})(window);
