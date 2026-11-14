// Public API of the audio engine. This is the only file the UI imports.
// Documented in src/audio/CONTRACT.md.
//
//   import * as audio from './src/audio/engine/index.js';
//   button.onclick = async () => { await audio.loadPreset('sst'); await audio.play(); };
//   video.ontimeupdate = () => audio.playFrame(frameAt(video.currentTime));

import Tone from '../tone.js';
import { createGraph } from './graph.js';
import { createLayer } from './layers.js';
import { mapFrame, sanitizeFrame } from './mapping.js';
import { describeFrame as describeText } from './describe.js';
import { getPreset, listPresets, hasPreset } from '../presets/index.js';
import { getScale, quantizeStep, stepToMidi, midiToHz, midiToName } from '../scales.js';

export { getPreset, listPresets, hasPreset };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  initPromise: null,
  ready: false,
  graph: null,
  preset: getPreset('default'),
  builtPreset: null,        // preset whose layers currently exist
  layers: [],
  tickLoop: null,
  subdivision: null,
  params: null,             // SoundParams of the latest frame
  mode: undefined,          // 'warm' | 'cool', for hysteresis
  frame: null,              // latest frame (sanitized)
  prevFrame: null,
  lastInput: null,          // object last passed to playFrame
  playing: false,
  volume: 0.8,
  loadToken: 0,
  lastProbe: 0,
};

/** True once init() has finished. */
export const isReady = () => state.ready;
/** True while play() is active. */
export const isPlaying = () => state.playing;
/** The resolved preset currently in use. */
export const currentPreset = () => state.preset;

/**
 * Start audio. MUST be called from a user gesture (click / key press):
 * browsers only allow sound after one. Safe to call more than once.
 */
export function init() {
  if (state.initPromise) return state.initPromise;
  const started = Tone.start();   // synchronously, while still inside the gesture
  state.initPromise = (async () => {
    await started;
    state.graph = await createGraph();
    applyVolume(0.01);
    buildPreset(state.preset);
    state.ready = true;
  })().catch((err) => {
    state.initPromise = null;     // allow a retry
    throw err;
  });
  return state.initPromise;
}

/**
 * Switch to the preset for a dataset id (unknown ids get the default preset).
 * Disposes the old preset's instruments. Can be called before init().
 * @param {string} datasetId
 * @returns {Promise<import('../types.js').Preset>}
 */
export async function loadPreset(datasetId) {
  const preset = getPreset(datasetId);
  state.preset = preset;
  state.mode = undefined;
  if (state.initPromise) await state.initPromise.catch(() => {});
  if (!state.ready || state.builtPreset?.id === preset.id) return preset;

  const token = ++state.loadToken;
  state.graph.fader.gain.rampTo(0, 0.08);   // quick fade so the swap doesn't click
  await wait(100);
  if (token !== state.loadToken || !state.ready) return preset;   // a newer call took over

  teardownLayers();
  buildPreset(state.preset);
  state.graph.fader.gain.rampTo(1, 0.3);
  return preset;
}

/**
 * Feed one frame of features (a frames[] entry of features.json, or any object
 * with the same fields; missing fields get neutral values).
 * @param {Partial<import('../types.js').Frame>} features
 * @param {{frameSeconds?: number}} [opts]  How long this frame lasts (1 / fps / speed);
 *   percussion hits are spread over it.
 * @returns {import('../types.js').SoundParams}
 */
export function playFrame(features, opts = {}) {
  state.prevFrame = state.frame;
  state.frame = sanitizeFrame(features);
  state.lastInput = features;

  const p = mapFrame(state.frame, state.preset, state.mode);
  state.mode = p.mode;
  state.params = p;

  if (state.ready) {
    applyParams(p, state.preset.mapping.ramp);
    if (state.playing && p.hits > 0) triggerHits(p, opts.frameSeconds);
  }
  return p;
}

/** Start (or resume) playback. Calls init() if needed, so call it from a user gesture. */
export async function play() {
  if (!state.ready) await init();
  if (state.playing) return;
  state.playing = true;
  Tone.getTransport().start();
  const now = Tone.now();
  state.layers.forEach((l) => l.start?.(now));
}

/** Pause playback; held notes are released. */
export function pause() {
  if (!state.playing) return;
  state.playing = false;
  Tone.getTransport().pause();
  state.layers.forEach((l) => l.stop?.());
}

/** Master volume, 0 (silent) to 1 (full). */
export function setVolume(v) {
  state.volume = clamp(Number(v) || 0, 0, 1);
  if (state.graph) applyVolume(0.1);
}

/**
 * Explore mode: play one short tone for the grid cell at (x, y) of the latest
 * frame. x = column 0-31 (west -> east), y = row 0-15 (north -> south),
 * same as frame.grid[y][x]. x sets the pan, the cell's value sets the pitch.
 * Returns the cell info even if audio isn't started (then `sounded` is false).
 * @returns {import('../types.js').ProbeResult}
 */
export function probe(x, y) {
  const grid = state.frame?.grid;
  const rows = grid?.length || 16;
  const cols = grid?.[0]?.length || 32;
  const cx = clamp(Math.floor(x), 0, cols - 1);
  const cy = clamp(Math.floor(y), 0, rows - 1);
  const raw = grid ? grid[cy]?.[cx] : state.frame?.value;
  const value = clamp(typeof raw === 'number' ? raw : 0.5, 0, 1);

  const pan = ((cx + 0.5) / cols) * 2 - 1;
  const scale = getScale(state.params?.scaleName ?? state.preset.scales.warm);
  const midi = stepToMidi(quantizeStep(value, scale, 2), scale, state.preset.rootMidi + 12);

  let sounded = false;
  if (state.ready) {
    const g = state.graph;
    const t = Math.max(Tone.now() + 0.005, state.lastProbe + 0.01);   // strictly increasing
    state.lastProbe = t;
    g.probePanner.pan.setValueAtTime(pan, t);
    g.probeSynth.triggerAttackRelease(midiToHz(midi), 0.25, t, 0.8);
    sounded = true;
  }
  return { x: cx, y: cy, value, pan, midi, note: midiToName(midi), sounded };
}

/**
 * Short sentence for an ARIA live region, e.g.
 * "high water temperature, rising pitch, panned left".
 * @param {Partial<import('../types.js').Frame>} features
 * @param {import('../types.js').Preset | string} [preset]  Preset or dataset id; defaults to the current one.
 * @param {Partial<import('../types.js').Frame>} [prev]     Previous frame; defaults to the one before `features`.
 */
export function describeFrame(features, preset = state.preset, prev) {
  const p = typeof preset === 'string' ? getPreset(preset) : preset ?? state.preset;
  const before = prev ?? (features === state.lastInput ? state.prevFrame : state.frame);
  return describeText(features, p, before ?? undefined);
}

/** Stop everything and free all audio nodes. init() can be called again afterwards. */
export function dispose() {
  state.loadToken++;
  pause();
  teardownLayers();
  state.graph?.dispose();
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  Object.assign(state, {
    initPromise: null, ready: false, graph: null, builtPreset: null,
    params: null, mode: undefined, frame: null, prevFrame: null, lastInput: null,
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildPreset(preset) {
  const g = state.graph;
  const { reverb } = preset.mapping;
  if (g.reverb.decay !== reverb.decay) g.reverb.decay = reverb.decay;   // re-renders the impulse
  g.reverb.wet.rampTo(reverb.wet, 0.5);

  state.layers = preset.layers.map((spec) => createLayer(spec, g, preset, () => state.params));
  state.subdivision = preset.mapping.subdivisions[0];
  state.tickLoop = new Tone.Loop(onTick, state.subdivision).start(0);
  state.builtPreset = preset;

  // Re-map the latest frame with the new preset so the sound is right at once.
  state.params = mapFrame(state.frame ?? {}, preset, undefined);
  state.mode = state.params.mode;
  applyParams(state.params, 0.05);
  if (state.playing) {
    const now = Tone.now();
    state.layers.forEach((l) => l.start?.(now));
  }
}

function teardownLayers() {
  state.tickLoop?.dispose();
  state.tickLoop = null;
  state.layers.forEach((l) => {
    l.stop?.();
    l.dispose();
  });
  state.layers = [];
  state.builtPreset = null;
}

/** Called on every beat subdivision while the transport runs. */
function onTick(time) {
  const p = state.params;
  if (!p) return;
  state.layers.forEach((l) => l.tick?.(time, p));
}

/** Ramp every shared parameter to the new frame's targets. */
function applyParams(p, ramp) {
  const g = state.graph;
  g.layerIn.volume.rampTo(p.volumeDb, ramp);
  g.filter.frequency.rampTo(p.filterHz, ramp);
  g.panner.pan.rampTo(p.pan, ramp);
  g.tremolo.wet.rampTo(p.tremoloDepth, ramp);
  g.tremolo.frequency.rampTo((p.bpm / 60) * 2, ramp);   // tremolo pulses in 8th notes
  Tone.getTransport().bpm.rampTo(p.bpm, ramp);
  if (state.tickLoop && p.subdivision !== state.subdivision) {
    state.tickLoop.interval = p.subdivision;
    state.subdivision = p.subdivision;
  }
  state.layers.forEach((l) => l.update?.(p, ramp));
}

function applyVolume(ramp) {
  const { master } = state.graph;
  master.mute = state.volume <= 0.001;
  if (!master.mute) master.volume.rampTo(20 * Math.log10(state.volume), ramp);
}

/** Spread this frame's percussion hits over the frame's duration. */
function triggerHits(p, frameSeconds) {
  const { hitWindow } = state.preset.mapping;
  const span = Math.min(hitWindow, frameSeconds ?? hitWindow);
  const now = Tone.now();
  const times = Array.from({ length: p.hits }, (_, i) =>
    now + 0.01 + (i / p.hits) * span + Math.random() * 0.02);
  state.layers.forEach((l) => l.hit?.(times, p));
}
