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
HOGWALLER="C:/Users/Ben/Desktop/commanders"
# Later one-offs land loose on the Desktop rather than in a batch folder.
DESKTOP="C:/Users/Ben/Desktop"
GAMEDAY="C:/Users/Ben/Desktop/gameday"

# Long edge in px. Big enough to look sharp on a retina laptop at the widths
# these are displayed at, small enough that a gallery of them is not a 6 MB
# page. Also the reason the event credentials in the suite shots stop being
# legible: they are simply too few pixels to read at this scale.
LONG=1200

# name|source|crop (ffmpeg crop=w:h:x:y, or "-")|extra eq/filter tweaks (or "-")|badge regions to blur (or "-")|long edge override (optional, default $LONG)
#
# Crops only where there is dead space actually hurting the frame. Color is a
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
  # Week 1 at Högwaller. Shot in late-afternoon sun under a metal roof, so the
  # two beer-garden frames get a slightly warmer, lighter touch than the UVA
  # batch; the tube man is outside in full sun and needs the opposite.
  "hogwaller-us|$HOGWALLER/commanders1.jpg|-|contrast=1.06:saturation=1.06:gamma=1.03|-"
  "hogwaller-evan|$HOGWALLER/commanders2.jpg|-|contrast=1.06:saturation=1.08:gamma=1.02|-"
  "hogwaller-scary-terry|$HOGWALLER/commanders3.jpg|-|contrast=1.08:saturation=1.10:gamma=0.99|-"
  # Delaware tailgate, 2026-09-26, outside Scott Stadium. Shot in hard
  # mid-afternoon sun, so it needs less lifting than the suite photos above.
  # The crop pulls in from the left and right: as framed there was an empty
  # stretch of lot on both sides, and the bottom cannot come up at all
  # without taking the baby's feet with it. Four credentials on lanyards
  # here, and unlike most of this set the headshots on them survived the
  # downscale legibly, so all four get smeared.
  "first-tailgate|$DESKTOP/friends.jpg|5085:4004:350:280|contrast=1.09:saturation=1.12:gamma=1.02|46:64:409:690;44:66:565:650;40:60:615:585;38:66:735:639"
  # Week 3 vs Seattle, the home opener, 2026-09-27. Shot in overcast drizzle
  # all day, so this batch gets a heavier lift than the sunny sets above:
  # flat gray light needs contrast and saturation or everything reads as a
  # photograph of a car park. The .HEIC files are from a second phone and
  # ffmpeg reads the JPEG preview inside them without complaint.
  "gameday-spread|$GAMEDAY/IMG_8868.JPG|-|contrast=1.12:saturation=1.14:gamma=1.03|-"
  "gameday-tent|$GAMEDAY/IMG_8877.JPG|-|contrast=1.12:saturation=1.12:gamma=1.04|-"
  "gameday-crew|$GAMEDAY/IMG_8892.JPG|-|contrast=1.12:saturation=1.15:gamma=1.03|-"
  "gameday-set|$GAMEDAY/IMG_8901.JPG|-|contrast=1.10:saturation=1.10:gamma=1.06|-"
  "gameday-three|$GAMEDAY/IMG_8907.JPG|-|contrast=1.10:saturation=1.12:gamma=1.03|-"
  "gameday-bowl|$GAMEDAY/IMG_8914.JPG|-|contrast=1.14:saturation=1.16:gamma=1.02|-"
  "gameday-huddle|$GAMEDAY/IMG_8959.JPG|-|contrast=1.12:saturation=1.14:gamma=1.02|-"
  "gameday-hoods|$GAMEDAY/IMG_8999.JPG|-|contrast=1.10:saturation=1.12:gamma=1.03|-"
  "gameday-highlife|$GAMEDAY/IMG_1651.HEIC|-|contrast=1.10:saturation=1.10:gamma=1.02|-"
  "gameday-forty|$GAMEDAY/IMG_1652.HEIC|-|contrast=1.12:saturation=1.12:gamma=1.03|-"
  "gameday-mariota-sign|$GAMEDAY/IMG_1658.HEIC|-|contrast=1.12:saturation=1.14:gamma=1.03|-"
  "gameday-coverage|$GAMEDAY/IMG_1666.HEIC|-|contrast=1.12:saturation=1.14:gamma=1.02|-"
  "gameday-selfie|$GAMEDAY/IMG_1674.HEIC|-|contrast=1.10:saturation=1.12:gamma=1.03|-"
  # Header backdrops (config/hero-images.js), replacing the stock photos. The
  # header is a very wide, short band, about 5:1 on a desktop, so each is cut
  # to a 3:1 strip: wide enough to fill it, with vertical room left over for
  # the slow drift in site.css to travel through. They get the long-edge
  # override because this is the one image every page loads first and at
  # full width; 1200px would come out visibly soft across a 1440px screen.
  #
  # Ben asked for faces first ("crop to see more of our faces"), then crowd
  # and other Commanders shots, so that's the mix. The logo sits dead center
  # of the header, which means on a group shot the middle person is behind
  # it; the crops put faces in the vertical middle of the strip and rely on
  # the people on either side of center to carry it.
  #
  # Faces. Group shots taken from a few feet away, not selfies: a face that
  # fills a phone frame is taller than this whole strip, so a close-up only
  # ever showed a slice of it (the rain-hood selfie came out as a row of
  # eyes). These were also picked so Ben, his dad and his brother Josh land
  # either side of the centered logo rather than behind it. The one
  # exception is the rail shot, kept for the stadium bowl behind them.
  "hero-crew|$GAMEDAY/IMG_8892.JPG|2048:682:0:242|contrast=1.10:saturation=1.12:gamma=1.03|-|1920"
  "hero-six-in-lot|$GAMEDAY/IMG_8891.JPG|1536:512:0:500|contrast=1.10:saturation=1.12:gamma=1.03|-|1536"
  "hero-rail-bowl|$GAMEDAY/IMG_8910.JPG|2048:682:0:340|contrast=1.10:saturation=1.12:gamma=1.03|-|1920"
  # Crowd
  "hero-rain-crowd|$GAMEDAY/IMG_8959.JPG|1536:512:0:665|contrast=1.12:saturation=1.12:gamma=1.02|-|1536"
  "hero-pregame|$GAMEDAY/IMG_8933.JPG|1536:512:0:460|contrast=1.12:saturation=1.12:gamma=1.02|-|1536"
  # Commanders
  "hero-bowl|$GAMEDAY/IMG_8914.JPG|1536:512:0:400|contrast=1.12:saturation=1.14:gamma=1.02|-|1536"
  "hero-endzone|$GAMEDAY/IMG_1666.HEIC|1536:512:0:358|contrast=1.12:saturation=1.14:gamma=1.02|-|1536"
  "hero-mariota-sign|$GAMEDAY/IMG_1658.HEIC|1536:512:0:235|contrast=1.12:saturation=1.14:gamma=1.02|-|1536"
)

echo "{" > "$OUT/dimensions.json"
count=${#PHOTOS[@]}
i=0

for row in "${PHOTOS[@]}"; do
  i=$((i + 1))
  IFS='|' read -r name src crop eq blur long <<< "$row"
  L=${long:-$LONG}

  # A missing source is normal, not fatal. The sources live on a Desktop and get
  # cleaned up; the outputs are committed and are what the site actually serves.
  # So an already-processed photo whose original is gone is skipped, and its real
  # dimensions are read back off the existing output so dimensions.json stays
  # complete rather than silently shrinking every time this is re-run. Only a
  # row with neither a source nor an output is a genuine error.
  if [ ! -f "$src" ]; then
    if [ -f "$OUT/$name.jpg" ]; then
      dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
        -of csv=s=x:p=0 "$OUT/$name.jpg")
      w=${dims%x*}
      h=${dims#*x}
      comma=","
      [ "$i" -eq "$count" ] && comma=""
      printf '  "%s": { "w": %s, "h": %s }%s\n' "$name" "$w" "$h" "$comma" >> "$OUT/dimensions.json"
      printf '%-24s %5sx%-5s %6s   (skipped, source gone)\n' "$name" "$w" "$h" ""
      continue
    fi
    echo "missing source and no existing output: $src" >&2
    exit 1
  fi

  chain=""
  [ "$crop" != "-" ] && chain="crop=$crop,"
  # scale to the long edge whichever way the photo is oriented, keeping even
  # dimensions (-2) so the JPEG encoder is happy.
  chain="${chain}scale='if(gt(iw,ih),$L,-2)':'if(gt(iw,ih),-2,$L)':flags=lanczos"
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

  # -frames:v 1 because a HEIC is a container, not a single picture: the ones
  # off an iPhone carry the full-size image plus extra embedded frames, and
  # without this ffmpeg decodes all of them and dies trying to write several
  # files to one name ("Cannot write more than one file with the same name").
  # Harmless on an ordinary JPEG, which only has the one frame to take.
  ffmpeg -y -loglevel error -i "$src" -vf "$chain" -frames:v 1 -q:v 5 "$OUT/$name.jpg"

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
