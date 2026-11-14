# Data Contract

This file describes how the Python analysis (Person 1) hands data to the audio engine (Person 2) and the UI (Person 3). **Please don't change the format without telling the whole team.** If you need a new field, ask and we'll add it to every dataset at once.

`index.json` says which datasets are real: `"mock": false` means real SVS data. **All four datasets (sst, nightlights, lightning, co2) are now real.** `"mock": true` would mean generated test data (`scripts/make_mock.py` can still make some for testing). Real and mock files have exactly the same shape. Real files have different `frameCount`s (sst 133, nightlights 60, lightning 200, co2 78), so always read `frameCount` and never assume 60.

## 1. The manifest: `public/data/index.json`

Lists every dataset the jukebox can play.

| Field | Meaning |
|-------|---------|
| `id` | short id, also the folder name (`sst`, `nightlights`, `lightning`, `co2`) |
| `title` | display title |
| `description` | plain-language, screen-reader-friendly description (read it aloud as-is) |
| `colorMeaning` | what the colours in the video mean, e.g. "red = warm, blue = cold" |
| `source` | SVS page URL (filled in for all four datasets) |
| `credit` | credit line to show, e.g. "NASA/SVS" |
| `features` | path to the features file, **relative to `public/data/`** |
| `video` | path to the web video (`video.mp4`), relative to `public/data/` |
| `mock` | `false` for real SVS data, `true` for generated test data |

## 2. Per-dataset features: `public/data/<id>/features.json`

```json
{
  "dataset": "sst",
  "title": "Global Sea Surface Temperature",
  "fps": 2,
  "frameCount": 60,
  "grid": { "cols": 32, "rows": 16 },
  "frames": [ { "t": 0, "brightness": 0.42, "...": "...", "grid": [[...], ...] } ]
}
```

- `fps`: frames per second of data. With `fps: 2`, frame `i` belongs to time `i / 2` seconds into the video.
- `frameCount`: always equals `frames.length`.
- `grid`: size of the explore-mode grid, 32 columns × 16 rows.

### Each frame

| Field | Range | Meaning | Ideas for sound |
|-------|-------|---------|-----------------|
| `t` | integer | frame index (0, 1, 2…). Time in seconds = `t / fps` | — |
| `brightness` | 0–1 | mean luminance of the picture | overall loudness / filter brightness |
| `warmth` | 0–1 | red-vs-blue balance (1 = very red/warm) | timbre, major vs minor feel |
| `density` | 0–1 | share of the map that is bright/active | number of notes / layers |
| `pan` | −1 to 1 | horizontal centre of activity (−1 = left/west, 1 = right/east). **Exceptions:** lightning uses the centre of the cells that flashed in this frame; co2 is a position on screen and includes the camera turning (see section 4) | stereo position |
| `motion` | 0–1 | how much changed since the previous frame | rhythm speed, tremolo |
| `flashes` | integer 0–16 | number of newly bright spots | percussion hits (lightning) |
| `value` | 0–1 | the calibrated main quantity (e.g. normalised temperature) | pitch on a musical scale |
| `grid` | 16 × 32, each 0–1 | `value` for each area of the map | explore mode `probe(x, y)` |

Precision: features have up to 3 decimals, grid cells up to 2 decimals.

### The grid

- `grid[row][col]`: **row first**, then column.
- Row 0 is the **top (north)**, row 15 is the bottom (south).
- Column 0 is the **left (west)**, column 31 is the right (east).
- Each cell is that area's `value`, on the same 0–1 scale as the frame's `value`.

So a cursor at column `x` (0–31), row `y` (0–15) reads `frame.grid[y][x]`.

> **co2 is different: its grid is a screen grid, not a map.** The co2 video is a 3D globe seen by a turning camera, so its 32 × 16 grid covers the **video frame** (each cell is 40 × 45 px of the 1280 × 720 video). Row 0 is the top of the screen and column 0 the left edge, which are only roughly north and west, and a given cell shows a different place on Earth as the globe turns. Cells outside the globe are always 0. Explore mode still works the same way ("hear what is under the cursor right now"), but the UI should not describe co2 cells as latitudes/longitudes.

## 3. JavaScript example

```js
// Load the manifest, then one dataset's features.
const index = await fetch('public/data/index.json').then(r => r.json());
const ds = index.datasets.find(d => d.id === 'sst');
const data = await fetch('public/data/' + ds.features).then(r => r.json());

// Which frame matches the video's current time?
function frameAt(seconds) {
  const i = Math.min(data.frameCount - 1, Math.max(0, Math.floor(seconds * data.fps)));
  return data.frames[i];
}

// Read frame i directly.
const i = 10;
const frame = data.frames[i];
console.log(frame.value, frame.pan, frame.flashes);

// Read grid cell (x, y): x = column 0..31 (west→east), y = row 0..15 (north→south).
function cell(frame, x, y) {
  return frame.grid[y][x];          // row first!
}
console.log(cell(frame, 5, 8));

// From a mouse position over the video element:
function cellFromMouse(frame, event, videoEl) {
  const rect = videoEl.getBoundingClientRect();
  const x = Math.min(data.grid.cols - 1, Math.floor((event.clientX - rect.left) / rect.width  * data.grid.cols));
  const y = Math.min(data.grid.rows - 1, Math.floor((event.clientY - rect.top)  / rect.height * data.grid.rows));
  return cell(frame, x, y);
}

// Keep sound in sync with the video:
// video.addEventListener('timeupdate', () => audio.update(frameAt(video.currentTime)));
```

Paths are relative to the repo root, because the site is served with `python3 -m http.server` from there.

## 4. What the data sounds like

**sst is real data** (133 frames, 66.5 s at fps 2):

- `value` = area-weighted global mean temperature / 32 °C. Its range is narrow (0.58–0.60, i.e. 18.6–19.2 °C) because the global mean barely moves within one year. Use the **grid** for the interesting variation: cells range from 0 (0 °C) to about 0.97 (31 °C).
- In the grid, **0 means land** (or ocean that is never visible). A real 0 °C ocean cell also reads about 0.0–0.05, so treat 0 as "no ocean here" and keep near-zero ocean cells quiet.
- `brightness` is low (0.16–0.18) because most of the ocean in the video is black between streaks.
- `density` = share of ocean area warmer than 19.2 °C (about 0.58).
- `flashes` is always 0.

**nightlights is real data** (60 frames, 30 s at fps 2; one year every 2.5 s, re-paced from the SVS video, see `docs/sources.md`):

- Frames `5k` to `5k+4` belong to year `2012 + k`. Frame `5k+4` is the crossfade into the next year, so `motion` is non-zero only on frames `5k+4` and `5k+5`; everything else holds still within a year.
- `brightness` (0.087 → 0.111) and `value` (0.052 → 0.066) both measure light above the land base on one fixed scale. They rise about 27 % from 2012 to 2023, with a small dip in 2020 and a jump in 2022–2023.
- Grid: 1.0 = very bright city area (the brightest cell is 0.92). 71 % of cells are 0, which means ocean **or** unlit land. Lit areas are mostly 0.01–0.5. Rows 13–15 (Antarctica and the Southern Ocean) are always 0.
- `warmth` is nearly constant (0.62–0.63): the lights are always the same yellow-white.
- `pan` is near the centre and drifts slightly right over time (−0.02 → +0.03) as Asia gets brighter.
- `flashes` is always 0.

**lightning is real data** (200 frames, 100 s at fps 2, the SVS video's own pacing, about 2017–2023):

- **`flashes`** = number of grid cells where at least **20 % of the cell turned newly yellow within this half-second frame**, i.e. a storm bursting there; capped at 16. The video shows thousands of tiny strike dots at once, so `flashes` counts storm bursts, not single dots. Distribution over the 200 frames: 0 in 34 %, 1–4 in 39 %, 5–8 in 19 %, 9–16 in 8 % (median 1.5, mean 3.1). It changes by about 3 from frame to frame. The first ~5 s and the last ~20 s have few or no flashes (the video builds up and fades out, and new strikes arrive more slowly near the end).
- **`pan` is lightning-specific.** On frames with `flashes > 0`, `pan` is the centre of **the cells that flashed**, weighted by how much new lightning each had, so a hit sounds where the storm burst. On frames with no flashes it falls back to the shared definition (`pan_of(grid)`: centre of cells above the median). Why: the Americas, Africa and Asia always have lightning at the same time, so the centre of *all* lightning hardly moves (about 0.0–0.16). Range −0.53 to +0.72, typically jumping about 0.12 between frames.
- `value` = average lightning coverage over the rows the ISS can see (grid rows 3–12, about 52° N to 52° S): 0–0.13, median 0.07. It swells about every 12 s (one swell per northern summer).
- Grid cell = share of the cell covered by lightning during the frame ÷ 0.5 (1.0 = half the cell covered). Rows 0–2 and 13–15 are always 0: the ISS can't see that far north or south. 71 % of cells are 0.
- `brightness` = light added by lightning, above the empty map: 0 at the start, up to 0.50 (median 0.27).
- `density` = share of visible cells with any storms (≥ 2 % coverage): 0–0.36.
- `motion` = shared definition: 0–0.40, higher on burst frames (mean 0.22 when `flashes` ≥ 5, 0.10 when 0).
- `warmth` ≈ 0.85 whenever there is lightning (the dots are yellow), 0.5 on the empty first frames.

**co2 is real data** (78 frames, 39 s at fps 2, the SVS video's own pace, 14 Jan – 3 Mar 2020). It is a **globe tour**, not a map:

- **Camera:** the camera turns westward about 190°: East Asia → India and the Indian Ocean → Africa → Atlantic → South America (see the time table in `docs/sources.md`). So the features describe **what is facing the viewer**, and they change as new regions come into view. They do not show a global rise in CO₂ (a rise over these two months is far too small to see on this colour scale) or wind direction.
- **Grid** = screen grid (see section 2). Each cell = how much high CO₂ is visible there: the average colorbar position of readable pixels, with everything else counted as 0. 0–0.62; 89 % of cells are 0 (outside the globe, or nothing readable).
- **`value`** = the same over the whole visible disc. Relative only: **no ppm** (the SVS colorbar has no numbers). Only the opaque top of the colorbar (0.6–1.0, tan → orange → red) can be read; lower CO₂ is a faint haze that can't be separated from the land. Range 0.018–0.049 (median 0.032): highest over East Asia at the start and South America at the end, lowest while Africa and the Atlantic face the camera (13–29 s).
- **`density`** = share of the visible disc showing high CO₂: 0.026–0.072.
- **Daily averaging:** each frame is the average of one model day (24 source frames around it). In the video, CO₂ near the ground pulses every 0.8 s (it builds up at night and fades in daytime); the data deliberately smooths this out, so values move slowly (at most 0.005 between frames).
- **`pan` and `motion` include the camera turn.** `pan` is the screen position of the high-CO₂ cells (shared `pan_of`), range −0.24 to +0.22. It does **not** follow the wind: patches drift right as the globe turns, then new ones enter on the left. `motion` (shared definition, 0–0.15) is partly the camera moving.
- `brightness` 0.067–0.116 and `warmth` 0.62–0.67 describe the whole visible disc. `flashes` is always 0.

## 5. Checking files

```bash
python3 scripts/make_mock.py   # regenerate the mocks (fixed seed, same output every time)
python3 scripts/validate.py    # check all features.json + index.json against this contract
```
