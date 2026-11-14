// The shared Tone.js signal graph, built once in init() and kept across
// preset changes. Presets only add/remove their instrument layers.
//
//   melodic layers -> layerIn -> filter -> tremolo -> panner -> reverb -> master -> fader -> limiter -> out
//   percussion     -> dryIn  -----------------------^  (skips filter + tremolo so hits stay crisp)
//   probe synth    -> probePanner --------------------------------------^  (own pan, no reverb)

import Tone from '../tone.js';

export async function createGraph() {
  const limiter = new Tone.Limiter(-1).toDestination();
  const fader = new Tone.Gain(1).connect(limiter);        // short fades when switching presets
  const master = new Tone.Volume(0).connect(fader);      // user volume (setVolume)
  const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3, preDelay: 0.02 }).connect(master);
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

  await reverb.ready;   // the reverb impulse is rendered asynchronously

  const nodes = [probeSynth, probePanner, dryIn, layerIn, filter, tremolo, panner, reverb, master, fader, limiter];
  return {
    layerIn, dryIn, filter, tremolo, panner, reverb, master, fader, limiter, probePanner, probeSynth,
    dispose() {
      nodes.forEach((n) => n.dispose());
    },
  };
}
