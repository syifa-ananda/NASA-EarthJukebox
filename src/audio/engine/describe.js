// Short plain-language sentences for ARIA live regions. Pure, no Tone.js.

import { sanitizeFrame } from './mapping.js';
import { normalizeFrame } from './normalize.js';
import { getScale, quantizeStep } from '../scales.js';

const LEVELS = ['very low', 'low', 'medium', 'high', 'very high'];

/** 0-1 -> 'very low' ... 'very high'. */
export function levelWord(v) {
  return LEVELS[Math.min(LEVELS.length - 1, Math.floor(v * LEVELS.length))];
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
 * e.g. "high water temperature, rising pitch, panned left".
 *
 * Words describe what you hear, so they use the same normalized values as the
 * sound mapping: "high" means high for this dataset (relative to its ranges),
 * and the pitch trend compares the actual scale steps played. Without ranges
 * the raw 0-1 values are used. Counts (flashes) and pan are never rescaled.
 *
 * @param {Partial<import('../types.js').Frame>} features
 * @param {import('../types.js').Preset} preset
 * @param {Partial<import('../types.js').Frame>} [prev]  Previous frame, for the pitch trend.
 * @param {import('../types.js').Ranges | null} [ranges]  The dataset's ranges (analyzeRanges).
 */
export function describeFrame(features, preset, prev, ranges) {
  const f = normalizeFrame(sanitizeFrame(features), ranges ?? null);
  const parts = [`${levelWord(f.value)} ${preset?.valueLabel ?? 'value'}`];

  if (prev && typeof prev.value === 'number') {
    const before = normalizeFrame(sanitizeFrame(prev), ranges ?? null);
    const d = pitchStep(f, preset) - pitchStep(before, preset);
    parts.push(d > 0 ? 'rising pitch' : d < 0 ? 'falling pitch' : 'steady pitch');
  }
  parts.push(panWord(f.pan));
  if (f.flashes > 0) parts.push(f.flashes === 1 ? '1 flash' : `${f.flashes} flashes`);
  if (f.motion > 0.75) parts.push('changing fast');   // top quarter of this dataset's motion

  return parts.join(', ');
}

/** Scale step the mapping would play for a (normalized) frame. */
function pitchStep(f, preset) {
  const field = preset?.sources?.pitch ?? 'value';
  const weight = preset?.weights?.[field] ?? 1;
  const v = Math.min(1, Math.max(0, f[field] * weight));
  return quantizeStep(v, getScale(preset?.scales?.warm), preset?.octaves ?? 2);
}

/**
 * Text version of the audio legend (playLegend), e.g. "Low notes mean cooler
 * water, high notes mean warmer water. ..."
 * @param {import('../types.js').Preset} preset
 */
export function legendText(preset) {
  const label = preset?.valueLabel ?? 'value';
  const low = preset?.valueWords?.low ?? `lower ${label}`;
  const high = preset?.valueWords?.high ?? `higher ${label}`;
  const parts = [
    `Low notes mean ${low}, high notes mean ${high}.`,
    'Sounds on the left come from the west of the map, sounds on the right from the east.',
  ];
  if (preset?.legendExtra) parts.push(preset.legendExtra);
  return parts.join(' ');
}
