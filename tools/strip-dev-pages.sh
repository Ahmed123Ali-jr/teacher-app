#!/usr/bin/env bash
# =====================================================================
# يحذف صفحاتِ أدوات التطوير من نسخةٍ **مُخرَجة** — لا من مصدرك.
#
# يقرأ الأسماءَ من tools/dev-pages.txt: مكانٌ واحدٌ يقرؤه النشرُ والتغليفُ
# معاً، فلا تصير القائمةُ في موضعين وتُنسى إحداهما.
#
#   الاستعمال:  tools/strip-dev-pages.sh <مجلَّدُ الإخراج>
#   مثال     :  tools/strip-dev-pages.sh teacher_app          (النشر)
#              tools/strip-dev-pages.sh ios/App/App/public    (التغليف)
#
# ── ولماذا يتوقّف عند الخطأ ──
# `rm -f` يتجاهل المفقودَ بصمت. وهذا بالضبط ما أخفى عطباً يوم ٢٧ أغسطس
# ٢٠٢٦: أمرٌ مطويٌّ في YAML جعل اسمَ الملفّ يبدأ بفراغ، فـ«حُذف» ملفّان لم
# يُحذفا ونُشرا. فهنا: يُتحقّق من وجود الملفّ قبل الحذف، ومن اختفائه بعده،
# ويُطبع ما بقي — ويسقط البناءُ إن تخلّف شيء.
# =====================================================================
set -euo pipefail

OUT="${1:-}"
LIST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dev-pages.txt"

if [ -z "$OUT" ] || [ ! -d "$OUT" ]; then
    echo "✋ مجلَّدُ الإخراج مطلوبٌ وموجود.  الاستعمال: $0 <مجلَّد>" >&2
    exit 1
fi
if [ ! -f "$LIST" ]; then
    echo "✋ القائمةُ مفقودة: $LIST" >&2
    exit 1
fi

removed=0; missing=0; failed=0

while IFS= read -r line || [ -n "$line" ]; do
    name="${line%%#*}"                      # يُسقط التعليق
    name="$(printf '%s' "$name" | tr -d '[:space:]')"
    [ -z "$name" ] && continue

    target="$OUT/$name"
    if [ -f "$target" ]; then
        rm -f "$target"
        if [ -e "$target" ]; then
            echo "   ❌ لم يُحذف: $name" >&2
            failed=$((failed + 1))
        else
            echo "   🗑️  $name"
            removed=$((removed + 1))
        fi
    else
        echo "   ○  $name (غيرُ موجودٍ أصلاً)"
        missing=$((missing + 1))
    fi
done < "$LIST"

echo ""
echo "   حُذف $removed · غيرُ موجودٍ $missing · فشل $failed"
echo "   بقي من صفحات HTML في $OUT:"
ls -1 "$OUT"/*.html 2>/dev/null | sed 's|^|      |' || echo "      (لا شيء)"

if [ "$failed" -gt 0 ]; then
    echo "" >&2
    echo "✋ صفحةُ أداةٍ بقيت في المُخرَج — يُوقَف البناء." >&2
    exit 1
fi
