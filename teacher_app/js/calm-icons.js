/* ==========================================================================
   calm-icons.js — يستبدل الإيموجي برسومٍ خطّيّةٍ بحدودٍ سوداء بلا تعبئة
   ==========================================================================
   طلبُ المستخدم (٢ سبتمبر ٢٠٢٦): «الإيموجيات خلّها رسماتٍ بحدودٍ فقط،
   وتكون حدودُها باللون الأسود، لا ترسمها من الداخل».

   الإيموجي حروفٌ في النصّ لا صورٌ في وسوم، ومبثوثةٌ في ٧٠ موضعاً بين
   الشاشات. فبدل تعديل كلّ شاشة: هذا الملفُّ يمشي على عُقَد النصّ ويبدّل
   كلَّ إيموجي يعرفه بـSVG خطّيّ (stroke بلا fill)، ويعيد المشيَ كلّما
   رُسمت شاشة (MutationObserver). وكلُّه محصورٌ بـ`body.theme-calm`: إن
   خُفض المفتاحُ أُعيد الإيموجي إلى مكانه.

   الرموزُ الخطّيّةُ أصلاً (✓ ✗ ✕ ✎) تُترك: هي خطوطٌ لا تعبئةَ فيها.
   ========================================================================== */
(function (global) {
    'use strict';

    /* مسارٌ واحدٌ لكلّ رمز في صندوق ٢٤×٢٤ — على أسلوب Feather/SF Symbols
       الخطّيّ. الحدُّ من currentColor والتعبئةُ none في CSS. */
    const P = {
        home:     'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
        users:    'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 21v-2a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8',
        user:     'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
        calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',
        folder:   'M3 7h6l2 2h10v11H3z',
        gear:     'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
        book:     'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
        books:    'M4 20V6a2 2 0 0 1 2-2h2v16zM8 20V4h2a2 2 0 0 1 2 2v14zM12 20l3-15 3 1-3 15z',
        edit:     'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
        pencil:   'M17 3l4 4L7 21H3v-4zM15 5l4 4',
        file:     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
        clipboard:'M9 4h6v3H9zM9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M8 12h8M8 16h5',
        target:   'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
        camera:   'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
        trash:    'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
        star:     'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
        bell:     'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
        upload:   'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
        download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        save:     'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2M17 21v-8H7v8M7 3v5h8',
        print:    'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
        phone:    'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M11 18h2',
        call:     'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
        lock:     'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
        key:      'M21 2l-2 2M15.5 7.5l3 3L22 7l-3-3M15.5 7.5L9 14a5 5 0 1 0 1 1z',
        search:   'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
        refresh:  'M23 4v6h-6M1 20v-6h6M20.5 9A9 9 0 0 0 5.6 5.6L1 10M3.5 15a9 9 0 0 0 14.9 3.4L23 14',
        warning:  'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01',
        check:    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M8 12l3 3 5-6',
        bulb:     'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2',
        cap:      'M22 10L12 5 2 10l10 5zM6 12v5c3 3 9 3 12 0v-5',
        mail:     'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 6l-10 7L2 6',
        school:   'M3 21V9l9-6 9 6v12M9 21v-6h6v6M3 21h18M12 9h.01',
        chart:    'M3 3v18h18M7 15l4-4 3 3 5-6',
        trophy:   'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3',
        door:     'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
        tag:      'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-8.6-8.6V3h9l8.6 8.6a2 2 0 0 1 0 2.8M7 7h.01',
        clip:     'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
        question: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
        clock:    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
        seed:     'M12 22V12M12 12C12 8 9 5 4 5c0 5 3 8 8 7M12 12c0-4 3-7 8-7 0 5-3 8-8 7',
        run:      'M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M4 17l4-1 2-5-3-1-2 4M10 11l3 2v4l-2 5M13 13l3-2 3 3M10 8l3-2 3 1 1 3',
        hands:    'M11 17l-4 4M20.5 9.5l-5-5-4 4 3 3-5 5M4 15l5-5-3-3-4 4z',
        family:   'M9 21v-2a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v2M5.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M22 21v-2a3 3 0 0 0-3-3h-1a3 3 0 0 0-3 3v2M18.5 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M9 21v-4a3 3 0 0 1 6 0v4',
        hash:     'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
        thought:  'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.6-.8L3 21l1.9-5.4A8.4 8.4 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4',
        puzzle:   'M14 4a2 2 0 1 1 4 0v2h2v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H8v-4H6a2 2 0 1 1 0-4h2V6h4V4z',
        brain:    'M9.5 2a2.5 2.5 0 0 1 2.5 2.5v15A2.5 2.5 0 0 1 9.5 22 2.5 2.5 0 0 1 7 19.5a3 3 0 0 1-3-3 3 3 0 0 1 1-5.8A3 3 0 0 1 5 6a3 3 0 0 1 2-2 2.5 2.5 0 0 1 2.5-2M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 3 3 0 0 0 3-3 3 3 0 0 0-1-5.8A3 3 0 0 0 19 6a3 3 0 0 0-2-2 2.5 2.5 0 0 0-2.5-2',
        compass:  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z',
        chevL:    'M15 18l-6-6 6-6',
        chevR:    'M9 18l6-6-6-6'
    };

    /* الإيموجي ← اسمُ المسار. المتغيّرُ FE0F يُقشَّر قبل البحث. */
    const MAP = {
        '🏠': 'home', '👥': 'users', '👤': 'user', '👪': 'family', '🤝': 'hands',
        '📅': 'calendar', '🗓': 'calendar', '📁': 'folder', '📂': 'folder', '⚙': 'gear',
        '📖': 'book', '📚': 'books', '📝': 'edit', '✏': 'pencil', '✍': 'pencil',
        '📄': 'file', '📋': 'clipboard', '🎯': 'target', '📷': 'camera', '🗑': 'trash',
        '⭐': 'star', '🌟': 'star', '★': 'star', '☆': 'star', '🔔': 'bell',
        '📤': 'upload', '📥': 'download', '💾': 'save', '🖨': 'print', '📱': 'phone',
        '📞': 'call', '🔒': 'lock', '🔑': 'key', '🔍': 'search', '🔄': 'refresh',
        '🔁': 'refresh', '⚠': 'warning', '✅': 'check', '💡': 'bulb', '🎓': 'cap',
        '✉': 'mail', '🏫': 'school', '📊': 'chart', '🏆': 'trophy', '🚪': 'door',
        '🏷': 'tag', '📎': 'clip', '❓': 'question', '⏰': 'clock', '⏳': 'clock',
        '🌱': 'seed', '🏃': 'run', '🔢': 'hash', '💭': 'thought', '🧩': 'puzzle',
        '🧠': 'brain', '🧭': 'compass', '❮': 'chevL', '❯': 'chevR'
    };

    const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);
    const RE = new RegExp('(' + KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?', 'g');
    const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SVG: 1, svg: 1 };

    function svg(name, glyph) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('viewBox', '0 0 24 24');
        el.setAttribute('class', 'ci');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('data-emoji', glyph);      /* لإعادة الإيموجي عند الخفض */
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', P[name]);
        el.appendChild(p);
        return el;
    }

    function swapNode(t) {
        const s = t.nodeValue;
        if (!s || !RE.test(s)) { RE.lastIndex = 0; return; }
        RE.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = RE.exec(s))) {
            if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
            frag.appendChild(svg(MAP[m[1]], m[0]));
            last = m.index + m[0].length;
        }
        if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
        t.parentNode.replaceChild(frag, t);
    }

    function walk(root) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                const p = n.parentNode;
                if (!p || SKIP[p.nodeName] || p.isContentEditable) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const list = [];
        let n;
        while ((n = w.nextNode())) list.push(n);
        list.forEach(swapNode);
    }

    function restore() {
        document.querySelectorAll('svg.ci[data-emoji]').forEach((el) => {
            el.parentNode.replaceChild(document.createTextNode(el.getAttribute('data-emoji')), el);
        });
        document.body.normalize();
    }

    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            if (document.body.classList.contains('theme-calm')) walk(document.body);
        });
    }

    const mo = new MutationObserver((recs) => {
        for (const r of recs) {
            if (r.type === 'attributes') {
                /* رُفع المفتاحُ أو خُفض */
                if (document.body.classList.contains('theme-calm')) walk(document.body);
                else restore();
                return;
            }
            if (r.addedNodes.length || r.type === 'characterData') { schedule(); return; }
        }
    });

    function start() {
        /* المراقبُ لا يُسجَّل إلّا لمن فتح المعاينةَ مرّةً. كان يُسجَّل للجميع
           بلا شرط — والبوّابةُ داخلَ ردِّ النداء لا قبلَه — فكان كلُّ تبدّلِ
           صنفٍ في أيّ عنصرٍ يستدعي `restore()` ومعها `document.body.normalize()`
           على المستند كلِّه. (قِيس ٢ سبتمبر ٢٠٢٦.) */
        try { if (global.localStorage.getItem('calm_ui') !== '1') return; } catch (e) { return; }
        mo.observe(document.body, { childList: true, subtree: true, characterData: true,
                                    attributes: true, attributeFilter: ['class'] });
        schedule();
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    global.CalmIcons = { refresh: schedule, restore };
})(window);
