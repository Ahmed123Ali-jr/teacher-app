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
    const CACHE_DB_VERSION = 1;

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
        { name: 'strategies',    keyPath: 'id',          indexes: [['teacher_id']] },
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
        async clearAll() {
            for (const def of CACHE_STORES) await this.clearStore(def.name);
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

    async function teachersOut(value) {
        const out = {};
        for (const k of Object.keys(value || {})) {
            if (k === 'photo') {
                if (value.photo instanceof Blob) out.photo_url = await blobToDataURL(value.photo);
                else if (value.photo === null) out.photo_url = null;
                continue;
            }
            const mapped = TEACHERS_OUT_MAP[k];
            if (mapped) out[mapped] = value[k];
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

    function portfolioIn(row) {
        if (!row) return null;
        return Object.assign(
            { teacher_id: row.teacher_id, updated_at: row.updated_at },
            row.data || {}
        );
    }

    async function portfolioOut(value, uid) {
        const teacher_id = value.teacher_id || uid;
        const data = Object.assign({}, value);
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

    /** Pull all of the current teacher's rows from Supabase into the cache.
     *  Idempotent: subsequent calls during the same login return the same Promise. */
    async function hydrate() {
        if (_hydratePromise) return _hydratePromise;
        _hydratePromise = (async () => {
            const uid = await currentUid();
            if (!uid) return;
            const t0 = performance.now();

            // Run fetches in parallel for speed.
            const fetches = STORE_NAMES.map(async (storeName) => {
                const table = TABLE[storeName];
                let rows;
                try {
                    if (storeName === 'teachers') {
                        const { data } = await sb.from(table).select('*').eq('id', uid);
                        rows = (data || []).map(teachersIn);
                    } else if (storeName === 'portfolio') {
                        const { data } = await sb.from(table).select('*').eq('teacher_id', uid);
                        rows = data || [];
                    } else if (storeName === 'settings') {
                        const { data } = await sb.from(table).select('key,value').eq('teacher_id', uid);
                        rows = data || [];
                    } else {
                        const { data } = await sb.from(table).select('*');
                        rows = data || [];
                    }
                } catch (e) {
                    console.warn('[TeacherDB] hydrate ' + storeName + ' failed:', e.message);
                    return;
                }
                await Cache.clearStore(storeName);
                if (rows.length) await Cache.putMany(storeName, rows);
            });

            await Promise.all(fetches);
            console.info('[TeacherDB] hydrated in ' + Math.round(performance.now() - t0) + 'ms');
        })();
        return _hydratePromise;
    }

    function resetHydration() {
        _hydratePromise = null;
        _cachedUid = null;
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

        const row = Object.assign({}, value);
        delete row.id;
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

        const row = Object.assign({}, value);
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
        if (cached) return cached;
        return undefined;
    }

    async function getAll(storeName) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);

        const rows = await Cache.getAll(storeName);
        if (storeName === 'portfolio') return rows.map(portfolioIn);
        return rows;
    }

    async function getAllByIndex(storeName, indexName, value) {
        if (!TABLE[storeName]) throw new Error('Unknown store: ' + storeName);

        if (storeName === 'teachers' && indexName === 'email') return [];

        const rows = await Cache.getAllByIndex(storeName, indexName, value);
        // Some legacy callers query an index that wasn't declared on the cache; fall back to filter.
        if (rows.length === 0) {
            const all = await Cache.getAll(storeName);
            return all.filter((r) => r[indexName] === value);
        }
        return rows;
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

    async function importAll(dump) {
        if (!dump || !dump.data) throw new Error('نسخة احتياطية غير صالحة.');
        for (const name of STORE_NAMES) {
            const rows = dump.data[name];
            if (!Array.isArray(rows)) continue;
            if (name === 'teachers') continue;
            await clear(name);
            for (const row of rows) {
                try { await put(name, row); }
                catch (e) { console.warn('[TeacherDB] importAll row failed (' + name + '):', e.message); }
            }
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
        async unset(key) { return remove('settings', key); }
    };

    function open() { return openCache(); }

    global.TeacherDB = {
        open,
        add, put, get, getAll, getAllByIndex, remove, clear, count,
        destroy, exportAll, importAll,
        Settings,
        STORES: STORE_NAMES,
        VERSION: 'sb-cached-1',
        // Cache control
        hydrate,
        resetHydration,
        clearLocalCache: () => Cache.clearAll()
    };
})(window);
