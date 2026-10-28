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
BIRTHDAY="C:/Users/Ben/Desktop/birthday"
# The licensed header photos (public domain and Creative Commons stadium and
# game shots; see HERO_CREDITS in config/hero-images.js), with their
# candidates.json of who took what.
HEADER="C:/Users/Ben/Desktop/header-photos"

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
  # Ben's 45th birthday post (Oct 19), from $BIRTHDAY: Nicole and a bar cat,
  # an arena night with Sam and Jason, lunch with his mom, stepdad Darryl and
  # Nicole's mom Chris, Topgolf, and Darcie. Phone shots, so a lighter touch
  # than the gameday set; no badges anywhere to blur.
  "birthday-pookie-cat|$BIRTHDAY/1.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-ben-nicole|$BIRTHDAY/2.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-arena|$BIRTHDAY/3.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-family-lunch|$BIRTHDAY/4.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-deck-lunch|$BIRTHDAY/5.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-topgolf|$BIRTHDAY/6.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-aviators|$BIRTHDAY/7.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  "birthday-darcie-nicole|$BIRTHDAY/8.jpg|-|contrast=1.05:saturation=1.06:gamma=1.02|-"
  # The London brunch crew (the Oct 13 Monday post, "Just Quieter"). Its
  # output was added by hand with the post and the original is gone; the row
  # is here so dimensions.json keeps the entry (see the skip branch below).
  "brunch-crew|$DESKTOP/brunch-crew.jpg|-|-|-"
  # Header backdrops (config/hero-images.js). The header is a very wide,
  # short band, about 5:1 on a desktop, so each is cut to a 3:1 strip: wide
  # enough to fill it, with vertical room left over for the slow drift in
  # site.css to travel through. They get the long-edge override because this
  # is the one image every page loads first and at full width; 1200px would
  # come out visibly soft across a 1440px screen.
  #
  # Oct 28, 2026: Ben's own photos came out of the header (public repo, his
  # face on every page) and these went in: public-domain frames by military
  # photographers at Commanders games (DVIDS, the White House, the Joint
  # Staff), a CC0 night exterior, and CC BY-SA game photos by Joe Glorioso
  # (All-Pro Reels). Who took each is in HERO_CREDITS in
  # config/hero-images.js and on credits.html. The old rows, the side-by-
  # side pairs and the single-object strips are in git history before this
  # date if they are ever wanted back.
  #
  # The crops were placed by eye, one per photo, so helmets and faces stay
  # inside the band a desktop actually shows (the middle ~57% of the strip,
  # tighter once the drift runs), with the subject near the horizontal
  # middle so a phone, which shows the center half, keeps it too. On the
  # tight game-action frames (run-out, touchdown, black alternates) the
  # heads sit at the very top of the source, so y=0 is as high as the band
  # goes and a desktop still clips the crowns a little.
  "hero-flyover-formation|$HEADER/01-flyover-formation-northwest-stadium-2025.jpg|2000:667:0:40|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-color-guard-flyover|$HEADER/02-color-guard-flyover-big-flag-2024.jpg|1999:666:0:260|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-anthem-fireworks|$HEADER/03-anthem-fireworks-northwest-stadium-2025.jpg|2000:667:0:520|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-giant-flag-crowd|$HEADER/04-giant-flag-crowd-northwest-stadium-2025.jpg|1999:666:0:230|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-air-force-one-aerial|$HEADER/05-air-force-one-aerial-northwest-stadium-2025.jpg|2100:700:0:650|contrast=1.12:saturation=1.12:gamma=1.0|-|1920"
  "hero-stadium-exterior-night|$HEADER/06-northwest-stadium-exterior-night-2024.jpg|9248:3083:0:1000|contrast=1.04:saturation=1.05:gamma=1.04|-|1920"
  "hero-full-bowl-anthem|$HEADER/08-army-navy-full-bowl-northwest-stadium-2024.jpg|7415:2472:0:230|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-team-runs-out|$HEADER/10-eagles-2022-team-runs-out.jpg|6192:2064:0:0|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-mclaurin-champions-wall|$HEADER/11-eagles-2022-mclaurin-world-champions-wall.jpg|4061:1354:0:0|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-fight-for-old-dc-mural|$HEADER/12-eagles-2022-fight-for-old-dc-mural.jpg|7322:2441:0:600|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-take-command-tunnel|$HEADER/13-eagles-2022-take-command-tunnel.jpg|4700:1567:0:980|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-burgundy-fan-section|$HEADER/14-raiders-2025-fan-section-burgundy.jpg|4300:1433:0:200|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-video-board-sign|$HEADER/15-video-board-northwest-stadium-sign-2025.jpg|1999:666:0:120|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-touchdown-celebration|$HEADER/16-jaguars-2022-touchdown-celebration-crowd.jpg|5339:1780:0:0|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-huddle-helmets-up|$HEADER/17-jaguars-2022-huddle-helmets-up.jpg|3900:1300:0:80|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-tackle-championship-wall|$HEADER/18-jaguars-2022-tackle-championship-wall.jpg|4025:1342:0:50|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-black-alternates-celebration|$HEADER/19-vikings-2022-black-uniform-celebration.jpg|6981:2327:0:0|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-mnf-huddle-lights|$HEADER/20-bears-2025-mnf-huddle-under-lights.jpg|3300:1100:0:340|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
  "hero-mnf-line-of-scrimmage|$HEADER/21-bears-2025-mnf-line-of-scrimmage.jpg|3600:1200:0:330|contrast=1.06:saturation=1.08:gamma=1.02|-|1920"
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

# Header side-by-sides (config/hero-images.js). Ben wanted more of his own
# photos in the header, and most of the ones with faces in them are selfies.
# A selfie can't be a header on its own: the band a laptop shows is so short
# that a face filling a phone frame comes out as a row of eyes, which is why
# the strips above are all shot from a few feet back. So two group selfies
# go side by side, each a 4:3 frame shrunk to fit the band, one either side
# of the centered logo (which then covers the gap between them instead of
# somebody's face), on a blurred, darkened mix of the same two photos.
#
# Output is a 1920x640 strip like the wide ones above. A phone shows only the
# middle half of the width, so it gets the inner half of each photo. Not in
# dimensions.json: the header sets them from CSS, never as an <img>.
#
# The first version put two big hard-edged frames close to the edges, and on
# Ben's 1904px monitor, where the header is a 6.7:1 band, it read as a
# collage: giant faces, visible photo edges, a dark panel behind the logo.
# Now each frame is smaller (480x360, so faces come out about the size they
# are in the crew shot), sits nearer the middle (so a phone still gets most
# of each), and fades into the background on every side (the geq alpha: 90px
# ramps left and right, 45px top and bottom), over a darker blur.
#
# name|source A|crop A (or "-")|source B|crop B (or "-"). The crops pick a 4:3
# region around the faces before anything is scaled.
# Retired Oct 28, 2026 with Ben's photos; the three rows are in git history.
PAIRS=(
)

for row in "${PAIRS[@]}"; do
  IFS='|' read -r name a ca b cb <<< "$row"
  if [ ! -f "$a" ] || [ ! -f "$b" ]; then
    if [ -f "$OUT/$name.jpg" ]; then
      printf '%-28s (skipped, a source is gone)\n' "$name"
      continue
    fi
    echo "missing source and no existing output: $name" >&2
    exit 1
  fi
  pa=""; pb=""
  [ "$ca" != "-" ] && pa="crop=$ca,"
  [ "$cb" != "-" ] && pb="crop=$cb,"
  feather="geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,W-1-X)/90,min(Y,H-1-Y)/45))'"
  ffmpeg -y -loglevel error -i "$a" -i "$b" -filter_complex "\
[0:v]${pa}split[a0][a1];[1:v]${pb}split[b0][b1];\
[a0]scale=960:640:force_original_aspect_ratio=increase,crop=960:640[abg];\
[b0]scale=960:640:force_original_aspect_ratio=increase,crop=960:640[bbg];\
[abg][bbg]hstack,boxblur=40:3,eq=brightness=-0.20:saturation=0.80,format=rgba[bg];\
[a1]scale=-2:360:flags=lanczos,crop=480:360,eq=contrast=1.08:saturation=1.10:gamma=1.03,unsharp=5:5:0.6,format=rgba,$feather[fa];\
[b1]scale=-2:360:flags=lanczos,crop=480:360,eq=contrast=1.08:saturation=1.10:gamma=1.03,unsharp=5:5:0.6,format=rgba,$feather[fb];\
[bg][fa]overlay=300:140[t];[t][fb]overlay=1140:140,format=rgb24" -frames:v 1 -q:v 5 "$OUT/$name.jpg"
  printf '%-28s 1920x640  %6s KB\n' "$name" "$(( $(stat -c%s "$OUT/$name.jpg") / 1024 ))"
done

# Header singles: one photo, shrunk to sit inside the band, on a blurred,
# darkened copy of itself. For a close-up of one object, where even the full
# width of the photo cut to a strip is too tight: the header shows only the
# middle of the strip (about 365 of its 640 rows on a 1440px laptop, 275 on
# a 1904px monitor), so the W helmet as a plain strip (Oct 16) was nothing
# but the W. Ben found it far too close up (Oct 17) and picked the more
# zoomed-out of two versions, with more of the shelf showing.
#
# name|source|background crop (a 3:1 band of the source)|photo height in the
# 640px strip|photo's left edge. The photo keeps its own shape (4:3 here) and
# is centered vertically. The left edge is set so the W lands just right of
# the centered logo, which covers strip x ~760-1160 on a laptop and the same
# on a phone; the facemask goes behind the logo instead.
# Retired Oct 28, 2026 with Ben's photos; the W helmet row is in git history.
SINGLES=(
)

for row in "${SINGLES[@]}"; do
  IFS='|' read -r name src bgcrop fh left <<< "$row"
  if [ ! -f "$src" ]; then
    if [ -f "$OUT/$name.jpg" ]; then
      printf '%-28s (skipped, source is gone)\n' "$name"
      continue
    fi
    echo "missing source and no existing output: $name" >&2
    exit 1
  fi
  sw=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$src")
  sh=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$src")
  fw=$(( fh * sw / sh / 2 * 2 ))
  top=$(( (640 - fh) / 2 ))
  feather="geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*min(1,min(min(X,W-1-X)/110,min(Y,H-1-Y)/55))'"
  ffmpeg -y -loglevel error -i "$src" -filter_complex "\
[0:v]split[s0][s1];\
[s0]crop=$bgcrop,scale=1920:640,boxblur=36:3,eq=brightness=-0.24:saturation=0.85,format=rgba[bg];\
[s1]scale=${fw}:${fh}:flags=lanczos,eq=contrast=1.06:saturation=1.08,unsharp=5:5:0.5,format=rgba,$feather[fg];\
[bg][fg]overlay=${left}:${top},format=rgb24" -frames:v 1 -q:v 4 "$OUT/$name.jpg"
  printf '%-28s 1920x640  %6s KB\n' "$name" "$(( $(stat -c%s "$OUT/$name.jpg") / 1024 ))"
done

echo
echo "total: $(du -sk "$OUT" | cut -f1) KB across $count photo(s), ${#PAIRS[@]} side-by-side(s) and ${#SINGLES[@]} single(s)"
