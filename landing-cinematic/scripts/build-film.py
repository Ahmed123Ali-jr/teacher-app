#!/usr/bin/env python3
"""استخراجُ تسلسلِ إطارات الهيرو من المقاطع الأربعة.
   يُسقَط الإطارُ الأوّلُ من المقاطع ٢..٤ لأنّه نسخةٌ من آخرِ سابقه
   (قِيس: الفرقُ عند اللُّحمة ٠٫٧–٢٫٥ من ٢٥٥)."""
import cv2, os, glob, json

CLIPS = ['assets/clips/v1.mp4','assets/clips/v2.mp4','assets/clips/v3.mp4','assets/clips/v4.mp4']
OUT   = 'assets/film-seq'
PER, W, Q = 24, 1280, 82

os.makedirs(OUT, exist_ok=True)
for f in glob.glob(OUT + '/f*.jpg'): os.remove(f)

idx, marks = 0, []
for ci, p in enumerate(CLIPS):
    cap = cv2.VideoCapture(p)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        print('⚠ فارغ:', p); cap.release(); continue
    picks = [round(i*(total-1)/(PER-1)) for i in range(PER)]
    if ci: picks = picks[1:]                       # ‏إطارُ الحدِّ المكرَّر
    start = idx
    for f in picks:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, fr = cap.read()
        if not ok: continue
        h, w = fr.shape[:2]
        fr = cv2.resize(fr, (W, round(h*W/w)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'{OUT}/f{idx:03d}.jpg', fr, [cv2.IMWRITE_JPEG_QUALITY, Q])
        idx += 1
    marks.append({'clip': os.path.basename(p), 'start': start, 'end': idx-1})
    cap.release()

kb = sum(os.path.getsize(f) for f in glob.glob(OUT+'/f*.jpg'))/1024
json.dump({'count': idx, 'width': W, 'marks': marks},
          open(OUT+'/index.json','w'), ensure_ascii=False)
print(f'✓ {idx} إطاراً · {W}px · {kb/1024:.1f} م.ب · {kb/idx:.0f}ك.ب للإطار')
for m in marks: print(f'   {m["clip"]}: {m["start"]}–{m["end"]}')
