# -*- coding: utf-8 -*-
"""تسلسلُ إطاراتٍ واحدٌ من الفصول السبعة — يُسحب بالسكرول على canvas.
   هذه حيلةُ الحزمة الأساسيّة (memory/02): لا `video.currentTime` أبداً."""
import os, glob, json, shutil
from PIL import Image

ORDER = ['schedule','home','register','classes','exams','initiatives','portfolio']
PER   = 15                 # إطاراً لكلّ فصل
W     = 1600
OUT   = 'assets/seq'

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT, exist_ok=True)

marks, n = [], 0
for key in ORDER:
    src = sorted(glob.glob(f'assets/frames/{key}/f*.jpg'))
    if not src:
        print(f'⚠ {key}: لا إطارات'); continue
    start = n
    # عيّنةٌ متساويةٌ عبر الفصل، وآخرُ إطارٍ دائماً (نهايةُ المشهد)
    for j in range(PER):
        i = round(j * (len(src) - 1) / (PER - 1))
        im = Image.open(src[i]).convert('RGB')
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        im.save(f'{OUT}/f{n:03d}.jpg', 'JPEG', quality=76, optimize=True, progressive=True)
        n += 1
    marks.append({'key': key, 'start': start, 'end': n - 1})

size = sum(os.path.getsize(p) for p in glob.glob(f'{OUT}/*.jpg'))
json.dump({'count': n, 'marks': marks}, open(f'{OUT}/index.json','w'), ensure_ascii=False)
print(f'✓ {n} إطاراً · {size/1048576:.1f} MB · {size/n/1024:.0f}KB للإطار · عرض {W}px')
for m in marks: print(f'   {m["key"]:12} {m["start"]:3}–{m["end"]:3}')
