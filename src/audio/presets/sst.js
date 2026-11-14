// Global Sea Surface Temperature: slow, continuous change.
// Flowing pads; motion swells the pads; temperature sets the pitch.
// `value` is the calibrated temperature in the contract, so it drives pitch
// (warmth is only the picture's red/blue balance).

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'sst',
  name: 'Ocean temperature and currents',
  soundDescription:
    'Slow, flowing pads like ocean swells. Warmer water plays higher notes and ' +
    'cooler water lower ones. When the currents move faster the pads swell louder, ' +
    'and a few soft bell notes drift on top.',
  valueLabel: 'water temperature',

  rootMidi: 43,            // G2: low and warm
  scales: { warm: 'majorPentatonic', cool: 'minorPentatonic' },
  weights: { motion: 4 },  // currents change slowly; exaggerate so swells are audible

  mapping: {
    ramp: 1.5,
    bpm: [54, 72],
    subdivisions: ['2n', '4n'],
    noteChance: [0.15, 0.5],
    maxVoices: 4,
    filterHz: [400, 3500],
    tremolo: [0, 0.15],
    modeThreshold: 0.36,   // mock warmth sits at 0.31-0.39; retune with real frames
    reverb: { decay: 6, wet: 0.45 },
  },

  layers: [
    { kind: 'pad', role: 'chord', volume: 4, octave: 0, every: '1m', swellDb: 6 },
    { kind: 'pad', role: 'chord', volume: -5, octave: 1, every: '2m', swellDb: 4 },
    { kind: 'bell', role: 'arp', volume: -10, octave: 2, noteLength: '2n' },
  ],
};
