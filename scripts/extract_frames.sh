#!/usr/bin/env bash
# Extract analysis frames and build the web video for one dataset.
#
# Usage:   scripts/extract_frames.sh <id> <fps> [--video-only] [--video-fps N]
# Example: scripts/extract_frames.sh sst 2
#          scripts/extract_frames.sh lightning 2 --video-only --video-fps 30
#
#   --video-only   skip the PNG frames (for datasets analysed straight from the video)
#   --video-fps N  web video frame rate (default: same as the source). Dropping frames
#                  keeps every timestamp, so the video stays in sync with features.json.
#
# Input:   raw/<id>/source.mp4
# Output:  raw/<id>/frames/0000.png, 0001.png, ...   (gitignored)
#          public/data/<id>/video.mp4                (<= 720p, H.264, no audio, faststart, < 20 MB)

set -euo pipefail

usage() { echo "usage: $0 <id> <fps> [--video-only] [--video-fps N]" >&2; exit 1; }
[ $# -ge 2 ] || usage
ID="$1"
FPS="$2"
shift 2
VIDEO_ONLY=0
VIDEO_FPS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --video-only) VIDEO_ONLY=1; shift ;;
    --video-fps) [ $# -ge 2 ] || usage; VIDEO_FPS_ARGS=(-r "$2"); shift 2 ;;
    *) usage ;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/raw/$ID/source.mp4"
FRAMES="$ROOT/raw/$ID/frames"
OUT_DIR="$ROOT/public/data/$ID"
VIDEO="$OUT_DIR/video.mp4"
MAX_BYTES=$((20 * 1024 * 1024))

command -v ffmpeg >/dev/null || { echo "ffmpeg not found: brew install ffmpeg" >&2; exit 1; }
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

# 1. Frames for analysis, at full source resolution.
if [ "$VIDEO_ONLY" -eq 0 ]; then
  mkdir -p "$FRAMES"
  find "$FRAMES" -maxdepth 1 -name '*.png' -delete
  ffmpeg -v error -i "$SRC" -vf "fps=$FPS" -start_number 0 "$FRAMES/%04d.png"
  COUNT=$(find "$FRAMES" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
  echo "frames: $COUNT -> raw/$ID/frames/"
fi

# 2. Web video. Raise CRF (lower quality) until it fits under 20 MB.
mkdir -p "$OUT_DIR"
for CRF in 23 26 29 32 35; do
  ffmpeg -v error -y -i "$SRC" -an \
    -vf "scale=-2:'min(720,ih)'" ${VIDEO_FPS_ARGS[@]+"${VIDEO_FPS_ARGS[@]}"} \
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
