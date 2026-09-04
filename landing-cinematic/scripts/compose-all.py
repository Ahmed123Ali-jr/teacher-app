# -*- coding: utf-8 -*-
"""تركيبُ كلّ فصلٍ في إطارٍ سينمائيٍّ 4K."""
import os, glob, math, sys
from PIL import Image, ImageDraw, ImageFilter

W, H = 3840, 2160
BG   = (9, 12, 17)
GLOW = (20, 96, 111)

def radial(size, color, strength=1.0):
    s = 180
    g = Image.new('L', (s, s), 0); d = ImageDraw.Draw(g)
    for i in range(s // 2, 0, -1):
        d.ellipse([s/2-i, s/2-i, s/2+i, s/2+i], fill=int(255*strength*(1-i/(s/2))**2.2))
    g = g.resize(size, Image.LANCZOS)
    base = Image.new('RGB', size, BG); base.paste(Image.new('RGB', size, color), (0,0), g)
    return base

def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,img.size[0]-1,img.size[1]-1], radius=r, fill=255)
    o = img.convert('RGBA'); o.putalpha(m); return o

def build(key):
    src = sorted(glob.glob(f'assets/raw/{key}/f*.png'))
    if not src: return 0
    out = f'assets/frames/{key}'
    os.makedirs(out, exist_ok=True)
    N = len(src)
    for i, f in enumerate(src):
        t = i / max(1, N - 1)
        fr = Image.new('RGB', (W, H), BG)
        gw, gh = int(W*1.02), int(H*1.95)
        fr.paste(radial((gw, gh), GLOW, 0.92 + 0.08*math.sin(t*math.pi)),
                 (int(W*0.5-gw/2 + (t-0.5)*W*0.04), int(H*0.46-gh/2)),
                 Image.new('L', (gw, gh), 232))
        shot = Image.open(f).convert('RGB')
        scale = 0.945 + 0.09 * t                       # دوليٌّ بطيء
        ph = int(H * 0.955 * scale)
        pw = int(shot.width * ph / shot.height)
        shot = rounded(shot.resize((pw, ph), Image.LANCZOS), int(72*scale))
        px, py = (W-pw)//2, int((H-ph)/2 + (1-t)*14)
        sh = Image.new('RGBA', (pw+288, ph+288), (0,0,0,0))
        ImageDraw.Draw(sh).rounded_rectangle([144,168,pw+144,ph+168],
            radius=int(72*scale), fill=(0,0,0,170))
        sh = sh.filter(ImageFilter.GaussianBlur(82))
        fr.paste(sh, (px-144, py-144), sh)
        fr.paste(shot, (px, py), shot)
        ImageDraw.Draw(fr).rounded_rectangle([px,py,px+pw-1,py+ph-1],
            radius=int(72*scale), outline=(66,82,108), width=3)
        fr.save(f'{out}/f{i:03d}.jpg', 'JPEG', quality=93, subsampling=0, optimize=True)
    return N

keys = sys.argv[1:] or ['home','classes','schedule','register','exams','initiatives','portfolio']
for k in keys:
    n = build(k)
    sz = sum(os.path.getsize(p) for p in glob.glob(f'assets/frames/{k}/*.jpg'))
    print(f'{k:14} {n:3} إطاراً · {sz/1048576:5.1f} MB' if n else f'{k:14} — لا إطارات')
