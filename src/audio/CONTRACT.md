# Audio engine: API and data needs

How the UI (Person 3) uses the audio engine, and what the engine needs from the data (Person 1). The engine reads `features.json` exactly as described in [docs/data-contract.md](../../docs/data-contract.md) and adds no fields of its own.

## 1. Loading

Tone.js **15.1.22** is vendored at `src/audio/vendor/Tone.js` (MIT, licence files alongside it). No `npm install` is needed and the site works offline. Import the engine as an ES module. It loads Tone.js by itself if the page hasn't already:

```html
<!-- optional: preload Tone.js so the first click starts faster -->
<script src="src/audio/vendor/Tone.js"></script>
<script type="module">
  import * as audio from './src/audio/engine/index.js';
</script>
```

`package.json` lists `tone` as a devDependency only to record the version. Section 6 explains how to upgrade.

## 2. Quick start (UI)

```js
import * as audio from './src/audio/engine/index.js';

const data = await fetch('public/data/sst/features.json').then(r => r.json());
await audio.loadPreset(data.dataset);           // fine before audio has started

playButton.addEventListener('click', async () => {
  await audio.play();                           // first call starts audio: must be inside a click/key handler
});

// Keep the sound in sync with the video (frame i lasts 1 / fps seconds).
video.addEventListener('timeupdate', () => {
  const i = Math.min(data.frameCount - 1, Math.floor(video.currentTime * data.fps));
  if (i === lastIndex) return;
  lastIndex = i;
  audio.playFrame(data.frames[i], { frameSeconds: 1 / data.fps });
  liveRegion.textContent = audio.describeFrame(data.frames[i]);   // throttle this, see below
});
```

## 3. API

All functions are named exports of `src/audio/engine/index.js`.

| Function | What it does |
|---|---|
| `init()` → `Promise` | Starts audio (`Tone.start()`) and builds the shared sound graph. **Must be called from a user gesture** (click / key press). Safe to call more than once. `play()` and the test page call it for you. |
| `loadPreset(datasetId)` → `Promise<Preset>` | Switches to that dataset's preset. Unknown ids get the `default` preset, so new datasets still make sound. Fades out, disposes the old instruments and builds the new ones. Can be called before `init()`. |
| `playFrame(features, { frameSeconds }?)` → `SoundParams` | Feeds one `frames[]` entry. All changes are smoothed with ramps. `frameSeconds` (default 0.5) is how long the frame lasts; percussion hits for `flashes` are spread over it. Missing fields get neutral values. Returns the mapped sound parameters (useful for debugging). |
| `play()` → `Promise` | Starts or resumes the music. Calls `init()` if needed, so call it from a user gesture. |
| `pause()` | Pauses the music and releases held notes. `probe()` still works while paused. |
| `setVolume(v)` | Master volume, `0` (silent) to `1` (full). |
| `probe(x, y)` → `ProbeResult` | Explore mode: one short tone for grid cell `frame.grid[y][x]` of the latest frame. `x` = column 0–31 (west → east), `y` = row 0–15 (north → south). Column sets the stereo position and the cell value sets the pitch, on the current preset's scale. Returns `{ x, y, value, pan, midi, note, sounded }`. `sounded` is `false` if audio isn't started yet, but the value is still correct. |
| `describeFrame(features, preset?, prev?)` → `string` | Short sentence for an ARIA live region, e.g. `"high water temperature, rising pitch, panned left"`. `preset` can be a preset or a dataset id (default: current). `prev` defaults to the frame before it. |
| `dispose()` | Stops everything and frees all audio nodes. `init()` / `play()` can start again afterwards. |
| `listPresets()` | `[{ id, name, soundDescription }]` for menus and screen readers. |
| `getPreset(id)`, `hasPreset(id)` | Full preset object; whether an id has its own preset. |
| `isReady()`, `isPlaying()`, `currentPreset()` | State queries. |

Accessibility notes for the UI:

- **`soundDescription`**: every preset has a plain-language description of how it sounds (`listPresets()` or `currentPreset().soundDescription`). Read it when a dataset is chosen.
- **Throttle `describeFrame`** to about one announcement every 2–3 seconds. Frames change faster than a screen reader can speak.
- **Probe from the keyboard**: arrow keys move one cell, then call `probe(x, y)` and announce e.g. `"Column 6, row 9: value 0.62, note E4"` from the result. `src/audio/dev/` has a working example.

## 4. How data becomes sound

Follows the "Ideas for sound" column of the data contract. Every pitch is snapped to a scale (major pentatonic for warm frames, minor pentatonic for cool ones; lightning and co2 always use minor pentatonic). Every change is ramped, never jumped.

| Field | Sound |
|---|---|
| `value` | pitch of the melody / chord root on the scale; the probe's pitch |
| `brightness` | loudness and filter cutoff (dark → muffled, bright → open) |
| `warmth` | key (above the preset's threshold → major, below → minor) and a slightly brighter timbre |
| `density` | number of chord voices and how often notes play |
| `pan` | stereo position |
| `motion` | tempo, tremolo, and pad swells |
| `flashes` | percussion hits, one per flash (capped per preset) |
| `grid` | used only by `probe(x, y)` |

Presets in `src/audio/presets/` can change which field drives what (`sources`), how strongly (`weights`), the ranges (`mapping`) and the instruments (`layers`):

| Preset | Sound |
|---|---|
| `sst` | flowing FM pads, motion swells them, temperature (`value`) sets the pitch, soft bells on top |
| `nightlights` | bells whose number grows with brightness, so the piece fills in from 2012 to 2023 |
| `lightning` | thunder and crackle hit on each flash, panned to the storm; sparse minor pad |
| `co2` | low drone that thickens with density, rises with `value`, and adds a clashing note when values are high |
| `default` | pluck melody, soft pad and a light knock for flashes; used for any other dataset id |

## 5. Requests to Person 1 (data)

Nothing here blocks the audio; the current contract is enough. These would make it better:

1. **Units for `value`** (optional fields in `index.json`, e.g. `valueUnit: "°C"`, `valueMin: -2`, `valueMax: 32`). Then `describeFrame` and the probe could say "about 28 °C" instead of "high".
2. **Ids for new datasets** (aerosols, GEDI forest height, atmospheric rivers, air quality). Any new id plays with the `default` preset straight away; tell us the id and we'll add a dedicated preset.
3. **Aerosols, per particle type.** The plan is one instrument layer per particle type (dust, smoke, sea salt, sulfate). That needs a 0–1 value per type per frame, e.g. `"types": { "dust": 0.4, "smoke": 0.1 }`. This would be a contract change, so only if the whole team agrees.
4. **Calibrated ranges.** The mocks use narrow ranges (e.g. sst `warmth` 0.31–0.39, lightning `brightness` 0.04–0.10), and presets currently scale these up with `weights`. Once real frames exist we'll retune the weights; tell us if the real ranges differ a lot.

## 6. Upgrading Tone.js

```bash
npm install -D tone@<version>
cp node_modules/tone/build/Tone.js node_modules/tone/build/Tone.js.LICENSE.txt node_modules/tone/LICENSE.md src/audio/vendor/
```

Then update the version in `src/audio/tone.js`, this file, and `package.json` (pin it exactly, without `^`).
