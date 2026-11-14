# Data Contract

This file describes how the Python analysis (Person 1) hands data to the audio engine (Person 2) and the UI (Person 3). **Please don't change the format without telling the whole team.** If you need a new field, ask and we'll add it to every dataset at once.

Right now every file is **mock data** (`"mock": true` in `index.json`). The real files will have exactly the same shape, so code written against the mocks will keep working.

## 1. The manifest: `public/data/index.json`

Lists every dataset the jukebox can play.

| Field | Meaning |
|-------|---------|
| `id` | short id, also the folder name (`sst`, `nightlights`, `lightning`, `co2`) |
| `title` | display title |
| `description` | plain-language, screen-reader-friendly description (read it aloud as-is) |
| `colorMeaning` | what the colours in the video mean, e.g. "red = warm, blue = cold" |
| `source` | SVS page URL (currently `"TODO"`) |
| `credit` | credit line to show, e.g. "NASA/SVS" |
| `features` | path to the features file, **relative to `public/data/`** |
| `video` | path to the video, relative to `public/data/` (videos come later) |
| `mock` | `true` while the data is fake |

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
| `pan` | −1 to 1 | horizontal centre of activity (−1 = left/west, 1 = right/east) | stereo position |
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

## 4. What the mock data sounds like

The mocks follow how each real dataset behaves, so presets can be tuned now:

- **sst**: smooth and slow. Warm band in the middle rows (equator) drifting north/south, a gentle warm/cool cycle, low `motion`, `pan` near 0, no flashes.
- **nightlights**: dark map with bright clusters mostly on the left/centre (`pan` ≈ −0.2). `brightness`, `density` and `value` rise steadily across the 60 frames (2012 → 2023).
- **lightning**: low background. `flashes` jumps between 0 and 16, `pan` jumps around as storms move, `motion` spikes on burst frames.
- **co2**: plumes drift west → east, so `pan` sweeps from about −0.7 to +0.6. `value` rises steadily from about 0.37 to 0.70.

## 5. Checking files

```bash
python3 scripts/make_mock.py   # regenerate the mocks (fixed seed, same output every time)
python3 scripts/validate.py    # check all features.json + index.json against this contract
```
