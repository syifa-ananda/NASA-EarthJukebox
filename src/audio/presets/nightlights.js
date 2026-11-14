// Change in Night Lights 2012-2023: dark map, growing bright clusters.
// Brightness drives how many bells ring, so the piece slowly gets busier.

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'nightlights',
  name: 'City lights at night',
  soundDescription:
    'Soft bells that sparkle like city lights. The brighter the map, the more bells ring, ' +
    'so the music slowly fills in as cities grow from 2012 to 2023. ' +
    'A quiet pad holds the harmony, and the bells sit where the lights are, left or right.',
  valueLabel: 'night light',
  valueWords: { low: 'dark areas with few lights', high: 'bright city lights' },
  legendExtra: 'The more lights on the map, the more bells ring.',

  rootMidi: 55,             // G3: bells sit high
  scales: { warm: 'majorPentatonic', cool: 'minorPentatonic' },
  sources: { rate: 'brightness' },           // more light -> more bells

  mapping: {
    ramp: 2,                // slow growth, no jumps
    bpm: [72, 84],
    subdivisions: ['4n', '8n', '8n', '16n'],
    noteChance: [0.1, 0.95],
    maxVoices: 5,
    volumeDb: [-10, 0],
    filterHz: [1500, 8000],
    reverb: { decay: 4.5, wet: 0.4 },
  },

  layers: [
    { kind: 'bell', role: 'arp', volume: 3, octave: 1, noteLength: '4n' },
    { kind: 'pluck', role: 'arp', volume: -7, octave: 0, noteLength: '8n' },
    { kind: 'pad', role: 'chord', volume: -7, octave: -1, every: '2m' },
  ],
};
