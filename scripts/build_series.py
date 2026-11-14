#!/usr/bin/env python3
"""Rebuild a yearly series at an even, slower pace: one still per year, crossfaded.

Some SVS videos run through their years very fast (nightlights: ~0.6 s per year).
This script pulls one clean still per year from the source video, then builds a
new timeline where every year is held for HOLD seconds with a FADE-second
crossfade into the next year. From that single timeline it writes:

  raw/<id>/years/<label>.png      full-resolution cropped still per year (gitignored)
  raw/<id>/frames/0000.png ...    analysis frames at FPS, full resolution (gitignored)
  public/data/<id>/video.mp4      web video at 30 fps, WEB_SIZE, H.264, no audio, faststart

Analysis frame i is sampled at the middle of its time slot, t = (i + 0.5) / FPS,
using exactly the same blend as the video, so features and video line up.

Usage:  python3 scripts/build_series.py nightlights
"""

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

SERIES = {
    "nightlights": {
        # Section A of SVS #5313 (world map, no zoom boxes). Source frame numbers
        # (30 fps, 0-based) from the middle of each year's hold.
        "years": {
            "2012": 7, "2013": 24, "2014": 42, "2015": 60, "2016": 78, "2017": 95,
            "2018": 113, "2019": 131, "2020": 148, "2021": 166, "2022": 184, "2023": 240,
        },
        "crop": (3840, 2160, 0, 0),   # w, h, x, y: left world copy of the 7680x2160 frame
        "hold": 2.5,                  # seconds per year, including the fade out of it
        "fade": 0.5,                  # crossfade into the next year (last FADE s of each hold)
        "fps": 2,                     # analysis frames per second (data contract)
        "web_size": (1280, 720),
        "video_fps": 30,
        "crf": 23,
    },
}


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def extract_stills(src, out_dir, years, crop):
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    w, h, x, y = crop
    frames = list(years.values())
    select = "+".join(f"eq(n\\,{n})" for n in frames)
    tmp = out_dir / "_%02d.png"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src),
         "-vf", f"select='{select}',crop={w}:{h}:{x}:{y}",
         "-fps_mode", "passthrough", str(tmp)])
    # ffmpeg writes selected frames in source order, numbered from 01.
    order = sorted(years.items(), key=lambda kv: kv[1])
    for k, (label, _) in enumerate(order, start=1):
        (out_dir / f"_{k:02d}.png").rename(out_dir / f"{label}.png")
    print(f"stills: {len(order)} -> {out_dir.relative_to(ROOT)}/")


def blend_at(t, stills, hold, fade):
    """Image at time t (seconds) on the re-paced timeline."""
    n = len(stills)
    k = min(int(t // hold), n - 1)
    into = t - k * hold
    if k < n - 1 and into > hold - fade:
        a = (into - (hold - fade)) / fade
        return (1 - a) * stills[k] + a * stills[k + 1]
    return stills[k]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in SERIES:
        sys.exit(f"usage: {sys.argv[0]} <{'|'.join(SERIES)}>")
    ds_id = sys.argv[1]
    cfg = SERIES[ds_id]
    src = ROOT / "raw" / ds_id / "source.mp4"
    years_dir = ROOT / "raw" / ds_id / "years"
    frames_dir = ROOT / "raw" / ds_id / "frames"
    video = ROOT / "public" / "data" / ds_id / "video.mp4"

    extract_stills(src, years_dir, cfg["years"], cfg["crop"])
    labels = list(cfg["years"])
    full = [np.asarray(Image.open(years_dir / f"{y}.png").convert("RGB"), dtype=np.float32)
            for y in labels]
    duration = cfg["hold"] * len(labels)

    # Analysis frames: full resolution, sampled at the middle of each frame slot.
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("*.png"):
        old.unlink()
    n_frames = round(duration * cfg["fps"])
    for i in range(n_frames):
        t = (i + 0.5) / cfg["fps"]
        img = blend_at(t, full, cfg["hold"], cfg["fade"])
        Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(frames_dir / f"{i:04d}.png")
    print(f"frames: {n_frames} at {cfg['fps']} fps -> {frames_dir.relative_to(ROOT)}/")

    # Web video: same timeline, downscaled stills, piped to ffmpeg as raw RGB.
    W, H = cfg["web_size"]
    small = [np.asarray(Image.fromarray(f.astype(np.uint8)).resize((W, H), Image.LANCZOS),
                        dtype=np.float32) for f in full]
    video.parent.mkdir(parents=True, exist_ok=True)
    vfps = cfg["video_fps"]
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(vfps), "-i", "-", "-an",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(cfg["crf"]),
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video)],
        stdin=subprocess.PIPE)
    for j in range(round(duration * vfps)):
        img = blend_at(j / vfps, small, cfg["hold"], cfg["fade"])
        proc.stdin.write(np.clip(img + 0.5, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    size = video.stat().st_size
    print(f"video: {duration:.1f} s, {W}x{H}, {size / 1024:.0f} KB -> {video.relative_to(ROOT)}")
    if size > 20 * 1024 * 1024:
        sys.exit("video is over 20 MB; raise crf")


if __name__ == "__main__":
    main()
