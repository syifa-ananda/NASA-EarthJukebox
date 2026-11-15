// Lightning Events Detected from the ISS 2017-2023 (real data, 200 frames).
// `flashes` = storm bursts (cells newly lit), each one a percussion hit,
// panned where the storm burst. `value` swells once a year (northern summer).
// The first seconds and the last ~20 s are quiet (video build-up and fade).

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'lightning',
  name: 'Lightning storms',
  soundDescription:
    'Each storm bursting somewhere on the map is a drum hit: a deep thunder thump with a crackle ' +
    'on top, heard on the left or right where the storm bursts. Busy moments sound like a drum ' +
    'roll. A quiet minor-key pad underneath grows louder and higher once a year, when storms ' +
    'spread across the north during the northern summer. The start and the last twenty seconds ' +
    'are quiet, while the video builds up and fades out.',
  valueLabel: 'lightning activity',
  valueWords: { low: 'little lightning', high: 'a lot of lightning' },
  legendExtra: 'Each drum hit is a storm bursting somewhere on the map, heard where it happens.',
  emptyLabel: 'no lightning there',

  describe: { flashWords: ['storm burst', 'storm bursts'] },

  rootMidi: 45,              // A2
  scales: { warm: 'minorPentatonic', cool: 'minorPentatonic' },   // urgent

  mapping: {
    ramp: 0.25,              // follow storms quickly
    panRamp: 0.05,           // hits land where this frame's storm burst, not where the last one was
    bpm: [84, 132],
    tremolo: [0, 0.6],
    maxHits: 8,
    hitWindow: 0.5,
    filterHz: [400, 3000],
    reverb: { decay: 5, wet: 0.35 },
    trimDb: -4,
  },

  layers: [
    { kind: 'pad', role: 'chord', volume: -4, octave: 0, every: '2m', chance: 0.6 },
    { kind: 'thunder', role: 'hits', volume: -4 },
    { kind: 'crackle', role: 'hits', volume: -14 },
  ],
};
