/* ==========================================================================
   sheet-read.js — قراءةُ ملفّات إكسل في المتصفّح، بلا مكتبةٍ وبلا ذكاء.
   ==========================================================================
   كثيرٌ من المعلّمين يحفظون كشوفَهم جدولاً: تصديرٌ من نظامٍ مدرسيّ، أو
   ملفٌّ من الإدارة، أو جدولٌ كتبوه بأنفسهم. والجدولُ **خلايا حقيقيّة**:
   الاسمُ فيه كاملٌ بحروفه الصحيحة، لا صورةٌ تُقرأ ولا بكسلاتٌ تُخمَّن.

   فقراءتُه: دقّةٌ تامّة · بلا حصّةٍ من الذكاء · ولا يخرج الملفُّ من الجهاز.

   ── ولا مكتبةَ خارجيّة ──
   ملفُّ `xlsx` ليس إلّا **مجلّداً مضغوطاً فيه XML**. والمتصفّحُ يفكّ
   الضغطَ بنفسه (`DecompressionStream('deflate-raw')`)، ويقرأ XML بنفسه
   (`DOMParser`). فلا وزنَ يُضاف إلى التطبيق ولا تبعيّةَ تُصان.

   ── وما لا تقرؤه ──
   صيغةُ `xls` القديمة (ثنائيّةٌ لا مضغوطة) خارجَ هذا كلِّه، وتحتاج مكتبةً
   لوحدها. تُردّ برسالةٍ تقول للمعلّم ماذا يفعل، لا برفضٍ صامت.
   ========================================================================== */

(function (global) {
    'use strict';

    /* ══ فكُّ الضغط ══
       الأرشيفُ يُقرأ من ذيله: سجلُّ النهاية يقول أين الفهرس، والفهرسُ يقول
       أين كلُّ ملفّ. وهذا أضمنُ من المسح من الرأس — فبعض المنتِجين يكتبون
       أحجاماً صفريّةً في ترويسة الملفّ ويؤجّلونها إلى ما بعده. */
    async function unzip(buf) {
        const dv = new DataView(buf);
        const u8 = new Uint8Array(buf);
        let eocd = -1;
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
            if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('ليس ملفّاً مضغوطاً');

        const count = dv.getUint16(eocd + 10, true);
        let p = dv.getUint32(eocd + 16, true);
        const out = {};

        for (let i = 0; i < count; i++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            const method  = dv.getUint16(p + 10, true);
            const csize   = dv.getUint32(p + 20, true);
            const nameLen = dv.getUint16(p + 28, true);
            const extLen  = dv.getUint16(p + 30, true);
            const cmtLen  = dv.getUint16(p + 32, true);
            const lho     = dv.getUint32(p + 42, true);
            const name    = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
            p += 46 + nameLen + extLen + cmtLen;

            /* الترويسةُ المحلّيّة تحمل أطوالاً خاصّةً بها — تُقرأ منها لا من
               الفهرس، فقد تختلف. */
            const lNameLen = dv.getUint16(lho + 26, true);
            const lExtLen  = dv.getUint16(lho + 28, true);
            const start = lho + 30 + lNameLen + lExtLen;
            const raw = u8.subarray(start, start + csize);

            if (method === 0) { out[name] = raw; continue; }
            if (method !== 8) continue;                    /* ضغطٌ لا نعرفه */
            const ds = new DecompressionStream('deflate-raw');
            const blob = new Blob([raw]);
            out[name] = new Uint8Array(
                await new Response(blob.stream().pipeThrough(ds)).arrayBuffer());
        }
        return out;
    }

    const text = (u8) => u8 ? new TextDecoder().decode(u8) : '';
    const xml  = (s) => new DOMParser().parseFromString(s, 'application/xml');

    /* عنوانُ الخليّة «BC12» ← رقمُ عمودها. */
    function colOf(ref) {
        let n = 0;
        for (let i = 0; i < ref.length; i++) {
            const c = ref.charCodeAt(i);
            if (c < 65 || c > 90) break;
            n = n * 26 + (c - 64);
        }
        return n - 1;
    }

    /** يقرأ ورقةً واحدةً إلى مصفوفة صفوف. */
    function sheetRows(doc, shared) {
        const rows = [];
        const list = doc.getElementsByTagName('row');
        for (let i = 0; i < list.length; i++) {
            const cells = list[i].getElementsByTagName('c');
            const row = [];
            for (let j = 0; j < cells.length; j++) {
                const c = cells[j];
                const at = colOf(c.getAttribute('r') || '');
                const t  = c.getAttribute('t');
                let v = '';
                if (t === 'inlineStr') {
                    const is = c.getElementsByTagName('t');
                    for (let k = 0; k < is.length; k++) v += is[k].textContent;
                } else {
                    const vn = c.getElementsByTagName('v')[0];
                    const raw = vn ? vn.textContent : '';
                    v = (t === 's') ? (shared[+raw] || '') : raw;
                }
                v = String(v).replace(/\s+/g, ' ').trim();
                if (at >= 0) row[at] = v; else row.push(v);
            }
            /* صفٌّ فارغٌ تماماً يُسقط — ورقاتُ إكسل مليئةٌ بها في الذيل. */
            if (row.some((x) => x)) rows.push(Array.from(row, (x) => x || ''));
        }
        return rows;
    }

    /**
     * يقرأ ملفَّ إكسل إلى أوراقٍ وصفوف.
     * @returns {Promise<{ok:true,sheets:{name:string,rows:string[][]}[]}
     *                 |{ok:false,why:string,msg:string}>}
     *   `msg` رسالةٌ للمعلّم، و`why` سببٌ للسجلّ.
     */
    async function read(file) {
        const name = String(file.name || '');
        if (/\.xls$/i.test(name)) {
            return { ok: false, why: 'legacy-xls',
                     msg: 'صيغة xls القديمة لا تُقرأ. افتح الملف واحفظه بصيغة '
                        + 'xlsx أو CSV ثم ارفعه.' };
        }
        if (typeof DecompressionStream !== 'function') {
            return { ok: false, why: 'no-decompression',
                     msg: 'متصفّحك لا يفكّ ضغط ملفّات إكسل. احفظ الملف بصيغة CSV ثم ارفعه.' };
        }
        try {
            const files = await unzip(await file.arrayBuffer());

            /* السلاسلُ المشتركة: إكسل يخزّن النصوصَ المتكرّرة مرّةً ويشير
               إليها برقم. وبلا فكّها تخرج الأسماءُ أرقاماً. */
            const shared = [];
            const ss = files['xl/sharedStrings.xml'];
            if (ss) {
                const si = xml(text(ss)).getElementsByTagName('si');
                for (let i = 0; i < si.length; i++) {
                    const ts = si[i].getElementsByTagName('t');
                    let v = '';
                    for (let k = 0; k < ts.length; k++) v += ts[k].textContent;
                    shared.push(v);
                }
            }

            /* أسماءُ الأوراق في `workbook.xml`، ومواضعُها في ملفّ العلاقات —
               ولا يُفترض أنّ الورقة الأولى هي `sheet1.xml`. */
            const wb = files['xl/workbook.xml'];
            if (!wb) return { ok: false, why: 'not-xlsx',
                              msg: 'هذا ليس ملفّ إكسل صالحاً.' };
            const rels = {};
            const rl = files['xl/_rels/workbook.xml.rels'];
            if (rl) {
                const rs = xml(text(rl)).getElementsByTagName('Relationship');
                for (let i = 0; i < rs.length; i++) {
                    rels[rs[i].getAttribute('Id')] =
                        String(rs[i].getAttribute('Target') || '').replace(/^\/?xl\//, '');
                }
            }

            const sheets = [];
            const sh = xml(text(wb)).getElementsByTagName('sheet');
            for (let i = 0; i < sh.length; i++) {
                const rid = sh[i].getAttribute('r:id') || sh[i].getAttribute('id');
                let target = rels[rid] || ('worksheets/sheet' + (i + 1) + '.xml');
                const u8 = files['xl/' + target] || files[target];
                if (!u8) continue;
                const rows = sheetRows(xml(text(u8)), shared);
                if (rows.length) sheets.push({ name: sh[i].getAttribute('name') || ('ورقة ' + (i + 1)), rows });
            }
            if (!sheets.length) return { ok: false, why: 'empty',
                                         msg: 'الملف فارغ — لا صفوف فيه.' };
            return { ok: true, sheets };
        } catch (e) {
            return { ok: false, why: 'parse:' + (e && e.message || e),
                     msg: 'تعذّرت قراءة الملف. احفظه بصيغة CSV ثم ارفعه.' };
        }
    }

    const isSheet = (f) => /\.(xlsx|xlsm|xls)$/i.test(String(f && f.name || ''))
        || /spreadsheet|ms-excel/.test(String(f && f.type || ''));

    global.SheetRead = { read, isSheet };
})(window);
