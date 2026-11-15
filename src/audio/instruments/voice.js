// Wordless voice: a buzzy source shaped by three vowel formant filters, the
// way a vocal tract shapes the vocal folds' buzz. Vowels only ("oo", "oh",
// "aa"), never words. Used by the vocal pad and the climate alarm.

import { Tone } from '../tone.js';
import { wrap } from './common.js';

/** Formant centre frequencies (Hz) and levels (dB) of a low choir voice. */
export const VOWELS = {
  oo: [[350, 0], [620, -14], [2700, -26]],
  oh: [[420, 0], [800, -9], [2600, -20]],
  aa: [[660, 0], [1100, -6], [2650, -14]],
};
const Q = [6, 8, 12];   // formant widths (higher = narrower)

/**
 * Three parallel band-pass filters. With two vowels the formants glide
 * slowly back and forth between them (one round trip every `period` seconds),
 * or, with period 0, only when morph() is called (e.g. in step with a melody).
 * @param {string[]} vowels  One or two keys of VOWELS.
 * @param {number} [period]
 */
export function formantBank(vowels = ['oo'], period = 24) {
  const [a, b = a] = vowels.map((v) => VOWELS[v] ?? VOWELS.oo);
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const nodes = [input, output];
  const filters = [];
  for (let i = 0; i < 3; i++) {
    const level = (a[i][1] + b[i][1]) / 2;
    const gain = new Tone.Volume(level).connect(output);
    const filter = new Tone.Filter({ type: 'bandpass', frequency: a[i][0], Q: Q[i] }).connect(gain);
    input.connect(filter);
    nodes.push(gain, filter);
    filters.push(filter);
    if (b !== a && period > 0) {
      const lfo = new Tone.LFO({ frequency: 1 / period, min: a[i][0], max: b[i][0], phase: 270 })
        .connect(filter.frequency).start();
      nodes.push(lfo);
    }
  }
  return {
    input,
    output,
    /** Glide the formants to `amount` of the way from the first vowel to the second (0-1). */
    morph(amount, time, duration) {
      filters.forEach((f, i) => {
        f.frequency.setValueAtTime(f.frequency.getValueAtTime(time), time);
        f.frequency.exponentialRampToValueAtTime(a[i][0] * (b[i][0] / a[i][0]) ** amount, time + duration);
      });
    },
    dispose: () => nodes.forEach((n) => n.dispose()),
  };
}

export const voice = {
  /**
   * Vocal pad: a soft wordless choir, slowly morphing between two vowels.
   * @param {{vowels?: string[]}} [spec]
   */
  vocal: (spec = {}) => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      oscillator: { type: 'fatsawtooth', count: 3, spread: 14 },
      envelope: { attack: 1.4, decay: 0.5, sustain: 0.9, release: 2.5 },
    });
    const vibrato = new Tone.Vibrato({ frequency: 4.6, depth: 0.12 });
    const bank = formantBank(spec.vowels ?? ['oo', 'oh']);
    const level = new Tone.Volume(17);
    synth.chain(vibrato, bank.input);
    bank.output.connect(level);
    const inst = wrap(synth);
    return {
      ...inst,
      output: level,
      dispose() {
        inst.dispose();
        vibrato.dispose();
        bank.dispose();
        level.dispose();
      },
    };
  },
};
