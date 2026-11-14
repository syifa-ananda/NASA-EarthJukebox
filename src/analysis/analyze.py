#!/usr/bin/env python3
"""Turn SVS video frames into public/data/<id>/features.json (see docs/data-contract.md).

Usage:
  python3 src/analysis/analyze.py sst raw/sst/frames --colorbar raw/sst/colorbar.png
  python3 src/analysis/analyze.py nightlights raw/nightlights/frames
  python3 src/analysis/analyze.py lightning raw/lightning/source.mp4
  python3 src/analysis/analyze.py co2 raw/co2/source.mp4 --colorbar raw/co2/colorbar.png

Frames are 0000.png, 0001.png, ... at the dataset fps, from scripts/extract_frames.sh
(sst) or scripts/build_series.py (nightlights). Lightning and co2 are read straight
from the video instead (see events and globe modes below).

Each dataset uses one of four modes:
  "colorbar"  value is read from a colorbar (sst)
  "light"     no colorbar; value is light above the static base map (nightlights)
  "events"    short-lived dots counted as they appear (lightning)
  "globe"     a rotating 3D globe, measured on screen (co2)

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
above that base. Only yellowish pixels count: every light pixel is yellowish, while
snow, ice and shaded relief are grey or blue-grey, and that is where the base
estimate is least reliable. A pixel must be saturated enough (not neutral grey)
AND have red at least 3 levels above blue. The second test removes the blue-grey
edges of ice shelves, coastlines and mountain ridges in Antarctica and the Arctic
that the opening leaves behind, enough of the barely-warm bare rock of the McMurdo
Dry Valleys to keep that cell at 0, and some dull, trendless texture over northern
forests. Bright city lights are far above this margin. All years use the same
fixed scale, so growth is preserved.

How lightning is measured (events mode)
---------------------------------------
Each detected flash is a small yellow dot that switches on, stays for about 0.4-0.7 s
(the 10-day window) and switches off, with no fade. The picture changes almost every
1/60 s, so the video is decoded at DECODE_FPS and each data frame adds up the
DECODE_FPS / fps decoded frames inside its time slot:
  - new lightning = pixels that turn yellow from one decoded frame to the next,
  - coverage      = share of each grid cell that is yellow, averaged over the slot.
A grid cell "flashes" when at least flash_share of its area turns newly yellow within
one data frame (a storm bursting). flashes = number of such cells, capped at 16, and
pan = centre of those cells, so the percussion sounds where the storms burst.

How co2 is measured (globe mode)
--------------------------------
The co2 video is a 3D globe with the camera turning westward about 190 degrees
(East Asia -> India -> Africa -> Atlantic -> South America). There is no flat map,
so everything is measured ON SCREEN: the grid is a 32 x 16 grid over the video
frame (not a latitude/longitude map), only pixels inside the globe disc count, and
pan/motion include the camera turn. CO2 is drawn semi-transparent: the lower half
of the colorbar is a faint grey/white haze that cannot be told apart from bright
land or dark ocean, so only the opaque top of the scale is read, by hue (tan at
0.6 -> red at 1.0; the colorbar hue is flat below 0.6, so tan counts as 0.6).
Anything else in the disc counts as 0 ("low or not readable"). The model shows one
hour per video frame, and CO2 near the ground pulses every model day (24 frames),
so each data frame is the average of the 24 source frames (one day) around it.
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
        "min_red_over_blue": 3,   # R - B; lights are yellow, ice edges blue-grey, bare rock barely warm
        "land_min_lum": 2.5,      # darkest-ever luminance above this = land (ocean is 0-1)
        "land_cell_share": 0.02,  # a grid cell counts as land if >= 2% of it is land
        "light_scale": 30.0,      # luminance units of light that map to 1.0 (fixed, all years)
        "lit_threshold": 10.0,    # luminance units above base that count as a lit pixel
        "flashes": False,
    },
    "lightning": {
        "mode": "events",
        "title": "Lightning Events Detected from the ISS 2017–2023",
        "fps": 2,
        "decode_fps": 30,          # the source updates about every 1-2 of its 60 fps frames
        "decode_size": (2048, 1024),
        "yellow_min": 30,          # (R+G)/2 - B above this = lightning dot
        "flash_share": 0.20,       # share of a cell newly lit within one data frame = 1 flash
        "max_flashes": 16,
        "coverage_scale": 0.5,     # grid 1.0 = half the cell covered by lightning
        "storm_share": 0.02,       # cell coverage that counts as "storms present" (density)
        "band_rows": (3, 12),      # grid rows the ISS can see (about 52 N to 52 S), inclusive
        "light_scale": 10.0,       # luminance units above the base map that map to 1.0
    },
    "co2": {
        "mode": "globe",
        "title": "DYAMOND Global Carbon Dioxide",
        "fps": 2,
        "source_fps": 30,
        "decode_size": (1280, 720),          # same as the web video: grid cells are 40 x 45 px
        "day_frames": 24,                    # one model day = 24 source frames (1 h each)
        "mask_boxes": [(1520, 1005, 1910, 1055)],   # date label (padded: its width varies), 1920x1080 px
        "disc_shrink": 0.98,                 # ignore the outer 2 % of the disc (limb glow)
        "colorbar_strip": (239, 324, 1681, 539),    # x0, y0, x1, y1 of the strip in the colorbar image
        "readable_from": 0.6,                # colorbar hue is flat (tan) below this position
        "hue_tol": 4 / 360,
        "min_value": 60,                     # 0-255: darker pixels are too faint to read
        "min_saturation": 0.45,              # greyer pixels are haze, land or glare
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
    if cfg["mode"] == "events":
        write_features(ds_id, cfg, analyze_events(cfg, Path(frames_dir)))
        return
    if cfg["mode"] == "globe":
        if colorbar is None:
            raise SystemExit("this dataset needs --colorbar")
        write_features(ds_id, cfg, analyze_globe(cfg, Path(frames_dir), colorbar))
        return
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
        red_over_blue = rgb[..., 0].astype(np.int16) - rgb[..., 2].astype(np.int16)
        yellowish = red_over_blue >= cfg["min_red_over_blue"]   # lights, not blue-grey ice or bare rock
        light *= (sat >= cfg["min_saturation"]) & yellowish & land

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


# ---------------------------------------------------------------------------
# Events mode (lightning)
# ---------------------------------------------------------------------------

def decode_video(path, fps, size):
    """Yield RGB frames (uint8, H x W x 3) from a video at the given fps and size."""
    import subprocess
    W, H = size
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(path),
         "-vf", f"fps={fps},scale={W}:{H}:flags=area",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE)
    n = W * H * 3
    try:
        while True:
            buf = proc.stdout.read(n)
            if len(buf) < n:
                break
            yield np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    finally:
        proc.stdout.close()
        if proc.wait() != 0:
            raise SystemExit("ffmpeg failed to decode the video")


def analyze_events(cfg, video):
    if not video.is_file():
        raise SystemExit(f"events mode needs the source video, not found: {video}")
    W, H = cfg["decode_size"]
    per_slot = cfg["decode_fps"] // cfg["fps"]
    cell_px = (H // ROWS) * (W // COLS)
    r0, r1 = cfg["band_rows"]
    band = np.zeros((ROWS, COLS), dtype=bool)
    band[r0:r1 + 1] = True
    band_px = np.zeros((H, W), dtype=bool)
    band_px[r0 * (H // ROWS):(r1 + 1) * (H // ROWS)] = True

    slots = []
    prev_lit = None
    acc = None
    for j, frame in enumerate(decode_video(video, cfg["decode_fps"], cfg["decode_size"])):
        rgb = frame.astype(np.int16)
        lit = (rgb[..., 0] + rgb[..., 1]) // 2 - rgb[..., 2] > cfg["yellow_min"]
        new = np.zeros_like(lit) if prev_lit is None else lit & ~prev_lit
        prev_lit = lit
        lum = luminance(rgb.astype(np.float32))

        if j % per_slot == 0:
            acc = {"new": np.zeros((ROWS, COLS)), "lit": np.zeros((ROWS, COLS)),
                   "lum": 0.0, "rb": 0.0, "rb_n": 0}
        acc["new"] += block_sum(new.astype(np.float32))
        acc["lit"] += block_sum(lit.astype(np.float32))
        acc["lum"] += lum[band_px].mean()
        if lit.any():
            r, b = rgb[..., 0][lit].astype(np.float32), rgb[..., 2][lit].astype(np.float32)
            acc["rb"] += ((r - b) / np.maximum(r + b, 1.0)).sum()
            acc["rb_n"] += int(lit.sum())
        if j % per_slot == per_slot - 1:
            slots.append(acc)
    # A partial slot at the very end (less than 1 / fps seconds) is dropped.
    # Lightning only ever adds light to the static map, so the emptiest data frame
    # (the start of the video) is the zero point for brightness.
    base_level = min(a["lum"] for a in slots) / per_slot
    print(f"decoded {len(slots) * per_slot} frames at {cfg['decode_fps']} fps -> {len(slots)} data frames")

    x = 2.0 * (np.arange(COLS) + 0.5) / COLS - 1.0
    frames, prev = [], None
    for t, a in enumerate(slots):
        coverage = a["lit"] / (per_slot * cell_px)
        grid = np.clip(coverage / cfg["coverage_scale"], 0, 1) * band
        g = np.round(grid, 2)

        new_share = a["new"] / cell_px
        bursting = (new_share >= cfg["flash_share"]) & band
        if bursting.any():
            w = a["new"] * bursting
            pan = float((w.sum(0) * x).sum() / w.sum())
        else:
            pan = pan_of(g, mask=band)

        brightness = (a["lum"] / per_slot - base_level) / cfg["light_scale"]
        warmth = 0.5 + 0.5 * a["rb"] / a["rb_n"] if a["rb_n"] else 0.5
        frames.append(frame_record(
            t, g,
            brightness=brightness,
            warmth=warmth,
            density=(coverage[band] >= cfg["storm_share"]).mean(),
            pan=pan,
            motion=motion_of(g, prev, mask=band),
            flashes=min(cfg["max_flashes"], int(bursting.sum())),
            value=grid[band].mean(),
        ))
        prev = g
    return frames


# ---------------------------------------------------------------------------
# Globe mode (co2)
# ---------------------------------------------------------------------------

def read_colorbar_range(path, strip_box, lo):
    """Hue scale of the colorbar from position lo to 1.0 (strip given explicitly).

    Hue is forced to be non-increasing so the lookup is one-to-one; the raw strip
    wobbles by under 1 degree where it is flat.
    """
    x0, y0, x1, y1 = strip_box
    img = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)
    # Skip the edge rows and the tick marks along the bottom of the strip.
    strip = img[y0 + 6:y1 - 24, x0:x1 + 1, :3].mean(0)
    positions = np.linspace(0.0, 1.0, len(strip))
    keep = positions >= lo
    hues = unwrap_red(hsv(strip[keep])[0])
    hues = np.minimum.accumulate(hues)
    print(f"colorbar: strip x {x0}-{x1}, readable {lo:.2f}-1.00, hue {hues[0] * 360:.1f} -> {hues[-1] * 360:.1f} deg")
    return hues, positions[keep]


def analyze_globe(cfg, video, colorbar):
    if not video.is_file():
        raise SystemExit(f"globe mode needs the source video, not found: {video}")
    W, H = cfg["decode_size"]
    sx, sy = W / 1920, H / 1080
    hues, positions = read_colorbar_range(colorbar, cfg["colorbar_strip"], cfg["readable_from"])
    lo_h, hi_h = hues.min(), hues.max()

    keep = np.ones((H, W), dtype=bool)
    for x0, y0, x1, y1 in cfg["mask_boxes"]:
        keep[int(y0 * sy):int(y1 * sy) + 2, int(x0 * sx):int(x1 * sx) + 2] = False

    # Pass 1: the globe disc (it does not move or zoom). Brightest-ever pixels outside
    # the masks give its bounding box.
    brightest = None
    for frame in decode_video(video, 1, cfg["decode_size"]):
        lum = luminance(frame.astype(np.float32))
        brightest = lum if brightest is None else np.maximum(brightest, lum)
    ys, xs = np.where((brightest > 6) & keep)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    radius = min(xs.max() - xs.min(), ys.max() - ys.min()) / 2 * cfg["disc_shrink"]
    yy, xx = np.mgrid[0:H, 0:W]
    disc = ((xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2) & keep
    disc_px = block_sum(disc.astype(np.float32))
    disc_cells = disc_px > 0
    print(f"globe disc: centre ({cx:.0f}, {cy:.0f}), radius {radius:.0f} px at {W}x{H}; {disc_cells.sum()} grid cells")

    # Pass 2: every source frame.
    grids, vals, dens, bright, warm = [], [], [], [], []
    for frame in decode_video(video, cfg["source_fps"], cfg["decode_size"]):
        rgb = frame.astype(np.float32)
        h, s, v = hsv(rgb)
        h = unwrap_red(h)
        readable = (disc & (v >= cfg["min_value"]) & (s >= cfg["min_saturation"])
                    & (h >= lo_h - cfg["hue_tol"]) & (h <= hi_h + cfg["hue_tol"]))
        level = np.where(readable, np.interp(np.clip(h, lo_h, hi_h), hues[::-1], positions[::-1]), 0.0)
        grids.append(np.where(disc_cells, block_sum(level) / np.maximum(disc_px, 1), 0.0))
        vals.append(level[disc].mean())
        dens.append(readable[disc].mean())
        bright.append(luminance(rgb)[disc].mean() / 255.0)
        lit = disc & (v > 20)
        r, b = rgb[..., 0][lit], rgb[..., 2][lit]
        warm.append(0.5 + 0.5 * ((r - b) / np.maximum(r + b, 1.0)).mean() if lit.any() else 0.5)

    n_src = len(grids)
    per_slot = cfg["source_fps"] // cfg["fps"]
    day = cfg["day_frames"]
    n_frames = n_src // per_slot
    grids = np.stack(grids)
    series = {k: np.array(a) for k, a in
              (("value", vals), ("density", dens), ("brightness", bright), ("warmth", warm))}
    print(f"decoded {n_src} frames -> {n_frames} data frames, each a {day}-frame (one model day) average")

    frames, prev = [], None
    for t in range(n_frames):
        # Centre of slot t in source frames is per_slot * t + per_slot / 2; take one
        # day around it, shifted inward at the very start and end of the video.
        start = int(round(per_slot * t + per_slot / 2 - day / 2))
        start = min(max(start, 0), n_src - day)
        sl = slice(start, start + day)
        g = np.round(grids[sl].mean(0), 2)
        frames.append(frame_record(
            t, g,
            brightness=series["brightness"][sl].mean(),
            warmth=series["warmth"][sl].mean(),
            density=series["density"][sl].mean(),
            pan=pan_of(g, mask=disc_cells),
            motion=motion_of(g, prev, mask=disc_cells),
            flashes=0,
            value=series["value"][sl].mean(),
        ))
        prev = g
    return frames


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("id", choices=sorted(DATASETS))
    ap.add_argument("frames_dir", help="frames folder, or the source video for events mode")
    ap.add_argument("--colorbar", help="colorbar image (colorbar-mode datasets only)")
    args = ap.parse_args()
    analyze(args.id, args.frames_dir, args.colorbar)


if __name__ == "__main__":
    main()
