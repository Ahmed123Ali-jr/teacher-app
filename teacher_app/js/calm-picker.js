/* ==========================================================================
   calm-picker.js — شريطُ ألوانٍ مرقّمٌ أسفلَ الشاشة يبدّل لونَ الأزرار الرئيسيّة
   ==========================================================================
   طلبُ المستخدم (٢ سبتمبر ٢٠٢٦): «قائمةٌ كبيرةٌ من الألوان تحت الشاشة، أضغطها
   فتتعدّل ألوانُ الأزرار، وأختار المناسبَ بالرقم».

   أداةُ معاينةٍ لا شاشةُ معلّم: تظهر فقط مع مفتاح ?calm=1، وتحفظ اختيارَه
   في localStorage['calm_pri'] ليبقى وهو يتنقّل بين الشاشات. اللونُ الواحد
   يُشتقّ منه التدرّجُ كلُّه في CSS (color-mix) — فتغييرُ رمزٍ واحدٍ
   `--pri` يعيد رسمَ كلّ زرٍّ رئيسيّ.

   كلُّ الألوان داكنةٌ بما يكفي ليقرأ الأبيضُ عليها ‎≥ ٤٫٥:١‎ (قِيست عند
   الاختيار). الأسماءُ للتعرّف لا للحسم — الحسمُ بالرقم.
   ========================================================================== */
(function (global) {
    'use strict';

    /* (الطلبُ السابع) درجاتٌ متسلسلةٌ لكلّ لونٍ أساسيّ بدل ألوانٍ متفرّقة:
       كلُّ مجموعةٍ صبغةٌ واحدة (hue) تُمشّى على السطوع من الغامق إلى الأفتح.
       وتُحذف آليّاً كلُّ درجةٍ لا يقرأ الأبيضُ عليها ‎٤٫٥:١‎ — فالرقمُ الذي
       يراه صالحٌ لزرٍّ بحرفٍ أبيض. */
    const GROUPS = [
        ['كحلي',    222, 42, [10, 13, 16, 19, 22, 25, 28, 31, 34, 37]],
        ['أزرق',    212, 68, [16, 20, 24, 28, 32, 36, 40, 44]],
        ['نيلي',    240, 45, [18, 22, 26, 30, 34, 38, 42, 46]],
        ['بنفسجي',  270, 42, [18, 22, 26, 30, 34, 38, 42]],
        ['بترولي',  192, 62, [12, 15, 18, 21, 24, 27, 30, 33]],
        ['فيروزي',  178, 55, [14, 17, 20, 23, 26, 29, 32]],
        ['أخضر',    150, 45, [14, 17, 20, 23, 26, 29, 32, 35]],
        ['زيتوني',   85, 35, [16, 19, 22, 25, 28, 31]],
        ['خمري',    350, 55, [18, 22, 26, 30, 34, 38, 42]],
        ['بني',      25, 50, [18, 22, 26, 30, 34, 38]],
        ['ذهبي',     40, 70, [18, 21, 24, 27, 30]],
        ['رصاصي',   215, 12, [10, 14, 18, 22, 26, 30, 34, 38, 42]]
    ];

    function hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    function lum(hex) {
        const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    const COLORS = [];      /* [hex, label, groupName, isFirstOfGroup] */
    GROUPS.forEach((g) => {
        let first = true;
        g[3].forEach((l, i) => {
            const hex = hslToHex(g[1], g[2], l);
            if (1.05 / (lum(hex) + 0.05) < 4.5) return;
            COLORS.push([hex, g[0] + ' ' + (i + 1), g[0], first]);
            first = false;
        });
    });

    const KEY = 'calm_pri';

    function apply(hex) {
        document.documentElement.style.setProperty('--pri', hex);
        document.querySelectorAll('#calm-pri .sw').forEach((b) => {
            b.classList.toggle('on', b.dataset.hex === hex);
        });
        const lab = document.getElementById('calm-pri-label');
        if (lab) {
            const i = COLORS.findIndex((c) => c[0] === hex);
            lab.textContent = i >= 0 ? ('رقم ' + (i + 1) + ' — ' + COLORS[i][1] + ' ' + hex) : hex;
        }
    }

    function build() {
        if (document.getElementById('calm-pri')) return;
        const bar = document.createElement('div');
        bar.id = 'calm-pri';
        bar.innerHTML = '<div class="row"></div><div id="calm-pri-label"></div>';
        const row = bar.querySelector('.row');
        COLORS.forEach((c, i) => {
            if (c[3]) {
                const t = document.createElement('span');
                t.className = 'grp';
                t.textContent = c[2];
                row.appendChild(t);
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sw';
            b.dataset.hex = c[0];
            b.style.background = c[0];
            b.title = c[1];
            b.textContent = String(i + 1);
            b.addEventListener('click', () => {
                try { localStorage.setItem(KEY, c[0]); } catch (e) { /* لا يوقف */ }
                apply(c[0]);
            });
            row.appendChild(b);
        });
        document.body.appendChild(bar);
        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch (e) { /* لا يوقف */ }
        apply(saved || COLORS[0][0]);
    }

    function sync() {
        const show = document.body.classList.contains('theme-calm');
        let ui = null;
        try { ui = localStorage.getItem('calm_ui'); } catch (e) { /* لا يوقف */ }
        if (ui !== '1') return;
        if (show) build();
        const bar = document.getElementById('calm-pri');
        if (bar) bar.hidden = !show;
        document.body.classList.toggle('has-calm-pri', show);
    }

    function start() {
        sync();
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})(window);
