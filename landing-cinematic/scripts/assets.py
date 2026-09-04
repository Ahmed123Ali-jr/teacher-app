# -*- coding: utf-8 -*-
"""بناءُ أصول الصفحة من لقطات التطبيق الحقيقيّة.

- assets/seq/       تسلسلُ الفيلم (يُنقل من assets/film)
- product-cut.png   قصاصةٌ **شفّافة** للبطل — لا حيلةَ mix-blend (memory/04, 05)
- product-hero.jpg  لقطةٌ سينمائيّةٌ ساكنة
- ritual.jpg        مشهدُ «اللحظة»
- edition-1/2.jpg   بطاقاتُ الشاشات
"""
from PIL import Image, ImageDraw, ImageFilter
import os, glob, shutil

SHOTS = '../landing/public/shots'
OUT   = 'assets'
BG    = (9, 12, 17)
GLOW  = (20, 96, 111)

os.makedirs(OUT, exist_ok=True)
os.makedirs(f'{OUT}/seq', exist_ok=True)

# ── ١) الفيلم → assets/seq ──
for f in sorted(glob.glob('assets/film/f*.jpg')):
    shutil.copy(f, os.path.join(OUT, 'seq', os.path.basename(f)))
n_seq = len(glob.glob(f'{OUT}/seq/f*.jpg'))

def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0]-1, img.size[1]-1], radius=r, fill=255)
    out = img.convert('RGBA'); out.putalpha(m); return out

def radial(size, color, strength=1.0):
    s = 160
    g = Image.new('L', (s, s), 0); d = ImageDraw.Draw(g)
    for i in range(s // 2, 0, -1):
        d.ellipse([s/2-i, s/2-i, s/2+i, s/2+i], fill=int(255*strength*(1-i/(s/2))**2.2))
    g = g.resize(size, Image.LANCZOS)
    base = Image.new('RGB', size, BG); base.paste(Image.new('RGB', size, color), (0, 0), g)
    return base

def phone(shot_path, height):
    im = Image.open(shot_path).convert('RGB')
    w = int(im.width * height / im.height)
    im = im.resize((w, height), Image.LANCZOS)
    return rounded(im, int(height * 0.037))

# ── ٢) القصاصة الشفّافة للبطل ──
p = phone(f'{SHOTS}/dashboard.webp', 1180)
cut = Image.new('RGBA', (p.width + 160, p.height + 160), (0, 0, 0, 0))
sh = Image.new('RGBA', cut.size, (0, 0, 0, 0))
ImageDraw.Draw(sh).rounded_rectangle(
    [80, 96, 80 + p.width, 96 + p.height], radius=int(p.height*0.037), fill=(0, 0, 0, 150))
cut.alpha_composite(sh.filter(ImageFilter.GaussianBlur(40)))
cut.alpha_composite(p, (80, 80))
d = ImageDraw.Draw(cut)
d.rounded_rectangle([80, 80, 80+p.width-1, 80+p.height-1],
                    radius=int(p.height*0.037), outline=(120, 145, 175, 190), width=2)
cut.save(f'{OUT}/product-cut.png', 'PNG', optimize=True)

# ── ٣) لقطاتٌ سينمائيّةٌ ساكنة ──
def scene(shot_path, out_name, w=1600, h=900, ph_ratio=0.9, gx=0.5):
    fr = Image.new('RGB', (w, h), BG)
    gw, gh = int(w*1.0), int(h*1.9)
    fr.paste(radial((gw, gh), GLOW, 0.9), (int(w*gx-gw/2), int(h*0.46-gh/2)),
             Image.new('L', (gw, gh), 230))
    ph = phone(shot_path, int(h*ph_ratio))
    px, py = (w-ph.width)//2, (h-ph.height)//2
    sh = Image.new('RGBA', (ph.width+140, ph.height+140), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([70, 84, 70+ph.width, 84+ph.height],
        radius=int(ph.height*0.037), fill=(0, 0, 0, 165))
    fr.paste(sh.filter(ImageFilter.GaussianBlur(36)), (px-70, py-70),
             sh.filter(ImageFilter.GaussianBlur(36)))
    fr.paste(ph, (px, py), ph)
    ImageDraw.Draw(fr).rounded_rectangle([px, py, px+ph.width-1, py+ph.height-1],
        radius=int(ph.height*0.037), outline=(66, 82, 108), width=1)
    fr.resize((1280, 720), Image.LANCZOS).save(f'{OUT}/{out_name}', 'JPEG', quality=82, optimize=True)

scene(f'{SHOTS}/reports.webp',  'product-hero.jpg')
scene(f'{SHOTS}/classes.webp',  'ritual.jpg', gx=0.34)
scene(f'{SHOTS}/schedule.webp', 'edition-1.jpg', ph_ratio=0.82)
scene(f'{SHOTS}/dashboard.webp','edition-2.jpg', ph_ratio=0.82)

tot = sum(os.path.getsize(os.path.join(dp, f))
          for dp, _, fs in os.walk(OUT) for f in fs)
print(f'✓ الفيلم {n_seq} إطاراً · الأصول جاهزة · الإجمالي {tot/1048576:.1f} MB')
