#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-capture/out}"
DEST="${2:-../../docs/media}"
CAP_KB=5120

mkdir -p "$DEST"

compose() {
  local fps="$1" width="$2"
  ffmpeg -y -i "$OUT/hero-left.webm" -i "$OUT/hero-right.webm" \
    -filter_complex "[0:v][1:v]hstack=inputs=2[s];[s]fps=${fps},scale=${width}:-1:flags=lanczos,split[x][y];[x]palettegen=stats_mode=diff[p];[y][p]paletteuse=dither=bayer" \
    "$DEST/hero.gif"
}

compose 15 900
SIZE_KB=$(du -k "$DEST/hero.gif" | cut -f1)
echo "hero.gif = ${SIZE_KB}KB (cap ${CAP_KB}KB)"

if [ "$SIZE_KB" -gt "$CAP_KB" ]; then
  echo "over cap, retrying at 12fps / 720px"
  compose 12 720
  SIZE_KB=$(du -k "$DEST/hero.gif" | cut -f1)
  echo "hero.gif = ${SIZE_KB}KB"
fi

if [ "$SIZE_KB" -gt "$CAP_KB" ]; then
  echo "STILL over cap — remove hero.gif and use the still fallback (hero-left.png / hero-right.png)"
fi
