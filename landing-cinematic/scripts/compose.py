# -*- coding: utf-8 -*-
"""تركيبُ الإطارات الخام في إطارٍ سينمائيٍّ عريض.

اللقطةُ الخام شاشةُ جوالٍ طوليّةٌ بأرضيّةٍ بيضاء. والحزمة تطلب canvas بملء
الشاشة بلا حواف، ولونَ أرضيّةٍ موحَّداً عبر الإطارات كلِّها (memory/02).

فيُبنى لكلّ إطار: أرضيةٌ شبه سوداء + هالةٌ بتروليّةٌ تنجرف + الجوالُ في
الوسط بحوافَّ مدوّرةٍ وظلٍّ ناعم + **دوليٌّ بطيء** (تكبيرٌ متدرّج) يمنح
اللقطةَ حياةً بلا حركةٍ صاخبة.
"""
from PIL import Image, ImageDraw, ImageFilter
import os, glob, math

RAW   = 'assets/film/raw'
OUT   = 'assets/film'
W, H  = 3840, 2160         # 4K — يُبنى بالحجم النهائيّ لا مُصغَّراً
BG    = (9, 12, 17)        # #090C11 — لونُ حافّةِ الإطارات الموحَّد
GLOW  = (20, 96, 111)      # #14606F البترولي

def radial(size, color, strength=1.0):
    """هالةٌ شعاعيّة: تُرسم صغيرةً ثمّ تُكبَّر — أنعمُ وأسرعُ من رسمِ حلقات."""
    s = 160
    g = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(g)
    for i in range(s // 2, 0, -1):
        a = int(255 * strength * (1 - i / (s / 2)) ** 2.2)
        d.ellipse([s/2 - i, s/2 - i, s/2 + i, s/2 + i], fill=a)
    g = g.resize(size, Image.LANCZOS)
    layer = Image.new('RGB', size, color)
    out = Image.new('RGB', size, BG)
    out.paste(layer, (0, 0), g)
    return out

def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0]-1, img.size[1]-1], radius=r, fill=255)
    img.putalpha(m)
    return img

files = sorted(glob.glob(os.path.join(RAW, 'f*.png')))
if not files:
    raise SystemExit('لا إطاراتٍ خام')
N = len(files)
os.makedirs(OUT, exist_ok=True)

for i, f in enumerate(files):
    t = i / max(1, N - 1)

    frame = Image.new('RGB', (W, H), BG)

    # ── الهالة: تنجرف يميناً وتتنفّس ──
    # هالةٌ خلف الجهاز نفسِه — ضوءٌ يقع عليه لا بقعةٌ في زاوية
    gw, gh = int(W * 1.05), int(H * 2.0)
    glow = radial((gw, gh), GLOW, strength=0.95 + 0.10 * math.sin(t * math.pi))
    gx = int(W * 0.5 - gw / 2 + (t - 0.5) * W * 0.05)
    gy = int(H * 0.46 - gh / 2)
    frame.paste(glow, (gx, gy), Image.new('L', (gw, gh), 235))

    # مسحةُ ضوءٍ جانبيّةٌ تمنح العمق
    sw, sh2 = int(W * 0.62), int(H * 1.3)
    side = radial((sw, sh2), (28, 141, 166), strength=0.34)
    frame.paste(side, (int(W * 0.80 - sw / 2), int(H * 0.30 - sh2 / 2)),
                Image.new('L', (sw, sh2), 120))

    # ── الجوال: دوليٌّ بطيءٌ من ‎٠٫٩٣‎ إلى ‎١٫٠٥‎ ──
    shot = Image.open(f).convert('RGB')
    scale = 0.94 + 0.10 * t
    ph = int(H * 0.955 * scale)
    pw = int(shot.width * ph / shot.height)
    shot = shot.resize((pw, ph), Image.LANCZOS)
    shot = rounded(shot, int(72 * scale))

    px = (W - pw) // 2
    py = int((H - ph) / 2 + (1 - t) * 6)          # انجرافٌ رأسيٌّ ضئيل

    # ظلٌّ ناعمٌ تحت الجهاز
    sh = Image.new('RGBA', (pw + 288, ph + 288), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [144, 168, pw + 144, ph + 168], radius=int(72 * scale), fill=(0, 0, 0, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(82))
    frame.paste(sh, (px - 144, py - 144), sh)

    frame.paste(shot, (px, py), shot)

    # حدٌّ رفيعٌ يفصل الجهازَ عن العتمة
    ImageDraw.Draw(frame).rounded_rectangle(
        [px, py, px + pw - 1, py + ph - 1], radius=int(30 * scale),
        outline=(66, 82, 108), width=1)

    frame.save(os.path.join(OUT, 'f%03d.jpg' % i), 'JPEG', quality=93, subsampling=0, optimize=True)

total = sum(os.path.getsize(os.path.join(OUT, 'f%03d.jpg' % i)) for i in range(N))
print('✓ %d إطاراً · %.1f MB · %.0f KB للإطار' % (N, total/1048576, total/N/1024))
