// The shared Tone.js signal graph, built once in init() and kept across
// preset changes. Presets only add/remove their instrument layers.
//
//   melodic layers -> layerIn -> filter -> tremolo -> panner -> reverb -> duck -> master -> fader -> headroom -> limiter -> output
//   percussion     -> dryIn  -----------------------^  (skips filter + tremolo so hits stay crisp)
//   probe synth    -> probePanner ----------------------------------------------^  (own pan, no reverb, not ducked)
//   legend synth   ---------------------------------------------------------------^
//
// `duck` lowers only the music (e.g. while the audio legend plays).
// `output` (soft clipper after the limiter) is the final node; recordings tap it.

import { Tone } from '../tone.js';   // loaded by init() before anything here runs

const KNEE = 0.5;      // -6 dBFS: below this the signal passes unchanged
const CEILING = 0.89;  // -1 dBFS: the curve never goes above this

/** Soft-clip transfer curve (input and output in -1..1). */
function softClip(x) {
  const a = Math.abs(x);
  if (a <= KNEE) return x;
  const room = CEILING - KNEE;
  return Math.sign(x) * (KNEE + room * Math.tanh((a - KNEE) / room));
}

export async function createGraph() {
  // Safety net after the limiter: browser limiters let fast attacks (bells,
  // plucks) overshoot. This curve is untouched below -6 dBFS and bends smoothly
  // so nothing can pass -1 dBFS. The music averages about -20 dB, so it only
  // touches rare spikes.
  const output = new Tone.WaveShaper(softClip, 4096).toDestination();
  output.oversample = '2x';
  const limiter = new Tone.Limiter(-3).connect(output);
  const headroom = new Tone.Volume(-4).connect(limiter);  // keeps the limiter mostly idle
  const fader = new Tone.Gain(1).connect(headroom);       // short fades when switching presets
  const master = new Tone.Volume(0).connect(fader);      // user volume (setVolume)
  const duck = new Tone.Gain(1).connect(master);
  const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3, preDelay: 0.02 }).connect(duck);
  // channelCount 2: the tremolo outputs stereo; a mono panner would cost 3 dB at centre.
  const panner = new Tone.Panner({ pan: 0, channelCount: 2 }).connect(reverb);
  // Full-depth tremolo mixed in with `wet` (0 = untouched signal). At depth 0 a
  // tremolo still halves the level, so the amount is set via wet instead.
  const tremolo = new Tone.Tremolo({ frequency: 4, depth: 1, spread: 0, wet: 0 }).connect(panner).start();
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 0.7, rolloff: -24 }).connect(tremolo);
  const layerIn = new Tone.Volume(-6).connect(filter);   // preset loudness (from brightness)
  const dryIn = new Tone.Volume(0).connect(panner);

  const probePanner = new Tone.Panner(0).connect(master);
  const probeSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.3 },
    volume: -8,
  }).connect(probePanner);
  // Separate synth for the legend, so legend notes never collide with probe notes.
  const legendSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.25 },
    volume: -8,
  }).connect(master);

  await reverb.ready;   // the reverb impulse is rendered asynchronously

  const nodes = [legendSynth, probeSynth, probePanner, dryIn, layerIn, filter, tremolo, panner, reverb, duck,
    master, fader, headroom, limiter, output];
  return {
    layerIn, dryIn, filter, tremolo, panner, reverb, duck, master, fader, limiter, output,
    probePanner, probeSynth, legendSynth,
    dispose() {
      nodes.forEach((n) => n.dispose());
    },
  };
}
