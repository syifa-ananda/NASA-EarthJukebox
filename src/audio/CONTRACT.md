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

`package.json` lists `tone` as a devDependency only to record the version. Section 9 explains how to upgrade.

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

The real data moves very little (night lights brightness 0.087 → 0.111, co2 `value` 0.018 → 0.049), but those small changes are the real signal. The engine rescales each field to the range the file actually uses before mapping it to sound, so they become clearly audible.

- `analyzeRanges(featuresFile)` → `Ranges`. For `brightness`, `warmth`, `density`, `motion`, `value` and any preset-derived fields, it takes the 5th–95th percentile over all frames.
- **Minimum span.** A range narrower than the field's minimum span is widened around its centre (`widened: true`), so pure noise doesn't swing the sound. The minimum span is the largest of:
  - 0.004 (the data has 3 decimals)
  - 5 % of the field's typical level
  - 3× its typical frame-to-frame jitter

  Real trends pass. Near-constant fields stay calm, such as `warmth` and the global sst mean, and so do jittery ones, such as co2 `motion` from the camera. A preset can override it per field (`normalize.minSpan`).
- **Grid.** Grid cells of `0` mean "nothing there" (land, unlit, no lightning, off the globe), so the grid range uses only non-zero cells. That range sets the probe pitch.
- `pan` and `flashes` are not rescaled: one is a real position, the other a count.
- **Derived fields.** A preset can compute extra fields from each frame (`derive`). sst does this: its melody follows `seasons`, the northern minus the southern mid-latitude ocean temperature, because the global mean barely moves within a year.
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
| `probe(x, y)` → `ProbeResult` | Explore mode: one short tone for cell `frame.grid[y][x]`. `x` = column 0–31 (left → right), `y` = row 0–15 (top → bottom); west/north on the maps, but **co2 is a screen grid on a turning globe**, so don't announce co2 cells as places. Column → stereo position, value → pitch. Returns `{ x, y, value, pan, empty, label, level, midi, note, sounded }`. `value` is raw. **A cell of 0 is empty**: no note, just a soft tick, and `empty: true` with `label` (e.g. "land, where there is no ocean data"). Otherwise `level` is "very low" … "very high" for this dataset. Works while paused. |
| `previewAlarm({ seconds }?)` → `{ text, seconds, sounded }` | Plays the current dataset's climate alarm on its own for about 10 s (the music steps out and comes back), so listeners can learn the sound. Works while paused; plays even if the alarm is turned off. For datasets without an alarm: `sounded: false`, `text` says so. |
| `playLegend({ duration }?)` → `{ text, duration, sounded }` | Audio legend: plays the scale from the lowest to the highest value (same notes as the probe) in about 3 s, with the music turned down meanwhile. `text` is for screen readers. |
| `describeFrame(features, preset?, prev?)` → `string` | Short sentence for an ARIA live region. Words are relative to the current dataset's range (section 4). Examples from the real data: `"year 2023, very high night light, steady pitch, centred"`, `"over South America, high carbon dioxide in view, rising pitch, centred"`, `"northern oceans at their warmest, steady pitch, centred"`, `"very high lightning activity, falling pitch, panned left, 3 storm bursts"`. While the climate alarm sounds it ends with e.g. `"alarm: highest carbon dioxide in view"`. |
| `startRecording()` / `stopRecording()` → `Promise<Blob>` | Records everything you hear. The blob is webm/opus in Chrome and Firefox, mp4 in Safari (check `blob.type`). `isRecording()`, `isRecordingSupported()`. |
| `dispose()` | Stops everything and frees all audio nodes. `init()` can start again. |
| `listPresets()`, `getPreset(id)`, `hasPreset(id)` | Preset info for menus; every preset has a `soundDescription` for screen readers, written for the current instrument mix. |
| `setMix('acoustic' \| 'electronic')` → `Promise`, `getMix()`, `MIXES` | Instrument mix for every preset (section 6). Default `'acoustic'`. Rebuilds the current instruments with a short fade; works before `init()`. |
| `setAlarmEnabled(on)`, `isAlarmEnabled()`, `isAlarmActive()` | Climate alarm on/off for every preset (a user setting, default on), and whether it is sounding right now (section 6). |
| `setSwitch(name, on)` → `Promise`, `getSwitches()` | Optional layers of the current preset, e.g. `setSwitch('angklung', false)`; `null` goes back to the preset's own setting. `getSwitches()` → e.g. `{ angklung: true }`, or `{}` if the preset and mix have none. |
| `isReady()`, `isPlaying()`, `currentPreset()` | State queries. |

Accessibility notes for the UI:

- **`soundDescription`**: read it when a dataset is chosen (`currentPreset().soundDescription`).
- **Legend**: offer a "Play legend" button. Show or announce the returned `text` while it plays. For presets with the alarm, it explains the wailing sound.
- **Alarm preview**: next to the legend, offer "Preview alarm" (`previewAlarm()`) on datasets with an alarm, and announce the returned `text`.
- **Climate alarm switch**: offer a "Climate alarm on/off" setting (`setAlarmEnabled`). The alarm already fades in slowly and stays under the music, but some listeners will still prefer it off; the descriptions then stop mentioning it.
- **Throttle `describeFrame`** to about one announcement every 2–3 seconds, but always deliver the latest sentence when the window opens, so a seek or the last frame isn't left unannounced. `announceLatest()` in `src/audio/dev/dev.js` does this.
- **Probe from the keyboard**: arrow keys move one cell, then call `probe(x, y)` and announce the result, e.g. `"Column 8, row 5: very high, value 0.92"` or `"Column 6, row 16: empty (no lights: ocean or unlit land)"`. `src/audio/dev/` has a working example.

## 6. Instruments, mixes and the climate alarm

Everything is synthesized in the browser; nothing is downloaded.

**Two instrument mixes** (`setMix`). Each preset keeps the same mapping and story in both; only the instruments change.

- `acoustic` (default): acoustic and world-inspired instruments: harp, soft piano, strings, angklung, a marimba-style bass, a wordless vocal pad, hand drums, frame drum, log drum and an overtone drone. The drums are modelled on real ones: a drumhead ringing at a few inharmonic modes with its own decay, a small pitch drop at each hit, a short noise burst for the hand on the skin, and slight random variation from hit to hit. They are inspired by instruments from many places, not copies of any tradition; the vocal pad sings vowels only ("oo", "oh", "aa"), never words.
- `electronic`: the original synth sounds (plucks, FM bells, pads, a saw drone, thunder and noise crackle), with a gentler top end than before (`mixMapping.electronic` in each preset: less loud, less bright and less dense at the highest values) so it stays comfortable at the data's peaks.

**Why each preset sounds the way it does (acoustic mix):**

| Preset | Instruments | Why |
|---|---|---|
| `sst` | strings, "oo"–"oh" vocal pad, a few harp notes | long bowed notes match slow, continuous ocean change; a wordless voice feels like breath and depth and swells with the currents |
| `nightlights` | a bamboo ensemble: angklung lead, a few soft harp notes above, a marimba bass on the key's root and fifth, and a low angklung chord for each new year | each shaken note is one point of light, so more notes play as cities grow; every layer is harmonic and in the same key, so nothing clashes with the angklung |
| `lightning` | hand drums for each storm burst, a deep frame drum on busy frames, a log drum on the biggest bursts, an "aa"–"oh" vocal pad | storm bursts are sudden, rhythmic events, so they become percussion; the deep drum gives the thunder its weight |
| `co2` | overtone drone with a whistling overtone, a frame-drum heartbeat | an invisible gas becomes a breathing hum; the overtone climbs and the heartbeat quickens as CO₂ rises, so "more" is heard without just getting louder |
| `default` | piano, strings, hand drums for flashes | neutral and clear for any new dataset |

**Angklung** (Indonesian bamboo, the lead in nightlights): each note is two tubes an octave apart, shaken as a quick fading rattle. It can be switched off in `presets/nightlights.js` (`const ANGKLUNG = true` at the top) or at runtime with `setSwitch('angklung', false)`.

**Climate alarm.** A slow, low, wordless voice that holds the key's root, glides up to the fifth while its vowel opens from "oo" to "oh", holds, and glides back (one cycle every 9 s). It fades in over 1.5 s only when the data reaches the top of its range, fades out over 3 s, and sits about 5–6 dB under the music: clearly audible, never the loudest part. It is deliberately unlike a real siren: no continuous sweep, no two-tone jumps, no fast cycle, a low singing register, and on the music's key. Turning it off with `setAlarmEnabled(false)` fades it out; `previewAlarm()` plays it on its own.

| Preset | Alarm when | Real data |
|---|---|---|
| `co2` | CO₂ in view ≥ 0.8 of the file's range (off below 0.75) | East Asia at about 2.5–5 s and the Amazon at about 30–37 s |
| `sst` | off | the northern-summer peak is the normal yearly cycle, not a climate warning, so an alarm would be misleading |
| others | off | nightlights shows growth, not an emergency; lightning's storm bursts carry the drama already |

Thresholds are at the top of each preset file (`alarm: { on, field, threshold, ... }`, see `AlarmConfig` in `types.js`).

## 7. How data becomes sound

Follows the "Ideas for sound" column of the data contract, with per-preset changes listed below. Every pitch is snapped to a scale. In the real data `warmth` barely changes, so each preset uses one fixed key: major pentatonic for sst and nightlights, minor pentatonic for lightning and co2. Only `default` switches key with `warmth`. Every change is ramped, never jumped.

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

| Preset | Sound (real data) | Differences from the default mapping |
|---|---|---|
| `sst` | the melody climbs from March to its top in August–September and sinks again by March, following the seasons; acoustic: strings, vocal pad, harp; electronic: pads and bells | pitch ← derived `seasons` (northern minus southern mid-latitude ocean, land ignored) |
| `nightlights` | gets louder, brighter, higher and busier from 2012 to 2023; small dip in 2020, big fill-in in 2022–23; a marker at each new year (acoustic: angklung, harp, marimba bass, a low angklung chord; electronic: bells, a low chime) | note rate and tempo ← brightness; year-marker layer on `motion`; descriptions start with the year |
| `lightning` | a drum hit for each storm burst, placed where it bursts; a pad or vocal pad that swells each northern summer; quiet start and end (acoustic: hand, frame and log drums; electronic: thunder and crackle) | pan moves instantly (`panRamp` 0.05 s) so each hit lands at its storm |
| `co2` | a low drone following the globe tour: thicker, louder, brighter and higher over East Asia and the Amazon (with a clashing tension note and the alarm), thin and dark over Africa and the Atlantic; acoustic adds the singing overtone and a heartbeat. Its peak is capped (loudness, brightness, clash and overtone) so the rise stays intense but not harsh | loudness ← density, filter ← value (the globe's brightness is deserts, not CO₂); gentle pan and tempo (camera); descriptions start with the region |
| `default` | melody, soft pad and a light percussion hit for flashes (acoustic: piano, strings, hand drums; electronic: pluck, pad, knock); used for any other dataset id | none |

**Levels.** Each preset has a `trimDb` per mix so all presets and both mixes sound equally loud: about −20 dB RMS (within ±1 dB), measured from recordings of the real data after the drones have faded in. Peaks stay below −1 dBFS, also in recordings: a limiter plus a soft clipper (ceiling −2 dBFS, leaving room for the lossy encoding's overshoot) catch fast attacks. Re-measure after changing instruments or data.

## 8. Requests to Person 1 (data)

Nothing here blocks the audio; the current contract is enough.

1. **Units for `value` and the grid** (optional fields in `index.json`). For sst, cells are temperature ÷ 32 °C, so `valueScale: 32, valueUnit: "°C"` would let the probe say "about 28 °C" instead of "very high". nightlights, lightning and co2 have no physical unit, so they keep the relative words.
2. **Ids for new datasets** (aerosols, GEDI forest height, atmospheric rivers, air quality). Any new id plays with the `default` preset straight away; tell us the id and we'll add a dedicated preset.
3. **Aerosols, per particle type.** The plan is one instrument layer per particle type. That needs a 0–1 value per type per frame (e.g. `"types": { "dust": 0.4, "smoke": 0.1 }`). This would be a contract change, so only if the whole team agrees.
4. **Keep video and data in step.** `syncToVideo` relies on frame `i` being at `i / fps` seconds. The current videos match: sst 66.7 s for 133 frames, nightlights 30.0 s for 60, lightning 100.1 s for 200, co2 39.2 s for 78.

## 9. Upgrading Tone.js

```bash
npm install -D tone@<version>
cp node_modules/tone/build/Tone.js node_modules/tone/build/Tone.js.LICENSE.txt node_modules/tone/LICENSE.md src/audio/vendor/
```

Then update the version in `src/audio/tone.js`, this file, and `package.json` (pin it exactly, without `^`).
