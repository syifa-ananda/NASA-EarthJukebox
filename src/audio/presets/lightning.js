// Lightning Events Detected from the ISS 2017-2023 (real data, 200 frames).
// `flashes` = storm bursts (cells newly lit), each one a percussion hit,
// panned where the storm burst. `value` swells once a year (northern summer).
// The first seconds and the last ~20 s are quiet (video build-up and fade).
// Storm bursts per frame: 0 in a third of the frames, 2+ in half, 5+ in a quarter.

/** @type {import('../types.js').PresetFile} */
export default {
  id: 'lightning',
  name: 'Lightning storms',
  soundDescription: {
    acoustic:
      'Each storm bursting somewhere on the map is a hand-drum stroke, heard on the left or right ' +
      'where the storm bursts. Busy moments become a drum roll with deep frame-drum booms, and ' +
      'the biggest bursts add a wooden log drum. A soft wordless choir underneath grows louder and ' +
      'higher once a year, when storms spread across the north during the northern summer. The ' +
      'start and the last twenty seconds are quiet, while the video builds up and fades out.',
    electronic:
      'Each storm bursting somewhere on the map is a drum hit: a deep thunder thump with a crackle ' +
      'on top, heard on the left or right where the storm bursts. Busy moments sound like a drum ' +
      'roll. A quiet minor-key pad underneath grows louder and higher once a year, when storms ' +
      'spread across the north during the northern summer. The start and the last twenty seconds ' +
      'are quiet, while the video builds up and fades out.',
  },
  valueLabel: 'lightning activity',
  valueWords: { low: 'little lightning', high: 'a lot of lightning' },
  legendExtra: {
    acoustic: 'Each drum stroke is a storm bursting somewhere on the map, heard where it happens.',
    electronic: 'Each drum hit is a storm bursting somewhere on the map, heard where it happens.',
  },
  emptyLabel: 'no lightning there',

  // The storm bursts already carry the drama: no alarm.
  alarm: { on: false },

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
    trimDb: { acoustic: -5.5, electronic: -2.5 },
  },

  mixMapping: {
    electronic: { volumeDb: [-12, -5], filterHz: [400, 2000], maxHits: 5, tremolo: [0, 0.35] },
  },

  layers: {
    // Storm bursts are sudden, rhythmic events, so they become hand drums;
    // a deep frame drum on busy frames gives the thunder its weight, a log
    // drum marks the biggest bursts. The "aa"-"oh" choir carries the yearly swell.
    acoustic: [
      { kind: 'vocal', role: 'chord', volume: -4, octave: 0, every: '2m', chance: 0.6, vowels: ['aa', 'oh'] },
      { kind: 'handDrums', role: 'hits', volume: -4 },
      { kind: 'frameDrum', role: 'hits', volume: -6, minHits: 2, once: true, octave: 0 },
      { kind: 'logDrum', role: 'hits', volume: -10, minHits: 5, once: true, octave: 2 },
    ],
    electronic: [
      { kind: 'pad', role: 'chord', volume: -4, octave: 0, every: '2m', chance: 0.6 },
      { kind: 'thunder', role: 'hits', volume: -4 },
      { kind: 'crackle', role: 'hits', volume: -14 },
    ],
  },
};
