/* يولّد بلاطةَ الحبيبات PNG وقتَ البناء — لا feTurbulence وقتَ التشغيل.
   ١٢٨×١٢٨ RGBA، بيضاءُ وسوداءُ بشفافيّةٍ ضئيلة، متوازنةٌ فلا ترفع المتوسّط.
   المخرَج: app/grain.css فيه data-URI — صفرُ طلبات، ويدخل في حزمة CSS. */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 96;
const LEVELS = [0, 3, 6, 9];   // ألفا مكمَّمةٌ أربعَ درجات — إنتروبيا أقلُّ فضغطٌ أفضل
const MAX_A = 9;
let seed = 0x5f3a91c7;     // مولّدٌ حتميّ: بلاطةٌ واحدةٌ في كلّ بناء
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/* نوعُ اللون ٤: رماديٌّ + ألفا — بايتان لكلّ بكسل بدل أربعة. */
const raw = Buffer.alloc(SIZE * (SIZE * 2 + 1));
let p = 0, sum = 0;
for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0;                                   // بايتُ المرشّح: None
    for (let x = 0; x < SIZE; x++) {
        const up = rnd() < 0.5;                     // أفتحُ أم أغمق
        const a = LEVELS[(rnd() * LEVELS.length) | 0];
        raw[p++] = up ? 255 : 0;
        raw[p++] = a;
        sum += up ? a : -a;
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit رمادي+ألفا

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
]);

const b64 = png.toString('base64');
mkdirSync('app', { recursive: true });
writeFileSync('app/grain.css',
    `/* مولَّدٌ آلياً بـ scripts/make-grain.mjs — لا يُحرَّر بيد. */\n` +
    `:root { --grain: url("data:image/png;base64,${b64}"); }\n`);

const meanShift = sum / (SIZE * SIZE);
console.log(`grain: ${SIZE}x${SIZE} · ${(png.length / 1024).toFixed(1)}KB خام · ` +
    `${(b64.length / 1024).toFixed(1)}KB base64 · ذروة ±${MAX_A} · انزياحُ المتوسّط ${meanShift.toFixed(3)} درجة`);
if (Math.abs(meanShift) > 1) { console.error('✗ المتوسّطُ انزاح أكثرَ من درجة'); process.exit(1); }
