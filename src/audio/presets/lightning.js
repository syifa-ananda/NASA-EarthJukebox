// Lightning Events Detected from the ISS 2017-2023: sudden bursts.
// Each flash is a percussion hit; a sparse minor pad underneath ("urgent").

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'lightning',
  name: 'Lightning storms',
  soundDescription:
    'Each lightning flash is a drum hit: a deep thunder thump with a crackle on top, ' +
    'heard on the left or right where the storm is. Big bursts sound like a drum roll. ' +
    'A quiet, sparse minor-key pad sits underneath and trembles when storms move fast.',
  valueLabel: 'lightning activity',

  rootMidi: 45,              // A2
  scales: { warm: 'minorPentatonic', cool: 'minorPentatonic' },   // urgent
  weights: { brightness: 5, value: 5 },   // background is very dark (0.04-0.10)

  mapping: {
    ramp: 0.25,              // follow storms quickly
    bpm: [84, 132],
    tremolo: [0, 0.6],
    maxHits: 8,
    hitWindow: 0.5,
    filterHz: [400, 3000],
    reverb: { decay: 5, wet: 0.35 },
  },

  layers: [
    { kind: 'pad', role: 'chord', volume: -4, octave: 0, every: '2m', chance: 0.6 },
    { kind: 'thunder', role: 'hits', volume: -4 },
    { kind: 'crackle', role: 'hits', volume: -14 },
  ],
};
