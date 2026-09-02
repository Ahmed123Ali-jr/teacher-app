/* ==========================================================================
   calm-picker.js — لوحةُ ألوانٍ منطويةٌ تبدّل لونَ التطبيق فوراً
   ==========================================================================
   طلبُ المستخدم (٢ سبتمبر ٢٠٢٦، الطلبُ التاسع): «الأبيضُ بكلّ درجاته والأسودُ
   والأزرقُ والأصفرُ والأخضرُ والأحمرُ بجميع درجاتها ولو كانت ألفَ لون، ومعها
   خيارا الإشباع والإضاءة — ولا تغطّي المعاينة».

   فاللوحةُ **منطويةٌ في زرٍّ واحد** صغيرٍ عند أسفل اليسار؛ تُفتح لتختار
   ثمّ تُطوى بزرّ «إخفاء» — والتطبيقُ كلُّه ظاهرٌ وأنت تُقارن.

   الدرجات تُولَّد لا تُكتب: لكلّ عائلةٍ صبغةٌ ثابتة، وتُمشّى على الإضاءة
   من ٤ إلى ٩٦ بخطوة ٢، وعلى ثلاث درجاتٍ من الإشباع (خافت/متوسّط/مشبع) —
   ‎١٤١‎ درجةً للعائلة، ‎٧٠٥‎ للملوّنة الخمس + ‎٩٤‎ للأبيض والأسود (رماديّاتٌ
   محايدةٌ من ٠ إلى ١٠٠). كلُّ درجةٍ لها رقمٌ ثابت يُختار به.

   والمنزلقان يعدّلان الدرجةَ المختارة نفسَها (الصبغةُ تبقى)، فيرى الرقمَ
   ثمّ يضبطه بيده. وحرفُ الزرّ يُقلب آليّاً: أبيضُ على الغامق، وداكنٌ على
   الفاتح — فلا تسقط القراءةُ مهما فتّح.

   يُحفظ الاختيارُ في localStorage['calm_pri2'] = {hue, sat, light, n}.
   ========================================================================== */
(function (global) {
    'use strict';

    const FAMILIES = [
        ['أبيض',  null, 'light'],
        ['أسود',  null, 'dark'],
        ['أزرق',  215],
        ['أصفر',  45],
        ['أخضر',  140],
        ['أحمر',  355]
    ];
    const SATS = [22, 55, 88];                       /* خافت، متوسّط، مشبع */
    const LIGHTS = []; for (let l = 4; l <= 96; l += 2) LIGHTS.push(l);

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    function hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        if (mx === mn) return [0, 0, l * 100];
        const d = mx - mn, sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h * 60, sat * 100, l * 100];
    }
    function lum(hex) {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    /* الدرجات كلُّها مرقّمةً — SHADES[n-1] = {n, fam, h, s, l} */
    const SHADES = [];
    FAMILIES.forEach((f, fi) => {
        if (f[1] === null) {
            const range = f[2] === 'light' ? LIGHTS.filter((l) => l >= 50) : LIGHTS.filter((l) => l < 50);
            range.forEach((l) => SHADES.push({ n: SHADES.length + 1, fam: fi, h: 0, s: 0, l }));
        } else {
            SATS.forEach((s) => LIGHTS.forEach((l) => SHADES.push({ n: SHADES.length + 1, fam: fi, h: f[1], s, l })));
        }
    });

    const KEY = 'calm_pri2';
    const state = { h: 40, s: 28, l: 20, n: 0, fam: 3, open: false };

    function paint() {
        const hex = hslToHex(state.h, state.s, state.l);
        const dark = (1.05 / (lum(hex) + 0.05)) >= 3.2;      /* أبيضُ يقرأ؟ وإلّا حرفٌ داكن */
        /* على `body` لا على `html`: `--pri` صار معلَناً على `body.theme-calm`،
           والرمزُ المعلَنُ على العنصر يغلب الموروثَ من أبيه — فكتابةُ `html`
           تقف عند `body` فلا تصل شيئاً. (قِيس ٢ سبتمبر ٢٠٢٦.) */
        const root = document.body.style;
        root.setProperty('--pri', hex);
        root.setProperty('--pri-ink', dark ? '#FFFFFF' : '#1F2933');
        root.setProperty('--pri-ink-shadow', dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.5)');
        /* حبرُ النصوص الملوّنة على الأبيض (العناوين، الخانةُ النشطة، الحبّات،
           الأيقونات): اللونُ نفسُه إن كان غامقاً، وإلّا يُغمَّق حتى يُقرأ
           على الأبيض ‎٤٫٥:١‎ — فاللونُ الفاتح يبقى على الأزرار ولا يذوب حرفُه. */
        let tl = state.l, tHex = hex;
        while (tl > 4 && (1.05 / (lum(tHex) + 0.05)) < 4.5) { tl -= 2; tHex = hslToHex(state.h, state.s, tl); }
        root.setProperty('--pri-text', tHex);
        const lab = document.getElementById('cp-label');
        const isDefault = hex === hslToHex(190, 76, 16);
        if (lab) lab.textContent = (isDefault ? 'الافتراضي (بترولي التطبيق) · ' : (state.n ? 'رقم ' + state.n + ' · ' : '')) + FAMILIES[state.fam][0]
            + ' · إشباع ' + state.s + '٪ · إضاءة ' + state.l + '٪ · ' + hex;
        const pill = document.getElementById('cp-pill-n');
        if (pill) pill.textContent = state.n ? String(state.n) : '·';
        const dot = document.getElementById('cp-pill-dot');
        if (dot) dot.style.background = hex;
        document.querySelectorAll('#cp-shades .sw').forEach((b) => b.classList.toggle('on', +b.dataset.n === state.n));
        const ss = document.getElementById('cp-sat'), ls = document.getElementById('cp-light');
        if (ss && +ss.value !== state.s) ss.value = state.s;
        if (ls && +ls.value !== state.l) ls.value = state.l;
        try { localStorage.setItem(KEY, JSON.stringify({ h: state.h, s: state.s, l: state.l, n: state.n, fam: state.fam })); } catch (e) { /* لا يوقف */ }
    }

    function pick(sh) {
        state.h = sh.h; state.s = sh.s; state.l = sh.l; state.n = sh.n; state.fam = sh.fam;
        paint();
    }

    function renderShades() {
        const row = document.getElementById('cp-shades');
        row.innerHTML = '';
        SHADES.filter((sh) => sh.fam === state.fam).forEach((sh) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'sw'; b.dataset.n = sh.n;
            const hex = hslToHex(sh.h, sh.s, sh.l);
            b.style.background = hex;
            b.style.color = (1.05 / (lum(hex) + 0.05)) >= 3.2 ? '#fff' : '#1F2933';
            b.textContent = String(sh.n);
            b.addEventListener('click', () => pick(sh));
            row.appendChild(b);
        });
        document.querySelectorAll('#cp-fams .fm').forEach((b) => b.classList.toggle('on', +b.dataset.fam === state.fam));
        paint();
        const on = row.querySelector('.sw.on');
        if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function build() {
        if (document.getElementById('calm-cp')) return;
        const el = document.createElement('div');
        el.id = 'calm-cp';
        el.innerHTML =
            '<button type="button" id="cp-pill" aria-label="الألوان">' +
                '<span id="cp-pill-dot"></span><span id="cp-pill-n">·</span><span>الألوان</span></button>' +
            '<div id="cp-panel" hidden>' +
                '<div id="cp-fams"></div>' +
                '<div id="cp-shades"></div>' +
                '<label class="sl"><span>الإشباع</span><input id="cp-sat" type="range" min="0" max="100" step="1"></label>' +
                '<label class="sl"><span>الإضاءة</span><input id="cp-light" type="range" min="2" max="98" step="1"></label>' +
                '<div id="cp-foot"><span id="cp-label"></span>' +
                    '<button type="button" id="cp-default">الافتراضي</button>' +
                    '<button type="button" id="cp-hide">إخفاء</button></div>' +
            '</div>';
        document.body.appendChild(el);

        const fams = el.querySelector('#cp-fams');
        FAMILIES.forEach((f, i) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'fm'; b.dataset.fam = i; b.textContent = f[0];
            b.addEventListener('click', () => { state.fam = i; renderShades(); });
            fams.appendChild(b);
        });
        el.querySelector('#cp-sat').addEventListener('input', (e) => { state.s = +e.target.value; state.n = 0; paint(); });
        el.querySelector('#cp-light').addEventListener('input', (e) => { state.l = +e.target.value; state.n = 0; paint(); });
        const toggle = (open) => {
            state.open = open;
            el.querySelector('#cp-panel').hidden = !open;
            document.body.classList.toggle('cp-open', open);
        };
        el.querySelector('#cp-hide').addEventListener('click', () => toggle(false));
        /* «الافتراضي» = لونُ التطبيق المنشور: البتروليّ ‎#0A3F4A‎ (--pf-royal)
           بصبغته وإشباعه وإضاءته كما هي — لا رقمَ له في الشريط. */
        el.querySelector('#cp-default').addEventListener('click', () => {
            const [h, sat, l] = hexToHsl('#0A3F4A');
            state.h = Math.round(h); state.s = Math.round(sat); state.l = Math.round(l); state.n = 0; state.fam = 2;
            renderShades();
        });

        /* (الطلبُ العاشر) الزرُّ عائمٌ يُسحب: إن غطّى شيئاً حرّكه. السحبُ
           بالمؤشّر (لمسٌ وفأرة)، والنقرةُ التي لم تتحرّك ٦ نقاط تفتح
           اللوحة. الموضعُ يُحفظ في calm_cp_pos، ويُقصّ داخل الشاشة. */
        const pill = el.querySelector('#cp-pill');
        const POS = 'calm_cp_pos';
        function place(x, y) {
            const w = el.offsetWidth || 120, h = pill.offsetHeight || 36;
            x = Math.max(4, Math.min(x, global.innerWidth - w - 4));
            y = Math.max(4, Math.min(y, global.innerHeight - h - 4));
            el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.bottom = 'auto';
            /* اللوحةُ فوق الزرّ إن كان في النصف السفليّ، وتحته إن كان في العلويّ */
            el.classList.toggle('panel-below', y < global.innerHeight / 2);
            /* واللوحةُ تُقصّ أفقيّاً داخل الشاشة مهما كان موضعُ الزرّ */
            const panel = el.querySelector('#cp-panel');
            const pw = Math.min(global.innerWidth * 0.92, 420);
            const px = Math.max(4, Math.min(x, global.innerWidth - pw - 4));
            panel.style.left = (px - x) + 'px';
            return [x, y];
        }
        let drag = null;
        pill.addEventListener('pointerdown', (e) => {
            const r = el.getBoundingClientRect();
            drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
            pill.setPointerCapture(e.pointerId);
        });
        pill.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            if (!drag.moved && Math.hypot(dx, dy) < 6) return;
            drag.moved = true;
            place(drag.ox + dx, drag.oy + dy);
        });
        pill.addEventListener('pointerup', (e) => {
            if (!drag) return;
            if (drag.moved) {
                const r = el.getBoundingClientRect();
                try { localStorage.setItem(POS, JSON.stringify([r.left, r.top])); } catch (err) { /* لا يوقف */ }
            } else {
                toggle(!state.open);
            }
            drag = null;
        });
        pill.addEventListener('pointercancel', () => { drag = null; });
        let pos = null;
        try { pos = JSON.parse(localStorage.getItem(POS) || 'null'); } catch (e) { /* لا يوقف */ }
        if (pos && pos.length === 2) place(pos[0], pos[1]);
        global.addEventListener('resize', () => { const r = el.getBoundingClientRect(); if (el.style.top) place(r.left, r.top); });

        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* لا يوقف */ }
        if (saved && typeof saved.l === 'number') Object.assign(state, saved);
        renderShades();
    }

    function sync() {
        let ui = null;
        try { ui = localStorage.getItem('calm_ui'); } catch (e) { /* لا يوقف */ }
        if (ui !== '1') return;
        const show = document.body.classList.contains('theme-calm');
        if (show) build();
        const el = document.getElementById('calm-cp');
        if (el) el.hidden = !show;
    }
    function start() {
        sync();
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})(window);
