// Change in Night Lights 2012-2023 (real data): one year every 2.5 s
// (frames 5k..5k+4 = year 2012 + k). Brightness and value rise about 27 %
// over the decade, with a small dip in 2020 and a jump in 2022-2023; after
// normalization that is the full range, so the music clearly fills in.
// `motion` is non-zero only at each year change -> a low chime marks it.

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'nightlights',
  name: 'City lights at night',
  soundDescription:
    'Soft bells that sparkle like city lights, one year every two and a half seconds from 2012 ' +
    'to 2023. The more light on the map, the louder and brighter the music and the more bells ' +
    'ring, so it slowly fills in as cities grow. It dips a little in 2020 and fills in most in ' +
    '2022 and 2023. A low chime marks each new year, and a quiet pad holds the harmony underneath.',
  valueLabel: 'night light',
  valueWords: { low: 'dark areas', high: 'bright city lights' },
  legendExtra: 'The more light on the map, the more bells ring. A low chime marks each new year.',
  emptyLabel: 'no lights: ocean or unlit land',

  describe: {
    prefix: (f) => `year ${2012 + Math.min(11, Math.floor(f.t / 5))}`,
    motionWord: null,       // motion is just the year change; the prefix already says the year
  },

  rootMidi: 55,             // G3: bells sit high
  // Real warmth is constant (the lights are always yellow-white): one key.
  scales: { warm: 'majorPentatonic', cool: 'majorPentatonic' },
  sources: { rate: 'brightness', tempo: 'brightness' },   // more light -> more bells, a little livelier

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
  },

  layers: [
    { kind: 'bell', role: 'arp', volume: 3, octave: 1, noteLength: '4n' },
    { kind: 'pluck', role: 'arp', volume: -7, octave: 0, noteLength: '8n' },
    { kind: 'pad', role: 'chord', volume: -7, octave: -1, every: '2m' },
    // Year marker: low chime at each year crossfade. Motion is exactly 0 within a
    // year and at least about 0.33 (normalized) at every change, so 0.1 catches all 11.
    { kind: 'bell', role: 'marker', field: 'motion', threshold: 0.1, volume: -2, octave: -1, noteLength: '2n' },
  ],
};
