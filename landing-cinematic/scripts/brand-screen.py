#!/usr/bin/env python3
"""ختمُ شعار «فصول» الحقيقيِّ على شاشة الجوال في إطارات الفيلم.

   ⚠ **غيرُ مستعمَلٍ الآن.** بُني ليكتب «فصول» تحت الرمز، ثمّ اختار
   المستخدمُ الرمزَ وحدَه بلا كلمة (٦ سبتمبر ٢٠٢٦). يبقى هنا لأنّ فيه
   ثلاثةَ دروسٍ مقيسةٍ تُوفّر إعادةَ اكتشافها — انظر أسفله.


   لماذا لا نطلبه من النموذج: جرّبناه، فقصّ الكلمةَ عند حافّة الشاشة
   («ـصول» بلا الفاء). النماذجُ لا تُؤتمن على العربيّة — لا كتابةً ولا
   حتّى نسخاً عن مرجع. فالرسمُ يُختم هنا بمصفوفةِ منظور: حروفُه حروفُ
   ملفِّ الهُويّة نفسِه، بالبكسل.

   الطريقة: تُكتشف الشاشةُ بوصفها أسطعَ رباعيٍّ في الإطار، ثمّ يُطمس
   ما رسمه النموذجُ عليها بضبابةٍ تُبقي تدرّجَ الضوء، ثمّ يُختم الشعارُ
   بحبره فقط — فيبقى وهجُ الشاشة ولمعانُها كما صوّرهما النموذج.
"""
import cv2, numpy as np, glob, os, sys
from PIL import Image

SEQ  = 'assets/film-seq'
ART  = 'assets/brand/logo-lockup.png'
MINA = 0.004          # ‏أصغرُ مساحةِ شاشةٍ تُقبل، كنسبةٍ من الإطار
MAXA = 0.30           # ‏وأكبرُها — ما تجاوزها ليس شاشةً بل ضوءُ مشهد
THR  = 196            # ‏عتبةُ السطوع
AR   = (1.35, 2.85)   # ‏نسبةُ الطول للعرض: شاشةُ جوالٍ لا كومةُ ورق
CX   = (0.22, 0.78)   # ‏ومركزُه في وسط الإطار: النافذةُ في أعلاه
CY   = (0.28, 0.82)

def artwork():
    """الرمزُ وكلمةُ «فصول» بلا السطر الدقيق — يُقاس لا يُخمَّن."""
    im = Image.open(ART).convert('RGBA')
    a  = im.getchannel('A'); W, H = im.size
    rows = [max(a.crop((0, y, W, y+1)).getdata()) for y in range(H)]
    runs, s = [], None
    for y, v in enumerate(rows):
        if v > 16 and s is None: s = y
        elif v <= 16 and s is not None: runs.append((s, y)); s = None
    if s is not None: runs.append((s, H))
    end = runs[1][1] + 8 if len(runs) >= 2 else H     # ‏كتلتان: الرمزُ والكلمة
    return np.array(im.crop((0, 0, W, min(H, end))))  # RGBA

ART_RGBA = artwork()

def candidates(bgr):
    """كلُّ الرباعيّاتِ الساطعةِ التي تصلح شاشةَ جوالٍ شكلاً — لا أفضلُها.
       الاكتفاءُ بأسطعِ واحدةٍ يلتقط حافّةَ المكتب أو النافذة (رُئي بالعين)."""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, m = cv2.threshold(g, THR, 255, cv2.THRESH_BINARY)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    fa = bgr.shape[0] * bgr.shape[1]
    out = []
    for c in cs:
        if not (MINA * fa <= cv2.contourArea(c) <= MAXA * fa): continue
        (_, _), (rw, rh), _ = cv2.minAreaRect(c)
        if min(rw, rh) < 1: continue
        if not (AR[0] <= max(rw, rh)/min(rw, rh) <= AR[1]): continue
        M = cv2.moments(c)
        if M['m00'] == 0: continue
        ctr = (M['m10']/M['m00'], M['m01']/M['m00'])
        out.append((order_quad(cv2.boxPoints(cv2.minAreaRect(c))), ctr,
                    cv2.contourArea(c)))
    return out

def order_quad(box):
    """الحافّةُ القصيرةُ العليا رأسُ الشاشة، ثمّ لفٌّ مع عقارب الساعة.
       الترتيبُ بالزاويةِ حول المركز يقلب الرسمَ رأساً على عقب (جُرِّب)."""
    e = [np.linalg.norm(box[(i+1) % 4] - box[i]) for i in range(4)]
    shorts = [(0, 1), (2, 3)] if e[0] <= e[1] else [(1, 2), (3, 0)]
    mids = [(box[a] + box[b]) / 2 for a, b in shorts]
    ti = 0 if mids[0][1] < mids[1][1] else 1
    ta, tb = shorts[ti]; ba, bb = shorts[1 - ti]
    if np.linalg.norm(box[ta]-box[ba]) > np.linalg.norm(box[ta]-box[bb]):
        ba, bb = bb, ba
    q = np.array([box[ta], box[tb], box[bb], box[ba]], np.float32)
    if sum(q[i][0]*q[(i+1) % 4][1] - q[(i+1) % 4][0]*q[i][1] for i in range(4)) < 0:
        q = q[[1, 0, 3, 2]]
    return q

def stamp(bgr, quad):
    """يُبنى وجهُ الشاشة كاملاً ثمّ يُركَّب — لا تُطمس الشاشةُ في مكانها.
       الطمسُ في المكان يسيل خارج الرباعيّ فيُضبّب الجوالَ كلَّه (جُرِّب)."""
    h, w = bgr.shape[:2]
    side_w = int(np.linalg.norm(quad[1] - quad[0]))
    side_h = int(np.linalg.norm(quad[3] - quad[0]))
    if side_w < 24 or side_h < 24: return bgr

    dst = np.array([[0,0],[side_w,0],[side_w,side_h],[0,side_h]], np.float32)
    Mx  = cv2.getPerspectiveTransform(dst, quad)
    Mi  = cv2.getPerspectiveTransform(quad, dst)

    # ‏١ · لونُ الشاشة يُقاس منها لا يُخمَّن: وسيطُ أسطعِ نصفِ بكسلاتها
    flat = cv2.warpPerspective(bgr, Mi, (side_w, side_h))
    lum  = cv2.cvtColor(flat, cv2.COLOR_BGR2GRAY).reshape(-1)
    keep = flat.reshape(-1,3)[lum >= np.percentile(lum, 55)]
    base = np.median(keep, axis=0) if len(keep) else np.array([246,248,250], float)

    # ‏٢ · وجهُ شاشةِ بدءٍ نظيف: أرضيّةٌ بذلك اللون بتدرّجٍ خفيفٍ كزجاجٍ مضاء
    grad = np.linspace(1.03, 0.955, side_h, dtype=np.float32)[:, None, None]
    card = np.clip(base[None,None,:] * grad, 0, 255).astype(np.uint8)
    card = np.repeat(card, side_w, axis=1) if card.shape[1] == 1 else card

    # ‏٣ · الشعارُ الحقيقيُّ بحبره — ‎%66‎ من العرض، ومركزُه وسطُ الشاشة
    aw = int(side_w * .66)
    ah = int(aw * ART_RGBA.shape[0] / ART_RGBA.shape[1])
    if ah > side_h * .62:
        ah = int(side_h * .62); aw = int(ah * ART_RGBA.shape[1] / ART_RGBA.shape[0])
    art = cv2.resize(ART_RGBA, (max(aw,1), max(ah,1)), interpolation=cv2.INTER_AREA)
    x0, y0 = (side_w - aw)//2, (side_h - ah)//2
    ia = art[:,:,3:4].astype(np.float32)/255.0
    irgb = cv2.cvtColor(art[:,:,:3], cv2.COLOR_RGB2BGR).astype(np.float32)
    roi = card[y0:y0+ah, x0:x0+aw].astype(np.float32)
    card[y0:y0+ah, x0:x0+aw] = np.clip(roi*(1-ia) + irgb*ia, 0, 255).astype(np.uint8)

    # ‏٤ · قناعٌ بأركانٍ مدوّرةٍ كأركان الشاشة — والرباعيُّ المستطيلُ يتجاوزها
    #     فيسيل البياضُ على الإطار الأسود (جُرِّب فسال).
    pad = max(2, int(side_w * .035))
    rad = max(3, int(side_w * .13))
    mk = np.zeros((side_h, side_w), np.uint8)
    cv2.rectangle(mk, (pad+rad, pad), (side_w-pad-rad, side_h-pad), 255, -1)
    cv2.rectangle(mk, (pad, pad+rad), (side_w-pad, side_h-pad-rad), 255, -1)
    for cx, cy in [(pad+rad, pad+rad), (side_w-pad-rad, pad+rad),
                   (pad+rad, side_h-pad-rad), (side_w-pad-rad, side_h-pad-rad)]:
        cv2.circle(mk, (cx, cy), rad, 255, -1)

    face = cv2.warpPerspective(card, Mx, (w, h))
    m = cv2.warpPerspective(mk, Mx, (w, h))
    m = cv2.GaussianBlur(m, (0,0), max(1.0, side_w*0.010)).astype(np.float32)[:,:,None]/255.0
    out = bgr.astype(np.float32)*(1-m) + face.astype(np.float32)*m
    return np.clip(out, 0, 255).astype(np.uint8)

SEED   = 92          # ‏الإطارُ المرجعُ — رُئي بالعين وصحَّ
MAXJMP = 0.11        # ‏أقصى انتقالٍ لمركز الشاشة بين إطارين، كنسبةٍ من العرض

def track(files, seed_i):
    """يُمسك الجوالُ عند الإطار المرجع ثمّ يُتبَّع نزولاً — فأيُّ بقعةٍ
       ساطعةٍ بعيدةٍ عن موضعه السابق (حافّةُ مكتبٍ أو نافذة) تُرفض."""
    picked = {}
    im = cv2.imread(files[seed_i])
    cand = candidates(im)
    if not cand: return picked
    q, ctr, _ = max(cand, key=lambda t: t[2])
    picked[seed_i] = q
    W = im.shape[1]
    for step in (-1, 1):
        prev, i = ctr, seed_i + step
        while 0 <= i < len(files):
            cand = candidates(cv2.imread(files[i]))
            near = [t for t in cand
                    if np.hypot(t[1][0]-prev[0], t[1][1]-prev[1]) <= MAXJMP*W]
            if not near: break
            q, ctr2, _ = min(near, key=lambda t: np.hypot(t[1][0]-prev[0], t[1][1]-prev[1]))
            picked[i] = q; prev = ctr2; i += step
    return picked

if __name__ == '__main__':
    dry = '--dry' in sys.argv
    files = sorted(glob.glob(f'{SEQ}/f*.jpg'))
    picked = track(files, SEED)
    for i in sorted(picked):
        if dry:
            q = picked[i]
            print(f'  {os.path.basename(files[i])}  ✓ '
                  f'{np.linalg.norm(q[1]-q[0]):.0f}×{np.linalg.norm(q[3]-q[0]):.0f}')
        else:
            bgr = cv2.imread(files[i])
            cv2.imwrite(files[i], stamp(bgr, picked[i]), [cv2.IMWRITE_JPEG_QUALITY, 82])
    ks = sorted(picked)
    rng = f'f{ks[0]:03d}–f{ks[-1]:03d}' if ks else '—'
    print(f'{"جسٌّ فقط: " if dry else "✓ خُتم "}{len(picked)} إطاراً ({rng}) من {len(files)}')
