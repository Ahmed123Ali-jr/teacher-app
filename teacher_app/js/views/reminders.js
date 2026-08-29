/* ==========================================================================
   views/reminders.js — تذكيراتُ المعلّم.

   شريحتان لا ثلاث: **القائمة** كلُّ ما لم يُنجَز، و**المنجزة** ما أُنجز.
   فالتعليمُ ينقل التذكيرَ بينهما ولا يبقى له أثرٌ في القائمة.
   (اختاره المعلّم — الشكل «ج» من معاينة rem.html، ٢٩ أغسطس ٢٠٢٦.)

   والمواعيدُ من الأقدم إلى الأحدث: المتأخّرُ في رأس القائمة لا في ذيلها.
   وما فات موعدُه يقولها بالأحمر، والتأخيرُ يبدأ من «أمس» — يومُ الموعد
   نفسُه ليس تأخيراً.

   ── وما كان قبلَه ──
   كان الفلترُ الأوّل «القادمة» شرطُه `date >= today`، فتذكيرٌ فات موعدُه
   يختفي من أوّل ما تُفتح الشاشة — وهو أولى ما يُرى. سقط الشرطُ مع الشريحة.

   ولوحةُ الإضافة/التعديل (`openSheet`) لم تُمسّ: جُدّدت في ٨ أغسطس
   وتُنادى من الرئيسيّة أيضاً، فنموذجٌ واحدٌ لا اثنان.
   ========================================================================== */

(function (global) {
    'use strict';

    /* بلا أيقونات: رُفعت من الشاشة واللوحة معاً بطلبه (٢٩ أغسطس ٢٠٢٦)،
       فسقط حقلُها من البيانات — لا يبقى في الجدول ما لا يُقرأ. */
    const TYPE_META = {
        exam:     { label: 'اختبار',  color: '#EF4444' },
        homework: { label: 'واجب',    color: '#F59E0B' },
        meeting:  { label: 'اجتماع',  color: '#8B5CF6' },
        activity: { label: 'نشاط',    color: '#0EA5E9' },
        other:    { label: 'أخرى',    color: '#64748B' }
    };

    const TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"'
        + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
        + ' stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

    const arDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function formatDate(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso + 'T00:00:00');
            return new Intl.DateTimeFormat('ar-SA', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(d);
        } catch { return iso; }
    }

    function daysUntil(iso) {
        const today = new Date(todayISO() + 'T00:00:00');
        const target = new Date(iso + 'T00:00:00');
        return Math.round((target - today) / (1000 * 60 * 60 * 24));
    }

    function relativeLabel(iso) {
        const n = daysUntil(iso);
        if (n === 0)  return 'اليوم';
        if (n === 1)  return 'غداً';
        if (n === -1) return 'أمس';
        if (n > 1  && n <= 7)  return `بعد ${arDigits(n)} أيام`;
        if (n < -1 && n >= -7) return `قبل ${arDigits(Math.abs(n))} أيام`;
        return formatDate(iso);
    }

    async function loadAll(teacher) {
        const rows = await global.TeacherDB.getAllByIndex('reminders', 'teacher_id', teacher.id);
        return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }

    /** Today's active reminder count (exposed for dashboard badge). */
    async function todayCount(teacher) {
        const all = await global.TeacherDB.getAllByIndex('reminders', 'teacher_id', teacher.id);
        const t = todayISO();
        return all.filter((r) => r.date === t && !r.done).length;
    }

    async function render(container) {
        const teacher = await global.Auth.currentTeacher();
        if (!teacher) { global.location.hash = '#/login'; return; }

        let filter = 'open';        /* 'open' | 'done' */

        async function paint() {
            const all = await loadAll(teacher);          /* مرتّبةٌ بالتاريخ صعوداً */
            const today = todayISO();

            const open = all.filter((r) => !r.done);
            const done = all.filter((r) => r.done);
            const items = filter === 'done' ? done : open;

            const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
            const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

            /* الزرُّ عائمٌ بصنفَي شاشة الفصول أنفسِهما — لا بصنفٍ يحاكيهما:
               موضعُه ومقاسُه يتبعان «إضافة فصل جديد» أبداً، فإن تحرّك
               تحرّكا معاً. (طلبُ المعلّم ٢٩ أغسطس ٢٠٢٦.) */
            container.innerHTML = `
                <div class="container rm-v2">
                    ${heroHtml(open, done, today)}
                    <div class="rm-seg">
                        <button type="button" class="pseg${filter === 'open' ? ' on' : ''}"
                                data-filter="open">القائمة ${arDigits(open.length)}</button>
                        <button type="button" class="pseg${filter === 'done' ? ' on' : ''}"
                                data-filter="done">المنجزة ${arDigits(done.length)}</button>
                    </div>
                    ${items.length === 0 ? emptyHtml() : `
                        <div class="rm-list">${items.map((r) => itemHtml(r, classById, today)).join('')}</div>`}
                </div>
                <div class="classes-fab">
                    <button type="button" class="start-cta" id="btn-add-reminder">+ إضافة تذكير</button>
                </div>
            `;

            bind(all, classById);
        }

        /* الصدرُ يجيب سؤالَ الدخول: كم عليّ اليوم، وما الذي يليه. */
        function heroHtml(open, done, today) {
            const late  = open.filter((r) => r.date < today).length;
            const now   = open.filter((r) => r.date === today).length;
            const week  = open.filter((r) => r.date > today && daysUntil(r.date) <= 7).length;
            const next  = open.find((r) => r.date > today);
            return `
                <div class="rm-hero">
                    <div class="k">تذكيرات اليوم</div>
                    <div class="v">${arDigits(now)}</div>
                    <div class="s">${next
                        ? 'والقادم: ' + escapeHtml(next.title) + ' — ' + relativeLabel(next.date)
                        : 'لا تذكيرات قادمة'}</div>
                    <div class="row">
                        <div><div class="n">${arDigits(late)}</div><div class="c">متأخرة</div></div>
                        <div><div class="n">${arDigits(week)}</div><div class="c">هذا الأسبوع</div></div>
                        <div><div class="n">${arDigits(done.length)}</div><div class="c">منجزة</div></div>
                    </div>
                </div>`;
        }

        function emptyHtml() {
            return `<div class="rm-empty">${filter === 'done'
                ? 'لم تُنجز تذكيراً بعد.'
                : 'لا تذكيرات. اضغط «إضافة تذكير» لتسجّل ما لا تريد نسيانه.'}</div>`;
        }

        function itemHtml(r, classById, today) {
            const meta = TYPE_META[r.type] || TYPE_META.other;
            const cls  = r.class_id ? classById[r.class_id] : null;
            const label = cls
                ? (global.ClassCreate ? global.ClassCreate.label(cls.grade, cls.section)
                                      : cls.grade + ' / ' + cls.section)
                : '';
            /* التأخيرُ من «أمس»: يومُ الموعد نفسُه ليس تأخيراً. */
            const late = !r.done && r.date < today;
            /* وكم تأخّر يبقى في سطر بيانه، فلا تُفقد المدّةُ حين تُكسب الكلمة. */
            const bits = [meta.label, label, late ? relativeLabel(r.date) : ''].filter(Boolean);
            return `
                <div class="rm-row${r.done ? ' is-done' : ''}" data-id="${escapeAttr(r.id)}">
                    <button type="button" class="rm-tick" data-action="toggle"
                            aria-label="${r.done ? 'إلغاء الإنجاز' : 'تمّ'}">✓</button>
                    <button type="button" class="bd" data-action="edit">
                        <span class="t">${escapeHtml(r.title)}</span>
                        <span class="m">${escapeHtml(bits.join(' · '))}</span>
                    </button>
                    <span class="when${late ? ' late' : ''}">${
                        late ? 'متأخرة' : relativeLabel(r.date)}</span>
                    <button type="button" class="rm-del" data-action="delete"
                            aria-label="حذف التذكير">${TRASH}</button>
                </div>`;
        }

        function bind(all, classById) {
            container.querySelector('#btn-add-reminder')
                ?.addEventListener('click', () => openSheet(teacher, null, paint));

            container.querySelectorAll('[data-filter]').forEach((el) => {
                el.addEventListener('click', () => { filter = el.dataset.filter; paint(); });
            });

            container.querySelectorAll('.rm-row').forEach((el) => {
                const row = all.find((r) => r.id === el.dataset.id);
                if (!row) return;

                el.querySelector('[data-action="toggle"]')
                  ?.addEventListener('click', async () => {
                      row.done = !row.done;
                      await global.TeacherDB.put('reminders', row);
                      paint();
                  });

                el.querySelector('[data-action="edit"]')
                  ?.addEventListener('click', () => openSheet(teacher, row, paint));

                /* الحذفُ بتأكيدٍ دائماً — بشرطه، وهو حذفٌ لا يُستدرك. */
                el.querySelector('[data-action="delete"]')
                  ?.addEventListener('click', async () => {
                      if (!global.confirm('حذف هذا التذكير؟')) return;
                      await global.TeacherDB.remove('reminders', row.id);
                      global.TeacherApp.toast('تم حذف التذكير.', 'info');
                      paint();
                  });
            });
        }

        function escapeHtml(s) {
            return String(s || '').replace(/[&<>"']/g, (m) => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[m]));
        }
        function escapeAttr(s) { return escapeHtml(s); }

        paint();
    }

    /* ==========================================================================
       لوحة التذكير باللمس — نفس أسلوب لوحة إضافة الفصل: أزرار لا قوائم
       منسدلة. العنوان وحده حقل كتابة لأنه لا يمكن اختياره من قائمة.
       تُستدعى من الرئيسية ومن شاشة «تذكيراتي» معاً فلا يبقى نموذجان.
       ========================================================================== */

    function esc(s) {
        return String(s || '').replace(/[&<>"']/g, (m) => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));
    }

    function isoPlus(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    async function openSheet(teacher, existing, onSaved) {
        const classes = await global.TeacherDB.getAllByIndex('classes', 'teacher_id', teacher.id);
        const QUICK = [
            { d: isoPlus(0), label: 'اليوم' },
            { d: isoPlus(1), label: 'غداً' },
            { d: isoPlus(2), label: 'بعد غد' }
        ];

        const pick = {
            title:    existing ? existing.title : '',
            date:     existing ? existing.date : isoPlus(0),
            type:     existing ? existing.type : 'other',
            class_id: existing ? (existing.class_id || '') : ''
        };
        /* تاريخ خارج الأزرار السريعة يفتح منتقي التاريخ مباشرةً. */
        let customDate = !QUICK.some((q) => q.d === pick.date);
        let saving = false;

        const body = document.createElement('div');
        body.className = 'sch-sheet';
        paint();

        function paint() {
            body.innerHTML = `
                <div class="sch-lbl">التذكير</div>
                <input type="text" class="input" id="rm-title" maxlength="120"
                       placeholder="اختبار الوحدة الأولى" value="${esc(pick.title)}">

                <div class="sch-lbl" style="margin-top:15px">متى؟</div>
                <div class="sch-chips">
                    ${QUICK.map((q) => `
                        <button type="button" class="sch-chip ${!customDate && pick.date === q.d ? 'on' : ''}"
                                data-quick="${q.d}">${q.label}</button>
                    `).join('')}
                    <button type="button" class="sch-chip ${customDate ? 'on' : ''}" data-date-other>تاريخ آخر</button>
                </div>
                ${customDate ? `
                    <input type="date" class="input" id="rm-date" value="${esc(pick.date)}"
                           style="margin-bottom:13px">` : ''}

                <div class="sch-lbl">النوع</div>
                <div class="sch-chips">
                    ${Object.entries(TYPE_META).map(([k, v]) => `
                        <button type="button" class="sch-chip ${pick.type === k ? 'on' : ''}"
                                data-type="${k}">${v.label}</button>
                    `).join('')}
                </div>

                <div class="sch-lbl">الفصل</div>
                <div class="sch-chips">
                    <button type="button" class="sch-chip ${!pick.class_id ? 'on' : ''}" data-cls="">عام</button>
                    ${classes.map((c) => `
                        <button type="button" class="sch-chip ${pick.class_id === c.id ? 'on' : ''}"
                                data-cls="${esc(c.id)}">${esc(shortGrade(c.grade))}/${esc(c.section)}</button>
                    `).join('')}
                </div>

                <button type="button" class="fsave" id="rm-save">
                    ${existing ? 'حفظ التعديل' : 'حفظ التذكير'}
                </button>
            `;
            body.querySelector('#rm-title').addEventListener('input', (e) => { pick.title = e.target.value; });
            body.querySelector('#rm-date')?.addEventListener('input', (e) => {
                if (e.target.value) pick.date = e.target.value;
            });
            if (customDate) body.querySelector('#rm-date')?.focus();
        }

        body.addEventListener('click', async (e) => {
            const q = e.target.closest('[data-quick]');
            if (q) { pick.date = q.dataset.quick; customDate = false; return paint(); }

            if (e.target.closest('[data-date-other]')) { customDate = true; return paint(); }

            const ty = e.target.closest('[data-type]');
            if (ty) { pick.type = ty.dataset.type; return paint(); }

            const cl = e.target.closest('[data-cls]');
            if (cl) { pick.class_id = cl.dataset.cls; return paint(); }

            if (!e.target.closest('#rm-save') || saving) return;

            const title = String(pick.title || '').trim();
            if (!title) return global.TeacherApp.toast('اكتب التذكير أولاً.', 'warning', 3000);
            if (!pick.date) return global.TeacherApp.toast('اختر التاريخ.', 'warning', 3000);

            saving = true;
            const row = {
                teacher_id: teacher.id,
                title,
                date:       pick.date,
                type:       pick.type,
                class_id:   pick.class_id || null,
                notes:      existing ? (existing.notes || '') : '',
                done:       existing ? !!existing.done : false,
                created_at: existing ? existing.created_at : new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (existing) row.id = existing.id;

            /* اللوحة تُغلق قبل الكتابة — الكتابة رحلة شبكة تقارب ربع ثانية. */
            global.Modal.close();
            global.TeacherApp.toast(existing ? 'تم حفظ التعديل' : 'تمت إضافة التذكير', 'success', 1200);
            try {
                await global.TeacherDB.put('reminders', row);
            } catch (err) {
                saving = false;
                return global.TeacherApp.toast('تعذّر الحفظ: ' + err.message, 'error', 6000);
            }
            if (onSaved) await onSaved();
        });

        global.Modal.open({ title: existing ? 'تعديل التذكير' : 'تذكير جديد', body });
    }

    function shortGrade(grade) {
        return String(grade || '').replace(/^\s*الصف\s+/, '').split(/\s+/)[0];
    }

    global.RemindersView = { render, todayCount, openSheet };
})(window);
