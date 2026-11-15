// Short plain-language sentences for ARIA live regions and the audio legend.
// Pure, no Tone.js.

import { sanitizeFrame, withDerived, alarmState } from './mapping.js';
import { normalizeFrame } from './normalize.js';
import { getScale, quantizeStep } from '../scales.js';

const LEVELS = ['very low', 'low', 'medium', 'high', 'very high'];

/** 0-1 -> 'very low' ... 'very high' (or a preset's own five words). */
export function levelWord(v, words = LEVELS) {
  return words[Math.min(words.length - 1, Math.max(0, Math.floor(v * words.length)))];
}

/** -1..1 -> 'panned far left' ... 'centred' ... 'panned far right'. */
export function panWord(pan) {
  if (pan <= -0.6) return 'panned far left';
  if (pan <= -0.2) return 'panned left';
  if (pan >= 0.6) return 'panned far right';
  if (pan >= 0.2) return 'panned right';
  return 'centred';
}

/**
 * e.g. "year 2016, medium night light, rising pitch, centred".
 *
 * Words describe what you hear, so they use the same normalized values as the
 * sound mapping: "high" means high for this dataset (relative to its ranges),
 * and the pitch trend compares the actual scale steps played. Without ranges
 * the raw values are used. Counts (flashes) and pan are never rescaled.
 *
 * Presets can tune the wording with `describe`:
 *   field       which (possibly derived) field the level word describes (default 'value')
 *   levels      five words/phrases from lowest to highest (default 'very low' ... 'very high'
 *               followed by valueLabel)
 *   prefix      (frame, seconds) => string | null, e.g. 'year 2016' or 'over Africa'
 *   motionWord  phrase for fast change (default 'changing fast'; null = never said)
 *   flashWords  [singular, plural] noun for `flashes` (default ['flash', 'flashes'])
 *
 * @param {Partial<import('../types.js').Frame>} features
 * @param {import('../types.js').Preset} preset
 * @param {Partial<import('../types.js').Frame>} [prev]  Previous frame, for the pitch trend.
 * @param {import('../types.js').Ranges | null} [ranges]  The dataset's ranges (analyzeRanges).
 * @param {{alarm?: boolean}} [opts]  alarm: whether the climate alarm is sounding for this
 *   frame (the engine knows its hysteresis); if omitted, the preset's threshold decides.
 *   Adds e.g. "alarm: highest carbon dioxide in view" at the end.
 */
export function describeFrame(features, preset, prev, ranges, opts = {}) {
  const cfg = preset?.describe ?? {};
  const raw = sanitizeFrame(features);
  const f = normalizeFrame(withDerived(raw, preset), ranges ?? null);
  const parts = [];

  const seconds = raw.t / (ranges?.fps || 2);
  const prefix = cfg.prefix?.(raw, seconds);
  if (prefix) parts.push(prefix);

  const level = f[cfg.field ?? 'value'] ?? f.value;
  parts.push(cfg.levels ? levelWord(level, cfg.levels) : `${levelWord(level)} ${preset?.valueLabel ?? 'value'}`);

  if (prev && typeof prev.value === 'number') {
    const before = normalizeFrame(withDerived(sanitizeFrame(prev), preset), ranges ?? null);
    const d = pitchStep(f, preset) - pitchStep(before, preset);
    parts.push(d > 0 ? 'rising pitch' : d < 0 ? 'falling pitch' : 'steady pitch');
  }
  parts.push(panWord(f.pan));
  if (f.flashes > 0) {
    const [one, many] = cfg.flashWords ?? ['flash', 'flashes'];
    parts.push(f.flashes === 1 ? `1 ${one}` : `${f.flashes} ${many}`);
  }
  const motionWord = cfg.motionWord === undefined ? 'changing fast' : cfg.motionWord;
  if (motionWord && f.motion > 0.75) parts.push(motionWord);   // top quarter of this dataset's motion

  const alarm = opts.alarm ?? alarmState(f, preset?.alarm);
  if (alarm && preset?.alarm?.on) parts.push(preset.alarm.words ?? `alarm: very high ${preset.valueLabel ?? 'value'}`);

  return parts.join(', ');
}

/** Scale step the mapping would play for a (normalized) frame. */
function pitchStep(f, preset) {
  const field = preset?.sources?.pitch ?? 'value';
  const weight = preset?.weights?.[field] ?? 1;
  const v = Math.min(1, Math.max(0, (f[field] ?? 0) * weight));
  return quantizeStep(v, getScale(preset?.scales?.warm), preset?.octaves ?? 2);
}

/**
 * Text version of the audio legend (playLegend), e.g. "Low notes mean cooler
 * water, high notes mean warmer water. ..."
 * @param {import('../types.js').Preset} preset
 * @param {{alarm?: boolean}} [opts]  alarm: false = the user turned the alarm off (no alarm sentence).
 */
export function legendText(preset, { alarm = true } = {}) {
  const label = preset?.valueLabel ?? 'value';
  const low = preset?.valueWords?.low ?? `lower ${label}`;
  const high = preset?.valueWords?.high ?? `higher ${label}`;
  const parts = [
    `Low notes mean ${low}, high notes mean ${high}.`,
    preset?.legendPan ?? 'Sounds on the left come from the west of the map, sounds on the right from the east.',
  ];
  if (preset?.legendExtra) parts.push(preset.legendExtra);
  if (alarm && preset?.alarm?.on && preset.alarm.legend) parts.push(preset.alarm.legend);
  if (preset?.emptyLabel) parts.push(`In explore mode, a soft tick means ${preset.emptyLabel}.`);
  return parts.join(' ');
}
