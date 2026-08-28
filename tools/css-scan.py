# -*- coding: utf-8 -*-
"""ماسحُ CSS: يعيد مدى كلّ قاعدةٍ بدقّة، ويتخطّى التعليقاتِ والسلاسل."""
import re

def _skip(t, i):
    """يتخطّى تعليقاً أو سلسلةً إن بدأت عند i؛ ويعيد الموضعَ التالي أو None."""
    if t.startswith('/*', i):
        j = t.find('*/', i + 2)
        return (len(t) if j < 0 else j + 2)
    if t[i] in '"\'':
        q = t[i]; j = i + 1
        while j < len(t):
            if t[j] == '\\': j += 2; continue
            if t[j] == q: return j + 1
            j += 1
        return len(t)
    return None

def _close(t, i):
    """i عند '{' — يعيد موضعَ '}' المقابل + 1."""
    d = 0; j = i
    while j < len(t):
        s = _skip(t, j)
        if s is not None: j = s; continue
        if t[j] == '{': d += 1
        elif t[j] == '}':
            d -= 1
            if d == 0: return j + 1
        j += 1
    raise ValueError('قوسٌ غيرُ مغلق عند ' + str(i))

def scan(t, lo=0, hi=None):
    """يولّد (بدايةُ المحدِّد، نهايةُ القاعدة، نصُّ المحدِّد) لكلّ قاعدةٍ حقيقيّة.
       ويدخل @media و@supports فيعطي ما بداخلها."""
    hi = len(t) if hi is None else hi
    i = lo; sel0 = lo
    while i < hi:
        s = _skip(t, i)
        if s is not None:
            if s > i and t[i:i+2] == '/*' and not t[sel0:i].strip():
                sel0 = s          # تعليقٌ يسبق المحدِّد لا جزءٌ منه
            i = s; continue
        c = t[i]
        if c == '{':
            sel = t[sel0:i]
            end = _close(t, i)
            head = sel.strip()
            if head.startswith('@'):
                if re.match(r'@(media|supports|layer|container|scope)\b', head):
                    yield from scan(t, i + 1, end - 1)
                # @keyframes و@font-face: لا محدِّداتِ أصنافٍ فيها
            else:
                yield (sel0, end, sel)
            i = end; sel0 = i
        elif c == ';':
            i += 1; sel0 = i      # @import وأمثالُه
        elif c == '}':
            i += 1; sel0 = i      # نهايةُ حاوية
        else:
            i += 1

def selfcheck(t):
    """يتأكّد أنّ الماسحَ لا يخترع ولا يُسقط: كلُّ مدىً صالحٌ ولا يتداخل."""
    prev = -1
    n = 0
    for a, b, sel in scan(t):
        assert 0 <= a < b <= len(t), (a, b)
        assert a >= prev, 'تداخلٌ في المدى'
        assert '}' not in sel, 'محدِّدٌ يحوي } — الماسحُ ضلّ'
        assert t[b-1] == '}', 'القاعدةُ لا تنتهي بـ}'
        prev = b; n += 1
    return n
