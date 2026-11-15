// DYAMOND Global Carbon Dioxide (real data): a globe tour, not a map. The
// camera turns westward: East Asia -> India -> Africa -> Atlantic -> South
// America (times from docs/sources.md). `value` is the high CO2 in view:
// highest at the start (East Asia) and the end (Amazon), lowest over Africa
// and the Atlantic. `pan` and `motion` partly follow the camera, so they are
// kept gentle. The grid is a screen grid, not latitude/longitude.

/** Region facing the viewer, from the camera table in docs/sources.md. */
function regionAt(seconds) {
  if (seconds < 7) return 'over East Asia and Australia';
  if (seconds < 13) return 'over India and the Indian Ocean';
  if (seconds < 23) return 'over Africa';
  if (seconds < 29) return 'over the Atlantic Ocean';
  return 'over South America';
}

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'co2',
  name: 'Carbon dioxide drone',
  soundDescription:
    'A low, steady drone that follows the turning globe. When places with a lot of carbon ' +
    'dioxide near the ground come into view, such as East Asia at the start and the Amazon at ' +
    'the end, the drone grows thicker and its pitch lifts; over Africa and the open Atlantic it ' +
    'thins out.',
  valueLabel: 'carbon dioxide in view',
  valueWords: { low: 'less carbon dioxide in view', high: 'more carbon dioxide in view' },
  legendPan:
    'Sounds on the left come from the left side of the globe on screen, sounds on the right ' +
    'from the right side.',
  legendExtra:
    'A thicker drone means more of the globe in view shows high carbon dioxide near the ground, ' +
    'and a tense, clashing note means the highest levels are in view.',
  emptyLabel: 'no high carbon dioxide visible there',

  describe: {
    prefix: (f, seconds) => regionAt(seconds),
    motionWord: null,        // motion is mostly the camera turning
  },

  // Brightness here is the globe's luminance (bright deserts over Africa), not
  // CO2, so loudness and filter follow the CO2 itself instead.
  sources: { loudness: 'density', cutoff: 'value' },

  rootMidi: 36,              // C2: deep
  octaves: 1,                // drone pitch moves slowly within one octave
  scales: { warm: 'minorPentatonic', cool: 'minorPentatonic' },   // urgent

  mapping: {
    ramp: 2.5,
    bpm: [60, 66],           // tempo barely moves: motion is mostly the camera
    subdivisions: ['2n', '4n'],
    noteChance: [0.1, 0.35],
    tension: [0.55, 0.85],   // normalized value: rough, adjust here
    filterHz: [250, 2200],
    volumeDb: [-10, 0],
    panWidth: 0.6,
    tremolo: [0, 0.1],
    reverb: { decay: 7, wet: 0.4 },
    trimDb: 3,
  },

  layers: [
    { kind: 'drone', role: 'drone', volume: -1, octave: 0,
      intervals: [0, 7, 12, 19], tensionInterval: 13 },   // root, 5th, octave, 12th; clash = minor 9th
    { kind: 'bell', role: 'arp', volume: -10, octave: 3, noteLength: '2n' },
  ],
};
