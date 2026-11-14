// Audio adapter: the UI imports audio ONLY from this file.
//
// It loads Person 2's Tone.js engine (src/audio/engine/index.js, documented in
// src/audio/CONTRACT.md) and maps it onto the interface below. If the engine
// can't load (e.g. Tone.js fails to download), it logs a warning and falls back
// to ./audio-stub.js so the UI keeps working.
//
// Interface the UI uses:
//
//   whenReady(): Promise            Resolves once an engine (real or stub) is loaded.
//   engineName(): 'tone'|'stub'|'loading'
//   start(): Promise                Unlock audio. Call from a user gesture only.
//   isStarted(): boolean
//   load(datasetId): Promise        Switch preset. Fades out the old one. OK before start().
//   update(frame, { frameSeconds }) Feed one features.json frame. Silent while paused;
//                                   it only sets the sound for the next play / probe.
//   preview(frame, opts)            One short audible note for a frame, even while paused
//                                   (used when scrubbing). Also does update(frame).
//   play(): Promise / pause()
//   setVolume(v)                    0–1.
//   setRate(r)                      Speed multiplier. The UI clock handles speed and passes
//                                   frameSeconds = 1 / (fps × r) to update().
//   probe(x, y)                     Explore mode: tone for frame.grid[y][x] of the latest
//                                   frame given to update(). Returns
//                                   { x, y, value, pan, midi, note, sounded }.
//   stop()                          Silence now (pause + release held notes).
//
// Mapping to Person 2's engine:
//   start → init, isStarted → isReady, load → loadPreset, update → playFrame,
//   play/pause/setVolume/probe → same names, stop → pause.
//   setRate and preview have no direct equivalent: see the notes below.

import * as stubModule from './audio-stub.js';

const ENGINE_URL = '../../audio/engine/index.js';

let impl = null;

/** Grid cell whose value best matches frame.value, nearest the frame's pan. */
function matchingCell(frame) {
  const grid = frame?.grid;
  if (!grid?.length) return { x: 0, y: 0 };
  const rows = grid.length;
  const cols = grid[0].length;
  const target = frame.value ?? 0.5;
  const panCol = (((frame.pan ?? 0) + 1) / 2) * (cols - 1);
  let best = { x: 0, y: 0, score: Infinity };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const score = Math.abs(grid[y][x] - target) + (0.02 * Math.abs(x - panCol)) / cols;
      if (score < best.score) best = { x, y, score };
    }
  }
  return best;
}

function fromToneEngine(m) {
  return {
    name: 'tone',
    // init() calls Tone.start() synchronously, so this stays inside the gesture.
    start: () => m.init(),
    isStarted: () => m.isReady(),
    load: (id) => m.loadPreset(id),
    update: (frame, opts = {}) => m.playFrame(frame, opts),
    // The engine's notes come from its running transport, so playFrame() while
    // paused is silent. For a scrub preview we play one probe note at the cell
    // that best matches the frame's main value, near its pan position.
    // (Question for Person 2: a dedicated previewFrame(frame) would be better.)
    preview: (frame, opts = {}) => {
      m.playFrame(frame, opts);
      if (!m.isReady()) return null;
      const { x, y } = matchingCell(frame);
      return m.probe(x, y);
    },
    play: () => m.play(),
    pause: () => m.pause(),
    setVolume: (v) => m.setVolume(v),
    // Tempo comes from the data (motion → bpm), so speed is handled by the UI
    // clock via frameSeconds. Nothing to forward.
    setRate: () => {},
    probe: (x, y) => m.probe(x, y),
    stop: () => m.pause(),
  };
}

function fromStub(s) {
  return { name: 'stub', ...s };
}

const ready = import(ENGINE_URL)
  .then((m) => {
    impl = fromToneEngine(m);
  })
  .catch((err) => {
    console.warn(
      '[audio] Could not load the Tone.js audio engine (src/audio/engine/index.js). ' +
        'Falling back to the simple placeholder sounds in src/ui/adapters/audio-stub.js.',
      err,
    );
    impl = fromStub(stubModule);
  });

/** Call impl[name] now if loaded, otherwise once loading has finished. */
function call(name, args) {
  return impl ? impl[name](...args) : ready.then(() => impl[name](...args));
}

export const whenReady = () => ready;
export const engineName = () => impl?.name ?? 'loading';
export const isStarted = () => (impl ? impl.isStarted() : false);

export const start = (...a) => call('start', a);
export const load = (...a) => call('load', a);
export const update = (...a) => call('update', a);
export const preview = (...a) => call('preview', a);
export const play = (...a) => call('play', a);
export const pause = (...a) => call('pause', a);
export const setVolume = (...a) => call('setVolume', a);
export const setRate = (...a) => call('setRate', a);
export const probe = (...a) => call('probe', a);
export const stop = (...a) => call('stop', a);
