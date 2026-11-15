// Instrument registry. Layer specs pick an instrument by `kind`.
//
//   electronic: pluck, bell, pad, thunder, knock, crackle (and the 'drone' role)
//   acoustic and world: harp, piano, strings, angklung, marimba, vocal,
//                       handDrums, frameDrum, logDrum (and the 'overtone' drone)
//
// All are synthesized; nothing is downloaded. Neutral names on purpose: these
// are inspired by instruments from many places, not copies of any tradition.

import { electronic } from './electronic.js';
import { acoustic } from './acoustic.js';
import { percussion } from './percussion.js';
import { voice } from './voice.js';

const KINDS = { ...electronic, ...acoustic, ...percussion, ...voice };

/** Plain-language names, e.g. for a UI listing the instruments of a preset. */
export const INSTRUMENT_NAMES = {
  pluck: 'synth pluck', bell: 'synth bells', pad: 'synth pad', drone: 'synth drone',
  thunder: 'synth thunder', knock: 'synth knock', crackle: 'noise crackle',
  harp: 'harp', piano: 'soft piano', strings: 'strings', angklung: 'angklung', marimba: 'marimba bass',
  vocal: 'wordless vocal pad', handDrums: 'hand drums', frameDrum: 'frame drum',
  logDrum: 'log drum', overtone: 'overtone drone',
};

/**
 * @param {string} kind
 * @param {import('../types.js').LayerSpec} [spec]  Passed through for options (e.g. vowels).
 */
export function createInstrument(kind, spec) {
  const make = KINDS[kind];
  if (!make) throw new Error(`Unknown instrument kind "${kind}"`);
  return make(spec);
}
