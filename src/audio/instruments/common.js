// Shared helpers for instruments. Every instrument kind returns the same small
// object, so layers can use any kind in any role:
//
//   output                          Tone node to connect (the layer's volume)
//   play(midi, duration, time, vel) one note; `midi` can be an array (a chord)
//   releaseAll()                    stop held notes (pause)
//   dispose()                       free every Tone node it created
//   hitLength                       default note length when used for percussion
//
// Tone.js is loaded by init() before any instrument is created.

import { Tone } from '../tone.js';
import { midiToHz } from '../scales.js';

export const toHz = (midi) => (Array.isArray(midi) ? midi.map(midiToHz) : midiToHz(midi));

/**
 * Wrap a Tone synth (optionally followed by effect nodes) as an instrument.
 * @param {any} synth
 * @param {object} [options]
 * @param {any[]} [options.chain]      Nodes after the synth, in order.
 * @param {boolean} [options.unpitched] NoiseSynth: no note argument.
 * @param {number} [options.strum]     Seconds between chord notes (plucked kinds).
 * @param {string} [options.hitLength]
 */
export function wrap(synth, { chain = [], unpitched = false, strum = 0, hitLength = '8n' } = {}) {
  if (chain.length) synth.chain(...chain);
  return {
    output: chain.at(-1) ?? synth,
    hitLength,
    play(midi, duration, time, velocity) {
      if (unpitched) {
        synth.triggerAttackRelease(duration, time, velocity);
      } else if (strum && Array.isArray(midi)) {
        midi.forEach((m, i) => synth.triggerAttackRelease(midiToHz(m), duration, time + i * strum, velocity));
      } else {
        synth.triggerAttackRelease(toHz(midi), duration, time, velocity);
      }
    },
    releaseAll() {
      synth.releaseAll?.();
    },
    dispose() {
      synth.dispose();
      chain.forEach((n) => n.dispose());
    },
  };
}

/** Seconds of a Tone time value ('8n', 0.5, ...) at the current tempo. */
export const seconds = (time) => Tone.Time(time).toSeconds();
