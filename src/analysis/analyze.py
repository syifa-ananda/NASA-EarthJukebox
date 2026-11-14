#!/usr/bin/env python3
"""Turn extracted video frames into public/data/<id>/features.json (see docs/data-contract.md).

Usage:
  python3 src/analysis/analyze.py sst raw/sst/frames --colorbar raw/sst/colorbar.png
  python3 src/analysis/analyze.py nightlights raw/nightlights/frames

Frames are 0000.png, 0001.png, ... at the dataset fps, from scripts/extract_frames.sh
(sst) or scripts/build_series.py (nightlights).

Each dataset uses one of two modes:
  "colorbar"  value is read from a colorbar (sst)
  "light"     no colorbar; value is light above the static base map (nightlights)

How the sst calibration works (colorbar mode)
-----------------------------
The SVS sst video shows flow streaks coloured by temperature over a black ocean,
with grey land. Streak trails fade toward black and overlapping streaks are
brightened toward white, so the RGB values in the video rarely match the colorbar
exactly. Hue survives both effects, and the colorbar's hue runs smoothly from
blue (0 degC) to red (32 degC) without repeating, so each pixel's temperature is
read by matching its hue to the nearest colorbar hue.

A pixel only counts as a reading if it is:
  - ocean (not in the land mask, built from pixels that stay grey in every frame),
  - bright enough (not the black gaps between streaks or faded trail ends),
  - saturated enough (not grey land, not washed-out white highlights),
  - within HUE_TOL of some colorbar hue (purples/magentas are rejected).

How nightlights is measured (light mode)
----------------------------------------
City lights are drawn on top of a static base map (black ocean, grey snow and
ice, brownish deserts, dark forests) that is identical in every year. The base
is estimated per pixel: take the darkest value each pixel ever has, then apply a
morphological opening (min filter, then max filter) larger than a city cluster,
which removes the lights and keeps the smooth land texture. Light is luminance
above that base. Neutral grey pixels are ignored: every light pixel is yellowish,
while snow, ice and shaded relief are grey, and that is where the base estimate
is least reliable. All years use the same fixed scale, so growth is preserved.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import flashes_of, frame_record, motion_of, pan_of  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "data"
ROWS, COLS = 16, 32

# Per-dataset settings. Add an entry here for each new dataset.
DATASETS = {
    "sst": {
        "mode": "colorbar",
        "title": "Global Sea Surface Temperature",
        "fps": 2,
        "min_value": 60,          # 0-255: darker pixels are gaps/faded trails, not readings
        "min_saturation": 0.25,   # greyer pixels are land or white highlights
        "hue_tol": 0.03,          # max hue distance (0-1 hue wheel) to the colorbar
        "density_threshold": 0.6, # share of ocean warmer than 0.6 * 32 = 19.2 degC
        "flashes": False,         # sea surface temperature has no flash events
    },
    "nightlights": {
        "mode": "light",
        "title": "Change in Night Lights 2012–2023",
        "fps": 2,
        "base_kernel": 31,        # px; opening size, larger than a city cluster (~3 deg)
        "noise_margin": 3,        # luminance units ignored above the base (compression noise)
        "min_saturation": 0.12,   # lights are yellowish (>= 0.19); snow/ice/relief are grey
        "land_min_lum": 2.5,      # darkest-ever luminance above this = land (ocean is 0-1)
        "land_cell_share": 0.02,  # a grid cell counts as land if >= 2% of it is land
        "light_scale": 30.0,      # luminance units of light that map to 1.0 (fixed, all years)
        "lit_threshold": 10.0,    # luminance units above base that count as a lit pixel
        "flashes": False,
    },
}

# Land mask: a pixel is land if it is grey in nearly every frame and not black.
LAND_GREY_SAT = 0.15
LAND_GREY_SHARE = 0.95
LAND_MIN_VALUE = 35


def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def hsv(rgb):
    """Hue (0-1), saturation (0-1), value (0-255) for an (..., 3) array."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    c = mx - mn
    cz = np.maximum(c, 1e-6)
    h = np.where(mx == r, ((g - b) / cz) % 6,
                 np.where(mx == g, (b - r) / cz + 2, (r - g) / cz + 4)) / 6.0
    h = np.where(c == 0, 0.0, h)
    s = c / np.maximum(mx, 1e-6)
    return h, s, mx


def unwrap_red(h):
    """Put reds just past 0 (hue ~0.98) next to reds just above 0 so the scale is continuous."""
    return np.where(h > 0.8, h - 1.0, h)


# ---------------------------------------------------------------------------
# Colorbar
# ---------------------------------------------------------------------------

def read_colorbar(path):
    """Find the coloured strip inside the colorbar image and return its hue scale.

    Returns (hues, positions): hues sampled left->right along the strip, and
    positions 0..1 (0 = left end of the scale, 1 = right end).
    """
    img = load_rgb(path)
    _, s, _ = hsv(img)
    coloured = s > 0.5
    rows = np.where(coloured.mean(1) > 0.5)[0]
    if rows.size == 0:
        raise SystemExit(f"no coloured strip found in {path}")
    cols = np.where(coloured[rows].mean(0) > 0.9)[0]
    r0, r1, c0, c1 = rows.min(), rows.max(), cols.min(), cols.max()
    # Skip the anti-aliased edge row/column on each side of the strip.
    strip = img[r0 + 2:r1 - 1, c0 + 1:c1].mean(0)
    hues = unwrap_red(hsv(strip)[0])
    if not np.all(np.diff(hues) <= 1e-6):
        raise SystemExit("colorbar hue is not monotonic; hue lookup would be ambiguous")
    positions = np.linspace(0.0, 1.0, len(hues))
    print(f"colorbar: strip rows {r0}-{r1}, cols {c0 + 1}-{c1 - 1} ({len(hues)} samples), "
          f"hue {hues[0]:.3f} -> {hues[-1]:.3f}")
    return hues, positions


def calibrate(rgb, ocean, hues, positions, cfg):
    """Per-pixel calibrated value (0-1) and a mask of pixels that gave a valid reading."""
    h, s, v = hsv(rgb)
    h = unwrap_red(h)
    candidate = ocean & (v >= cfg["min_value"]) & (s >= cfg["min_saturation"])
    lo, hi = hues.min(), hues.max()
    in_range = (h >= lo - cfg["hue_tol"]) & (h <= hi + cfg["hue_tol"])
    valid = candidate & in_range
    # Colorbar hue decreases left->right; np.interp needs increasing x.
    value = np.interp(np.clip(h, lo, hi), hues[::-1], positions[::-1])
    return np.where(valid, value, 0.0), valid, candidate


# ---------------------------------------------------------------------------
# Masks and grids
# ---------------------------------------------------------------------------

def build_land_mask(frame_paths):
    grey_count = None
    values = []
    for p in frame_paths[::2]:
        _, s, v = hsv(load_rgb(p))
        grey = s < LAND_GREY_SAT
        grey_count = grey.astype(np.int32) if grey_count is None else grey_count + grey
        values.append(v)
    n = len(frame_paths[::2])
    median_v = np.median(np.stack(values), axis=0)
    return (grey_count >= LAND_GREY_SHARE * n) & (median_v > LAND_MIN_VALUE)


def block_sum(a, rows=ROWS, cols=COLS):
    H, W = a.shape
    return a[: H - H % rows, : W - W % cols].reshape(rows, H // rows, cols, W // cols).sum(axis=(1, 3))


def lat_weights(height):
    """cos(latitude) per image row for an equirectangular map: equal-area averaging."""
    lat = (0.5 - (np.arange(height) + 0.5) / height) * np.pi
    return np.cos(lat)[:, None]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def analyze(ds_id, frames_dir, colorbar):
    cfg = DATASETS[ds_id]
    frame_paths = sorted(Path(frames_dir).glob("*.png"))
    if not frame_paths:
        raise SystemExit(f"no PNG frames in {frames_dir}")
    if cfg["mode"] == "colorbar":
        if colorbar is None:
            raise SystemExit("this dataset needs --colorbar")
        frames = analyze_colorbar(cfg, frame_paths, colorbar)
    else:
        frames = analyze_light(cfg, frame_paths)
    write_features(ds_id, cfg, frames)


def write_features(ds_id, cfg, frames):
    doc = {
        "dataset": ds_id,
        "title": cfg["title"],
        "fps": cfg["fps"],
        "frameCount": len(frames),
        "grid": {"cols": COLS, "rows": ROWS},
        "frames": frames,
    }
    out = OUT_DIR / ds_id / "features.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"frames: {len(frames)}")
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")


def analyze_colorbar(cfg, frame_paths, colorbar):

    hues, positions = read_colorbar(colorbar)
    first = load_rgb(frame_paths[0])
    H, W = first.shape[:2]
    if H % ROWS or W % COLS:
        print(f"note: {W}x{H} is not a multiple of {COLS}x{ROWS}; edge pixels are dropped from the grid")

    land = build_land_mask(frame_paths)
    ocean = ~land
    print(f"land mask: {land.mean():.1%} of the map")
    ocean_cells = block_sum(ocean.astype(np.float32)) > 0
    # Ocean area of each grid cell (cos-latitude x ocean pixels), for global means.
    cell_area = block_sum(ocean * np.broadcast_to(lat_weights(H), (H, W)))

    grids, cell_has_data, per_frame = [], [], []
    rejected = candidates = 0
    for t, path in enumerate(frame_paths):
        rgb = load_rgb(path)
        value, valid, candidate = calibrate(rgb, ocean, hues, positions, cfg)
        rejected += int((candidate & ~valid).sum())
        candidates += int(candidate.sum())

        n = block_sum(valid.astype(np.float32))
        grid = np.where(n > 0, block_sum(value) / np.maximum(n, 1), np.nan)
        grids.append(grid)
        cell_has_data.append(n > 0)

        lum = (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255.0
        brightness = lum[ocean].mean()

        r, b = rgb[..., 0][valid], rgb[..., 2][valid]
        warmth = 0.5 + 0.5 * ((r - b) / np.maximum(r + b, 1.0)).mean() if valid.any() else 0.5

        per_frame.append({"brightness": brightness, "warmth": warmth,
                          "coverage": valid.sum() / ocean.sum()})

    # Ocean cells with no reading in a frame (only black gaps that frame): carry the
    # last reading forward, or the next one back for the first frames. Land cells = 0.
    stack = np.stack(grids)
    for t in range(1, len(stack)):
        stack[t] = np.where(np.isnan(stack[t]), stack[t - 1], stack[t])
    for t in range(len(stack) - 2, -1, -1):
        stack[t] = np.where(np.isnan(stack[t]), stack[t + 1], stack[t])
    never = np.isnan(stack[0]) & ocean_cells
    stack = np.nan_to_num(stack, nan=0.0)
    data_cells = ocean_cells & ~never
    filled = np.mean([(~h & data_cells).sum() / data_cells.sum() for h in cell_has_data])

    # value and density are area-weighted over grid cells, so every patch of ocean counts
    # once no matter how many streaks happen to cross it (warm regions have more streaks).
    w = cell_area * data_cells
    for grid, f in zip(stack, per_frame):
        f["value"] = (grid * w).sum() / w.sum()
        f["density"] = ((grid >= cfg["density_threshold"]) * w).sum() / w.sum()

    frames, prev = [], None
    for t, (grid, f) in enumerate(zip(stack, per_frame)):
        # Round the grid first so motion matches exactly what the browser sees.
        g = np.round(grid, 2)
        frames.append(frame_record(
            t, g,
            brightness=f["brightness"],
            warmth=f["warmth"],
            density=f["density"],
            pan=pan_of(g, mask=data_cells),
            motion=motion_of(g, prev, mask=data_cells),
            flashes=flashes_of(g, prev) if cfg["flashes"] else 0,
            value=f["value"],
        ))
        prev = g

    cov = [f["coverage"] for f in per_frame]
    print(f"readings per frame: {np.mean(cov):.1%} of ocean pixels (min {min(cov):.1%})")
    print(f"coloured ocean pixels rejected as off-colorbar: {rejected / max(candidates, 1):.2%}")
    print(f"grid: {data_cells.sum()} ocean cells, {(~ocean_cells).sum()} land-only cells (=0), "
          f"{never.sum()} ocean cells never read (=0); {filled:.1%} of cells carried over per frame")
    return frames


# ---------------------------------------------------------------------------
# Light mode (no colorbar)
# ---------------------------------------------------------------------------

def luminance(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def _filter(a, k, op):
    """Separable k x k min or max filter (op = np.min / np.max), edges padded."""
    p = k // 2
    a = op(sliding_window_view(np.pad(a, ((0, 0), (p, p)), mode="edge"), k, axis=1), axis=-1)
    return op(sliding_window_view(np.pad(a, ((p, p), (0, 0)), mode="edge"), k, axis=0), axis=-1)


def opening(a, k):
    """Morphological opening: removes bright features smaller than k x k."""
    return _filter(_filter(a, k, np.min), k, np.max)


def block_mean(a):
    H, W = a.shape
    return block_sum(a) / ((H // ROWS) * (W // COLS))


def analyze_light(cfg, frame_paths):
    first = load_rgb(frame_paths[0])
    H, W = first.shape[:2]
    if H % ROWS or W % COLS:
        print(f"note: {W}x{H} is not a multiple of {COLS}x{ROWS}; edge pixels are dropped from the grid")

    # Pass 1: darkest-ever luminance per pixel -> static base map and land mask.
    darkest = None
    for path in frame_paths:
        lum = luminance(load_rgb(path))
        darkest = lum if darkest is None else np.minimum(darkest, lum)
    base = opening(darkest, cfg["base_kernel"])
    land = darkest >= cfg["land_min_lum"]
    land_cells = block_mean(land.astype(np.float32)) >= cfg["land_cell_share"]
    print(f"land mask: {land.mean():.1%} of the map, {land_cells.sum()} land cells")

    scale = cfg["light_scale"]
    grids, per_frame = [], []
    for path in frame_paths:
        rgb = load_rgb(path)
        mx = rgb.max(-1)
        sat = (mx - rgb.min(-1)) / np.maximum(mx, 1e-6)
        light = np.clip(luminance(rgb) - base - cfg["noise_margin"], 0, None)
        light *= (sat >= cfg["min_saturation"]) & land

        grid = np.clip(block_mean(light) / scale, 0, 1)
        grids.append(grid)

        lit = light > 0
        if lit.any():
            r, b, w = rgb[..., 0][lit], rgb[..., 2][lit], light[lit]
            warmth = 0.5 + 0.5 * (w * (r - b) / np.maximum(r + b, 1.0)).sum() / w.sum()
        else:
            warmth = 0.5
        per_frame.append({
            "value": grid[land_cells].mean(),
            "brightness": light[land].mean() / scale,
            "density": (light[land] >= cfg["lit_threshold"]).mean(),
            "warmth": warmth,
        })

    frames, prev = [], None
    for t, (grid, f) in enumerate(zip(grids, per_frame)):
        g = np.round(grid, 2)
        frames.append(frame_record(
            t, g,
            brightness=f["brightness"],
            warmth=f["warmth"],
            density=f["density"],
            pan=pan_of(g, mask=land_cells),
            motion=motion_of(g, prev, mask=land_cells),
            flashes=flashes_of(g, prev) if cfg["flashes"] else 0,
            value=f["value"],
        ))
        prev = g
    return frames


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("id", choices=sorted(DATASETS))
    ap.add_argument("frames_dir")
    ap.add_argument("--colorbar", help="colorbar image (colorbar-mode datasets only)")
    args = ap.parse_args()
    analyze(args.id, args.frames_dir, args.colorbar)


if __name__ == "__main__":
    main()
