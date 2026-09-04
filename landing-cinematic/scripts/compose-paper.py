# -*- coding: utf-8 -*-
"""فصلا الاختبارات وملفّ الإنجاز: الجوالُ ينزاح، والورقةُ A4 تنزلق بجانبه.
   الورقةُ مصوَّرةٌ من مسرح الطباعة الحقيقيّ — لا رسمَ ولا تخيّل."""
import os, glob, math
from PIL import Image, ImageDraw, ImageFilter

W, H = 3840, 2160
BG   = (9, 12, 17)
GLOW = (20, 96, 111)

def radial(size, color, s=1.0):
    n = 180
    g = Image.new('L', (n, n), 0); d = ImageDraw.Draw(g)
    for i in range(n//2, 0, -1):
        d.ellipse([n/2-i, n/2-i, n/2+i, n/2+i], fill=int(255*s*(1-i/(n/2))**2.2))
    g = g.resize(size, Image.LANCZOS)
    b = Image.new('RGB', size, BG); b.paste(Image.new('RGB', size, color), (0,0), g)
    return b

def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,img.size[0]-1,img.size[1]-1], radius=r, fill=255)
    o = img.convert('RGBA'); o.putalpha(m); return o

def shadow(size, r, blur, alpha, pad):
    s = Image.new('RGBA', (size[0]+pad*2, size[1]+pad*2), (0,0,0,0))
    ImageDraw.Draw(s).rounded_rectangle([pad, pad+24, pad+size[0], pad+size[1]+24],
                                        radius=r, fill=(0,0,0,alpha))
    return s.filter(ImageFilter.GaussianBlur(blur))

def build(key, paper_path):
    src = sorted(glob.glob(f'assets/raw/{key}/f*.png'))
    paper = Image.open(paper_path).convert('RGB')
    out = f'assets/frames/{key}'; os.makedirs(out, exist_ok=True)
    N = len(src)
    for i, f in enumerate(src):
        t = i / max(1, N-1)
        # الورقةُ تدخل في النصف الثاني
        pin = max(0.0, min(1.0, (t - 0.46) / 0.34))
        e = 1 - (1 - pin) ** 3                       # تباطؤٌ في النهاية
        fr = Image.new('RGB', (W, H), BG)
        gw, gh = int(W*1.02), int(H*1.95)
        fr.paste(radial((gw, gh), GLOW, .92), (int(W*0.5-gw/2), int(H*0.46-gh/2)),
                 Image.new('L', (gw, gh), 232))

        # الجوال: يبدأ في الوسط ثمّ ينزاح يميناً ليُفسح للورقة
        shot = Image.open(f).convert('RGB')
        ph = int(H*0.955*(0.945+0.05*t)); pw = int(shot.width*ph/shot.height)
        shot = rounded(shot.resize((pw, ph), Image.LANCZOS), 72)
        px = int((W-pw)/2 + e*(W*0.205)); py = (H-ph)//2
        sh = shadow((pw, ph), 72, 82, 170, 144)
        fr.paste(sh, (px-144, py-144), sh); fr.paste(shot, (px, py), shot)
        ImageDraw.Draw(fr).rounded_rectangle([px,py,px+pw-1,py+ph-1], radius=72,
                                             outline=(66,82,108), width=3)
        # الورقة تنزلق من اليسار
        if pin > 0:
            ah = int(H*0.90); aw = int(paper.width*ah/paper.height)
            pg = rounded(paper.resize((aw, ah), Image.LANCZOS), 10)
            ax = int(W*0.30 - aw/2 - (1-e)*W*0.24); ay = (H-ah)//2
            psh = shadow((aw, ah), 10, 90, int(190*e), 150)
            fr.paste(psh, (ax-150, ay-150), psh)
            if e < 1:
                pg.putalpha(pg.getchannel('A').point(lambda v: int(v*e)))
            fr.paste(pg, (ax, ay), pg)
        fr.save(f'{out}/f{i:03d}.jpg', 'JPEG', quality=93, subsampling=0, optimize=True)
    return N

for key, paper in [('exams', 'assets/screens/exam-page-1.png'),
                   ('portfolio', 'assets/screens/portfolio-page-1.png')]:
    n = build(key, paper)
    sz = sum(os.path.getsize(p) for p in glob.glob(f'assets/frames/{key}/*.jpg'))
    print(f'{key:11} {n} إطاراً · {sz/1048576:.1f} MB')
