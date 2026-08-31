/* ==========================================================================
   views/portfolio-initiatives.js — مكتبة المبادرات المدرسية.

   بنفس نموذج مكتبة الاستراتيجيات: البطاقة تُفتح في مكانها بخطوات التنفيذ،
   وزرّان أسفلها — «نفّذتها» يفتح لوحة التسجيل، و«شواهدي» يعرض ما سُجِّل.

   الفرق عن الاستراتيجيات: المبادرة على مستوى المدرسة لا الفصل، فلا
   class_id فيها ومكانها ملف الإنجاز لا صفحة الفصل. ومعها حقلان زائدان:
   عدد المستفيدين (اختياري)، ومبادرة يكتبها المعلّم بنفسه إن لم يجد ما
   نفّذه في القائمة.
   ========================================================================== */

(function (global) {
    'use strict';

    const BUCKET   = 'evidence';   // نفس مخزن شواهد الاستراتيجيات
    const MAX_SIDE = 1280;

    let _cat = 'all';
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

    function timesWord(n) {
        if (n === 0)  return 'لم تُنفَّذ';
        if (n === 1)  return 'مرة';
        if (n === 2)  return 'مرتان';
        if (n <= 10)  return n + ' مرات';
        return n + ' مرة';
    }

    /* الصورة تُصغَّر قبل الرفع: صورة الكاميرا ٤ ميغابايت تصير نحو ١٥٠
       كيلوبايت، فالرفع أسرع والمخزن أخفّ. */
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

    async function loadLogs(teacher) {
        const rows = await global.TeacherDB.getAllByIndex('initiative_logs', 'teacher_id', teacher.id);
        return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    /* ---------- العرض ---------- */

    async function render(panel, ctx) {
        const teacher = ctx.teacher;
        const logs = await loadLogs(teacher);

        const counts = {};
        logs.forEach((l) => { counts[l.initiative_key] = (counts[l.initiative_key] || 0) + 1; });

        const cats = global.Initiatives.categories();
        const list = _cat === 'all' ? global.Initiatives.all() : global.Initiatives.ofCategory(_cat);
        const done = global.Initiatives.all().filter((x) => counts[x.key]).length;

        /* المبادرات المخصَّصة تُعرض في بطاقات مستقلة أعلى القائمة —
           ليست في الكتالوج فلا تظهر بالترشيح. */
        const customLogs = logs.filter((l) => l.initiative_key === global.Initiatives.CUSTOM_KEY);
        const customNames = [...new Set(customLogs.map((l) => l.custom_name).filter(Boolean))];

        panel.innerHTML = `
            <div class="stg-head">
                <div class="stg-sum">
                    <b class="num">${done}</b>
                    <span>من ${global.Initiatives.all().length} مبادرة نفّذتها${
                        customNames.length ? ` · و${customNames.length} مبادرة خاصة` : ''}</span>
                </div>
                <!-- نظيرُ سطر الاستراتيجيات، وشرحُه هناك. ونصُّه يختلف عنه
                     في كلمتين لأن الشاشةَ والورقَ يختلفان: الزرُّ هنا
                     «نفّذتها» لا «طبّقتها»، وترويسةُ الطباعة «الشواهد» لا
                     «شواهد التنفيذ» — فلا يُوعَد بما لا يقع.
                     ولا شولةً مائلةً هنا: النصُّ داخل قالبٍ نصّيّ. -->
                <p class="stg-note">
                    افتح المبادرة واضغط <b>«✓ نفّذتها»</b> وارفع شواهدك —
                    تُضاف إلى <b>ملف الإنجاز</b> وتُطبع معه تحت «الشواهد».
                </p>
            </div>

            <button type="button" class="stg-btn ghost ini-add" id="ini-custom">
                + مبادرة ليست في القائمة
            </button>

            <div class="stg-fams">
                <button type="button" class="stg-fam ${_cat === 'all' ? 'on' : ''}" data-cat="all">الكل</button>
                ${cats.map((c) => `
                    <button type="button" class="stg-fam ${_cat === c.key ? 'on' : ''}"
                            data-cat="${c.key}">${esc(c.label)}</button>
                `).join('')}
            </div>

            <div class="stg-list">
                ${_cat === 'all' ? customNames.map((n) =>
                    customCardHtml(n, customLogs.filter((l) => l.custom_name === n).length)).join('') : ''}
                ${list.map((x) => cardHtml(x, counts[x.key] || 0)).join('')}
            </div>
        `;

        bind(panel, ctx, logs);
    }

    function cardHtml(x, count) {
        const open = _openKey === x.key;
        return `
            <div class="stg-card ${open ? 'open' : ''}" data-key="${x.key}">
                <button type="button" class="stg-top" data-toggle>
                    <span class="tx">
                        <span class="nm">${esc(x.name)}</span>
                    </span>
                    <span class="badge ${count ? 'done' : 'none'}">${esc(timesWord(count))}</span>
                </button>
                ${open ? `
                    <p class="ini-brief">${esc(x.brief)}</p>
                    <p class="ini-goal">${esc(x.goal)}</p>
                    <ol class="stg-steps">
                        ${x.steps.map((t) => `<li>${esc(t)}</li>`).join('')}
                    </ol>
                    <div class="ini-ev">
                        <b>شواهد مقترحة:</b> ${x.evidence.map(esc).join(' · ')}
                    </div>
                    <div class="stg-act">
                        <button type="button" class="stg-btn main" data-apply>✓ نفّذتها</button>
                        <button type="button" class="stg-btn ghost" data-mine
                                ${count ? '' : 'disabled'}>شواهدي (${count})</button>
                    </div>` : ''}
            </div>
        `;
    }

    /* بطاقة مبادرة كتبها المعلّم: بلا خطوات ولا شواهد مقترحة — الكتالوج
       لا يعرفها، فلا نخترع لها محتوى. */
    function customCardHtml(name, count) {
        const key = 'custom:' + name;
        const open = _openKey === key;
        return `
            <div class="stg-card ${open ? 'open' : ''}" data-custom="${esc(name)}" data-key="${esc(key)}">
                <button type="button" class="stg-top" data-toggle>
                    <span class="tx">
                        <span class="nm">${esc(name)}</span>
                    </span>
                    <span class="badge done">${esc(timesWord(count))}</span>
                </button>
                ${open ? `
                    <p class="ini-brief">مبادرة كتبتها بنفسك</p>
                    <div class="stg-act">
                        <button type="button" class="stg-btn main" data-apply>✓ نفّذتها مرة أخرى</button>
                        <button type="button" class="stg-btn ghost" data-mine>شواهدي (${count})</button>
                    </div>` : ''}
            </div>
        `;
    }

    function bind(panel, ctx, logs) {
        panel.querySelectorAll('[data-cat]').forEach((b) => {
            b.addEventListener('click', () => {
                _cat = b.dataset.cat;
                _openKey = null;
                render(panel, ctx);
            });
        });

        panel.querySelector('#ini-custom')?.addEventListener('click', () =>
            openLogSheet(panel, ctx, global.Initiatives.CUSTOM_KEY, null, ''));

        panel.querySelectorAll('.stg-card').forEach((card) => {
            const key = card.dataset.key;
            const customName = card.dataset.custom || '';
            const isCustom = !!customName;
            const realKey = isCustom ? global.Initiatives.CUSTOM_KEY : key;

            card.querySelector('[data-toggle]')?.addEventListener('click', () => {
                _openKey = _openKey === key ? null : key;
                render(panel, ctx);
            });
            card.querySelector('[data-apply]')?.addEventListener('click', () =>
                openLogSheet(panel, ctx, realKey, null, customName));
            card.querySelector('[data-mine]')?.addEventListener('click', () =>
                openMineSheet(panel, ctx, realKey, logs.filter((l) =>
                    l.initiative_key === realKey &&
                    (!isCustom || l.custom_name === customName))));
        });
    }

    /* ---------- لوحة التسجيل ---------- */

    function openLogSheet(panel, ctx, key, existing, customName) {
        const isCustom = key === global.Initiatives.CUSTOM_KEY;
        const x = isCustom ? null : global.Initiatives.get(key);

        const pick = {
            date: existing ? existing.date : todayISO(),
            note: existing ? (existing.note || '') : '',
            name: existing ? (existing.custom_name || '') : (customName || ''),
            ben:  existing && existing.beneficiaries != null ? String(existing.beneficiaries) : ''
        };
        let files = [];
        let saving = false;
        const QUICK = [
            { d: todayISO(),  label: 'اليوم' },
            { d: isoPlus(-1), label: 'أمس' },
            { d: isoPlus(-7), label: 'الأسبوع الماضي' }
        ];
        let custom = !QUICK.some((q) => q.d === pick.date);

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        paint();

        function paint() {
            body.innerHTML = `
                ${isCustom ? `
                    <div class="sch-lbl">اسم المبادرة</div>
                    <input type="text" class="input" id="ini-name" maxlength="80"
                           placeholder="مثال: ركن الابتكار" value="${esc(pick.name)}">
                ` : ''}

                <div class="sch-lbl"${isCustom ? ' style="margin-top:15px"' : ''}>متى نفّذتها؟</div>
                <div class="sch-chips">
                    ${QUICK.map((q) => `
                        <button type="button" class="sch-chip ${!custom && pick.date === q.d ? 'on' : ''}"
                                data-quick="${q.d}">${q.label}</button>
                    `).join('')}
                    <button type="button" class="sch-chip ${custom ? 'on' : ''}" data-other>✎ تاريخ آخر</button>
                </div>
                ${custom ? `<input type="date" class="input" id="ini-date" max="${todayISO()}"
                                   value="${esc(pick.date)}" style="margin-bottom:13px">` : ''}

                <div class="sch-lbl">عدد المستفيدين (اختياري)</div>
                <input type="number" class="input" id="ini-ben" min="0" max="99999"
                       inputmode="numeric" placeholder="مثال: ٤٥" value="${esc(pick.ben)}">

                <div class="sch-lbl" style="margin-top:15px">ملاحظة (اختياري)</div>
                <input type="text" class="input" id="ini-note" maxlength="200"
                       placeholder="ما الذي نفّذته بالضبط؟" value="${esc(pick.note)}">

                <div class="sch-lbl" style="margin-top:15px">الشواهد</div>
                <button type="button" class="stg-drop" id="ini-pick">📷 أضف صور التنفيذ</button>
                <input type="file" id="ini-file" accept="image/*" multiple hidden>
                <p class="stg-warn">🔒 الشواهد خاصة بك وحدك. وإن ظهر فيها طلاب،
                   فتصويرهم تحكمه أنظمة الوزارة وموافقة أولياء الأمور — والأسلم
                   توثيق اللوحات أو الأعمال دون وجوه.</p>
                <div class="stg-thumbs" id="ini-thumbs"></div>

                <button type="button" class="fsave" id="ini-save">💾 حفظ الشاهد</button>
            `;
            body.querySelector('#ini-name')?.addEventListener('input', (e) => { pick.name = e.target.value; });
            body.querySelector('#ini-note').addEventListener('input', (e) => { pick.note = e.target.value; });
            body.querySelector('#ini-ben').addEventListener('input', (e) => { pick.ben = e.target.value; });
            body.querySelector('#ini-date')?.addEventListener('input', (e) => {
                if (e.target.value) pick.date = e.target.value;
            });
            paintThumbs();
        }

        function paintThumbs() {
            const box = body.querySelector('#ini-thumbs');
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

            if (e.target.closest('#ini-pick')) return body.querySelector('#ini-file').click();

            if (!e.target.closest('#ini-save') || saving) return;

            const name = String(pick.name || '').trim();
            if (isCustom && !name) {
                return global.TeacherApp.toast('اكتب اسم المبادرة أولاً.', 'warning', 3000);
            }
            saving = true;

            const teacher = await global.Auth.currentTeacher();
            const paths = existing ? (existing.evidence || []).slice() : [];

            const btn = body.querySelector('#ini-save');
            try {
                for (let i = 0; i < files.length; i++) {
                    btn.textContent = `⏳ رفع الصورة ${i + 1} من ${files.length}…`;
                    const blob = await compress(files[i]);
                    /* المسار يبدأ بمعرّف المعلم — سياسة المخزن تشترطه. */
                    const path = `${teacher.id}/ini-${Date.now()}-${i}.jpg`;
                    const { error } = await global.SB.storage
                        .from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
                    if (error) throw error;
                    paths.push(path);
                }
            } catch (err) {
                saving = false;
                btn.textContent = '💾 حفظ الشاهد';
                return global.TeacherApp.toast('تعذّر رفع الصورة: ' + err.message, 'error', 6000);
            }

            const ben = parseInt(pick.ben, 10);
            const row = {
                teacher_id:     teacher.id,
                initiative_key: key,
                custom_name:    isCustom ? name : null,
                date:           pick.date,
                note:           String(pick.note || '').trim(),
                beneficiaries:  Number.isFinite(ben) && ben >= 0 ? ben : null,
                evidence:       paths,
                updated_at:     new Date().toISOString()
            };
            if (existing) row.id = existing.id;
            else row.created_at = new Date().toISOString();

            global.Modal.close();
            global.TeacherApp.toast('تم تسجيل المبادرة ✅', 'success', 1400);
            try {
                if (existing) await global.TeacherDB.put('initiative_logs', row);
                else await global.TeacherDB.add('initiative_logs', row);
            } catch (err) {
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }
            _openKey = null;
            await render(panel, ctx);
            if (ctx.refresh) ctx.refresh();
        });

        body.addEventListener('change', (e) => {
            if (e.target.id !== 'ini-file') return;
            files = files.concat(Array.from(e.target.files || []));
            e.target.value = '';
            paintThumbs();
        });

        const title = isCustom
            ? (pick.name ? '✓ ' + pick.name : '✍️ مبادرة جديدة')
            : '✓ ' + (x ? x.name : 'تسجيل مبادرة');
        global.Modal.open({ title, body });
    }

    /* ---------- شواهدي ---------- */

    async function openMineSheet(panel, ctx, key, rows) {
        const label = key === global.Initiatives.CUSTOM_KEY
            ? (rows[0] && rows[0].custom_name) || 'مبادرة خاصة'
            : global.Initiatives.nameOf(key);

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        body.innerHTML = `<p class="dp-hint">جارٍ تحميل الشواهد…</p>`;
        global.Modal.open({ title: '📎 ' + label, body });

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
                    ${row.beneficiaries != null
                        ? `<span class="ini-ben num">👥 ${row.beneficiaries}</span>` : ''}
                    <button type="button" class="x" data-del="${row.id}">🗑️</button>
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
                await global.TeacherDB.remove('initiative_logs', d.dataset.del);
            } catch (err) {
                global.TeacherApp.toast('تعذّر الحذف: ' + err.message, 'error', 6000);
            }
            _openKey = null;
            await render(panel, ctx);
            if (ctx.refresh) ctx.refresh();
        });
    }

    global.PortfolioInitiatives = { render };
})(window);
