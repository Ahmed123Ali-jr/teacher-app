#!/bin/sh
# تشفيرُ الفصول: 4K بـAV1 (الأساس) و1080p بـH.264 (احتياطيّ للمتصفّحات القديمة)
mkdir -p assets/video
for k in home classes schedule register exams initiatives portfolio; do
  [ -d "assets/frames/$k" ] || continue
  ffmpeg -y -loglevel error -framerate 24 -i "assets/frames/$k/f%03d.jpg" \
    -c:v libsvtav1 -crf 30 -preset 6 -pix_fmt yuv420p10le -movflags +faststart \
    "assets/video/$k-2160.mp4"
  ffmpeg -y -loglevel error -framerate 24 -i "assets/frames/$k/f%03d.jpg" -vf scale=1920:1080 \
    -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -movflags +faststart \
    "assets/video/$k-1080.mp4"
  printf "%-13s 4K %7s   1080p %7s\n" "$k" \
    "$(du -h "assets/video/$k-2160.mp4" | cut -f1)" \
    "$(du -h "assets/video/$k-1080.mp4" | cut -f1)"
done
echo "───────────"
du -sh assets/video
