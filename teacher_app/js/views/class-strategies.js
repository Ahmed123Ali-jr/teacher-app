/* ==========================================================================
   views/class-strategies.js — مكتبة استراتيجيات التدريس داخل الفصل.

   النموذج ب: البطاقة تُفتح في مكانها بخطوات التطبيق، وزرّان أسفلها —
   «طبّقتها» يفتح لوحة التسجيل، و«شواهدي» يعرض ما سُجِّل سابقاً.

   الشاهد يخصّ فصلاً وتاريخاً، فمكان المكتبة داخل الفصل لا في قائمة الفصول
   — وإلا سُئل المعلم «أي فصل؟» في كل تسجيل.
   ========================================================================== */

(function (global) {
    'use strict';

    const BUCKET   = 'evidence';
    const MAX_SIDE = 1280;   // ضغط الصورة قبل الرفع

    let _family = 'all';
    let _openKey = null;

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function isoPlus(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function humanDate(iso) {
        try {
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'long'
            }).format(new Date(iso + 'T00:00:00'));
        } catch { return iso; }
    }

    /** «٣ مرات» بعدّ عربي صحيح — لا «3 مرات» في كل الحالات. */
    function timesWord(n) {
        if (n === 0)  return 'لم تُطبَّق';
        if (n === 1)  return 'مرة';
        if (n === 2)  return 'مرتان';
        if (n <= 10)  return n + ' مرات';
        return n + ' مرة';
    }

    /* صورة الشاهد تُصغَّر قبل الرفع: صورة الكاميرا ٤ ميغابايت تصير نحو
       ١٥٠ كيلوبايت، فالرفع أسرع والمخزن أخفّ. */
    function compress(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.82);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    async function loadLogs(cls) {
        const rows = await global.TeacherDB.getAllByIndex('strategy_logs', 'class_id', cls.id);
        return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    async function render(panel, cls) {
        const logs = await loadLogs(cls);
        const counts = {};
        logs.forEach((l) => { counts[l.strategy_key] = (counts[l.strategy_key] || 0) + 1; });

        const list = global.Strategies.ofFamily(_family);
        const applied = Object.keys(counts).length;

        panel.innerHTML = `
            <div class="stg-head">
                <div class="stg-sum">
                    <b class="num">${applied}</b>
                    <span>من ${global.Strategies.all().length} استراتيجية طبّقتها في هذا الفصل</span>
                </div>
                <!-- سطرٌ يخبر عن سلوكٍ لا يظهر في الشاشة: أن ما يُرفع هنا
                     ينتقل إلى ملف الإنجاز. وهو من الباقي لا المحذوف في
                     قاعدة theme-white — كسطر الجرس — لأنه بيانٌ عن الواقع
                     لا شرحٌ للواجهة. (طلبُ المعلّم، ٢٢ أغسطس ٢٠٢٦.)
                     ولا شولةً مائلةً هنا: النصُّ داخل قالبٍ نصّيّ، وأوّلُ
                     شولةٍ تُنهيه فينكسر الملفّ كلُّه. -->
                <p class="stg-note">
                    افتح الاستراتيجية واضغط <b>«✓ طبّقتها»</b> وارفع شواهدك —
                    تُضاف إلى <b>ملف الإنجاز</b> وتُطبع معه تحت «شواهد التنفيذ».
                </p>
            </div>

            <div class="stg-fams">
                ${global.Strategies.families().map((f) => `
                    <button type="button" class="stg-fam ${_family === f.key ? 'on' : ''}"
                            data-fam="${f.key}">${esc(f.label)}</button>
                `).join('')}
            </div>

            <div class="stg-list">
                ${list.map((s) => cardHtml(s, counts[s.key] || 0)).join('')}
            </div>
        `;

        bind(panel, cls, logs);
    }

    function cardHtml(s, count) {
        const open = _openKey === s.key;
        return `
            <div class="stg-card ${open ? 'open' : ''}" data-key="${s.key}">
                <button type="button" class="stg-top" data-toggle>
                    <span class="tx">
                        <span class="nm">${esc(s.name)}</span>
                        <span class="sub">${esc(s.brief)}</span>
                    </span>
                    <span class="badge ${count ? 'done' : 'none'}">${esc(timesWord(count))}</span>
                </button>
                ${open ? `
                    <ol class="stg-steps">
                        ${s.steps.map((t) => `<li>${esc(t)}</li>`).join('')}
                    </ol>
                    <div class="stg-act">
                        <button type="button" class="stg-btn main" data-apply>✓ طبّقتها</button>
                        <button type="button" class="stg-btn ghost" data-mine
                                ${count ? '' : 'disabled'}>شواهدي (${count})</button>
                    </div>` : ''}
            </div>
        `;
    }

    function bind(panel, cls, logs) {
        panel.querySelectorAll('[data-fam]').forEach((b) => {
            b.addEventListener('click', () => {
                _family = b.dataset.fam;
                _openKey = null;
                render(panel, cls);
            });
        });

        panel.querySelectorAll('.stg-card').forEach((card) => {
            const key = card.dataset.key;
            card.querySelector('[data-toggle]')?.addEventListener('click', () => {
                _openKey = _openKey === key ? null : key;
                render(panel, cls);
            });
            card.querySelector('[data-apply]')?.addEventListener('click', () =>
                openLogSheet(panel, cls, key, null));
            card.querySelector('[data-mine]')?.addEventListener('click', () =>
                openMineSheet(panel, cls, key, logs.filter((l) => l.strategy_key === key)));
        });
    }

    /* ---------- لوحة التسجيل ---------- */

    function openLogSheet(panel, cls, key, existing) {
        const s = global.Strategies.get(key);
        const pick = {
            date: existing ? existing.date : todayISO(),
            note: existing ? (existing.note || '') : ''
        };
        let files = [];      // ملفات جديدة تنتظر الرفع
        let saving = false;
        const QUICK = [
            { d: todayISO(),  label: 'اليوم' },
            { d: isoPlus(-1), label: 'أمس' },
            { d: isoPlus(-2), label: 'قبل يومين' }
        ];
        let custom = !QUICK.some((q) => q.d === pick.date);

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        paint();

        function paint() {
            body.innerHTML = `
                <div class="sch-lbl">متى طبّقتها؟</div>
                <div class="sch-chips">
                    ${QUICK.map((q) => `
                        <button type="button" class="sch-chip ${!custom && pick.date === q.d ? 'on' : ''}"
                                data-quick="${q.d}">${q.label}</button>
                    `).join('')}
                    <button type="button" class="sch-chip ${custom ? 'on' : ''}" data-other>✎ تاريخ آخر</button>
                </div>
                ${custom ? `<input type="date" class="input" id="stg-date" max="${todayISO()}"
                                   value="${esc(pick.date)}" style="margin-bottom:13px">` : ''}

                <div class="sch-lbl">ملاحظة (اختياري)</div>
                <input type="text" class="input" id="stg-note" maxlength="200"
                       placeholder="ما الذي نفّذته بالضبط؟" value="${esc(pick.note)}">

                <div class="sch-lbl" style="margin-top:15px">الشواهد</div>
                <button type="button" class="stg-drop" id="stg-pick">${Icons.svg('camera')} أضف صور التنفيذ</button>
                <input type="file" id="stg-file" accept="image/*" multiple hidden>
                <p class="stg-warn">${Icons.svg('lock')} الشواهد خاصة بك وحدك. وإن ظهر فيها طلاب،
                   فتصويرهم تحكمه أنظمة الوزارة وموافقة أولياء الأمور — والأسلم
                   توثيق السبورة أو أعمالهم دون وجوه.</p>
                <div class="stg-thumbs" id="stg-thumbs"></div>

                <button type="button" class="fsave" id="stg-save">${Icons.svg('save')} حفظ الشاهد</button>
            `;
            body.querySelector('#stg-note').addEventListener('input', (e) => { pick.note = e.target.value; });
            body.querySelector('#stg-date')?.addEventListener('input', (e) => {
                if (e.target.value) pick.date = e.target.value;
            });
            paintThumbs();
        }

        function paintThumbs() {
            const box = body.querySelector('#stg-thumbs');
            if (!box) return;
            box.innerHTML = files.map((f, i) => `
                <span class="stg-thumb">
                    <img src="${URL.createObjectURL(f)}" alt="">
                    <button type="button" class="x" data-rm="${i}">✕</button>
                </span>
            `).join('');
        }

        body.addEventListener('click', async (e) => {
            const q = e.target.closest('[data-quick]');
            if (q) { pick.date = q.dataset.quick; custom = false; return paint(); }
            if (e.target.closest('[data-other]')) { custom = true; return paint(); }

            const rm = e.target.closest('[data-rm]');
            if (rm) { files.splice(Number(rm.dataset.rm), 1); return paintThumbs(); }

            if (e.target.closest('#stg-pick')) return body.querySelector('#stg-file').click();

            if (!e.target.closest('#stg-save') || saving) return;
            saving = true;

            const teacher = await global.Auth.currentTeacher();
            const paths = existing ? (existing.evidence || []).slice() : [];

            const btn = body.querySelector('#stg-save');
            try {
                for (let i = 0; i < files.length; i++) {
                    btn.textContent = `رفع الصورة ${i + 1} من ${files.length}…`;
                    const blob = await compress(files[i]);
                    /* المسار يبدأ بمعرّف المعلم — سياسة المخزن تشترطه. */
                    const path = `${teacher.id}/${key}-${Date.now()}-${i}.jpg`;
                    const { error } = await global.SB.storage
                        .from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
                    if (error) throw error;
                    paths.push(path);
                }
            } catch (err) {
                saving = false;
                btn.textContent = 'حفظ الشاهد';
                return global.TeacherApp.toast('تعذّر رفع الصورة: ' + err.message, 'error', 6000);
            }

            const row = {
                teacher_id:   teacher.id,
                class_id:     cls.id,
                strategy_key: key,
                date:         pick.date,
                note:         String(pick.note || '').trim(),
                evidence:     paths,
                updated_at:   new Date().toISOString()
            };
            if (existing) row.id = existing.id;
            else row.created_at = new Date().toISOString();

            global.Modal.close();
            global.TeacherApp.toast('تم تسجيل التطبيق ✅', 'success', 1400);
            try {
                if (existing) await global.TeacherDB.put('strategy_logs', row);
                else await global.TeacherDB.add('strategy_logs', row);
            } catch (err) {
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }
            await render(panel, cls);
        });

        body.addEventListener('change', (e) => {
            if (e.target.id !== 'stg-file') return;
            files = files.concat(Array.from(e.target.files || []));
            e.target.value = '';
            paintThumbs();
        });

        global.Modal.open({ title: '✓ ' + (s ? s.name : 'تسجيل تطبيق'), body });
    }

    /* ---------- شواهدي ---------- */

    async function openMineSheet(panel, cls, key, rows) {
        const s = global.Strategies.get(key);
        const body = document.createElement('div');
        body.className = 'sch-sheet';
        body.innerHTML = `<p class="dp-hint">جارٍ تحميل الشواهد…</p>`;
        global.Modal.open({ title: '' + (s ? s.name : 'شواهدي'), body });

        /* روابط موقّتة: المخزن خاص فلا تُفتح صوره برابط مباشر. */
        const withUrls = await Promise.all(rows.map(async (r) => {
            const urls = await Promise.all((r.evidence || []).map(async (p) => {
                try {
                    const { data } = await global.SB.storage.from(BUCKET).createSignedUrl(p, 3600);
                    return data ? data.signedUrl : null;
                } catch { return null; }
            }));
            return { row: r, urls: urls.filter(Boolean) };
        }));

        body.innerHTML = withUrls.map(({ row, urls }) => `
            <div class="stg-log" data-log="${row.id}">
                <div class="stg-log-h">
                    <b>${esc(humanDate(row.date))}</b>
                    <button type="button" class="x" data-del="${row.id}">${Icons.svg('trash')}</button>
                </div>
                ${row.note ? `<p class="stg-log-n">${esc(row.note)}</p>` : ''}
                ${urls.length ? `<div class="stg-thumbs">
                    ${urls.map((u) => `<a class="stg-thumb" href="${esc(u)}" target="_blank" rel="noopener">
                        <img src="${esc(u)}" alt=""></a>`).join('')}
                </div>` : '<p class="stg-log-n">بلا صور</p>'}
            </div>
        `).join('') || '<p class="dp-hint">لا شواهد بعد.</p>';

        body.addEventListener('click', async (e) => {
            const d = e.target.closest('[data-del]');
            if (!d) return;
            if (!(await global.TeacherApp.confirm({ title: 'حذف هذا الشاهد؟', ok: 'حذف', danger: true }))) return;
            const row = rows.find((r) => r.id === d.dataset.del);
            global.Modal.close();
            global.TeacherApp.toast('تم الحذف.', 'info', 1200);
            try {
                /* الصور تُحذف من المخزن أيضاً — لا تتتالى مع حذف الصف. */
                if (row && row.evidence && row.evidence.length) {
                    await global.SB.storage.from(BUCKET).remove(row.evidence);
                }
                await global.TeacherDB.remove('strategy_logs', d.dataset.del);
            } catch (err) {
                global.TeacherApp.toast('تعذّر الحذف: ' + err.message, 'error', 6000);
            }
            await render(panel, cls);
        });
    }

    global.ClassStrategiesView = { render };
})(window);
