// Audio adapter: the UI imports audio ONLY from this file.
//
// It drives Person 2's engine (src/audio/engine/index.js, documented in
// src/audio/CONTRACT.md) and falls back to ./audio-stub.js if the engine can't
// be used, so the UI keeps working:
//   - the engine module fails to import → stub from the start;
//   - Tone.js fails to load or start on the first Play (the engine loads Tone
//     lazily inside init()) → switch to the stub, including any video sync.
//
// Interface the UI uses:
//
//   whenReady(): Promise          Resolves once an implementation is chosen.
//   engineStatus(): 'loading' | 'tone-idle' | 'tone' | 'stub'
//   onEngineChange(fn)            Called whenever engineStatus() changes.
//   start(): Promise              Unlock audio. Call SYNCHRONOUSLY in a click / key
//                                 handler, before any await.
//   isStarted(): boolean
//   load(featuresFile): Promise   Preset + per-file ranges (engine loadDataset).
//   syncToVideo(video, file, { onFrame }) → detach()
//                                 Audio follows the <video> (play/pause/seek/rate).
//   update(frame, { frameSeconds })  Feed one frame (heatmap clock, no video).
//   preview(frame, opts)          One audible note for a frame, even while paused.
//   play() / pause() / stop()
//   setVolume(v) 0–1, setRate(r)
//   probe(x, y)                   { x, y, value, pan, empty, label, level, midi, note, sounded }
//   playLegend()                  { text, duration, sounded }
//
// Still missing from the engine (see CONTRACT): previewFrame, setRate and a
// fast-fade stop. preview() plays one probe() note instead, setRate is a no-op
// (the video's playbackRate / our clock handle speed), stop() = pause().

import * as stub from './audio-stub.js';
// Plain JS, no Tone.js: the legend text works on the stub too.
import { getPreset } from '../../audio/presets/index.js';
import { legendText } from '../../audio/engine/describe.js';

const ENGINE_URL = '../../audio/engine/index.js';

let engine = null; // the engine module, once imported
let impl = null; // active implementation (engine wrapper or stub wrapper)
let status = 'loading';
let startPromise = null;
let volume = 0.7;
let currentFile = null;
let lastFrame = null;
let sync = null; // { video, file, opts, detach }
const listeners = new Set();

function setStatus(next) {
  if (status === next) return;
  status = next;
  listeners.forEach((fn) => fn(status));
}

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
      if (grid[y][x] === 0) continue; // empty cells only tick
      const score = Math.abs(grid[y][x] - target) + (0.02 * Math.abs(x - panCol)) / cols;
      if (score < best.score) best = { x, y, score };
    }
  }
  return best;
}

function engineImpl(m) {
  return {
    name: 'tone',
    isStarted: () => m.isReady(),
    load: (file) => m.loadDataset(file),
    update: (frame, opts = {}) => m.playFrame(frame, opts),
    // Engine notes come from its running transport, so playFrame() while paused
    // is silent. A scrub preview plays one probe note at the cell that best
    // matches the frame's main value instead (no previewFrame in the engine yet).
    preview: (frame, opts = {}) => {
      m.playFrame(frame, opts);
      if (!m.isReady()) return null;
      const { x, y } = matchingCell(frame);
      return m.probe(x, y);
    },
    play: () => m.play(),
    pause: () => m.pause(),
    setVolume: (v) => m.setVolume(v),
    probe: (x, y) => m.probe(x, y),
    stop: () => m.pause(),
    playLegend: () => m.playLegend(),
    syncToVideo: (video, file, opts) => m.syncToVideo(video, file, opts),
  };
}

const stubImpl = {
  name: 'stub',
  isStarted: () => stub.isStarted(),
  load: (file) => stub.load(file),
  update: (frame, opts) => stub.update(frame, opts),
  preview: (frame, opts) => stub.preview(frame, opts),
  play: () => stub.play(),
  pause: () => stub.pause(),
  setVolume: (v) => stub.setVolume(v),
  probe: (x, y) => stub.probe(x, y),
  stop: () => stub.stop(),
  playLegend: () => stub.playLegend({ text: currentFile ? legendText(getPreset(currentFile.dataset)) : '' }),
  syncToVideo: (video, file, opts) => stub.syncToVideo(video, file, opts),
};

/** Move everything (preset, frame, volume, video sync) over to the stub. */
function switchToStub() {
  if (impl === stubImpl) return;
  impl = stubImpl;
  stub.setVolume(volume);
  if (currentFile) stub.load(currentFile);
  if (lastFrame) stub.update(lastFrame);
  if (sync) {
    const { video, file, opts } = sync;
    try {
      sync.detach();
    } catch {
      // the engine is already broken; ignore
    }
    sync.detach = stub.syncToVideo(video, file, opts);
  }
  setStatus('stub');
}

const ready = import(ENGINE_URL)
  .then((m) => {
    engine = m;
    impl = engineImpl(m);
    setStatus('tone-idle');
  })
  .catch((err) => {
    console.warn(
      '[audio] Could not load the audio engine (src/audio/engine/index.js). ' +
        'Using the simple fallback sounds in src/ui/adapters/audio-stub.js.',
      err,
    );
    impl = stubImpl;
    setStatus('stub');
  });

/** Call impl[name] now if chosen, otherwise once loading has finished. */
function call(name, args) {
  return impl ? impl[name](...args) : ready.then(() => impl[name](...args));
}

export const whenReady = () => ready;
export const engineStatus = () => status;
export const engineName = () => (status === 'loading' ? 'loading' : impl?.name ?? 'loading');
export const onEngineChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const isStarted = () => (impl ? impl.isStarted() : false);

/**
 * Unlock audio. MUST be called synchronously from a click / key handler.
 * With the engine, a backup Web Audio context is also created inside the same
 * gesture (Safari only allows that there), so falling back later still has sound.
 */
export function start() {
  if (startPromise) return startPromise;
  if (!impl) return ready.then(() => start());
  if (impl === stubImpl) {
    startPromise = stub.start().catch((err) => {
      startPromise = null;
      throw err;
    });
    return startPromise;
  }
  const engineStart = engine.init();
  const backup = stub.start().catch(() => {});
  startPromise = engineStart.then(
    () => {
      stub.close(); // the real engine runs; release the backup context
      setStatus('tone');
    },
    async (err) => {
      console.warn('[audio] Tone.js could not start. Switching to the simple fallback sounds.', err);
      await backup;
      switchToStub();
    },
  );
  return startPromise;
}

export function load(file) {
  currentFile = file;
  return call('load', [file]);
}

export function update(frame, opts) {
  lastFrame = frame;
  return call('update', [frame, opts]);
}

export function preview(frame, opts) {
  lastFrame = frame;
  return call('preview', [frame, opts]);
}

export function setVolume(v) {
  volume = v;
  return call('setVolume', [v]);
}

/**
 * Audio follows the video. Returns detach(); call it on every record change.
 * Survives a later switch to the stub (the sync is moved across).
 */
export function syncToVideo(video, file, opts = {}) {
  sync?.detach();
  currentFile = file;
  const entry = { video, file, opts, detach: () => {} };
  sync = entry;
  const attach = () => {
    if (sync !== entry) return;
    entry.detach = impl.syncToVideo(video, file, {
      ...opts,
      onFrame: (frame, index, params) => {
        lastFrame = frame;
        opts.onFrame?.(frame, index, params);
      },
    });
  };
  if (impl) attach();
  else ready.then(attach);
  return function detach() {
    if (sync !== entry) return;
    sync = null;
    entry.detach();
  };
}

export const play = (...a) => call('play', a);
export const pause = (...a) => call('pause', a);
export const setRate = () => {}; // speed is the video's playbackRate / the UI clock
export const probe = (...a) => call('probe', a);
export const stop = (...a) => call('stop', a);
export const playLegend = (...a) => call('playLegend', a);
