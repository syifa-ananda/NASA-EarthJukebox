// Electronic mix: the original synth sounds (the sound before Phase 2).
// Each kind's `volume` is trimmed so all kinds peak at roughly the same level;
// layer volumes in presets are then relative mixes on equal footing.

import { Tone } from '../tone.js';
import { wrap } from './common.js';

export const electronic = {
  /** Soft plucked synth (triangle). */
  pluck: () => wrap(new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 16,
    volume: 3,
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.8 },
  })),

  /** FM bell (modulation kept moderate so loud, busy passages don't turn harsh). */
  bell: () => wrap(new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 16,
    volume: 9,
    harmonicity: 3.01,
    modulationIndex: 8,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
  })),

  /** Slow FM pad. */
  pad: () => wrap(new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 16,
    volume: 10,
    harmonicity: 2,
    modulationIndex: 1.5,
    oscillator: { type: 'triangle' },
    envelope: { attack: 1.2, decay: 0.6, sustain: 0.8, release: 3 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 1.5, decay: 0.5, sustain: 0.6, release: 3 },
  })),

  /** Deep thump with a falling pitch. */
  thunder: () => wrap(new Tone.MembraneSynth({
    pitchDecay: 0.15,
    octaves: 4,
    envelope: { attack: 0.002, decay: 1.0, sustain: 0, release: 1.2 },
  })),

  /** Short knock. */
  knock: () => wrap(new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
  })),

  /** Noise crackle (unpitched). */
  crackle: () => wrap(new Tone.NoiseSynth({
    volume: 9,
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
  }), { unpitched: true, hitLength: '16n' }),
};
