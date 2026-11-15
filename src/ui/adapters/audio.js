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
//   setAlarmEnabled(on), isAlarmEnabled()   Climate alarm on/off (engine default: on)
//   previewAlarm({ seconds })     { text, seconds, sounded }: the alarm on its own, ~10 s.
//                                 No way to stop it early in the engine yet.
//   canSoundAlarm()               false on the stub fallback (it has no alarm voice)
//   sampleState()                 Recorded instruments for the current dataset:
//                                 'none' | 'idle' | 'loading' | 'ready' | 'fallback' | 'off'
//                                 (engine getSampleStatus().state; always 'none' on the stub)
//   onSampleStatus(fn)            fn(state) on every change of sampleState(); → unsubscribe
//
// Texts from the engine (legend, alarm preview) pass through fixWording()
// (../preset-text.js) before the UI shows or speaks them.
//
// Still missing from the engine (see CONTRACT): previewFrame, setRate and a
// fast-fade stop. preview() plays one probe() note instead, setRate is a no-op
// (the video's playbackRate / our clock handle speed), stop() = pause().

import * as stub from './audio-stub.js';
// Plain JS, no Tone.js: the legend text works on the stub too.
import { getPreset } from '../../audio/presets/index.js';
import { legendText } from '../../audio/engine/describe.js';
import { presetText, fixWording } from '../preset-text.js';

const ENGINE_URL = '../../audio/engine/index.js';

let engine = null; // the engine module, once imported
let impl = null; // active implementation (engine wrapper or stub wrapper)
let status = 'loading';
let startPromise = null;
let volume = 0.7;
let currentFile = null;
let lastFrame = null;
let sync = null; // { video, file, opts, detach }
let alarmEnabled = true; // engine default (CONTRACT.md §5)
const listeners = new Set();
const sampleListeners = new Set();
let lastSampleState = 'none';

/** Tell the UI when the recorded-instrument state changes (deduplicated). */
function emitSampleState(next) {
  if (next === lastSampleState) return;
  lastSampleState = next;
  sampleListeners.forEach((fn) => {
    try {
      fn(next);
    } catch (err) {
      console.error(err);
    }
  });
}

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

/** { text, … } results from the engine, with the interim wording fixes applied. */
function withFixedText(result) {
  return Promise.resolve(result).then((r) => (r && typeof r.text === 'string' ? { ...r, text: fixWording(r.text) } : r));
}

/** Legend text from the plain-JS presets (stub fallback): always a string. */
function stubLegendText() {
  if (!currentFile) return '';
  const preset = getPreset(currentFile.dataset, { alarm: alarmEnabled });
  // describe.js joins preset fields as they are: make sure they are strings.
  const safe = { ...preset, legendExtra: presetText(preset.legendExtra), alarm: { ...preset.alarm, legend: presetText(preset.alarm?.legend) } };
  return fixWording(legendText(safe, { alarm: alarmEnabled }));
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
    playLegend: () => withFixedText(m.playLegend()),
    previewAlarm: (opts) => withFixedText(m.previewAlarm(opts)),
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
  playLegend: () => stub.playLegend({ text: stubLegendText() }),
  // The fallback has no alarm voice.
  previewAlarm: () => ({ text: 'The climate alarm example needs the full sound engine, which could not start.', seconds: 0, sounded: false }),
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
  emitSampleState('none');
}

const ready = import(ENGINE_URL)
  .then((m) => {
    engine = m;
    impl = engineImpl(m);
    m.setAlarmEnabled(alarmEnabled);
    // Recorded instruments (CONTRACT.md §5): 'loading' → 'ready' or 'fallback'.
    m.onSampleStatus?.((st) => {
      if (impl === stubImpl) return;
      emitSampleState(st?.state ?? 'none');
    });
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
      // init() can take a few seconds while recorded instruments load. If the
      // video was paused meanwhile, the engine's play() (queued behind init)
      // would still start the music after it: pause it again once that has run.
      setTimeout(() => {
        if (sync?.video?.paused && engine.isPlaying?.()) engine.pause();
      }, 0);
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
export const previewAlarm = (...a) => call('previewAlarm', a);

/** Climate alarm on/off. Works before audio starts. */
export function setAlarmEnabled(on) {
  alarmEnabled = !!on;
  engine?.setAlarmEnabled(alarmEnabled);
}
export const isAlarmEnabled = () => alarmEnabled;
/** Whether the alarm can be heard at all (not on the stub fallback). */
export const canSoundAlarm = () => impl !== stubImpl;

/**
 * Recorded instruments for the current dataset (see the list at the top).
 * Read straight from the engine, so it is right before init() too: 'idle'
 * means they will load on the first Play.
 */
export function sampleState() {
  if (!engine || impl === stubImpl) return 'none';
  try {
    return engine.getSampleStatus?.().state ?? 'none';
  } catch {
    return 'none';
  }
}

/** fn(state) whenever sampleState() changes. Returns an unsubscribe function. */
export function onSampleStatus(fn) {
  sampleListeners.add(fn);
  return () => sampleListeners.delete(fn);
}
