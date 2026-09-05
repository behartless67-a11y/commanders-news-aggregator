#!/usr/bin/env bash
# One-off: turn the phone photos off Ben's desktop into web assets.
#
# Not wired into `npm run build` on purpose. The sources live outside the repo
# (Desktop), the originals are 3 to 5 MB each and are not committed, and this
# only needs to run when new photos are added. Re-running it is safe and
# idempotent: same inputs, same outputs.
#
# Requires ffmpeg on PATH. Emits both the JPEGs and a JSON fragment of their
# real output dimensions, so the templates can set width/height and the
# browser reserves the space before the image loads.
set -euo pipefail

OUT="src/site/assets/photos"
mkdir -p "$OUT"

UVA="C:/Users/Ben/Desktop/uva pics"
GAME="C:/Users/Ben/Desktop/game"

# Long edge in px. Big enough to look sharp on a retina laptop at the widths
# these are displayed at, small enough that a gallery of them is not a 6 MB
# page. Also the reason the event credentials in the suite shots stop being
# legible: they are simply too few pixels to read at this scale.
LONG=1200

# name|source|crop (ffmpeg crop=w:h:x:y, or "-")|extra eq/filter tweaks (or "-")|badge regions to blur (or "-")
#
# Crops only where there is dead space actually hurting the frame. Colour is a
# light global lift plus per-photo nudges for the ones shot into the sun or
# under stadium lights, not a look.
#
# The blur column is w:h:x:y rects, semicolon separated, in OUTPUT pixels (that
# is, after the crop and scale above). It exists for one reason: these are
# working credentials for a stadium suite, and several of them carry a legible
# name and a scannable QR. Downscaling to 1200px kills most of them on its own,
# but not the two shot close up, so those get smeared out deliberately rather
# than left to chance.
PHOTOS=(
  "tailgate-cavman|$UVA/uva1.jpg|1512:1650:0:100|contrast=1.10:saturation=1.10:gamma=1.02|-"
  "tailgate-beers|$UVA/uva2.jpg|-|contrast=1.08:saturation=1.00:gamma=1.02|-"
  "tailgate-toast|$UVA/uva3.jpg|-|contrast=1.12:saturation=1.08:gamma=0.97|60:78:510:614"
  "tailgate-wings|$UVA/uva4.jpg|-|contrast=1.06:saturation=1.14:gamma=1.01|-"
  "presidents-box-friends|$UVA/uva5.jpg|-|contrast=1.10:saturation=1.08:gamma=1.03|72:88:610:662;60:88:752:580;46:70:520:658"
  "presidents-box-field|$UVA/uva6.jpg|-|contrast=1.06:saturation=1.06:gamma=1.02|62:96:486:622;92:108:544:788"
  "tailgate-selfie|$UVA/uva7.jpg|-|contrast=1.06:saturation=1.04:gamma=1.01|-"
  "accn-compound|$GAME/1.jpg|1836:2081:0:367|contrast=1.12:saturation=1.10:gamma=1.03|-"
  "pregame-huddle|$GAME/2.jpg|2142:2056:0:0|contrast=1.08:saturation=1.10:gamma=1.02|-"
  "box-ncstate|$GAME/3.jpg|-|contrast=1.06:saturation=1.06:gamma=1.01|-"
  "go-hoos-marquee|$GAME/4.jpg|-|contrast=1.06:saturation=1.08:gamma=1.02|100:140:602:636;106:196:452:766"
  "acc-huddle-set|$GAME/shaq.jpg|1950:1800:0:180|contrast=1.10:saturation=1.08:gamma=1.02|-"
)

echo "{" > "$OUT/dimensions.json"
count=${#PHOTOS[@]}
i=0

for row in "${PHOTOS[@]}"; do
  i=$((i + 1))
  IFS='|' read -r name src crop eq blur <<< "$row"
  [ -f "$src" ] || { echo "missing source: $src" >&2; exit 1; }

  chain=""
  [ "$crop" != "-" ] && chain="crop=$crop,"
  # scale to the long edge whichever way the photo is oriented, keeping even
  # dimensions (-2) so the JPEG encoder is happy.
  chain="${chain}scale='if(gt(iw,ih),$LONG,-2)':'if(gt(iw,ih),-2,$LONG)':flags=lanczos"
  [ "$eq" != "-" ] && chain="$chain,eq=$eq"
  # A downscale this aggressive always softens; put a little of it back.
  chain="$chain,unsharp=5:5:0.6"
  # Badges last, so the unsharp above can't put detail back into a region we
  # just took it out of. delogo rather than a blur: a blurred rectangle still
  # reads as "something was hidden here", while this interpolates from the
  # surrounding pixels and just looks like a badge photographed badly.
  # delogo interpolates from a one-pixel border around the region, so a rect
  # flush against any edge of the frame makes it refuse to open the encoder and
  # the only clue is "Could not open encoder before EOF". Keep at least 1px in.
  if [ "$blur" != "-" ]; then
    IFS=';' read -ra rects <<< "$blur"
    for rect in "${rects[@]}"; do
      IFS=':' read -r bw bh bx by <<< "$rect"
      chain="$chain,delogo=x=$bx:y=$by:w=$bw:h=$bh"
    done
  fi

  ffmpeg -y -loglevel error -i "$src" -vf "$chain" -q:v 5 "$OUT/$name.jpg"

  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
    -of csv=s=x:p=0 "$OUT/$name.jpg")
  w=${dims%x*}
  h=${dims#*x}
  bytes=$(stat -c%s "$OUT/$name.jpg")
  comma=","
  [ "$i" -eq "$count" ] && comma=""
  printf '  "%s": { "w": %s, "h": %s }%s\n' "$name" "$w" "$h" "$comma" >> "$OUT/dimensions.json"
  printf '%-24s %5sx%-5s %6s KB\n' "$name" "$w" "$h" "$((bytes / 1024))"
done

echo "}" >> "$OUT/dimensions.json"
echo
echo "total: $(du -sk "$OUT" | cut -f1) KB across $count photo(s)"
