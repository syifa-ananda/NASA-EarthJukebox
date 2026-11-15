// Instrument layers. Each preset layer (see LayerSpec in types.js) becomes one
// object with the same small interface, all methods optional:
//   tick(time, params)        arp: called on every beat subdivision
//   update(params, ramp)      called for every new frame
//   hit(times, params)        hits: one percussion hit per time
//   start(time) / stop()      play / pause (held notes)
//   dispose()                 free every Tone node the layer created
//
// Roles: arp, chord, drone, hits, marker, pulse, bass (see LayerSpec in types.js).
// Instruments come from ../instruments/ and all share one interface, so any
// kind can play any role (except the held drones).

import { Tone } from '../tone.js';   // loaded by init() before anything here runs
import { getScale, stepToMidi, midiToHz } from '../scales.js';
import { createInstrument } from '../instruments/index.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dbFromGain = (g) => (g <= 0.001 ? -60 : 20 * Math.log10(g));
/** Percussion skips the filter and tremolo so hits stay crisp. */
const DRY_ROLES = new Set(['hits', 'pulse']);

/**
 * @param {import('../types.js').LayerSpec} spec
 * @param {Awaited<ReturnType<import('./graph.js').createGraph>>} graph
 * @param {import('../types.js').Preset} preset
 * @param {() => import('../types.js').SoundParams | null} getParams  Latest params.
 */
export function createLayer(spec, graph, preset, getParams) {
  const out = new Tone.Volume(spec.volume ?? -12)
    .connect(DRY_ROLES.has(spec.role) ? graph.dryIn : graph.layerIn);
  const shift = 12 * (spec.octave ?? 0);

  if (spec.role === 'drone') return droneLayer(spec, preset, out, shift, getParams);

  const inst = createInstrument(spec.kind, spec);
  inst.output.connect(out);
  const base = {
    dispose() {
      inst.dispose();
      out.dispose();
    },
  };

  if (spec.role === 'arp') {
    let step = 0;
    return {
      ...base,
      tick(time, p) {
        if (Math.random() > p.noteChance * (spec.chance ?? 1)) return;   // sparse when the rate is low
        const midi = p.chord[step++ % p.chord.length] + shift;
        const vel = p.velocity * (0.85 + 0.15 * Math.random());          // slight humanizing
        inst.play(midi, spec.noteLength ?? '8n', time, vel);
      },
      stop: () => inst.releaseAll(),
    };
  }

  if (spec.role === 'chord') {
    // Own loop: plays the current chord every `spec.every`.
    const loop = new Tone.Loop((time) => {
      const p = getParams();
      if (!p || Math.random() > (spec.chance ?? 1)) return;
      inst.play(p.chord.map((m) => m + shift), spec.every ?? '1m', time, p.velocity * 0.8);
    }, spec.every ?? '1m').start(0);
    return {
      ...base,
      update(p, ramp) {
        // Swell: quieter by `swellDb` when the swell field is 0.
        if (spec.swellDb) out.volume.rampTo(spec.volume - spec.swellDb * (1 - p.swell), ramp);
      },
      stop: () => inst.releaseAll(),
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
        // minHits + once: one hit per frame, only on busy frames (e.g. big storm bursts).
        if (p.hits < (spec.minHits ?? 1)) return;
        const scale = getScale(p.scaleName);
        for (const time of spec.once ? times.slice(0, 1) : times) {
          // Tone needs strictly increasing start times on a mono synth.
          const t = Math.max(time, lastHit + 0.02);
          if (t > times[0] + 1) break;                     // don't build a backlog
          lastHit = t;
          const vel = Math.min(1, p.velocity + 0.2 * Math.random());
          // Drum pitch stays in key: a random low scale step.
          const step = Math.floor(Math.random() * scale.length);
          const midi = stepToMidi(step, scale, preset.rootMidi - 12 + shift);
          inst.play(midi, spec.noteLength ?? inst.hitLength, t, vel);
        }
      },
    };
  }

  if (spec.role === 'marker') {
    // One note (or chord: `spec.chord` semitones) each time `spec.field`
    // (normalized) rises past `spec.threshold`, e.g. at every new year in
    // nightlights. `onKeyRoot`: on the key's root instead of the melody's.
    let prev = 1;          // start "above" so a preset switch never fires a marker
    let playing = false;
    let lastHit = 0;
    return {
      ...base,
      start() { playing = true; },
      stop() {
        playing = false;
        inst.releaseAll();
      },
      update(p) {
        const v = p.levels?.[spec.field] ?? 0;
        if (playing && prev < spec.threshold && v >= spec.threshold) {
          const t = Math.max(Tone.now() + 0.02, lastHit + 0.05);
          lastHit = t;
          const root = (spec.onKeyRoot ? preset.rootMidi : p.chord[0]) + shift;
          const notes = (spec.chord ?? [0]).map((i) => root + i);
          inst.play(notes.length === 1 ? notes[0] : notes, spec.noteLength ?? '2n', t, 0.7);
        }
        prev = v;
      },
    };
  }

  if (spec.role === 'pulse') {
    // Heartbeat: a "lub-dub" every few beats, quicker as `spec.field` rises.
    // beats: [at level 0, at level 1], e.g. [4, 1] = every 4th beat -> every beat.
    const [slow, fast] = spec.beats ?? [4, 1];
    let beat = 0;
    const loop = new Tone.Loop((time) => {
      const p = getParams();
      if (!p) return;
      const level = clamp01(p.levels?.[spec.field ?? 'value'] ?? 0);
      const every = Math.max(1, Math.round(slow + (fast - slow) * level));
      if (beat++ % every) return;
      const midi = preset.rootMidi + shift;
      const vel = 0.55 + 0.35 * level;
      inst.play(midi, inst.hitLength, time, vel);
      inst.play(midi, inst.hitLength, time + 0.2, vel * 0.6);
    }, '4n').start(0);
    return {
      ...base,
      stop: () => inst.releaseAll(),
      dispose() {
        loop.dispose();
        base.dispose();
      },
    };
  }

  if (spec.role === 'bass') {
    // Low line on the key's root and fifth (`spec.pattern` semitones, cycling),
    // so it is always in tune; plays every few beats, more often as `field` rises.
    const [slow, fast] = spec.beats ?? [4, 1];
    const pattern = spec.pattern ?? [0, 7];
    let beat = 0;
    let n = 0;
    const loop = new Tone.Loop((time) => {
      const p = getParams();
      if (!p) return;
      const level = clamp01(p.levels?.[spec.field ?? 'brightness'] ?? 0);
      const every = Math.max(1, Math.round(slow + (fast - slow) * level));
      if (beat++ % every) return;
      const midi = preset.rootMidi + shift + pattern[n++ % pattern.length];
      inst.play(midi, spec.noteLength ?? inst.hitLength, time, p.velocity * (0.9 + 0.1 * Math.random()));
    }, '4n').start(0);
    return {
      ...base,
      stop: () => inst.releaseAll(),
      dispose() {
        loop.dispose();
        base.dispose();
      },
    };
  }

  throw new Error(`Unknown layer role "${spec.role}"`);
}

// Overtone singing: the band-pass filter picks one harmonic of the drone's
// root. Harmonics 7 and 11 are left out (out of tune with the scale).
const HARMONICS = [5, 6, 8, 9, 10, 12];
const SING_GAIN = [0.35, 0.75];   // whistle level at field 0 and 1 (capped so the peak isn't piercing)

/**
 * Held drone: one voice per interval, plus an optional clashing tension voice.
 * kind 'overtone' adds a narrow band-pass "singing" one harmonic of the root
 * at a time, like overtone singing: higher harmonics as `singField` rises,
 * wandering to a neighbouring harmonic every few seconds.
 */
function droneLayer(spec, preset, out, shift, getParams) {
  const intervals = spec.intervals ?? [0, 7, 12];
  const withTension = typeof spec.tensionInterval === 'number';
  const all = withTension ? [...intervals, spec.tensionInterval] : intervals;
  const overtone = spec.kind === 'overtone';
  const harmonics = spec.harmonics ?? HARMONICS;
  const tensionGain = spec.tensionGain ?? 0.6;   // level of the clashing voice at full tension
  const nodes = [];

  let bus = out;
  let sing = null;
  if (overtone) {
    bus = new Tone.Gain(1);
    const body = new Tone.Filter({ type: 'lowpass', frequency: 700, Q: 0.6 }).connect(out);
    const singLevel = new Tone.Volume(spec.singDb ?? 22).connect(out);
    const singGain = new Tone.Gain(0).connect(singLevel);
    const filter = new Tone.Filter({ type: 'bandpass', frequency: 400, Q: 24, rolloff: -24 }).connect(singGain);
    bus.fan(body, filter);
    sing = { filter, gain: singGain, wander: 0 };
    nodes.push(bus, body, singLevel, singGain, filter);
  }

  const voices = all.map(() => new Tone.Synth({
    oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
    envelope: { attack: 2, decay: 0.5, sustain: 1, release: 3 },
    volume: -60,
  }).connect(bus));

  const rootOf = (p) => (p ? p.chord[0] : preset.rootMidi) + shift;

  function singTarget(p, ramp) {
    const level = clamp01(p?.levels?.[spec.singField ?? 'value'] ?? 0);
    const i = Math.round(level * (harmonics.length - 1)) + sing.wander;
    const h = harmonics[Math.min(harmonics.length - 1, Math.max(0, i))];
    sing.filter.frequency.rampTo(midiToHz(rootOf(p)) * h, ramp);
    sing.gain.gain.rampTo(SING_GAIN[0] + (SING_GAIN[1] - SING_GAIN[0]) * level, ramp);   // clearer when high
  }

  function setTargets(p, ramp) {
    const root = rootOf(p);
    voices.forEach((v, i) => {
      v.frequency.rampTo(midiToHz(root + all[i]), ramp);
      const isTension = withTension && i === voices.length - 1;
      // Density fades voices in one by one; tension fades in the clash.
      const gain = isTension ? (p ? p.tension * tensionGain : 0) : Math.min(1, Math.max(0, (p ? p.voices : 1) - i));
      v.volume.rampTo(dbFromGain(gain), ramp);
    });
    if (sing) singTarget(p, ramp);
  }

  // The singing harmonic wanders to a neighbour now and then, so it sounds like a melody.
  const wanderLoop = overtone
    ? new Tone.Loop(() => {
      sing.wander = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
      singTarget(getParams(), 0.7);
    }, 3.3).start(0)
    : null;

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
      wanderLoop?.dispose();
      voices.forEach((v) => v.dispose());
      nodes.forEach((n) => n.dispose());
      out.dispose();
    },
  };
}
