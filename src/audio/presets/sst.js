// Global Sea Surface Temperature, March 2007 - March 2008 (real data).
// The global mean (`value`, 0.58-0.60) barely moves within a year, so the
// melody follows the seasons instead. `seasons` (derived from the grid) =
// mean of the northern mid-latitude ocean rows minus the southern ones; land
// cells (0) are ignored. It rises toward the northern summer (peak around
// August-September) and falls toward the southern summer.

const NORTH_ROWS = [2, 5];    // about 56-34 deg N
const SOUTH_ROWS = [10, 13];  // about 34-56 deg S

/** Mean of the non-zero (ocean) cells in rows r0..r1. */
function oceanMean(grid, [r0, r1]) {
  let sum = 0;
  let n = 0;
  for (let r = r0; r <= r1; r++) {
    for (const c of grid?.[r] ?? []) {
      if (c > 0) {
        sum += c;
        n++;
      }
    }
  }
  return n ? sum / n : 0;
}

/** @type {Partial<import('../types.js').Preset>} */
export default {
  id: 'sst',
  name: 'Ocean temperature and currents',
  soundDescription:
    'Slow, flowing pads like ocean swells, following a year of ocean currents from March 2007 ' +
    'to March 2008. The melody climbs as the northern oceans warm up toward the northern summer, ' +
    'is highest around August and September, and sinks again as the southern oceans warm. ' +
    'The pads swell when the currents change faster, and a few soft bell notes drift on top. ' +
    'In explore mode, warmer water plays higher notes and land plays a soft tick.',
  valueLabel: 'water temperature',
  valueWords: { low: 'cooler water', high: 'warmer water' },
  legendExtra:
    'In the music, the melody climbs when the northern oceans are warmer than the southern ones, ' +
    'and sinks when the south is warmer.',
  emptyLabel: 'land, where there is no ocean data',

  derive: (f) => ({ seasons: oceanMean(f.grid, NORTH_ROWS) - oceanMean(f.grid, SOUTH_ROWS) }),
  sources: { pitch: 'seasons' },
  describe: {
    field: 'seasons',
    levels: [
      'southern oceans at their warmest',
      'southern oceans warmer',
      'between seasons',
      'northern oceans warmer',
      'northern oceans at their warmest',
    ],
  },

  rootMidi: 43,            // G2: low and warm
  // Real warmth is nearly constant (0.61-0.64), so one key instead of noise-driven switching.
  scales: { warm: 'majorPentatonic', cool: 'majorPentatonic' },

  mapping: {
    ramp: 1.5,
    bpm: [54, 72],
    subdivisions: ['2n', '4n'],
    noteChance: [0.15, 0.5],
    maxVoices: 4,
    filterHz: [400, 3500],
    tremolo: [0, 0.15],
    reverb: { decay: 6, wet: 0.45 },
    trimDb: -3.5,
  },

  layers: [
    { kind: 'pad', role: 'chord', volume: 4, octave: 0, every: '1m', swellDb: 6 },
    { kind: 'pad', role: 'chord', volume: -5, octave: 1, every: '2m', swellDb: 4 },
    { kind: 'bell', role: 'arp', volume: -10, octave: 2, noteLength: '2n' },
  ],
};
