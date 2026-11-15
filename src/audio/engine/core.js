// Engine state and the main API functions. The UI imports them through
// engine/index.js (see src/audio/CONTRACT.md), not from this file.

import { Tone, unlockAudio, loadTone } from '../tone.js';
import { createGraph } from './graph.js';
import { createLayer } from './layers.js';
import { createAlarm, previewAlarm as previewAlarmVoice } from './alarm.js';
import { SAMPLE_SETS, loadSampleSet, sampleBuffers, sampleStatus, resetFailed } from './samples.js';
import { mapFrame, sanitizeFrame, withDerived } from './mapping.js';
import { analyzeRanges as analyzeFile, normalizeFrame, normalizeValue } from './normalize.js';
import { describeFrame as describeText, legendText, levelWord } from './describe.js';
import { getPreset as resolvePreset, listPresets as listAll, MIXES, DEFAULT_MIX } from '../presets/index.js';
import { getScale, quantizeStep, stepToMidi, midiToHz, midiToName } from '../scales.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  initPromise: null,
  ready: false,
  graph: null,
  mix: DEFAULT_MIX,         // 'acoustic' | 'electronic'
  alarmEnabled: true,       // user setting: false silences the climate alarm everywhere
  switchOverrides: {},      // layer switches set with setSwitch(), e.g. { angklung: false }
  sampled: true,            // use recorded strings/piano when loaded (setSampled)
  sampleListeners: new Set(),
  preset: resolvePreset('default'),
  builtKey: null,           // preset id + mix + switches whose layers currently exist
  layers: [],
  alarm: null,              // climate alarm of the current preset (engine/alarm.js), or null
  alarmOn: false,           // data is in the alarm zone (with hysteresis)
  tickLoop: null,
  subdivision: null,
  ranges: null,             // Ranges of the loaded file, or null = no normalization
  params: null,             // SoundParams of the latest frame
  mode: undefined,          // 'warm' | 'cool', for hysteresis
  frame: null,              // latest frame, raw values (sanitized)
  prevFrame: null,
  lastInput: null,          // object last passed to playFrame
  playing: false,
  volume: 0.8,
  loadToken: 0,
  lastProbe: 0,
  lastLegend: 0,
  recorder: null,
  stopPreview: null,        // stops a running previewAlarm()
};

/** True once init() has finished. */
export const isReady = () => state.ready;
/** True while play() is active. */
export const isPlaying = () => state.playing;
/** The resolved preset currently in use. */
export const currentPreset = () => state.preset;
/** Ranges used for normalization, or null. */
export const getRanges = () => state.ranges;
/** Current instrument mix: 'acoustic' or 'electronic'. */
export const getMix = () => state.mix;
/** False if the user turned the climate alarm off (setAlarmEnabled). */
export const isAlarmEnabled = () => state.alarmEnabled;
/** True while the climate alarm is sounding (or fading in). */
export const isAlarmActive = () => Boolean(state.alarm?.active);

/** Preset for a dataset id with the current mix and alarm setting. */
const resolve = (id) => resolvePreset(id, { mix: state.mix, alarm: state.alarmEnabled });

/**
 * Full preset for a dataset id, for the current instrument mix (unknown ids
 * get the default preset).
 * @param {string} id
 * @returns {import('../types.js').Preset}
 */
export const getPreset = (id) => resolve(id);

/** Short list for menus: id, name and soundDescription (for the current mix). */
export const listPresets = () => listAll({ mix: state.mix, alarm: state.alarmEnabled });

/** True if recorded strings and piano are used (when loaded); false = synth versions. */
export const isSampled = () => state.sampled;

/**
 * Sample loading state for the current preset and mix:
 *   state 'none'     the preset uses no sampled instruments
 *         'idle'     not loaded yet: they load during init(), before anything plays
 *         'off'      sampled instruments are turned off (setSampled(false)): synth versions
 *         'loading'  "Loading samples..."
 *         'ready'    playing the recorded samples
 *         'fallback' a sample failed or took over 8 s: synth versions instead
 * @returns {{state: 'none'|'idle'|'off'|'loading'|'ready'|'fallback', kinds: Record<string, string>}}
 */
export function getSampleStatus() {
  const kinds = {};
  for (const k of sampledKinds(state.preset)) kinds[k] = sampleStatus(k);
  const values = Object.values(kinds);
  let st = 'ready';
  if (!values.length) st = 'none';
  else if (!state.sampled) st = 'off';
  else if (values.includes('loading')) st = 'loading';
  else if (values.includes('idle')) st = 'idle';
  else if (values.includes('failed')) st = 'fallback';
  return { state: st, kinds };
}

/**
 * Get told when the sample state changes (e.g. to show "Loading samples..."
 * in a live region). Returns a function that stops the updates.
 * @param {(status: ReturnType<typeof getSampleStatus>) => void} fn
 */
export function onSampleStatus(fn) {
  state.sampleListeners.add(fn);
  return () => state.sampleListeners.delete(fn);
}

/**
 * Recorded strings and piano on (default) or off (synth versions), e.g. to
 * compare them. Turning it on again retries samples that failed.
 * @param {boolean} on
 * @returns {Promise<void>}
 */
export async function setSampled(on) {
  state.sampled = Boolean(on);
  if (state.sampled) resetFailed();
  notifySamples();
  await rebuild();
}

/**
 * Optional layers of the current preset and mix, and whether each is on,
 * e.g. { angklung: true } for nightlights in the acoustic mix ({} if none).
 */
export function getSwitches() {
  const out = {};
  for (const name of switchNames(state.preset)) out[name] = switchOn(name);
  return out;
}

/**
 * Start audio. MUST be called from a user gesture (click / key press):
 * browsers only allow sound after one. Safe to call more than once.
 * @returns {Promise<void>}
 */
export function init() {
  if (state.initPromise) return state.initPromise;
  const unlocked = unlockAudio();   // synchronously, while still inside the gesture
  state.initPromise = (async () => {
    await loadTone();               // Tone.js is only loaded now (see tone.js)
    await unlocked;
    await Tone.start();
    state.graph = await createGraph();
    applyVolume(0.01);
    await prepareSamples(state.preset);   // recorded instruments load before anything plays
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
 * Keeps the current ranges; use loadDataset() to switch data and preset together.
 * @param {string} datasetId
 * @returns {Promise<import('../types.js').Preset>}
 */
export async function loadPreset(datasetId) {
  const preset = resolve(datasetId);
  if (preset.id !== state.preset.id) {
    state.mode = undefined;
    state.alarmOn = false;
  }
  state.preset = preset;
  await rebuild();
  return preset;
}

/**
 * Switch the instrument mix for every preset: 'acoustic' (acoustic and world
 * instruments, the default) or 'electronic' (synth sounds). The current
 * preset is rebuilt with a short fade. Can be called before init().
 * @param {'acoustic'|'electronic'} mix
 * @returns {Promise<void>}
 */
export async function setMix(mix) {
  if (!MIXES.includes(mix)) throw new Error(`Unknown mix "${mix}" (use ${MIXES.join(' or ')})`);
  state.mix = mix;
  state.preset = resolve(state.preset.id);
  await rebuild();
}

/**
 * Turn an optional layer on or off for every preset that has it, e.g.
 * setSwitch('angklung', false). `null` goes back to the preset's own setting.
 * See `switches` in the preset files. Rebuilds the current preset if needed.
 * @param {string} name
 * @param {boolean | null} on
 * @returns {Promise<void>}
 */
export async function setSwitch(name, on) {
  if (on === null || on === undefined) delete state.switchOverrides[name];
  else state.switchOverrides[name] = Boolean(on);
  await rebuild();
}

/**
 * Climate alarm on or off for every preset (a user setting; presets without
 * an alarm are not affected). Turning it off fades a sounding alarm out.
 * @param {boolean} on
 */
export function setAlarmEnabled(on) {
  state.alarmEnabled = Boolean(on);
  state.preset = resolve(state.preset.id);   // soundDescription mentions the alarm only when on
  state.alarm?.setEnabled(state.alarmEnabled);
}

/**
 * Ranges of a features.json for normalization: the contract fields, the
 * dataset preset's derived fields (e.g. sst `seasons`) and the grid.
 * @param {import('../types.js').FeaturesFile} file
 * @returns {import('../types.js').Ranges}
 */
export function analyzeRanges(file) {
  const preset = resolve(file?.dataset);
  return analyzeFile(file, { derive: preset.derive, minSpan: preset.normalize?.minSpan });
}

/**
 * Use a features.json: analyzes its ranges (normalization) and loads the
 * matching preset. The usual way to switch datasets.
 * @param {import('../types.js').FeaturesFile} file
 * @returns {Promise<{preset: import('../types.js').Preset, ranges: import('../types.js').Ranges}>}
 */
export async function loadDataset(file) {
  const ranges = analyzeRanges(file);
  setRanges(ranges);
  const preset = await loadPreset(file.dataset);
  return { preset, ranges };
}

/**
 * Set the ranges used to normalize frames before mapping (from
 * analyzeRanges()), or null to map raw values.
 * @param {import('../types.js').Ranges | null} ranges
 */
export function setRanges(ranges) {
  state.ranges = ranges ?? null;
  if (state.frame) remap(0.3);
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

  const p = remap(state.preset.mapping.ramp);
  if (state.ready && state.playing && p.hits > 0) triggerHits(p, opts.frameSeconds);
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
 * frame. x = column 0-31 (left/west -> right/east), y = row 0-15 (top/north ->
 * bottom/south), same as frame.grid[y][x]. x sets the pan, the cell's value
 * sets the pitch (normalized to the file's non-zero grid range). `value` in
 * the result is raw.
 *
 * A cell of exactly 0 means "nothing there" (land, unlit, no lightning, off
 * the globe): it plays a soft tick instead of a note and returns
 * `empty: true` with the preset's `emptyLabel`.
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
  const empty = grid ? raw === 0 : false;
  const norm = normalizeValue(value, state.ranges?.grid);
  const midi = empty ? null : probeMidi(norm);

  let sounded = false;
  if (state.ready) {
    const g = state.graph;
    const t = Math.max(Tone.now() + 0.005, state.lastProbe + 0.01);   // strictly increasing
    state.lastProbe = t;
    g.probePanner.pan.setValueAtTime(pan, t);
    if (empty) g.emptySynth.triggerAttackRelease(0.03, t, 0.6);
    else g.probeSynth.triggerAttackRelease(midiToHz(midi), 0.25, t, 0.55 + 0.3 * norm);   // near-zero cells stay soft
    sounded = true;
  }
  return {
    x: cx, y: cy, value, pan, empty,
    label: empty ? state.preset.emptyLabel ?? 'nothing here' : null,
    level: empty ? null : levelWord(norm),
    midi, note: midi === null ? null : midiToName(midi),
    sounded,
  };
}

/**
 * Audio legend: plays the current preset's scale from the lowest to the
 * highest value (same notes as probe()) in about `duration` seconds, with the
 * music ducked. Returns the text version for screen readers.
 * @returns {{text: string, duration: number, sounded: boolean}}
 */
export function playLegend({ duration = 3 } = {}) {
  const preset = state.preset;
  const text = legendText(preset, { alarm: state.alarmEnabled });
  if (!state.ready) return { text, duration: 0, sounded: false };

  const g = state.graph;
  const scale = getScale(state.params?.scaleName ?? preset.scales.warm);
  const count = scale.length * 2 + 1;            // two octaves, top note included
  const dt = duration / count;
  const start = Math.max(Tone.now() + 0.05, state.lastLegend + 0.01);
  for (let i = 0; i < count; i++) {
    const midi = probeMidi(i / (count - 1));
    g.legendSynth.triggerAttackRelease(midiToHz(midi), dt * 0.9, start + i * dt, 0.55 + 0.3 * (i / count));
  }
  state.lastLegend = start + (count - 1) * dt;
  g.duck.gain.rampTo(0.25, 0.3, Tone.now());            // music steps back...
  g.duck.gain.rampTo(1, 0.8, start + duration + 0.2);   // ...and returns afterwards
  return { text, duration, sounded: true };
}

/**
 * Play the current preset's climate alarm on its own for about `seconds`
 * (the music is muted meanwhile, and comes back afterwards), so listeners can
 * learn what it sounds like. Plays even if the alarm is turned off with
 * setAlarmEnabled(false); does nothing for presets without an alarm.
 * Returns a text version for screen readers.
 * @returns {{text: string, seconds: number, sounded: boolean}}
 */
export function previewAlarm({ seconds = 10 } = {}) {
  const preset = state.preset;
  if (!preset.alarm?.on) return { text: 'This dataset has no climate alarm.', seconds: 0, sounded: false };
  const text = `Climate alarm preview. ${preset.alarm.legend}`;
  if (!state.ready) return { text, seconds: 0, sounded: false };

  const g = state.graph;
  state.stopPreview?.();
  const now = Tone.now();
  const start = now + 0.4;
  const end = start + seconds;
  const gate = g.musicGate.gain;
  gate.cancelScheduledValues(now);
  gate.setValueAtTime(gate.getValueAtTime(now), now);
  gate.linearRampToValueAtTime(0, start);         // music steps out...
  gate.setValueAtTime(0, end);
  gate.linearRampToValueAtTime(1, end + 1);       // ...and back in afterwards
  state.stopPreview = previewAlarmVoice(g, preset, seconds, start);
  return { text, seconds, sounded: true };
}

/**
 * Short sentence for an ARIA live region, e.g.
 * "high water temperature, rising pitch, panned left". Level words and the
 * pitch trend are relative to the loaded dataset's ranges (what you hear);
 * without ranges they use the raw values.
 * @param {Partial<import('../types.js').Frame>} features
 * @param {import('../types.js').Preset | string} [preset]  Preset or dataset id; defaults to the current one.
 * @param {Partial<import('../types.js').Frame>} [prev]     Previous frame; defaults to the one before `features`.
 */
export function describeFrame(features, preset = state.preset, prev) {
  const p = typeof preset === 'string' ? resolve(preset) : preset ?? state.preset;
  const before = prev ?? (features === state.lastInput ? state.prevFrame : state.frame);
  // Alarm phrase only when it is (or would be) heard: same hysteresis as the sound.
  const latest = features === state.lastInput && p.id === state.preset.id;
  const alarm = !state.alarmEnabled ? false : latest ? state.alarmOn : undefined;
  return describeText(features, p, before ?? undefined, state.ranges, { alarm });
}

/** True if this browser can record (MediaRecorder). */
export const isRecordingSupported = () => typeof MediaRecorder !== 'undefined';
/** True while a recording is running. */
export const isRecording = () => state.recorder !== null;

/** Start recording the master output (everything you hear). Calls init() if needed. */
export async function startRecording() {
  if (!state.ready) await init();
  if (state.recorder) throw new Error('Already recording');
  const recorder = new Tone.Recorder();
  state.graph.output.connect(recorder);
  await recorder.start();
  state.recorder = recorder;
}

/**
 * Stop recording. Resolves to the audio Blob (webm/opus in Chrome and
 * Firefox, mp4 in Safari; check blob.type), or null if nothing was recording.
 * The caller decides what to do with it, e.g. offer it as a download.
 */
export async function stopRecording() {
  const recorder = state.recorder;
  if (!recorder) return null;
  state.recorder = null;
  const blob = await recorder.stop();
  state.graph?.output.disconnect(recorder);
  recorder.dispose();
  return blob;
}

/** Stop everything and free all audio nodes. init() can be called again afterwards. */
export function dispose() {
  state.loadToken++;
  if (state.recorder) {
    state.recorder.dispose();
    state.recorder = null;
  }
  pause();
  state.stopPreview?.();
  state.stopPreview = null;
  teardownLayers();
  state.graph?.dispose();
  if (Tone) {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
  }
  Object.assign(state, {
    initPromise: null, ready: false, graph: null, builtKey: null, alarm: null,
    params: null, mode: undefined, alarmOn: false, frame: null, prevFrame: null, lastInput: null,
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Note for a normalized 0-1 value in explore mode and the legend. */
function probeMidi(v) {
  const scale = getScale(state.params?.scaleName ?? state.preset.scales.warm);
  return stepToMidi(quantizeStep(v, scale, 2), scale, state.preset.rootMidi + 12);
}

/** Map the latest frame (normalized) with the current preset and apply it. */
function remap(ramp) {
  const full = withDerived(state.frame ?? sanitizeFrame({}), state.preset);
  const p = mapFrame(normalizeFrame(full, state.ranges), state.preset, { mode: state.mode, alarm: state.alarmOn });
  state.mode = p.mode;
  state.alarmOn = p.alarm;
  state.params = p;
  if (state.ready && state.layers.length) applyParams(p, ramp);
  return p;
}

function buildPreset(preset) {
  const g = state.graph;
  const { reverb } = preset.mapping;
  if (g.reverb.decay !== reverb.decay) g.reverb.decay = reverb.decay;   // re-renders the impulse
  g.reverb.wet.rampTo(reverb.wet, 0.5);

  const specs = preset.layers.filter((spec) => !spec.switch || switchOn(spec.switch));
  const opts = { samples: state.sampled ? sampleBuffers : null };
  state.layers = specs.map((spec) => createLayer(spec, g, preset, () => state.params, opts));
  if (preset.alarm?.on) {
    state.alarm = createAlarm(g, preset);
    state.alarm.setEnabled(state.alarmEnabled);
    state.layers.push(state.alarm);
  }
  state.subdivision = preset.mapping.subdivisions[0];
  state.tickLoop = new Tone.Loop(onTick, state.subdivision).start(0);
  state.builtKey = buildKey(preset);

  // Re-map the latest frame with the new preset so the sound is right at once.
  remap(0.05);
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
  state.alarm = null;
  state.builtKey = null;
}

/** Switch names used by the preset's layers in its current mix. */
function switchNames(preset) {
  return [...new Set(preset.layers.map((spec) => spec.switch).filter(Boolean))];
}

/** Whether layer switch `name` is on: setSwitch() override, else the preset's setting. */
function switchOn(name) {
  return state.switchOverrides[name] ?? state.preset.switches?.[name] ?? true;
}

/** Identifies what is built: rebuild only when the preset, mix, a switch or the samples changed. */
function buildKey(preset) {
  const switches = switchNames(preset).map((n) => `${n}=${switchOn(n)}`);
  const samples = sampledKinds(preset).map((k) => `${k}=${state.sampled && sampleStatus(k) === 'ready'}`);
  return [preset.id, preset.mix, ...switches, ...samples].join('|');
}

/** Instrument kinds of the preset (current mix, switched-on layers) that have recorded samples. */
function sampledKinds(preset) {
  const kinds = preset.layers.filter((spec) => !spec.switch || switchOn(spec.switch)).map((spec) => spec.kind);
  return [...new Set(kinds)].filter((k) => k in SAMPLE_SETS);
}

function notifySamples() {
  const status = getSampleStatus();
  state.sampleListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      // a listener's error must not break the audio
    }
  });
}

/** Load the preset's recorded instruments (each set once; 8 s timeout, never throws). */
async function prepareSamples(preset) {
  const kinds = state.sampled ? sampledKinds(preset) : [];
  const loads = kinds.map((k) => loadSampleSet(k));   // marks them 'loading' straight away
  notifySamples();
  if (!loads.length) return;
  await Promise.all(loads);
  notifySamples();
}

/**
 * Rebuild the current preset's instruments if needed, with a quick fade so the
 * swap doesn't click. Samples load first; the old instruments keep playing meanwhile.
 */
async function rebuild() {
  if (state.initPromise) await state.initPromise.catch(() => {});
  if (!state.ready) return;
  const token = ++state.loadToken;
  await prepareSamples(state.preset);
  if (token !== state.loadToken || !state.ready) return;   // a newer call took over
  if (state.builtKey === buildKey(state.preset)) return;

  state.graph.fader.gain.rampTo(0, 0.08);
  await wait(100);
  if (token !== state.loadToken || !state.ready) return;   // a newer call took over

  teardownLayers();
  buildPreset(state.preset);
  state.graph.fader.gain.rampTo(1, 0.3);
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
  const trim = state.preset.mapping.trimDb ?? 0;   // per-preset loudness match
  g.layerIn.volume.rampTo(p.volumeDb + trim, ramp);
  g.dryIn.volume.rampTo(trim, ramp);
  g.filter.frequency.rampTo(p.filterHz, ramp);
  g.panner.pan.rampTo(p.pan, state.preset.mapping.panRamp ?? ramp);
  g.tremolo.wet.rampTo(p.tremoloDepth, ramp);
  g.tremolo.frequency.rampTo((p.bpm / 60) * 2, ramp);   // tremolo pulses in 8th notes
  rampTempo(p.bpm, ramp);
  if (state.tickLoop && p.subdivision !== state.subdivision) {
    state.tickLoop.interval = p.subdivision;
    state.subdivision = p.subdivision;
  }
  state.layers.forEach((l) => l.update?.(p, ramp));
}

/**
 * Ramp the transport tempo. Not bpm.rampTo(): on the transport's tick-counting
 * tempo, rampTo's cancel-and-hold adds events without tick counts, and
 * interrupting a long ramp (e.g. co2's 2.5 s) then made the clock throw
 * "Cannot read properties of undefined (reading 'time')". Cancel, hold the
 * current value and ramp linearly instead; tiny changes are skipped.
 */
function rampTempo(target, ramp) {
  const bpm = Tone.getTransport().bpm;
  const now = Tone.now();
  const current = bpm.getValueAtTime(now);
  if (Math.abs(target - current) < 0.25) return;
  bpm.cancelScheduledValues(now);
  bpm.setValueAtTime(current, now);
  bpm.linearRampToValueAtTime(target, now + Math.max(0.05, ramp));
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
