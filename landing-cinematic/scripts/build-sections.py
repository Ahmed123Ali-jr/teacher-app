#!/usr/bin/env python3
"""لقطاتُ الأقسام — ثلاثُ لحظاتٍ لكلِّ فصل: الفراغُ، ثمّ النصفُ، ثمّ التمام.
   المصدرُ assets/raw (١١٢٥×٢٤٣٦ من الجهاز نفسه)، والخرجُ assets/shots."""
from PIL import Image
import os, json, pathlib

SRC = pathlib.Path('assets/raw')
OUT = pathlib.Path('assets/shots'); OUT.mkdir(parents=True, exist_ok=True)
W   = 820                       # ‏عرضُ الخرج — ٢٫٢× عرضِ العرضِ الفعليّ
Q   = 84

# ‏نسبٌ من طولِ التسجيل، لا أرقامٌ ثابتة — فعددُ الإطارات يختلف
PICKS = {
    'schedule':    [0.00, 0.42, 1.00],
    'home':        [0.00, 0.50, 1.00],
    'register':    [0.00, 0.50, 1.00],
    'classes':     [0.00, 0.46, 1.00],
    'exams':       [0.00, 0.50, 1.00],
    'initiatives': [0.00, 0.46, 1.00],
    'portfolio':   [0.00, 0.50, 1.00],
}

man, total = {}, 0
for ch, ps in PICKS.items():
    fs = sorted(os.listdir(SRC / ch))
    n  = len(fs)
    man[ch] = []
    for j, p in enumerate(ps):
        idx = min(n - 1, round(p * (n - 1)))
        im  = Image.open(SRC / ch / fs[idx]).convert('RGB')
        h   = round(W * im.height / im.width)
        im  = im.resize((W, h), Image.LANCZOS)
        name = f'{ch}-{j}.jpg'
        im.save(OUT / name, 'JPEG', quality=Q, optimize=True, progressive=True)
        kb = (OUT / name).stat().st_size / 1024; total += kb
        man[ch].append({'src': f'assets/shots/{name}', 'w': W, 'h': h})
        print(f'  {name}  ←  {fs[idx]}  {kb:.0f}KB')

(OUT / 'index.json').write_text(json.dumps(man, ensure_ascii=False), encoding='utf-8')
print(f'\n✓ {sum(len(v) for v in man.values())} لقطة — {total/1024:.1f} م.ب')
