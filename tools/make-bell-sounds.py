#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-bell-sounds.py — يولّد ملفَّي صوتِ المنبّه من الوصفة نفسِها التي في المتصفّح.

── لماذا سكربتٌ لا ملفّان في المستودع ──
الصوتُ داخل التطبيق مولَّدٌ بـWeb Audio (`js/bell.js`)، ولا مقابلَ لذلك في
إشعارٍ نظاميّ: iOS لا يقبل إلّا **ملفاً** في حزمة التطبيق. فلو رُفع ملفٌّ
ثنائيٌّ يتيمٌ لانفصل جرسُ الخلفية عن جرس المقدّمة عند أوّل تعديل، فيرتاب
المعلّمُ أنّ أحدَهما ليس منبّهَه. وهذا السكربتُ يُبقيهما نسخةً واحدة:
تُعدَّل النغمةُ في `bell.js` ثمّ يُعاد تشغيلُه.

── والصيغةُ WAV لا CAF ──
iOS يقبل Linear PCM في WAV مباشرةً، وهي التي توصي بها إضافةُ Capacitor
لأنّها تخدم أندرويد بالملفّ نفسِه. فالتحويلُ إلى `.caf` خطوةٌ بلا عائد.
و`ima4` جُرّب فأعطى ‎٣٥٫٤‎ ديسيبل إشارةً إلى ضجيج — جودةُ ستِّ بتّاتٍ على
جيبيّاتٍ نقيّةٍ تخفت ببطء، وهو أسوأُ ما يُعطى لـADPCM. الفرقُ ‎١١٥‎ كيلوبايت
لا يستحقّ.

── والكسبُ واحدٌ للملفّين ──
لو طُبّع كلُّ ملفٍّ على حدة لاستوى «التنبيهُ الليّن» بالجرس وضاع الفرقُ الذي
بُني عليه تمييزُ الصوتين. فالعاملُ يُحسب من الجرس ويُطبَّق على الاثنين.

    python3 tools/make-bell-sounds.py
"""

import math
import os
import struct

RATE = 22050          # يكفي لجرسٍ أعلى توافقيّاته ‎١٩٨٦‎ هرتز (نايكويست ‎١١٠٢٥‎)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', 'teacher_app', 'assets', 'sounds')

# نسبُ الجرس المتنافرة — منقولةٌ حرفاً من js/bell.js
BELL_PARTIALS = [0.56, 1, 1.5, 2.0, 2.66, 3.01]


def tone(buf, freq, start, dur, gain, kind='sine'):
    """نغمةٌ واحدةٌ بغلافٍ أُسّيّ — تطابق `tone()` في bell.js.

    الغلاف: صعودٌ من ‎0.0001‎ إلى الذروة في ‎١٢‎ مِلّي، ثمّ هبوطٌ أُسّيٌّ إلى
    ‎0.0001‎ عند نهاية المدّة. (`exponentialRampToValueAtTime` أُسّيٌّ في
    الاتجاهين.)
    """
    i0 = int(start * RATE)
    n = int((dur + 0.05) * RATE)
    atk = max(1, int(0.012 * RATE))
    floor = 0.0001
    for i in range(n):
        idx = i0 + i
        if idx >= len(buf):
            break
        t = i / RATE
        if i < atk:
            a = floor * (gain / floor) ** (i / atk)
        else:
            x = min(1.0, (t - 0.012) / max(dur - 0.012, 1e-6))
            a = gain * (floor / gain) ** x
        ph = 2 * math.pi * freq * t
        if kind == 'triangle':
            # موجةٌ مثلّثيّةٌ من الطور، كما يبنيها OscillatorNode
            s = 2 / math.pi * math.asin(math.sin(ph))
        else:
            s = math.sin(ph)
        buf[idx] += a * s


def strike(buf, at, base=660.0):
    """ضربةُ جرسٍ واحدة — ستُّ جيبيّاتٍ تخفت بمددٍ متناقصة."""
    for i, p in enumerate(BELL_PARTIALS):
        tone(buf, base * p, at, 2.4 - i * 0.28, 0.16 / (i + 1), 'sine')


def make_bell():
    """ثلاثُ ضرباتٍ عند ‎0.00‎ و‎0.55‎ و‎1.10‎ — كجرس المدرسة لا ضربةً واحدة."""
    dur = 1.10 + 2.4 + 0.05
    buf = [0.0] * int(dur * RATE)
    for at in (0.0, 0.55, 1.10):
        strike(buf, at)
    return buf


def make_alert():
    """نغمتان صاعدتان ليّنتان، مرّتين — يتميّز عن الجرس بوضوح."""
    dur = 0.9 + 0.20 + 0.42 + 0.05
    buf = [0.0] * int(dur * RATE)
    for off in (0.0, 0.9):
        tone(buf, 880.0, off, 0.34, 0.13, 'triangle')
        tone(buf, 1174.0, off + 0.20, 0.42, 0.13, 'triangle')
    return buf


def write_wav(path, buf, gain):
    """‎١٦‎ بت أحاديّ القناة، Linear PCM."""
    frames = bytearray()
    for s in buf:
        v = max(-1.0, min(1.0, s * gain))
        frames += struct.pack('<h', int(v * 32767))
    data = bytes(frames)
    hdr = (b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt '
           + struct.pack('<IHHIIHH', 16, 1, 1, RATE, RATE * 2, 2, 16)
           + b'data' + struct.pack('<I', len(data)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(hdr + data)
    return len(hdr) + len(data)


def main():
    bell = make_bell()
    alert = make_alert()
    peak = max(abs(x) for x in bell)
    # ‎-1‎ ديسيبل من الذروة، بعاملٍ واحدٍ للملفّين حفظاً للفرق بينهما
    gain = (10 ** (-1 / 20)) / peak
    for name, buf in (('bell', bell), ('alert', alert)):
        p = os.path.normpath(os.path.join(OUT, name + '.wav'))
        size = write_wav(p, buf, gain)
        pk = max(abs(x) for x in buf) * gain
        print('%-10s %6.2fs  %7d B  peak %.3f  %s'
              % (name + '.wav', len(buf) / RATE, size, pk, p))


if __name__ == '__main__':
    main()
