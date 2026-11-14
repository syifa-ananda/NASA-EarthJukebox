// Short plain-language sentences for ARIA live regions. Pure, no Tone.js.

import { sanitizeFrame } from './mapping.js';

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
 * @param {Partial<import('../types.js').Frame>} features
 * @param {import('../types.js').Preset} preset
 * @param {Partial<import('../types.js').Frame>} [prev]  Previous frame, for the pitch trend.
 */
export function describeFrame(features, preset, prev) {
  const f = sanitizeFrame(features);
  const parts = [`${levelWord(f.value)} ${preset?.valueLabel ?? 'value'}`];

  if (prev && typeof prev.value === 'number') {
    const d = f.value - prev.value;
    parts.push(d > 0.01 ? 'rising pitch' : d < -0.01 ? 'falling pitch' : 'steady pitch');
  }
  parts.push(panWord(f.pan));
  if (f.flashes > 0) parts.push(f.flashes === 1 ? '1 flash' : `${f.flashes} flashes`);
  if (f.motion > 0.5) parts.push('changing fast');

  return parts.join(', ');
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
