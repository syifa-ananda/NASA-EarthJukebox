// Climate alarm: a low, wordless voice that slowly glides between the preset's
// root and fifth, fading in only when the data is at its extremes. The vowel
// opens from "oo" to "oh" as it rises, like a sung lament.
//
// It is deliberately unlike a real emergency siren, so nobody mistakes it
// for a real alert:
//   - it holds each note for about 3 seconds and glides between them over
//     1.5 s (sirens sweep continuously, or jump between two tones);
//   - one cycle takes 9 s (vehicle sirens cycle every 0.3-3 s);
//   - it sits in a low singing-voice register (about 130-400 Hz) with a soft
//     vowel timbre, vibrato and reverb, and stays on the music's key;
//   - it fades in over 1.5 s (long enough to never start abruptly, short
//     enough for co2's 2.5 s East Asia window) and out over 3 s, and stays
//     under the music (preset `alarm.volume`, measured).
//
// Preset settings: preset.alarm = { on, field, threshold, ... } (types.js).
// The user can turn it off for every preset with setAlarmEnabled(false).

import { Tone } from '../tone.js';
import { midiToHz } from '../scales.js';
import { formantBank } from '../instruments/voice.js';

const CYCLE = 9;     // seconds: hold root 3 s, glide 1.5 s, hold fifth 3 s, glide back 1.5 s
const HOLD = 3;
const GLIDE = 1.5;
export const ALARM_FADE_IN = 1.5;
export const ALARM_FADE_OUT = 3;

/**
 * The alarm voice and its gain chain, connected to the graph's reverb
 * (unpanned, unfiltered, not part of the music bus).
 * @returns {{ fade: any, voice: any, low: number, cycle: (time: number) => void, dispose: () => void }}
 */
function buildVoice(graph, preset) {
  const cfg = preset.alarm;
  const fade = new Tone.Gain(0).connect(graph.reverb);
  const level = new Tone.Volume(cfg.volume ?? -5).connect(fade);
  const bank = formantBank(['oo', 'oh'], 0);   // vowel opens as the pitch rises (see cycle)
  bank.output.connect(level);
  const vibrato = new Tone.Vibrato({ frequency: 4.2, depth: 0.1 }).connect(bank.input);
  const voice = new Tone.Synth({
    oscillator: { type: 'fatsawtooth', count: 2, spread: 10 },
    envelope: { attack: 0.8, decay: 0, sustain: 1, release: 2 },
    volume: 6,
  }).connect(vibrato);

  const root = preset.rootMidi + 12 * (1 + (cfg.octave ?? 0));
  const low = midiToHz(root);
  const high = midiToHz(root + 7);   // the fifth: on every pentatonic scale here

  return {
    fade,
    voice,
    low,
    /** One hold-glide-hold-glide cycle starting at `time`. */
    cycle(time) {
      const f = voice.frequency;
      f.setValueAtTime(low, time);
      f.setValueAtTime(low, time + HOLD);
      f.exponentialRampToValueAtTime(high, time + HOLD + GLIDE);
      f.setValueAtTime(high, time + 2 * HOLD + GLIDE);
      f.exponentialRampToValueAtTime(low, time + CYCLE);
      bank.morph(1, time + HOLD, GLIDE);                 // "oo" -> "oh" going up
      bank.morph(0, time + 2 * HOLD + GLIDE, GLIDE);     // and back going down
    },
    dispose() {
      [voice, vibrato, level, fade].forEach((n) => n.dispose());
      bank.dispose();
    },
  };
}

/**
 * @param {Awaited<ReturnType<import('./graph.js').createGraph>>} graph
 * @param {import('../types.js').Preset} preset
 */
export function createAlarm(graph, preset) {
  const cfg = preset.alarm;
  const v = buildVoice(graph, preset);
  const loop = new Tone.Loop((time) => v.cycle(time), CYCLE).start(0);

  let enabled = true;
  let wanted = false;     // the data is in the alarm zone
  let playing = false;
  let target = 0;

  function apply() {
    const next = enabled && wanted && playing ? 1 : 0;
    if (next === target) return;
    target = next;
    v.fade.gain.rampTo(next, next ? cfg.fadeIn ?? ALARM_FADE_IN : cfg.fadeOut ?? ALARM_FADE_OUT);
  }

  return {
    /** True while the alarm is sounding or fading in. */
    get active() {
      return target === 1;
    },
    setEnabled(on) {
      enabled = on;
      apply();
    },
    start(time) {
      v.voice.triggerAttack(v.low, time);
      playing = true;
      apply();
    },
    stop() {
      playing = false;
      target = 0;
      v.fade.gain.cancelScheduledValues(Tone.now());
      v.fade.gain.rampTo(0, 0.3);
      v.voice.triggerRelease(Tone.now() + 0.3);
    },
    update(p) {
      wanted = Boolean(p.alarm);
      apply();
    },
    dispose() {
      loop.dispose();
      v.dispose();
    },
  };
}

/**
 * Play the preset's alarm on its own for `seconds` (works while paused: the
 * glide is scheduled directly, not on the transport). Returns a stop function
 * that also frees the nodes; it stops by itself afterwards.
 * @returns {() => void}
 */
export function previewAlarm(graph, preset, seconds, start = Tone.now() + 0.05) {
  const v = buildVoice(graph, preset);
  const end = start + seconds;
  v.voice.triggerAttack(v.low, start);
  for (let t = start; t < end; t += CYCLE) v.cycle(t);
  v.fade.gain.setValueAtTime(0, start);
  v.fade.gain.linearRampToValueAtTime(1, start + ALARM_FADE_IN);
  v.fade.gain.setValueAtTime(1, end - ALARM_FADE_IN);
  v.fade.gain.linearRampToValueAtTime(0, end);
  v.voice.triggerRelease(end);
  let done = false;
  const timer = setTimeout(() => stop(), (end - Tone.now() + 2.5) * 1000);
  function stop() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    v.dispose();
  }
  return stop;
}
