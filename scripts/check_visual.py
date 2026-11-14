#!/usr/bin/env python3
"""Visual check of one dataset: does the features.json grid match what the video shows?

Usage:
  python3 scripts/check_visual.py <dataset>      # e.g. sst, nightlights, lightning, co2

Writes to docs/images/<dataset>/:
  frame_start.png, frame_middle.png, frame_end.png
      left: the video frame at time t / fps; right: that frame's 16 x 32 grid as a heatmap.
      Heatmap: one blue scale from light (low) to dark (high), stretched from 0 to the
      dataset's highest grid value (same scale in all three images). Cells that are
      exactly 0 (land, outside the globe, outside ISS coverage...) are drawn grey.
  timeline.png
      brightness, value, density and flashes over time, one panel each (they have
      different scales, so they don't share an axis). Dashed lines mark the three frames.

Needs numpy, pillow and ffmpeg (same as the rest of the analysis). Images are PNG
and kept under 300 KB.
"""

import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
OUT = ROOT / "docs" / "images"

PANEL_H = 256                 # height of video frame and heatmap
CELL = PANEL_H // 16          # heatmap cell size (16 px -> 512 x 256 heatmap)
MAX_BYTES = 300_000

# Colours (light chart theme).
SURFACE = (252, 252, 251)
INK = (11, 11, 11)
INK_2 = (82, 81, 78)
MUTED = (137, 135, 129)
GRIDLINE = (225, 224, 217)
AXIS = (195, 194, 183)
ZERO = (225, 224, 217)        # grid cells that are exactly 0
LINE = (42, 120, 214)         # series blue
# Sequential blue ramp, light -> dark.
RAMP = [(0xcd, 0xe2, 0xfb), (0x9e, 0xc5, 0xf4), (0x6d, 0xa7, 0xec), (0x39, 0x87, 0xe5),
        (0x25, 0x6a, 0xbf), (0x18, 0x4f, 0x95), (0x0d, 0x36, 0x6b)]


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:                      # Pillow < 10.1
        return ImageFont.load_default()


F_TITLE, F_TEXT, F_SMALL = font(15), font(13), font(11)


def ramp(x):
    """x in 0..1 -> RGB on the blue ramp."""
    x = min(max(x, 0.0), 1.0) * (len(RAMP) - 1)
    i = min(int(x), len(RAMP) - 2)
    f = x - i
    return tuple(round(a + (b - a) * f) for a, b in zip(RAMP[i], RAMP[i + 1]))


def video_frame(video, seconds, height):
    """Grab one frame at `seconds`, scaled to `height` px tall (width keeps the aspect)."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{seconds:.3f}", "-i", str(video),
           "-frames:v", "1", "-vf", f"scale=-2:{height}", "-f", "image2pipe", "-vcodec", "png", "-"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    if not out:
        raise RuntimeError(f"ffmpeg returned no frame at {seconds:.2f} s of {video}")
    return Image.open(io.BytesIO(out)).convert("RGB")


def video_duration(video):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]
    return float(subprocess.run(cmd, capture_output=True, check=True, text=True).stdout.strip())


def heatmap(grid, vmax):
    g = np.asarray(grid, float)
    img = Image.new("RGB", (g.shape[1] * CELL, g.shape[0] * CELL), SURFACE)
    d = ImageDraw.Draw(img)
    for r in range(g.shape[0]):
        for c in range(g.shape[1]):
            v = g[r, c]
            col = ZERO if v == 0 else ramp(v / vmax if vmax > 0 else 0)
            d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=col)
    return img


def save_small(img, path):
    """Save as PNG; fall back to a 256-colour palette if it would be over 300 KB."""
    img.save(path, optimize=True)
    if path.stat().st_size > MAX_BYTES:
        img.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(path, optimize=True)
    return path.stat().st_size


def snapshot(doc, idx, video, duration, vmax, label):
    f = doc["frames"][idx]
    seconds = min(f["t"] / doc["fps"], duration - 0.1)
    vid = video_frame(video, seconds, PANEL_H)
    hm = heatmap(f["grid"], vmax)

    pad, top, gap, bottom = 16, 58, 16, 40
    W = pad + vid.width + gap + hm.width + pad
    H = top + PANEL_H + bottom
    img = Image.new("RGB", (W, H), SURFACE)
    d = ImageDraw.Draw(img)
    d.text((pad, 10), f"{doc['dataset']}  ·  {label}  ·  frame {f['t']} of {doc['frameCount'] - 1}"
                      f"  ·  t = {seconds:.1f} s", font=F_TITLE, fill=INK)
    d.text((pad, 32), f"value {f['value']:.3f}   brightness {f['brightness']:.3f}   density "
                      f"{f['density']:.3f}   flashes {f['flashes']}   pan {f['pan']:+.2f}",
           font=F_TEXT, fill=INK_2)
    x_hm = pad + vid.width + gap
    img.paste(vid, (pad, top))
    img.paste(hm, (x_hm, top))
    y = top + PANEL_H + 8
    d.text((pad, y), "video frame", font=F_SMALL, fill=MUTED)
    d.text((x_hm, y), "grid (16 rows x 32 cols)", font=F_SMALL, fill=MUTED)

    # Colour key: grey = 0, then the ramp from 0 to vmax.
    kx, ky, kw, kh = x_hm + hm.width - 220, y + 2, 140, 10
    d.rectangle([kx - 40, ky, kx - 30, ky + kh], fill=ZERO)
    d.text((kx - 26, ky - 2), "0", font=F_SMALL, fill=MUTED)
    for i in range(kw):
        d.line([(kx + i, ky), (kx + i, ky + kh)], fill=ramp(i / (kw - 1)))
    d.text((kx + kw + 6, ky - 2), f"{vmax:.2f}", font=F_SMALL, fill=MUTED)
    return img


def nice_max(v):
    if v <= 0:
        return 1.0
    for step in (0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 4, 5, 10, 20):
        if v <= step * 4:
            return step * 4
    return float(np.ceil(v))


def timeline(doc, marks):
    frames = doc["frames"]
    fps = doc["fps"]
    secs = np.array([f["t"] / fps for f in frames])
    series = [("brightness", "brightness (mean luminance)"), ("value", "value (calibrated main quantity)"),
              ("density", "density (share of bright / active area)"), ("flashes", "flashes (new bright spots, 0-16)")]

    W, left, right = 900, 64, 24
    ph, title_h, gap = 110, 22, 18
    top = 44
    H = top + len(series) * (title_h + ph + gap) + 28
    img = Image.new("RGB", (W, H), SURFACE)
    d = ImageDraw.Draw(img)
    d.text((left, 12), f"{doc['dataset']}: features over time  ({doc['frameCount']} frames at {fps} fps, "
                       f"{doc['frameCount'] / fps:.1f} s)", font=F_TITLE, fill=INK)
    x0, x1 = left, W - right
    tmax = max(secs[-1], 1e-9)
    xs = lambda s: x0 + (x1 - x0) * s / tmax

    y = top
    for key, title in series:
        v = np.array([f[key] for f in frames], float)
        d.text((x0, y), title, font=F_TEXT, fill=INK_2)
        y0, y1 = y + title_h, y + title_h + ph          # plot top, plot bottom
        ymax = max(nice_max(v.max()), 4) if key == "flashes" else nice_max(v.max())
        ys = lambda val: y1 - (y1 - y0) * val / ymax
        for k in range(5):                              # gridlines + y labels
            gv = ymax * k / 4
            gy = round(ys(gv))
            d.line([(x0, gy), (x1, gy)], fill=AXIS if k == 0 else GRIDLINE, width=1)
            lab = f"{gv:g}" if key == "flashes" else f"{gv:.3g}"
            tw = d.textlength(lab, font=F_SMALL)
            d.text((x0 - 8 - tw, gy - 7), lab, font=F_SMALL, fill=MUTED)
        for m in marks:                                 # snapshot frames
            mx = round(xs(secs[m]))
            for yy in range(y0, y1, 6):
                d.line([(mx, yy), (mx, min(yy + 3, y1))], fill=AXIS)
        pts = [(xs(s), ys(val)) for s, val in zip(secs, v)]
        d.line(pts, fill=LINE, width=2, joint="curve")
        y = y1 + gap

    # Shared time axis.
    step = next(s for s in (1, 2, 5, 10, 15, 20, 30, 60) if tmax / s <= 10)
    for s in np.arange(0, tmax + 1e-9, step):
        tx = round(xs(s))
        lab = f"{s:g} s"
        d.text((tx - d.textlength(lab, font=F_SMALL) / 2, y - 10), lab, font=F_SMALL, fill=MUTED)
    return img


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 1
    ds = argv[0]
    feat_path = DATA / ds / "features.json"
    if not feat_path.is_file():
        print(f"no features file: {feat_path}")
        return 1
    doc = json.loads(feat_path.read_text(encoding="utf-8"))

    video = DATA / ds / "video.mp4"
    index = DATA / "index.json"
    if index.is_file():
        for d in json.loads(index.read_text(encoding="utf-8")).get("datasets", []):
            if d.get("id") == ds and d.get("video"):
                video = DATA / d["video"]
    if not video.is_file():
        print(f"no video: {video}")
        return 1

    out = OUT / ds
    out.mkdir(parents=True, exist_ok=True)
    n = doc["frameCount"]
    picks = [("start", 0), ("middle", n // 2), ("end", n - 1)]
    duration = video_duration(video)
    vmax = max(max(max(row) for row in f["grid"]) for f in doc["frames"]) or 1.0

    for label, idx in picks:
        img = snapshot(doc, idx, video, duration, vmax, label)
        p = out / f"frame_{label}.png"
        print(f"{p.relative_to(ROOT)}  {save_small(img, p) / 1000:.0f} KB")
    p = out / "timeline.png"
    print(f"{p.relative_to(ROOT)}  {save_small(timeline(doc, [i for _, i in picks]), p) / 1000:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
