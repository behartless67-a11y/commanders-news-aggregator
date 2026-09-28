#!/usr/bin/env bash
# One-off: turn a phone video off Ben's desktop into a web asset.
#
# Sibling of process-photos.sh and deliberately separate, because video is a
# different bargain. A photo here costs ~250 KB and everyone who loads the
# page pays it. A video costs megabytes, it lives in git history forever, and
# most readers will never press play. So this is for the occasional clip
# worth the trouble, not for every phone video from a weekend.
#
# Two things make it safe to put a video on the page at all:
#
#   1. Every clip gets a poster frame, and the <video> is rendered with
#      preload="none" (see essayVideo in src/site/templates.js). The browser
#      then fetches *nothing* until the reader presses play, so a clip nobody
#      watches costs exactly one JPEG.
#   2. +faststart moves the MP4 index to the front of the file, so the one
#      reader who does press play starts watching immediately instead of
#      after the whole thing downloads.
#
# Requires ffmpeg on PATH. Emits the MP4, its poster, and a JSON fragment of
# real dimensions so the page can reserve the space before anything loads.
set -euo pipefail

OUT="src/site/assets/videos"
POSTERS="src/site/assets/videos"
mkdir -p "$OUT"

GAMEDAY="C:/Users/Ben/Desktop/gameday"

# Portrait phone video, displayed in a column about 420px wide. 900 is the
# smallest height that still looks sharp there on a retina screen; 720 saves
# half a megabyte and looks soft, 1080 costs half a megabyte more and looks
# identical. CRF 30 because crowd footage is noisy and motion-heavy, so a
# lower number spends a lot of bytes encoding rain and shoulders.
HEIGHT=900
CRF=30

# One field at a time: ffprobe's csv writer emits a trailing separator for a
# video stream ("506x900x"), so asking for width,height together and then
# splitting on "x" silently yields "506x900" and "900x".
probe_dim() {
  ffprobe -v error -select_streams v:0 -show_entries "stream=$2" -of csv=p=0 "$1" | tr -d '
,'
}

# name|source|poster timestamp in seconds
VIDEOS=(
  "gameday-third-down|$GAMEDAY/IMG_8971.MP4|3"
)

echo "{" > "$OUT/dimensions.json"
count=${#VIDEOS[@]}
i=0

for row in "${VIDEOS[@]}"; do
  i=$((i + 1))
  IFS='|' read -r name src poster_at <<< "$row"

  # Same rule as the photo script: a missing source with an existing output is
  # a clip whose original has been cleaned off the Desktop, not an error.
  if [ ! -f "$src" ]; then
    if [ -f "$OUT/$name.mp4" ]; then
      w=$(probe_dim "$OUT/$name.mp4" width); h=$(probe_dim "$OUT/$name.mp4" height)
      comma=","; [ "$i" -eq "$count" ] && comma=""
      printf '  "%s": { "w": %s, "h": %s }%s\n' "$name" "$w" "$h" "$comma" >> "$OUT/dimensions.json"
      printf '%-24s %5sx%-5s %8s   (skipped, source gone)\n' "$name" "$w" "$h" ""
      continue
    fi
    echo "missing source and no existing output: $src" >&2
    exit 1
  fi

  ffmpeg -y -loglevel error -i "$src" \
    -vf "scale=-2:$HEIGHT" \
    -c:v libx264 -crf "$CRF" -preset slow -profile:v high -pix_fmt yuv420p \
    -movflags +faststart \
    -c:a aac -b:a 96k \
    "$OUT/$name.mp4"

  # Poster frame through the same scale, so it lines up pixel for pixel with
  # the first frame of video and there is no jump when playback starts.
  ffmpeg -y -loglevel error -ss "$poster_at" -i "$src" \
    -vf "scale=-2:$HEIGHT,eq=contrast=1.08:saturation=1.10" \
    -frames:v 1 -q:v 5 "$POSTERS/$name-poster.jpg"

  w=$(probe_dim "$OUT/$name.mp4" width); h=$(probe_dim "$OUT/$name.mp4" height)
  size=$(( $(wc -c < "$OUT/$name.mp4") / 1024 ))
  psize=$(( $(wc -c < "$POSTERS/$name-poster.jpg") / 1024 ))

  comma=","; [ "$i" -eq "$count" ] && comma=""
  printf '  "%s": { "w": %s, "h": %s }%s\n' "$name" "$w" "$h" "$comma" >> "$OUT/dimensions.json"
  printf '%-24s %5sx%-5s %6s KB  poster %s KB\n' "$name" "$w" "$h" "$size" "$psize"
done

echo "}" >> "$OUT/dimensions.json"
