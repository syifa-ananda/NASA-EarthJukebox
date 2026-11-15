// Sampled strings and piano (Tone.Sampler over the decoded VSCO 2 CE notes,
// see engine/samples.js). Used only when the samples loaded; otherwise
// instruments/index.js picks the synth versions in acoustic.js.

import { Tone } from '../tone.js';
import { wrap } from './common.js';

/**
 * Fresh Tone buffers around the shared decoded audio: a Sampler disposes its
 * buffers, so every instrument gets its own wrappers.
 */
const wrapBuffers = (raw) => Object.fromEntries(Object.entries(raw).map(([note, b]) => [note, new Tone.ToneAudioBuffer(b)]));

export const sampled = {
  /** Solo violin (cello section below G3): soft bowed notes; a short attack keeps chord entries gentle. */
  strings: (buffers) => wrap(new Tone.Sampler({
    urls: wrapBuffers(buffers), attack: 0.2, release: 1.4, volume: 11.5,   // same loudness as the synth strings
  })),

  /** Soft upright piano. */
  piano: (buffers) => wrap(new Tone.Sampler({
    urls: wrapBuffers(buffers), release: 0.9, volume: 6,   // same loudness as the synth piano
  })),
};
