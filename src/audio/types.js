// Shared JSDoc types for the audio engine. Nothing runs here; editors use these
// for autocomplete and type checking.
//
// The data types mirror docs/data-contract.md exactly. If that contract
// changes, update these to match (and never the other way round).

// ---------------------------------------------------------------------------
// Data contract (owned by Person 1)
// ---------------------------------------------------------------------------

/**
 * One frame of `public/data/<id>/features.json`.
 * @typedef {object} Frame
 * @property {number} t           Frame index (0, 1, 2, ...). Seconds = t / fps.
 * @property {number} brightness  0-1, mean luminance of the picture.
 * @property {number} warmth      0-1, red-vs-blue balance (1 = very red/warm).
 * @property {number} density     0-1, share of the map that is bright/active.
 * @property {number} pan         -1 (left/west) to 1 (right/east), horizontal centre of activity.
 * @property {number} motion      0-1, how much changed since the previous frame.
 * @property {number} flashes     Integer 0-16, number of newly bright spots.
 * @property {number} value       0-1, the calibrated main quantity (pitch).
 * @property {number[][]} grid    rows x cols (16 x 32) of 0-1 values; grid[row][col],
 *                                row 0 = north/top, col 0 = west/left.
 */

/**
 * Whole `public/data/<id>/features.json` file.
 * @typedef {object} FeaturesFile
 * @property {string} dataset     Dataset id, same as the folder name.
 * @property {string} title
 * @property {number} fps         Data frames per second (frame i is at i / fps seconds).
 * @property {number} frameCount  Always equals frames.length.
 * @property {{cols: number, rows: number}} grid  Grid size, 32 x 16.
 * @property {Frame[]} frames
 */

/**
 * One entry of `public/data/index.json` -> `datasets[]`.
 * @typedef {object} DatasetEntry
 * @property {string} id
 * @property {string} title
 * @property {string} description   Plain-language, screen-reader friendly.
 * @property {string} colorMeaning
 * @property {string} source
 * @property {string} credit
 * @property {string} features      Path relative to public/data/.
 * @property {string} video         Path relative to public/data/.
 * @property {boolean} mock
 */

// ---------------------------------------------------------------------------
// Audio engine (owned by Person 2)
// ---------------------------------------------------------------------------

/**
 * Name of a frame field that can drive a sound parameter.
 * @typedef {'brightness'|'warmth'|'density'|'motion'|'value'} UnitField
 */

/**
 * Which frame field drives each sound parameter. Presets override single
 * entries; the rest come from the default preset.
 * @typedef {object} Sources
 * @property {UnitField} loudness  Layer loudness.
 * @property {UnitField} cutoff    Low-pass filter cutoff (dark -> bright).
 * @property {UnitField} mode      Warm (major) vs cool (minor) scale.
 * @property {UnitField} timbre    Extra filter brightness on warm frames.
 * @property {UnitField} voices    Number of chord voices.
 * @property {UnitField} rate      Note subdivision + chance a note plays.
 * @property {UnitField} tempo     Transport BPM.
 * @property {UnitField} tremolo   Tremolo depth.
 * @property {UnitField} swell     Pad swells (layers with swellDb).
 * @property {UnitField} pitch     Melody / chord root on the scale.
 * @property {UnitField} tension   Clashing drone voice (layers with tensionInterval).
 */

/**
 * Ranges the mapped parameters move between. `[low, high]` pairs map the
 * driving field from 0 to 1.
 * @typedef {object} Mapping
 * @property {number} ramp                   Seconds for parameter ramps (smoothing).
 * @property {[number, number]} volumeDb     Layer loudness range in dB.
 * @property {[number, number]} filterHz     Filter cutoff range (exponential).
 * @property {[number, number]} bpm          Tempo range.
 * @property {string[]} subdivisions         Note lengths from slow to fast, e.g. ['4n', '8n', '16n'].
 * @property {[number, number]} noteChance   Chance (0-1) that an arpeggio tick plays.
 * @property {number} maxVoices              Chord voices at full density.
 * @property {number} panWidth               0-1, how far the sound follows `pan`.
 * @property {[number, number]} tremolo      Tremolo depth range.
 * @property {[number, number]} tension      Tension field range where the clash fades in.
 * @property {number} modeThreshold          Mode field value where cool turns warm.
 * @property {number} maxHits                Max percussion hits per frame.
 * @property {number} hitWindow              Seconds over which a frame's hits are spread.
 * @property {{decay: number, wet: number}} reverb
 */

/**
 * One instrument layer of a preset.
 * @typedef {object} LayerSpec
 * @property {'pluck'|'bell'|'pad'|'drone'|'thunder'|'crackle'|'knock'} kind  Instrument.
 * @property {'arp'|'chord'|'drone'|'hits'} role
 *   arp:   one chord tone per tick (rate from `rate`/`tempo`).
 *   chord: the whole chord every `every`.
 *   drone: held notes that follow pitch; voices fade in with `voices`.
 *   hits:  percussion, one hit per flash.
 * @property {number} volume              Layer volume in dB.
 * @property {number} [octave]            Octave offset from the preset root.
 * @property {string} [noteLength]        arp: note length, e.g. '8n'.
 * @property {string} [every]             chord: how often the chord is played, e.g. '1m'.
 * @property {number} [chance]            chord: chance (0-1) each chord plays.
 * @property {number} [swellDb]           chord: dB the layer drops when `swell` is 0.
 * @property {number[]} [intervals]       drone: semitones above the root, one voice each.
 * @property {number} [tensionInterval]   drone: semitones of the clashing voice.
 */

/**
 * A dataset preset. Only `id`, `name` and `soundDescription` are required;
 * everything else falls back to the default preset.
 * @typedef {object} Preset
 * @property {string} id                 Dataset id from public/data/index.json, or 'default'.
 * @property {string} name               Display name.
 * @property {string} soundDescription   Plain-language description of the sound, for screen readers.
 * @property {string} valueLabel         What `value` means, e.g. 'sea surface temperature'.
 * @property {number} rootMidi           Lowest note of the scale range (MIDI).
 * @property {number} octaves            Octaves the pitch can span.
 * @property {{warm: string, cool: string}} scales  Scale names from scales.js.
 * @property {Partial<Record<keyof Frame, number>>} weights  Multiplies each field before mapping
 *                                       (0 = ignore, 1 = as is, 3 = exaggerate small values).
 * @property {Sources} sources
 * @property {Mapping} mapping
 * @property {LayerSpec[]} layers
 */

/**
 * Sound parameters computed from one frame (output of mapFrame).
 * @typedef {object} SoundParams
 * @property {'warm'|'cool'} mode
 * @property {string} scaleName
 * @property {number} volumeDb
 * @property {number} filterHz
 * @property {number} pan
 * @property {number} bpm
 * @property {number} tremoloDepth
 * @property {string} subdivision
 * @property {number} noteChance
 * @property {number} voices
 * @property {number} pitchIndex     Scale step of the root (0 = rootMidi).
 * @property {number[]} chord        MIDI notes of the current chord.
 * @property {number} swell          0-1.
 * @property {number} tension        0-1.
 * @property {number} hits           Percussion hits to play for this frame.
 * @property {number} velocity       0-1.
 */

/**
 * Result of probe(x, y).
 * @typedef {object} ProbeResult
 * @property {number} x       Column used (0-31).
 * @property {number} y       Row used (0-15).
 * @property {number} value   Grid value 0-1 at that cell.
 * @property {number} pan     -1 to 1.
 * @property {number} midi    Note played.
 * @property {string} note    Note name, e.g. 'E4'.
 * @property {boolean} sounded  False if audio is not started yet.
 */

export {};
