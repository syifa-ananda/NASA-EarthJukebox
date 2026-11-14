// Instrument layers. Each preset layer (see LayerSpec in types.js) becomes one
// object with the same small interface, all methods optional:
//   tick(time, params)        arp: called on every beat subdivision
//   update(params, ramp)      called for every new frame
//   hit(times, params)        hits: one percussion hit per time
//   start(time) / stop()      play / pause (held notes)
//   dispose()                 free every Tone node the layer created

import { Tone } from '../tone.js';   // loaded by init() before anything here runs
import { getScale, stepToMidi, midiToHz } from '../scales.js';

const dbFromGain = (g) => (g <= 0.001 ? -60 : 20 * Math.log10(g));

/**
 * Tone.js instrument for a layer `kind`. Each kind's `volume` is trimmed so all
 * kinds peak at roughly the same level; layer volumes in presets are then
 * relative mixes on equal footing.
 */
function makeInstrument(kind) {
  switch (kind) {
    case 'pluck':
      return new Tone.PolySynth(Tone.Synth, {
        maxPolyphony: 16,
        volume: 3,
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.005, decay: 0.35, sustain: 0.05, release: 0.8 },
      });
    case 'bell':
      return new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 16,
        volume: 9,
        harmonicity: 3.01,
        modulationIndex: 12,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
      });
    case 'pad':
      return new Tone.PolySynth(Tone.FMSynth, {
        maxPolyphony: 16,
        volume: 10,
        harmonicity: 2,
        modulationIndex: 1.5,
        oscillator: { type: 'triangle' },
        envelope: { attack: 1.2, decay: 0.6, sustain: 0.8, release: 3 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 1.5, decay: 0.5, sustain: 0.6, release: 3 },
      });
    case 'thunder':
      return new Tone.MembraneSynth({
        pitchDecay: 0.15,
        octaves: 4,
        envelope: { attack: 0.002, decay: 1.0, sustain: 0, release: 1.2 },
      });
    case 'knock':
      return new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
      });
    case 'crackle':
      return new Tone.NoiseSynth({
        volume: 9,
        noise: { type: 'pink' },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
      });
    default:
      throw new Error(`Unknown instrument kind "${kind}"`);
  }
}

/**
 * @param {import('../types.js').LayerSpec} spec
 * @param {Awaited<ReturnType<import('./graph.js').createGraph>>} graph
 * @param {import('../types.js').Preset} preset
 * @param {() => import('../types.js').SoundParams | null} getParams  Latest params.
 */
export function createLayer(spec, graph, preset, getParams) {
  const out = new Tone.Volume(spec.volume ?? -12)
    .connect(spec.role === 'hits' ? graph.dryIn : graph.layerIn);
  const shift = 12 * (spec.octave ?? 0);

  if (spec.role === 'drone') return droneLayer(spec, preset, out, shift, getParams);

  const synth = makeInstrument(spec.kind).connect(out);
  const base = {
    dispose() {
      synth.dispose();
      out.dispose();
    },
  };

  if (spec.role === 'arp') {
    let step = 0;
    return {
      ...base,
      tick(time, p) {
        if (Math.random() > p.noteChance) return;   // sparse when the rate is low
        const midi = p.chord[step++ % p.chord.length] + shift;
        const vel = p.velocity * (0.85 + 0.15 * Math.random());   // slight humanizing
        synth.triggerAttackRelease(midiToHz(midi), spec.noteLength ?? '8n', time, vel);
      },
      stop: () => synth.releaseAll(),
    };
  }

  if (spec.role === 'chord') {
    // Own loop: plays the current chord every `spec.every`.
    const loop = new Tone.Loop((time) => {
      const p = getParams();
      if (!p || Math.random() > (spec.chance ?? 1)) return;
      const notes = p.chord.map((m) => midiToHz(m + shift));
      synth.triggerAttackRelease(notes, spec.every ?? '1m', time, p.velocity * 0.8);
    }, spec.every ?? '1m').start(0);
    return {
      ...base,
      update(p, ramp) {
        // Swell: quieter by `swellDb` when the swell field is 0.
        if (spec.swellDb) out.volume.rampTo(spec.volume - spec.swellDb * (1 - p.swell), ramp);
      },
      stop: () => synth.releaseAll(),
      dispose() {
        loop.dispose();
        base.dispose();
      },
    };
  }

  if (spec.role === 'hits') {
    let lastHit = 0;
    return {
      ...base,
      hit(times, p) {
        const scale = getScale(p.scaleName);
        for (const time of times) {
          // Tone needs strictly increasing start times on a mono synth.
          const t = Math.max(time, lastHit + 0.02);
          if (t > times[0] + 1) break;                     // don't build a backlog
          lastHit = t;
          const vel = Math.min(1, p.velocity + 0.2 * Math.random());
          if (spec.kind === 'crackle') {
            synth.triggerAttackRelease('16n', t, vel);
          } else {
            // Drum pitch stays in key: a random low scale step.
            const step = Math.floor(Math.random() * scale.length);
            const midi = stepToMidi(step, scale, preset.rootMidi - 12 + shift);
            synth.triggerAttackRelease(midiToHz(midi), '8n', t, vel);
          }
        }
      },
    };
  }

  throw new Error(`Unknown layer role "${spec.role}"`);
}

/** Held drone: one voice per interval, plus an optional clashing tension voice. */
function droneLayer(spec, preset, out, shift, getParams) {
  const intervals = spec.intervals ?? [0, 7, 12];
  const withTension = typeof spec.tensionInterval === 'number';
  const all = withTension ? [...intervals, spec.tensionInterval] : intervals;

  const voices = all.map(() => new Tone.Synth({
    oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
    envelope: { attack: 2, decay: 0.5, sustain: 1, release: 3 },
    volume: -60,
  }).connect(out));

  const rootOf = (p) => (p ? p.chord[0] : preset.rootMidi) + shift;

  function setTargets(p, ramp) {
    const root = rootOf(p);
    voices.forEach((v, i) => {
      v.frequency.rampTo(midiToHz(root + all[i]), ramp);
      const isTension = withTension && i === voices.length - 1;
      // Density fades voices in one by one; tension fades in the clash.
      const gain = isTension ? (p ? p.tension * 0.6 : 0) : Math.min(1, Math.max(0, (p ? p.voices : 1) - i));
      v.volume.rampTo(dbFromGain(gain), ramp);
    });
  }

  let playing = false;
  return {
    start(time) {
      const root = rootOf(getParams());
      voices.forEach((v, i) => v.triggerAttack(midiToHz(root + all[i]), time));
      setTargets(getParams(), 0.5);
      playing = true;
    },
    update(p, ramp) {
      if (playing) setTargets(p, ramp);
    },
    stop() {
      voices.forEach((v) => v.triggerRelease());
      playing = false;
    },
    dispose() {
      voices.forEach((v) => v.dispose());
      out.dispose();
    },
  };
}
