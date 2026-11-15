// Change in Night Lights 2012-2023 (real data): one year every 2.5 s
// (frames 5k..5k+4 = year 2012 + k). Brightness and value rise about 27 %
// over the decade, with a small dip in 2020 and a jump in 2022-2023; after
// normalization that is the full range, so the music clearly fills in.
// `motion` is non-zero only at each year change -> a low angklung chord
// (acoustic) or a low chime (electronic) marks it.
//
// Acoustic mix = a small bamboo ensemble built around the angklung. Every layer
// is harmonic (no gongs or detuned voices) and plays in the same key, G major
// pentatonic.

// Angklung melody in the acoustic mix: set to false to drop it. It is the
// lead of this preset; without it only the harp and the marimba bass remain.
const ANGKLUNG = true;

/** @type {import('../types.js').PresetFile} */
export default {
  id: 'nightlights',
  name: 'City lights at night',
  soundDescription: {
    acoustic:
      `A small bamboo ensemble: ${ANGKLUNG ? 'shaken angklung notes sparkle' : 'soft harp notes sparkle'} ` +
      `like city lights${ANGKLUNG ? ', with a few soft harp notes above' : ''} and a wooden marimba ` +
      'bass on the low root and fifth, one year every two and a half seconds from 2012 to 2023. ' +
      'The more light on the map, the louder and brighter it plays and the more notes ring, so ' +
      'it fills in as cities grow: sparse in 2012, a small dip in 2020 and a full bloom in 2022 ' +
      'and 2023. A low angklung chord marks each new year.',
    electronic:
      'Soft bells that sparkle like city lights, one year every two and a half seconds from 2012 ' +
      'to 2023. The more light on the map, the louder and brighter the music and the more bells ' +
      'ring, so it slowly fills in as cities grow. It dips a little in 2020 and fills in most in ' +
      '2022 and 2023. A low chime marks each new year, and a quiet pad holds the harmony underneath.',
  },
  valueLabel: 'night light',
  valueWords: { low: 'dark areas', high: 'bright city lights' },
  legendExtra: {
    acoustic: 'The more light on the map, the more notes play. A low angklung chord marks each new year.',
    electronic: 'The more light on the map, the more bells ring. A low chime marks each new year.',
  },
  emptyLabel: 'no lights: ocean or unlit land',

  // Growth is the story here, not an emergency: no alarm.
  alarm: { on: false },
  switches: { angklung: ANGKLUNG },

  describe: {
    prefix: (f) => `year ${2012 + Math.min(11, Math.floor(f.t / 5))}`,
    motionWord: null,       // motion is just the year change; the prefix already says the year
  },

  rootMidi: 55,             // G3: bells sit high
  // Real warmth is constant (the lights are always yellow-white): one key.
  scales: { warm: 'majorPentatonic', cool: 'majorPentatonic' },
  sources: { rate: 'brightness', tempo: 'brightness' },   // more light -> more notes, a little livelier

  mapping: {
    ramp: 1.2,              // smooth, but each year still lands within its 2.5 s
    bpm: [72, 84],
    subdivisions: ['4n', '8n', '8n', '16n'],
    noteChance: [0.1, 0.95],
    maxVoices: 5,
    volumeDb: [-10, 0],
    filterHz: [1500, 8000],
    tremolo: [0, 0],
    reverb: { decay: 4.5, wet: 0.4 },
    trimDb: { acoustic: 5, electronic: 6.5 },
  },

  // Year marker: motion is exactly 0 within a year and at least about 0.33
  // (normalized) at every change, so threshold 0.1 catches all 11 changes.
  mixMapping: {
    electronic: {
      volumeDb: [-10, -5], filterHz: [1500, 4500], noteChance: [0.1, 0.7], maxVoices: 4,
      subdivisions: ['4n', '8n', '8n', '8n'],     // no 16th-note bell flurries at the top
    },
  },

  layers: {
    // Bamboo ensemble:
    // - angklung (lead): each shaken note is one point of light, more of them as cities grow;
    // - harp: a few soft notes an octave above, a sparkle on top;
    // - marimba bass: wooden root and fifth of the key, from every 4th beat (2012)
    //   to every beat (2023), following the light;
    // - year marker: a low angklung chord (root, fifth, octave) on the key's root.
    acoustic: [
      { kind: 'angklung', role: 'arp', volume: 0, octave: 1, noteLength: '8n', chance: 0.9,
        switch: 'angklung' },
      { kind: 'harp', role: 'arp', volume: -9, octave: 2, noteLength: '4n', chance: 0.4 },
      { kind: 'marimba', role: 'bass', field: 'brightness', beats: [4, 1], pattern: [0, 7],
        volume: -4, octave: -1 },
      { kind: 'angklung', role: 'marker', field: 'motion', threshold: 0.1, onKeyRoot: true,
        chord: [0, 7, 12], volume: -2, octave: 0, noteLength: '2n' },
    ],
    electronic: [
      { kind: 'bell', role: 'arp', volume: 3, octave: 1, noteLength: '4n' },
      { kind: 'pluck', role: 'arp', volume: -7, octave: 0, noteLength: '8n' },
      { kind: 'pad', role: 'chord', volume: -7, octave: -1, every: '2m' },
      { kind: 'bell', role: 'marker', field: 'motion', threshold: 0.1, volume: -2, octave: -1, noteLength: '2n' },
    ],
  },
};
