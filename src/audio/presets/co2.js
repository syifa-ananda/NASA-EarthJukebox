// DYAMOND Global Carbon Dioxide (real data): a globe tour, not a map. The
// camera turns westward: East Asia -> India -> Africa -> Atlantic -> South
// America (times from docs/sources.md). `value` is the high CO2 in view:
// highest at the start (East Asia) and the end (Amazon), lowest over Africa
// and the Atlantic. `pan` and `motion` partly follow the camera, so they are
// kept gentle. The grid is a screen grid, not latitude/longitude.

// Climate alarm: set to false to remove it from this preset.
const ALARM = true;

/** Region facing the viewer, from the camera table in docs/sources.md. */
function regionAt(seconds) {
  if (seconds < 7) return 'over East Asia and Australia';
  if (seconds < 13) return 'over India and the Indian Ocean';
  if (seconds < 23) return 'over Africa';
  if (seconds < 29) return 'over the Atlantic Ocean';
  return 'over South America';
}

/** @type {import('../types.js').PresetFile} */
export default {
  id: 'co2',
  name: 'Carbon dioxide drone',
  soundDescription: {
    acoustic:
      'A low overtone drone that follows the turning globe: a deep hum with a whistling overtone ' +
      'singing above it, and a slow drum heartbeat. When places with a lot of carbon dioxide near ' +
      'the ground come into view, such as East Asia at the start and the Amazon at the end, the ' +
      'drone grows thicker, its pitch lifts, the overtone climbs and the heartbeat quickens; over ' +
      'Africa and the open Atlantic it thins out and the heartbeat slows.',
    electronic:
      'A low, steady drone that follows the turning globe. When places with a lot of carbon ' +
      'dioxide near the ground come into view, such as East Asia at the start and the Amazon at ' +
      'the end, the drone grows thicker and its pitch lifts; over Africa and the open Atlantic it ' +
      'thins out.',
  },
  valueLabel: 'carbon dioxide in view',
  valueWords: { low: 'less carbon dioxide in view', high: 'more carbon dioxide in view' },
  legendPan:
    'Sounds on the left come from the left side of the globe on screen, sounds on the right ' +
    'from the right side.',
  legendExtra: {
    acoustic:
      'A thicker drone and a higher whistling overtone mean more of the globe in view shows high ' +
      'carbon dioxide near the ground, and a tense, clashing note means the highest levels are in ' +
      'view. The drum heartbeat quickens as carbon dioxide rises.',
    electronic:
      'A thicker drone means more of the globe in view shows high carbon dioxide near the ground, ' +
      'and a tense, clashing note means the highest levels are in view.',
  },
  emptyLabel: 'no high carbon dioxide visible there',

  // Alarm at the high-CO2 regions: normalized value >= 0.8 is East Asia
  // (about 2.5-5 s) and the Amazon (about 30-37 s); it turns off below 0.75.
  alarm: {
    on: ALARM,
    field: 'value',
    threshold: 0.8,
    volume: -4.5,            // about 5 dB under the music in its windows (measured)
    octave: 1,               // C4-G4: above the drone (C2-G3), so the drone doesn't mask it
    words: 'alarm: highest carbon dioxide in view',
    legend: 'A slow, low wailing voice means the highest carbon dioxide levels are in view.',
    description:
      'At the highest levels, over East Asia and the Amazon, a slow, low wailing voice fades in.',
  },

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
    filterHz: [250, 1400],   // capped: at the CO2 peaks the drone got too bright and loud
    volumeDb: [-10, -3],
    panWidth: 0.6,
    tremolo: [0, 0.1],
    reverb: { decay: 7, wet: 0.4 },
    trimDb: { acoustic: -1, electronic: 1.5 },
  },

  mixMapping: {
    electronic: { volumeDb: [-10, -5], filterHz: [250, 1000] },
  },

  layers: {
    // Overtone drone: an invisible gas becomes a breathing hum; the singing
    // overtone climbs as CO2 rises, so "more" is heard without getting louder.
    // Frame-drum heartbeat: quickens from every 4th beat to every beat with CO2.
    acoustic: [
      { kind: 'overtone', role: 'drone', volume: -1, octave: 0,
        intervals: [0, 7, 12, 19], tensionInterval: 13, tensionGain: 0.4,
        singField: 'value', harmonics: [5, 6, 8, 9, 10] },   // whistle stops at harmonic 10
      { kind: 'frameDrum', role: 'pulse', field: 'value', beats: [4, 1], volume: -10, octave: 0 },
    ],
    electronic: [
      { kind: 'drone', role: 'drone', volume: -1, octave: 0,
        intervals: [0, 7, 12, 19], tensionInterval: 13, tensionGain: 0.4 },   // root, 5th, octave, 12th; clash = minor 9th
      { kind: 'bell', role: 'arp', volume: -10, octave: 3, noteLength: '2n' },
    ],
  },
};
