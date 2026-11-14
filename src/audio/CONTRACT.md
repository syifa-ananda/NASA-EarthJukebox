# Audio engine: API and data needs

How the UI (Person 3) uses the audio engine, and what the engine needs from the data (Person 1). The engine reads `features.json` exactly as described in [docs/data-contract.md](../../docs/data-contract.md) and adds no fields of its own.

## 1. Loading

Tone.js **15.1.22** is vendored at `src/audio/vendor/Tone.js` (MIT, licence files alongside it). No `npm install` is needed and the site works offline. Import the engine as an ES module:

```html
<script type="module">
  import * as audio from './src/audio/engine/index.js';
</script>
```

**Don't add a `<script>` tag for `vendor/Tone.js`.** Loading Tone creates an AudioContext immediately, and browsers log "AudioContext was not allowed to start" if that happens before a click. The engine loads Tone itself on the first `init()`, which runs inside a click or key press. Until then the page has no AudioContext at all. Everything except sound works before `init()`: `loadPreset`, `loadDataset`, `playFrame`, `probe` (returns the value, `sounded: false`), `describeFrame` and `listPresets`.

`package.json` lists `tone` as a devDependency only to record the version. Section 8 explains how to upgrade.

## 2. Quick start: one call per dataset

```js
import * as audio from './src/audio/engine/index.js';

const data = await fetch('public/data/sst/features.json').then(r => r.json());

// Optional but recommended: start audio from a click before the video plays.
startButton.addEventListener('click', () => audio.init());

// Wires everything: preset, ranges, play/pause/seek/end, frame changes.
let detach = audio.syncToVideo(videoEl, data, {
  onFrame(frame, index) {
    // e.g. update a (throttled) live region
    liveRegion.textContent = audio.describeFrame(frame);
  },
});

// Switching dataset:
detach();
detach = audio.syncToVideo(videoEl, otherData);
```

## 3. Video sync: `syncToVideo(video, featuresFile, options?)` → `detach()`

- Calls `loadDataset(featuresFile)`: the matching preset plus per-file normalization (section 4).
- Frame index = `floor(video.currentTime × fps)`, clamped to the last frame. `playFrame` runs **only when the index changes**.
- Updates every shown video frame with `requestVideoFrameCallback` where the browser has it, otherwise `requestAnimationFrame`; `timeupdate` is a slower backup.
- `play` → audio plays, `pause` / `ended` → audio pauses, `seeked` → the new frame is applied immediately, even while paused.
- Respects `playbackRate`: at 2x, percussion is spread over half the time.
- `options.onFrame(frame, index, soundParams)` runs after each new frame.
- `options.loadDataset: false` skips loading the preset and ranges, if you did it yourself.
- `detach()` removes every listener and pauses the audio.

Browsers only allow sound after a user gesture. Clicking the video's play button counts in Chrome, Firefox and Safari, but calling `audio.init()` from your own Start/Play button first is the most reliable.

## 4. Per-file normalization

Each dataset uses only part of the 0–1 range (e.g. dark night-light maps have brightness 0.03–0.28). The engine rescales each field to the range the file actually uses before mapping it to sound, so presets work the same on mock and real data.

- `analyzeRanges(featuresFile)` → `Ranges`. For `brightness`, `warmth`, `density`, `motion` and `value` it takes the 5th–95th percentile over all frames. It does the same over all `grid` cells, for the probe pitch.
- Ranges narrower than 0.1 are widened around their centre (`widened: true`), so noise in a nearly constant field doesn't swing the sound.
- `pan` and `flashes` are not rescaled: one is a real position, the other a count.
- `loadDataset(file)` = `loadPreset(file.dataset)` + `setRanges(analyzeRanges(file))`. `syncToVideo` calls it for you.
- `setRanges(null)` turns normalization off; `getRanges()` returns the current ranges.
- **Words match the sound.** `describeFrame()` uses the same normalized values as the sound: its level words ("very low" … "very high") and "rising / falling pitch" are **relative to the current dataset's range**. "High night light" means bright for this dataset, and "rising pitch" only appears when the played note actually goes up. Without ranges it falls back to the raw values.
- **Numbers stay raw.** Wherever an actual number is shown, such as the `value` in `probe()` results, it is the raw contract value.

## 5. API

All functions are named exports of `src/audio/engine/index.js`.

| Function | What it does |
|---|---|
| `init()` → `Promise` | Starts audio and builds the sound graph. **Call from a user gesture** (click / key press). Safe to call more than once. |
| `syncToVideo(video, file, options?)` → `detach` | See section 3. |
| `loadDataset(file)` → `Promise<{preset, ranges}>` | Preset + normalization for a features.json. |
| `loadPreset(datasetId)` → `Promise<Preset>` | Preset only. Unknown ids get the `default` preset, so new datasets still make sound. Disposes the old instruments. Works before `init()`. |
| `analyzeRanges(file)`, `setRanges(r)`, `getRanges()` | Normalization, see section 4. |
| `playFrame(features, { frameSeconds }?)` → `SoundParams` | Feeds one `frames[]` entry. Changes are smoothed with ramps. `frameSeconds` (default 0.5) is how long the frame lasts; `flashes` hits are spread over it. |
| `play()` → `Promise` / `pause()` | Start or resume / pause the music. `play()` calls `init()` if needed. |
| `setVolume(v)` | Master volume, `0` to `1`. |
| `probe(x, y)` → `ProbeResult` | Explore mode: one short tone for cell `frame.grid[y][x]`. `x` = column 0–31 (west → east), `y` = row 0–15 (north → south). Column → stereo position, value → pitch. Returns `{ x, y, value, pan, midi, note, sounded }`; `value` is raw. Works while paused. |
| `playLegend({ duration }?)` → `{ text, duration, sounded }` | Audio legend: plays the scale from the lowest to the highest value (same notes as the probe) in about 3 s, with the music turned down meanwhile. `text` is for screen readers. |
| `describeFrame(features, preset?, prev?)` → `string` | Short sentence for an ARIA live region, e.g. `"high water temperature, rising pitch, panned left"`. Words are relative to the current dataset's range (section 4). |
| `startRecording()` / `stopRecording()` → `Promise<Blob>` | Records everything you hear. The blob is webm/opus in Chrome and Firefox, mp4 in Safari (check `blob.type`). `isRecording()`, `isRecordingSupported()`. |
| `dispose()` | Stops everything and frees all audio nodes. `init()` can start again. |
| `listPresets()`, `getPreset(id)`, `hasPreset(id)` | Preset info for menus; every preset has a `soundDescription` for screen readers. |
| `isReady()`, `isPlaying()`, `currentPreset()` | State queries. |

Accessibility notes for the UI:

- **`soundDescription`**: read it when a dataset is chosen (`currentPreset().soundDescription`).
- **Legend**: offer a "Play legend" button. Show or announce the returned `text` while it plays.
- **Throttle `describeFrame`** to about one announcement every 2–3 seconds.
- **Probe from the keyboard**: arrow keys move one cell, then call `probe(x, y)` and announce the result (e.g. `"Column 6, row 9: value 0.62, note E4"`). `src/audio/dev/` has a working example.

## 6. How data becomes sound

Follows the "Ideas for sound" column of the data contract. Every pitch is snapped to a scale (major pentatonic for warm frames, minor pentatonic for cool ones; lightning and co2 always use minor pentatonic). Every change is ramped, never jumped.

| Field (after normalization) | Sound |
|---|---|
| `value` | pitch of the melody / chord root on the scale; the probe's pitch |
| `brightness` | loudness and filter cutoff (dark → muffled, bright → open) |
| `warmth` | key (warm → major, cool → minor) and a slightly brighter timbre |
| `density` | number of chord voices and how often notes play |
| `pan` | stereo position |
| `motion` | tempo, tremolo, and pad swells |
| `flashes` | percussion hits, one per flash (capped per preset) |
| `grid` | used only by `probe(x, y)` |

| Preset | Sound |
|---|---|
| `sst` | flowing FM pads, motion swells them, temperature sets the pitch, soft bells on top |
| `nightlights` | bells whose number grows with brightness, so the piece fills in from 2012 to 2023 |
| `lightning` | thunder and crackle hit on each flash, panned to the storm; sparse minor pad |
| `co2` | low drone that thickens with density, rises with `value`, and adds a clashing note when values are high |
| `default` | pluck melody, soft pad and a light knock for flashes; used for any other dataset id |

**Levels.** Each preset has a `trimDb` setting so all presets sound equally loud: about −20 dB RMS, measured from recordings. Peaks stay below −1 dBFS: a limiter plus a soft clipper on the final output catch fast attacks. Re-measure after changing instruments.

## 7. Requests to Person 1 (data)

Nothing here blocks the audio; the current contract is enough.

1. **Units for `value`** (optional fields in `index.json`, e.g. `valueUnit: "°C"`, `valueMin: -2`, `valueMax: 32`). Then `describeFrame` and the probe could say "about 28 °C" instead of "high".
2. **Ids for new datasets** (aerosols, GEDI forest height, atmospheric rivers, air quality). Any new id plays with the `default` preset straight away; tell us the id and we'll add a dedicated preset.
3. **Aerosols, per particle type.** The plan is one instrument layer per particle type. That needs a 0–1 value per type per frame (e.g. `"types": { "dust": 0.4, "smoke": 0.1 }`). This would be a contract change, so only if the whole team agrees.
4. **Videos at the path in `index.json`** (`public/data/<id>/video.mp4`), with the same frame timing as `features.json` (frame `i` at `i / fps` seconds). `syncToVideo` relies on that.

## 8. Upgrading Tone.js

```bash
npm install -D tone@<version>
cp node_modules/tone/build/Tone.js node_modules/tone/build/Tone.js.LICENSE.txt node_modules/tone/LICENSE.md src/audio/vendor/
```

Then update the version in `src/audio/tone.js`, this file, and `package.json` (pin it exactly, without `^`).
