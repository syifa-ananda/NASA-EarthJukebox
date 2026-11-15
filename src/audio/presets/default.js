// Generic preset: used for any dataset id without its own preset, and the base
// every other preset is merged over (see presets/index.js). Follows the
// "Ideas for sound" column in docs/data-contract.md.

/** @type {import('../types.js').Preset} */
export default {
  id: 'default',
  name: 'Generic Earth data',
  soundDescription:
    'A gentle plucked melody over a soft pad. Higher values play higher notes. ' +
    'Brighter pictures sound louder and brighter, busier maps play more notes, ' +
    'warm colours move to a major key and cool colours to a minor key, ' +
    'and the sound moves left or right to follow the activity on the map.',
  valueLabel: 'value',
  valueWords: { low: 'lower values', high: 'higher values' },
  legendExtra: '',
  emptyLabel: 'nothing there',

  rootMidi: 48,            // C3
  octaves: 2,
  scales: { warm: 'majorPentatonic', cool: 'minorPentatonic' },

  // Multiplies each frame field before mapping (after per-file normalization,
  // see engine/normalize.js). 1 = as is. For artistic emphasis only: ranges
  // are already handled by normalization.
  weights: { brightness: 1, warmth: 1, density: 1, pan: 1, motion: 1, flashes: 1, value: 1 },

  // Which frame field drives which sound parameter.
  sources: {
    loudness: 'brightness', // contract: brightness -> overall loudness / filter brightness
    cutoff: 'brightness',
    mode: 'warmth',         // contract: warmth -> timbre, major vs minor feel
    timbre: 'warmth',
    voices: 'density',      // contract: density -> number of notes / layers
    rate: 'density',
    tempo: 'motion',        // contract: motion -> rhythm speed, tremolo
    tremolo: 'motion',
    swell: 'motion',
    pitch: 'value',         // contract: value -> pitch on a musical scale
    tension: 'value',
  },

  mapping: {
    ramp: 0.5,
    volumeDb: [-12, 0],
    filterHz: [500, 6000],
    bpm: [66, 104],
    subdivisions: ['4n', '8n', '16n'],
    noteChance: [0.45, 1],
    maxVoices: 4,
    panWidth: 0.8,
    tremolo: [0, 0.5],
    tension: [0.6, 0.95],
    modeThreshold: 0.5,
    maxHits: 6,
    hitWindow: 0.5,
    reverb: { decay: 3.5, wet: 0.3 },
    trimDb: 2,              // loudness match across presets (measured, about -20 dB RMS)
  },

  layers: [
    { kind: 'pluck', role: 'arp', volume: 0, octave: 1, noteLength: '8n' },
    { kind: 'pad', role: 'chord', volume: -2, octave: 0, every: '1m', swellDb: 6 },
    { kind: 'knock', role: 'hits', volume: -8 },
  ],
};
