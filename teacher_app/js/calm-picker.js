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

    const COLORS = [
        ['#2C3B63', 'كحلي نيلي'],     ['#0A2540', 'كحلي سترايب'],   ['#1B3A5C', 'أزرق بحري'],
        ['#1F4E79', 'أزرق ملكي'],     ['#0B5FA5', 'أزرق آبل غامق'], ['#2F5D8A', 'أزرق فولاذي'],
        ['#3B4B8C', 'نيلي'],          ['#5E6AD2', 'بنفسجي لينير'],  ['#4B3F8F', 'بنفسجي ملكي'],
        ['#553C6E', 'أرجواني'],       ['#6B2D5C', 'توتي'],          ['#7A2E3B', 'خمري'],
        ['#8B3A3A', 'أحمر طوبي'],     ['#7C4A1E', 'بني ذهبي'],      ['#5C4A2E', 'بني رمادي'],
        ['#3C4F41', 'أخضر زيتوني'],   ['#1E5945', 'أخضر غابة'],     ['#0F5C5A', 'أخضر بحري'],
        ['#15606F', 'بترولي (الحالي)'], ['#2A6F77', 'فيروزي غامق'], ['#0F5C7A', 'أزرق بترولي'],
        ['#2B3A42', 'رصاصي أزرق'],    ['#37474F', 'رصاصي فحمي'],    ['#1F2933', 'فحمي'],
        ['#111111', 'أسود'],          ['#3D3D5C', 'رمادي بنفسجي'],  ['#4A5568', 'رمادي فولاذي'],
        ['#6D4C41', 'بني قهوة'],      ['#795548', 'بني فاتح'],      ['#5D4037', 'بني داكن'],
        ['#00695C', 'زمردي'],         ['#00796B', 'زمردي فاتح'],    ['#283593', 'نيلي مادّة'],
        ['#303F9F', 'نيلي فاتح'],     ['#512DA8', 'بنفسجي عميق'],   ['#7B1FA2', 'بنفسجي مشرق'],
        ['#AD1457', 'وردي داكن'],     ['#C62828', 'أحمر'],          ['#B23A0C', 'برتقالي محروق'],
        ['#A64B00', 'برتقالي داكن'],       ['#7A5C00', 'ذهبي داكن'],          ['#9E6B00', 'خردلي'],
        ['#33691E', 'أخضر داكن'],     ['#2E7D32', 'أخضر'],          ['#01579B', 'أزرق سماوي غامق'],
        ['#0277BD', 'أزرق سماوي'],    ['#006064', 'أزرق مخضر'],     ['#004D40', 'أخضر بحري داكن']
    ];

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
