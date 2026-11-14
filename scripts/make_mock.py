#!/usr/bin/env python3
"""Generate mock features.json files that follow docs/data-contract.md.

These let the audio and UI work start before the real SVS media is analysed.
Output: public/data/<id>/features.json for sst, nightlights, lightning, co2.

Usage:  python3 scripts/make_mock.py
"""

import json
from pathlib import Path

import numpy as np

SEED = 2026
FPS = 2
FRAMES = 60
ROWS, COLS = 16, 32

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data"

# Cell coordinates: row 0 = north/top, col 0 = west/left.
RR, CC = np.mgrid[0:ROWS, 0:COLS].astype(float)
LAT = 1.0 - 2.0 * (RR + 0.5) / ROWS          # +1 north ... -1 south
XPOS = 2.0 * (CC + 0.5) / COLS - 1.0         # -1 left ... +1 right


def blob(cx, cy, radius):
    """Gaussian bump centred on (col cx, row cy)."""
    return np.exp(-((CC - cx) ** 2 + (RR - cy) ** 2) / (2.0 * radius ** 2))


# ---------------------------------------------------------------------------
# Shared feature extraction (the real analyze.py will use the same definitions)
# ---------------------------------------------------------------------------

def pan_of(grid):
    """Horizontal centre of activity: weighted by how far cells sit above the median."""
    w = np.clip(grid - np.median(grid), 0.0, None)
    if w.sum() < 1e-9:
        return 0.0
    return float((w * XPOS).sum() / w.sum())


def motion_of(grid, prev):
    """Mean absolute change from the previous frame, scaled into 0-1."""
    if prev is None:
        return 0.0
    return float(np.clip(np.abs(grid - prev).mean() * 8.0, 0.0, 1.0))


def flashes_of(grid, prev, threshold=0.6):
    """Number of cells that just became bright (capped at 16)."""
    if prev is None:
        new = grid >= threshold
    else:
        new = (grid >= threshold) & (prev < threshold)
    return int(min(16, new.sum()))


def r3(x):
    return round(float(x), 3) + 0.0   # + 0.0 turns -0.0 into 0.0


def frame_record(t, grid, brightness, warmth, density, pan, motion, flashes):
    grid = np.clip(grid, 0.0, 1.0)
    return {
        "t": t,
        "brightness": r3(np.clip(brightness, 0, 1)),
        "warmth": r3(np.clip(warmth, 0, 1)),
        "density": r3(np.clip(density, 0, 1)),
        "pan": r3(np.clip(pan, -1, 1)),
        "motion": r3(np.clip(motion, 0, 1)),
        "flashes": int(flashes),
        "value": r3(grid.mean()),
        "grid": [[round(float(v), 2) + 0.0 for v in row] for row in grid],
    }


# ---------------------------------------------------------------------------
# Per-dataset grid generators. Grids are on a fixed 0-1 scale across all
# frames (never normalised per frame) so trends over time survive.
# ---------------------------------------------------------------------------

def make_sst(rng):
    """Slow drift, warm equatorial band, low motion, no flashes."""
    texture = rng.normal(0, 0.03, (ROWS, COLS))
    frames, prev = [], None
    for t in range(FRAMES):
        season = 0.12 * np.sin(2 * np.pi * t / FRAMES)          # band drifts N/S
        band = np.exp(-((LAT - season) ** 2) / 0.18)
        swirl = 0.06 * np.sin(2 * np.pi * (CC / COLS) * 2 + 0.15 * t) * np.cos(np.pi * LAT)
        warm = 0.05 * np.sin(2 * np.pi * t / FRAMES - np.pi / 2)  # slow global warm/cool cycle
        g = np.clip(0.08 + warm + 0.80 * band + swirl + texture, 0, 1)
        frames.append(frame_record(
            t, g,
            brightness=0.30 + 0.40 * g.mean(),
            warmth=np.clip((g - 0.2) / 0.6, 0, 1).mean(),
            density=(g >= 0.6).mean(),
            pan=pan_of(g),
            motion=motion_of(g, prev),
            flashes=0,
        ))
        prev = np.round(g, 2)
    return frames


def make_nightlights(rng):
    """Dark background, clusters mostly left/centre, growing 2012 -> 2023."""
    # (col, row, peak, radius, frame it starts to appear)
    clusters = [
        (5, 4, 0.95, 1.4, 0), (8, 5, 0.80, 1.2, 0), (12, 6, 0.85, 1.6, 0),
        (15, 4, 0.70, 1.1, 0), (17, 8, 0.75, 1.3, 0), (10, 9, 0.60, 1.0, 10),
        (20, 5, 0.65, 1.2, 20), (6, 10, 0.55, 1.0, 25), (14, 11, 0.60, 1.1, 30),
        (24, 6, 0.50, 1.0, 40), (3, 7, 0.55, 0.9, 45), (27, 9, 0.45, 0.9, 50),
    ]
    background = np.clip(rng.normal(0.03, 0.01, (ROWS, COLS)), 0, 0.06)
    frames, prev = [], None
    for t in range(FRAMES):
        growth = t / (FRAMES - 1)
        g = background.copy()
        for cx, cy, peak, rad, start in clusters:
            if t < start:
                continue
            ramp = min(1.0, (t - start) / 8.0)                  # fade in over 4 s
            amp = peak * (0.45 + 0.55 * growth) * ramp
            g += amp * blob(cx, cy, rad * (1.0 + 0.35 * growth))
        g += rng.normal(0, 0.003, (ROWS, COLS))                 # sensor flicker
        g = np.clip(g, 0, 1)
        lit = (g >= 0.3).mean()
        frames.append(frame_record(
            t, g,
            brightness=g.mean(),
            warmth=0.35 + 0.5 * min(1.0, lit * 4),              # orange lights vs dark blue map
            density=lit,
            pan=pan_of(g),
            motion=motion_of(g, prev),
            flashes=0,
        ))
        prev = np.round(g, 2)
    return frames


def make_lightning(rng):
    """Low background, spiky flash counts, storm centre jumps around."""
    frames, prev = [], None
    for t in range(FRAMES):
        g = np.clip(rng.normal(0.04, 0.006, (ROWS, COLS)), 0, 0.1)
        roll = rng.random()
        if roll < 0.30:
            n = int(rng.integers(6, 17))       # storm burst
        elif roll < 0.65:
            n = int(rng.integers(1, 6))        # scattered strikes
        else:
            n = 0                              # quiet frame
        if n:
            # Lightning favours the tropics: storm centre within the middle rows.
            cx = rng.uniform(1, COLS - 2)
            cy = rng.uniform(4, ROWS - 5)
            near = np.argsort(((CC - cx) ** 2 + (RR - cy) ** 2).ravel()
                              + rng.uniform(0, 6, ROWS * COLS))[: max(n, 1) * 2]
            for idx in rng.choice(near, size=n, replace=False):
                r, c = divmod(int(idx), COLS)
                g += 0.30 * blob(c, r, 0.9)                     # glow around the strike
                g[r, c] = max(g[r, c], rng.uniform(0.75, 1.0))
        g = np.clip(g, 0, 1)
        frames.append(frame_record(
            t, g,
            brightness=g.mean(),
            warmth=0.20 + 0.08 * (g >= 0.6).mean(),             # blue-white flashes
            density=(g >= 0.6).mean(),
            pan=pan_of(g),
            motion=motion_of(g, prev),
            flashes=flashes_of(g, prev),
        ))
        prev = np.round(g, 2)
    return frames


def make_co2(rng):
    """Plumes drift west -> east while the global baseline rises."""
    plumes = [  # (start col, row, amplitude, radius)
        (2.0, 4, 0.30, 2.2), (4.0, 7, 0.35, 2.6), (1.0, 10, 0.25, 2.0),
    ]
    texture = rng.normal(0, 0.015, (ROWS, COLS))
    frames, prev = [], None
    for t in range(FRAMES):
        progress = t / (FRAMES - 1)
        baseline = 0.30 + 0.30 * progress                       # steady CO2 rise
        g = baseline + texture + 0.03 * np.cos(np.pi * LAT / 2)  # slightly higher N hemisphere
        for start, row, amp, rad in plumes:
            cx = start + progress * 24.0                        # travels ~3/4 of the map
            cy = row + 0.8 * np.sin(2 * np.pi * t / 30 + start)
            g += amp * blob(cx, cy, rad * (1 + 0.3 * progress))
        g = np.clip(g, 0, 1)
        frames.append(frame_record(
            t, g,
            brightness=0.20 + 0.60 * g.mean(),
            warmth=0.25 + 0.6 * g.mean(),
            density=(g >= 0.6).mean(),
            pan=pan_of(g),
            motion=motion_of(g, prev),
            flashes=0,
        ))
        prev = np.round(g, 2)
    return frames


DATASETS = [
    ("sst", "Global Sea Surface Temperature", make_sst),
    ("nightlights", "Change in Night Lights 2012–2023", make_nightlights),
    ("lightning", "Lightning Events Detected from the ISS 2017–2023", make_lightning),
    ("co2", "DYAMOND Global Carbon Dioxide", make_co2),
]


def main():
    rng = np.random.default_rng(SEED)
    for ds_id, title, maker in DATASETS:
        frames = maker(rng)
        doc = {
            "dataset": ds_id,
            "title": title,
            "fps": FPS,
            "frameCount": len(frames),
            "grid": {"cols": COLS, "rows": ROWS},
            "frames": frames,
        }
        out = OUT_DIR / ds_id / "features.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n",
                       encoding="utf-8")
        print(f"wrote {out.relative_to(ROOT)}  ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
