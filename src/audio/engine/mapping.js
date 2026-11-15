// Frame -> sound parameters. Pure functions (no Tone.js), so they can be
// tested in Node and reused by the UI.

import { getScale, quantizeStep, chordFromStep } from '../scales.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = ([a, b], t) => a + (b - a) * t;
// Exponential interpolation, so a filter sweep sounds even to the ear.
const expLerp = ([a, b], t) => a * (b / a) ** t;
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const MODE_HYSTERESIS = 0.05;   // stops the key flipping back and forth on noisy frames
const ALARM_HYSTERESIS = 0.05;  // default: the alarm turns off 0.05 below its threshold

const CONTRACT_KEYS = new Set(['t', 'brightness', 'warmth', 'density', 'pan', 'motion', 'flashes', 'value', 'grid']);

/**
 * Fill missing fields with neutral values and clamp everything to the
 * contract's ranges, so a half-filled object never breaks the audio. Extra
 * numeric fields (a preset's derived fields) are kept as they are.
 * @param {Partial<import('../types.js').Frame>} f
 * @returns {import('../types.js').Frame}
 */
export function sanitizeFrame(f = {}) {
  const extra = {};
  for (const [k, v] of Object.entries(f ?? {})) {
    if (!CONTRACT_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v)) extra[k] = v;
  }
  return {
    ...extra,
    t: num(f.t, 0),
    brightness: clamp(num(f.brightness, 0.5), 0, 1),
    warmth: clamp(num(f.warmth, 0.5), 0, 1),
    density: clamp(num(f.density, 0.5), 0, 1),
    pan: clamp(num(f.pan, 0), -1, 1),
    motion: clamp(num(f.motion, 0), 0, 1),
    flashes: clamp(Math.round(num(f.flashes, 0)), 0, 16),
    value: clamp(num(f.value, 0.5), 0, 1),
    grid: Array.isArray(f.grid) ? f.grid : null,
  };
}

/**
 * Frame plus the preset's derived fields (e.g. sst's `seasons`, computed from
 * the grid). Presets without `derive` get the frame back unchanged.
 */
export function withDerived(frame, preset) {
  return preset?.derive ? { ...frame, ...preset.derive(frame) } : frame;
}

/** Numeric fields of a (normalized) frame, for layers that react to one field (markers). */
function levelsOf(f) {
  const out = {};
  for (const [k, v] of Object.entries(f)) if (typeof v === 'number') out[k] = v;
  return out;
}

/**
 * True when the preset's alarm field is in its top zone: on at `threshold`,
 * off again only below `threshold - hysteresis`, so it doesn't flicker.
 * Always false when the preset's alarm is off.
 */
export function alarmState(f, alarm, wasOn = false) {
  if (!alarm?.on) return false;
  const v = clamp(num(f[alarm.field ?? 'value'], 0), 0, 1);
  return wasOn ? v >= alarm.threshold - (alarm.hysteresis ?? ALARM_HYSTERESIS) : v >= alarm.threshold;
}

/**
 * Compute sound parameters for one frame.
 * @param {Partial<import('../types.js').Frame>} frame
 * @param {import('../types.js').Preset} preset   A resolved preset (getPreset()).
 * @param {{mode?: 'warm'|'cool', alarm?: boolean} | 'warm' | 'cool'} [prev]
 *   The previous frame's mode and alarm state, for hysteresis (or just its mode).
 * @returns {import('../types.js').SoundParams}
 */
export function mapFrame(frame, preset, prev) {
  const f = sanitizeFrame(frame);
  const prevMode = typeof prev === 'string' ? prev : prev?.mode;
  const { weights: w, sources: src, mapping: m } = preset;

  // Weighted 0-1 value of the field that drives sound parameter `param`.
  const drive = (param) => {
    const field = src[param];
    return clamp(f[field] * (w[field] ?? 1), 0, 1);
  };

  // Mode: warm (major) vs cool (minor), with hysteresis around the threshold.
  const modeIn = drive('mode');
  const th = m.modeThreshold;
  const mode = prevMode === 'warm'
    ? (modeIn < th - MODE_HYSTERESIS ? 'cool' : 'warm')
    : prevMode === 'cool'
      ? (modeIn > th + MODE_HYSTERESIS ? 'warm' : 'cool')
      : (modeIn >= th ? 'warm' : 'cool');
  const scaleName = preset.scales[mode];
  const scale = getScale(scaleName);

  // Pitch and chord, always on the scale.
  const voices = 1 + Math.round(drive('voices') * (m.maxVoices - 1));
  const pitchIndex = quantizeStep(drive('pitch'), scale, preset.octaves);
  const chord = chordFromStep(pitchIndex, voices, scale, preset.rootMidi);

  // Note rate: pick a subdivision, slow -> fast.
  const rate = drive('rate');
  const subs = m.subdivisions;
  const subdivision = subs[Math.min(subs.length - 1, Math.floor(rate * subs.length))];

  // Tension fades in between mapping.tension[0] and [1].
  const [t0, t1] = m.tension;
  const tension = clamp((drive('tension') - t0) / (t1 - t0), 0, 1);

  const loud = drive('loudness');
  return {
    alarm: alarmState(f, preset.alarm, typeof prev === 'object' && prev ? prev.alarm : false),
    mode,
    scaleName,
    volumeDb: lerp(m.volumeDb, loud),
    // Warm frames open the filter a little more (brighter timbre).
    filterHz: expLerp(m.filterHz, drive('cutoff')) * (0.75 + 0.5 * drive('timbre')),
    pan: clamp(f.pan * (w.pan ?? 1) * m.panWidth, -1, 1),
    bpm: lerp(m.bpm, drive('tempo')),
    tremoloDepth: lerp(m.tremolo, drive('tremolo')),
    subdivision,
    noteChance: lerp(m.noteChance, rate),
    voices,
    pitchIndex,
    chord,
    swell: drive('swell'),
    tension,
    hits: Math.min(m.maxHits, Math.round(f.flashes * (w.flashes ?? 1))),
    velocity: 0.45 + 0.45 * loud,
    levels: levelsOf(f),
  };
}
