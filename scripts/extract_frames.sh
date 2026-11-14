#!/usr/bin/env bash
# Extract analysis frames and build the web video for one dataset.
#
# Usage:   scripts/extract_frames.sh <id> <fps>
# Example: scripts/extract_frames.sh sst 2
#
# Input:   raw/<id>/source.mp4
# Output:  raw/<id>/frames/0001.png, 0002.png, ...   (gitignored)
#          public/data/<id>/video.mp4                (<= 720p, H.264, no audio, faststart, < 20 MB)

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <id> <fps>" >&2
  exit 1
fi

ID="$1"
FPS="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/raw/$ID/source.mp4"
FRAMES="$ROOT/raw/$ID/frames"
OUT_DIR="$ROOT/public/data/$ID"
VIDEO="$OUT_DIR/video.mp4"
MAX_BYTES=$((20 * 1024 * 1024))

command -v ffmpeg >/dev/null || { echo "ffmpeg not found: brew install ffmpeg" >&2; exit 1; }
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

# 1. Frames for analysis, at full source resolution.
mkdir -p "$FRAMES"
find "$FRAMES" -maxdepth 1 -name '*.png' -delete
ffmpeg -v error -i "$SRC" -vf "fps=$FPS" -start_number 0 "$FRAMES/%04d.png"
COUNT=$(find "$FRAMES" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
echo "frames: $COUNT -> raw/$ID/frames/"

# 2. Web video. Raise CRF (lower quality) until it fits under 20 MB.
mkdir -p "$OUT_DIR"
for CRF in 23 26 29 32 35; do
  ffmpeg -v error -y -i "$SRC" -an \
    -vf "scale=-2:'min(720,ih)'" \
    -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart \
    "$VIDEO"
  SIZE=$(stat -f%z "$VIDEO" 2>/dev/null || stat -c%s "$VIDEO")
  echo "video: crf $CRF -> $((SIZE / 1024)) KB"
  if [ "$SIZE" -le "$MAX_BYTES" ]; then
    break
  fi
done
[ "$SIZE" -le "$MAX_BYTES" ] || { echo "video still over 20 MB" >&2; exit 1; }
echo "video: public/data/$ID/video.mp4"
