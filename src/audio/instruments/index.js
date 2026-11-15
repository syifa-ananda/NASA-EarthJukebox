// Instrument registry. Layer specs pick an instrument by `kind`.
//
//   electronic: pluck, bell, pad, thunder, knock, crackle (and the 'drone' role)
//   acoustic and world: harp, piano, strings, angklung, marimba, vocal,
//                       handDrums, frameDrum, logDrum (and the 'overtone' drone)
//
// All are synthesized, except strings and piano, which use recorded samples
// (VSCO 2 CE, CC0, served from vendor/samples/) once they have loaded and fall
// back to their synth versions otherwise. Neutral names on purpose: these are
// inspired by instruments from many places, not copies of any tradition.

import { electronic } from './electronic.js';
import { acoustic } from './acoustic.js';
import { percussion } from './percussion.js';
import { voice } from './voice.js';
import { sampled } from './sampled.js';

const KINDS = { ...electronic, ...acoustic, ...percussion, ...voice };

/** Plain-language names, e.g. for a UI listing the instruments of a preset. */
export const INSTRUMENT_NAMES = {
  pluck: 'synth pluck', bell: 'synth bells', pad: 'synth pad', drone: 'synth drone',
  thunder: 'synth thunder', knock: 'synth knock', crackle: 'noise crackle',
  harp: 'harp', piano: 'soft piano', strings: 'strings', angklung: 'angklung', marimba: 'marimba bass',
  vocal: 'wordless vocal pad', handDrums: 'hand drums', frameDrum: 'frame drum',
  logDrum: 'log drum', overtone: 'overtone drone',
};

/** Kinds that have a sampled version. */
export const SAMPLED_KINDS = Object.keys(sampled);

/**
 * @param {string} kind
 * @param {import('../types.js').LayerSpec} [spec]  Passed through for options (e.g. vowels).
 * @param {{samples?: ((kind: string) => Record<string, AudioBuffer> | null) | null}} [opts]
 *   samples: returns the decoded notes of a kind, or null to use the synth version.
 */
export function createInstrument(kind, spec, opts = {}) {
  const buffers = sampled[kind] ? opts.samples?.(kind) : null;
  if (buffers) return sampled[kind](buffers);
  const make = KINDS[kind];
  if (!make) throw new Error(`Unknown instrument kind "${kind}"`);
  return make(spec);
}
