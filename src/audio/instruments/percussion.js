// World percussion, synthesized to behave like real drums:
//   - the drumhead rings in a few "modes" at inharmonic ratios (1, 1.59, 2.14 ...,
//     like a real circular membrane), each with its own natural decay;
//   - the pitch drops a little right after the hit (the head is stretched
//     tighter at the moment of impact);
//   - a short filtered noise burst is the hand (or mallet) hitting the skin;
//   - every hit varies slightly in pitch, loudness, decay and skin brightness,
//     like a player's hand.
// All are tuned: the pitch they get is a note of the preset's scale.

import { Tone } from '../tone.js';
import { midiToHz } from '../scales.js';

/** 1 +/- amount, at random. */
const vary = (amount) => 1 + (Math.random() * 2 - 1) * amount;
const MAX_MODES = 3;

/**
 * One drum voice: up to three membrane modes plus a skin noise burst.
 * A stroke describes how it is played:
 *   modes     [[ratio, gain, decay seconds], ...]
 *   drop      semitones the pitch falls from at the hit, over dropTime seconds
 *   bend      optional semitones the pitch rises afterwards (talking drum)
 *   attack    seconds (a soft hand is a little slower than a stick)
 *   skin      { freq, q, decay, gain } of the noise burst
 */
function drumVoice(out) {
  const modes = Array.from({ length: MAX_MODES }, () => new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
  }).connect(out));
  const skinFilter = new Tone.Filter({ type: 'bandpass', frequency: 2000, Q: 1 }).connect(out);
  const skin = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
  }).connect(skinFilter);

  return {
    strike(stroke, hz, time, velocity) {
      const pitch = hz * vary(0.025);
      const vel = Math.min(1, velocity * vary(0.1));
      stroke.modes.slice(0, MAX_MODES).forEach(([ratio, gain, decay], i) => {
        const synth = modes[i];
        const f = pitch * ratio;
        const d = decay * vary(0.12);
        synth.envelope.attack = stroke.attack ?? 0.001;
        synth.envelope.decay = d;
        synth.triggerAttackRelease(f, d, time, vel * gain);
        const fq = synth.frequency;
        fq.cancelScheduledValues(time);
        fq.setValueAtTime(f * 2 ** (stroke.drop / 12), time);
        fq.exponentialRampToValueAtTime(f, time + stroke.dropTime);
        if (stroke.bend) fq.exponentialRampToValueAtTime(f * 2 ** (stroke.bend / 12), time + stroke.dropTime + 0.2);
      });
      const s = stroke.skin;
      skinFilter.frequency.setValueAtTime(s.freq * vary(0.15), time);
      skinFilter.Q.setValueAtTime(s.q, time);
      skin.envelope.decay = s.decay * vary(0.2);
      skin.triggerAttackRelease(s.decay, time, vel * s.gain);
    },
    dispose() {
      modes.forEach((m) => m.dispose());
      skin.dispose();
      skinFilter.dispose();
    },
  };
}

/**
 * A drum with a few voices (so hits can overlap) and a set of strokes.
 * `pick()` chooses the stroke for each hit; `pitchOf` sets its pitch ratio.
 */
function drum({ volume, voices = 4, strokes, pick, hitLength = '8n' }) {
  const out = new Tone.Volume(volume);
  const pool = Array.from({ length: voices }, () => drumVoice(out));
  const lastTime = pool.map(() => -1);
  let next = 0;
  return {
    output: out,
    hitLength,
    play(midi, duration, time, velocity) {
      const name = pick();
      const stroke = strokes[name];
      // Round robin, but a voice never gets a time earlier than its last one.
      let i = next;
      for (let k = 0; k < voices && lastTime[i] >= time; k++) i = (i + 1) % voices;
      if (lastTime[i] >= time) return;           // all voices busy at this instant: skip
      next = (i + 1) % voices;
      lastTime[i] = time;
      const hz = midiToHz(Array.isArray(midi) ? midi[0] : midi) * (stroke.pitch ?? 1);
      pool[i].strike(stroke, hz, time, velocity);
    },
    releaseAll() {},
    dispose() {
      pool.forEach((v) => v.dispose());
      out.dispose();
    },
  };
}

/** Pick a key of `weights` at random, in proportion to its weight. */
function weighted(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return () => {
    let r = Math.random() * total;
    for (const [name, w] of entries) if ((r -= w) < 0) return name;
    return entries[0][0];
  };
}

export const percussion = {
  /**
   * Hand drums, played like a goblet drum: bass (open, low, centre of the
   * head), tone (higher, ringing, near the rim), slap (sharp, bright skin) and
   * now and then a talking stroke whose pitch bends up after the hit.
   */
  handDrums: () => drum({
    volume: 0,
    voices: 6,
    pick: weighted({ bass: 0.38, tone: 0.34, slap: 0.2, talk: 0.08 }),
    strokes: {
      bass: {
        pitch: 1, modes: [[1, 1, 0.32], [1.59, 0.22, 0.1]], drop: 3, dropTime: 0.035, attack: 0.002,
        skin: { freq: 700, q: 0.8, decay: 0.025, gain: 0.25 },
      },
      tone: {
        pitch: 2.3, modes: [[1, 1, 0.16], [1.59, 0.45, 0.07], [2.14, 0.2, 0.04]], drop: 1.5, dropTime: 0.02,
        skin: { freq: 1800, q: 1, decay: 0.03, gain: 0.45 },
      },
      slap: {
        pitch: 3, modes: [[1, 0.35, 0.05], [1.59, 0.3, 0.04], [2.65, 0.2, 0.03]], drop: 1, dropTime: 0.01,
        skin: { freq: 3200, q: 0.9, decay: 0.06, gain: 1 },
      },
      talk: {
        pitch: 1.6, modes: [[1, 1, 0.35], [1.59, 0.3, 0.12]], drop: 1, dropTime: 0.02, bend: 3,
        skin: { freq: 1500, q: 1, decay: 0.02, gain: 0.3 },
      },
    },
  }),

  /** Frame drum: a large, low drum played with the hand: deep, soft boom with a long ring. */
  frameDrum: () => drum({
    volume: -1,
    voices: 3,
    hitLength: '4n',
    pick: () => 'open',
    strokes: {
      open: {
        modes: [[1, 1, 0.7], [1.59, 0.3, 0.25], [2.14, 0.12, 0.12]], drop: 1.2, dropTime: 0.05, attack: 0.004,
        skin: { freq: 500, q: 0.7, decay: 0.05, gain: 0.2 },
      },
    },
  }),

  /** Log drum (slit drum): a wooden "tok" with a short inharmonic ring and a mallet click. */
  logDrum: () => drum({
    volume: -1,
    voices: 2,
    pick: () => 'tok',
    strokes: {
      tok: {
        modes: [[1, 1, 0.32], [2.76, 0.25, 0.06], [5.4, 0.08, 0.02]], drop: 0.3, dropTime: 0.005,
        skin: { freq: 1200, q: 2, decay: 0.008, gain: 0.35 },
      },
    },
  }),

};
