// DYAMOND Global Carbon Dioxide: plumes drifting west -> east, rising values.
// A drone that thickens with density; a clashing voice adds tension at high values.

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'co2',
  name: 'Carbon dioxide drone',
  soundDescription:
    'A low, steady drone. It grows thicker, with more voices, as carbon dioxide spreads ' +
    'across the map, and its pitch rises as concentrations rise. When levels are high a ' +
    'tense, clashing note creeps in. The drone drifts from left to right as the wind ' +
    'carries the plumes east.',
  valueLabel: 'carbon dioxide',
  valueWords: { low: 'less carbon dioxide', high: 'more carbon dioxide' },
  legendExtra: 'A thicker drone means carbon dioxide is spread over more of the map.',

  rootMidi: 36,              // C2: deep
  octaves: 1,                // drone pitch moves slowly within one octave
  scales: { warm: 'minorPentatonic', cool: 'minorPentatonic' },   // urgent

  mapping: {
    ramp: 2.5,
    bpm: [60, 72],
    subdivisions: ['2n', '4n'],
    noteChance: [0.1, 0.35],
    tension: [0.55, 0.85],
    filterHz: [250, 2200],
    volumeDb: [-10, 0],
    reverb: { decay: 7, wet: 0.4 },
    trimDb: 9,
  },

  layers: [
    { kind: 'drone', role: 'drone', volume: -1, octave: 0,
      intervals: [0, 7, 12, 19], tensionInterval: 13 },   // root, 5th, octave, 12th; clash = minor 9th
    { kind: 'bell', role: 'arp', volume: -10, octave: 3, noteLength: '2n' },
  ],
};
