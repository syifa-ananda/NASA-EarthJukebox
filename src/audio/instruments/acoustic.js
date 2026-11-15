// Acoustic-style instruments, all synthesized (no samples yet):
// harp, piano (soft synth keys until Phase 3 samples), strings and angklung.

import { Tone } from '../tone.js';
import { midiToHz } from '../scales.js';
import { wrap, seconds } from './common.js';

export const acoustic = {
  /**
   * Harp: bright pluck that mellows as it rings (the filter closes faster
   * than the note fades, like a real string). Chords are strummed.
   */
  harp: () => wrap(new Tone.PolySynth(Tone.MonoSynth, {
    maxPolyphony: 24,
    volume: -1,
    oscillator: { type: 'custom', partials: [1, 0.55, 0.3, 0.18, 0.1, 0.06] },
    envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 1.4 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: {
      attack: 0.001, decay: 0.35, sustain: 0.25, release: 1,
      baseFrequency: 900, octaves: 2.6, exponent: 2,
    },
  }), { strum: 0.03 }),

  /** Soft keys: FM tone with a bright hammer attack that fades to a round note. */
  piano: () => wrap(new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 24,
    volume: 7,
    harmonicity: 1,
    modulationIndex: 3.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.002, decay: 2.8, sustain: 0, release: 0.9 },
    modulationEnvelope: { attack: 0.002, decay: 0.45, sustain: 0.08, release: 0.5 },
  })),

  /** Strings: long bowed notes, slow attack, gentle vibrato. */
  strings: () => wrap(new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 16,
    volume: 4,
    oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
    envelope: { attack: 0.9, decay: 0.4, sustain: 0.85, release: 2.2 },
  }), {
    chain: [
      new Tone.Vibrato({ frequency: 5.2, depth: 0.15 }),
      new Tone.Filter({ type: 'highpass', frequency: 110, Q: 0.5 }),
      new Tone.Filter({ type: 'lowpass', frequency: 2600, Q: 0.5, rolloff: -24 }),
    ],
  }),

  /**
   * Marimba-style wooden bass: a warm bar tone plus its overtone exactly two
   * octaves up (marimba bars are tuned so it lands on 4x the fundamental, so
   * it stays in tune with the scale), and a soft mallet touch.
   */
  marimba: () => {
    const out = new Tone.Volume(0);
    const bar = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.003, decay: 1.2, sustain: 0, release: 0.3 },
    }).connect(out);
    const overtone = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.1 },
    }).connect(out);
    const malletFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 0.5 }).connect(out);
    const mallet = new Tone.NoiseSynth({
      noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.01 },
    }).connect(malletFilter);
    let lastMallet = -1;
    return {
      output: out,
      hitLength: '2n',
      play(midi, duration, time, velocity) {
        for (const m of Array.isArray(midi) ? midi : [midi]) {
          const hz = midiToHz(m);
          bar.triggerAttackRelease(hz, 1.2, time, velocity);
          overtone.triggerAttackRelease(hz * 4, 0.18, time, velocity * 0.25);
        }
        if (time > lastMallet) {          // the noise burst is one voice: strictly increasing times
          lastMallet = time;
          mallet.triggerAttackRelease(0.01, time, velocity * 0.12);
        }
      },
      releaseAll() {},
      dispose() {
        [bar, overtone, mallet, malletFilter, out].forEach((n) => n.dispose());
      },
    };
  },

  /**
   * Angklung (Indonesian bamboo): each note sounds two tubes an octave apart,
   * shaken: a quick fading rattle of 3-8 hits instead of one note.
   * Traditional angklung is pentatonic, like every scale here.
   */
  angklung: () => {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      maxPolyphony: 64,
      volume: 9,
      harmonicity: 3,
      modulationIndex: 5,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.004, decay: 0.22, sustain: 0, release: 0.08 },
      modulationEnvelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.03 },
    });
    const RATTLE = 0.058;   // seconds between shakes (about 17 per second)
    const inst = wrap(synth);
    return {
      ...inst,
      play(midi, duration, time, velocity) {
        const notes = Array.isArray(midi) ? midi : [midi];
        const shakes = Math.min(8, Math.max(3, Math.round(seconds(duration) / RATTLE)));
        for (let k = 0; k < shakes; k++) {
          const t = time + k * RATTLE + (k ? (Math.random() - 0.5) * 0.012 : 0);
          const v = velocity * 0.8 ** k;
          for (const m of notes) {
            const hz = midiToHz(m);
            synth.triggerAttackRelease(hz, 0.06, t, v);             // main tube
            synth.triggerAttackRelease(hz * 2, 0.06, t, v * 0.45);  // small tube, an octave up
          }
        }
      },
    };
  },
};
