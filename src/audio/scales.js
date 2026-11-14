// Musical scales and pitch quantization. Pure functions, no Tone.js, so they
// also run in Node.

/** Semitone steps of each scale within one octave. */
export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Look up a scale by name, falling back to major pentatonic. */
export function getScale(name) {
  return SCALES[name] ?? SCALES.majorPentatonic;
}

/** MIDI note of scale step `index` (0 = root, can be negative or past one octave). */
export function stepToMidi(index, scale, rootMidi) {
  const n = scale.length;
  const octave = Math.floor(index / n);
  return rootMidi + 12 * octave + scale[((index % n) + n) % n];
}

/** Map a 0-1 value to the nearest scale step over `octaves` octaves. */
export function quantizeStep(v, scale, octaves) {
  const steps = scale.length * octaves;           // e.g. 10 steps for 2 octaves
  const clamped = Math.min(1, Math.max(0, v));
  return Math.round(clamped * steps);             // 0..steps (top = next octave's root)
}

/**
 * Chord built by stacking every other scale step on `index`, which keeps
 * every voice in the scale: on a pentatonic that's root, 3rd/4th, 5th, ...
 */
export function chordFromStep(index, voices, scale, rootMidi) {
  return Array.from({ length: voices }, (_, k) => stepToMidi(index + 2 * k, scale, rootMidi));
}

export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
