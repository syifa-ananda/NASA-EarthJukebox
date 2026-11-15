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
 * @property {number} [panRamp]              Seconds for pan ramps (default: ramp).
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
 * @property {number} trimDb                 Whole-preset level trim so presets sound equally loud.
 *                                          In preset files: a number or { acoustic, electronic }.
 */

/**
 * Instrument of a layer (see src/audio/instruments/).
 * Electronic mix: pluck, bell, pad, drone, thunder, knock, crackle.
 * Acoustic and world mix: harp, piano (synth soft keys), strings, angklung,
 * marimba, vocal (wordless vocal pad), handDrums, frameDrum, logDrum, overtone (drone).
 * @typedef {'pluck'|'bell'|'pad'|'drone'|'thunder'|'knock'|'crackle'|'harp'|'piano'|'strings'|
 *           'angklung'|'marimba'|'vocal'|'handDrums'|'frameDrum'|'logDrum'|'overtone'} InstrumentKind
 */

/**
 * One instrument layer of a preset.
 * @typedef {object} LayerSpec
 * @property {InstrumentKind} kind  Instrument.
 * @property {'arp'|'chord'|'drone'|'hits'|'marker'|'pulse'|'bass'} role
 *   arp:    one chord tone per tick (rate from `rate`/`tempo`).
 *   chord:  the whole chord every `every`.
 *   drone:  held notes that follow pitch; voices fade in with `voices` (kind 'drone' or 'overtone').
 *   hits:   percussion, one hit per flash.
 *   marker: one root note when `field` (normalized) rises past `threshold`.
 *   pulse:  heartbeat ("lub-dub") every few beats, quicker as `field` rises.
 *   bass:   low notes on the key's root and fifth (`pattern`), more often as `field` rises.
 * @property {number} volume              Layer volume in dB.
 * @property {number} [octave]            Octave offset from the preset root.
 * @property {string} [switch]            Name of an on/off switch (preset `switches`, setSwitch()).
 * @property {string} [noteLength]        arp/marker/hits: note length, e.g. '8n'.
 * @property {string} [every]             chord: how often the chord is played, e.g. '1m'.
 * @property {number} [chance]            chord: chance (0-1) each chord plays; arp: multiplies noteChance.
 * @property {number} [swellDb]           chord: dB the layer drops when `swell` is 0.
 * @property {string[]} [vowels]          vocal: one or two of 'oo', 'oh', 'aa' (slowly morphing).
 * @property {number[]} [intervals]       drone: semitones above the root, one voice each.
 * @property {number} [tensionInterval]   drone: semitones of the clashing voice.
 * @property {number} [tensionGain]       drone: level of the clashing voice at full tension (default 0.6).
 * @property {number[]} [harmonics]       overtone: harmonics the whistle can sing (default [5, 6, 8, 9, 10, 12]).
 * @property {string} [singField]         overtone: field that raises the singing harmonic (default 'value').
 * @property {number} [singDb]            overtone: level of the singing harmonic (default 22).
 * @property {string} [field]             marker/pulse: field to watch, e.g. 'motion'.
 * @property {number} [threshold]         marker: 0-1 level that triggers it.
 * @property {number[]} [chord]           marker: semitones played together, e.g. [0, 7, 12].
 * @property {boolean} [onKeyRoot]       marker: on the key's root instead of the melody's current note.
 * @property {number[]} [pattern]         bass: semitones above the key root, cycling (default [0, 7]).
 * @property {[number, number]} [beats]   pulse/bass: beats between notes at level 0 and 1, e.g. [4, 1].
 * @property {number} [minHits]           hits: play only on frames with at least this many hits.
 * @property {boolean} [once]             hits: one hit per frame instead of one per flash.
 */

/**
 * Climate alarm settings of a preset (engine/alarm.js): a slow, low, wordless
 * wailing voice that fades in when `field` (normalized) reaches `threshold`.
 * @typedef {object} AlarmConfig
 * @property {boolean} on            Whether this preset has the alarm.
 * @property {string} field          Field to watch, e.g. 'value' or a derived field.
 * @property {number} threshold      0-1 level (of this file's range) where it fades in.
 * @property {number} [hysteresis]   It turns off below threshold - hysteresis (default 0.05).
 * @property {number} [fadeIn]       Seconds (default 1.5).
 * @property {number} [fadeOut]      Seconds (default 3).
 * @property {number} [volume]       dB (default -5): keep it under the music.
 * @property {number} [octave]       Pitch: 0 = an octave above the preset root.
 * @property {string} [words]        describeFrame phrase, e.g. 'alarm: highest carbon dioxide in view'.
 * @property {string} [legend]       Legend sentence.
 * @property {string} [description]  Sentence added to soundDescription while the alarm is enabled.
 */

/**
 * A dataset preset. Only `id`, `name` and `soundDescription` are required;
 * everything else falls back to the default preset.
 * @typedef {object} Preset
 * @property {string} id                 Dataset id from public/data/index.json, or 'default'.
 * @property {string} name               Display name.
 * @property {string} soundDescription   Plain-language description of the sound, for screen readers.
 *                                       In preset files: a string or { acoustic, electronic }.
 * @property {'acoustic'|'electronic'} [mix]  The instrument mix this preset was resolved for.
 * @property {string} valueLabel         What `value` means, e.g. 'sea surface temperature'.
 * @property {{low: string, high: string}} valueWords  Legend wording, e.g. 'cooler water' / 'warmer water'.
 * @property {string} [legendExtra]      Extra sentence for the audio legend (per mix allowed in preset files).
 * @property {AlarmConfig} alarm         Climate alarm (off unless the preset turns it on).
 * @property {Record<string, boolean>} [switches]  Optional layers on/off, e.g. { angklung: true }.
 * @property {string} [legendPan]        Legend sentence about left/right (default: west/east of the map).
 * @property {string} [emptyLabel]       What a grid value of 0 means here, e.g. 'land, where there is no ocean data'.
 * @property {(frame: Frame) => Record<string, number>} [derive]
 *   Extra fields computed from each frame (e.g. from the grid). They are
 *   normalized like contract fields and can be used in `sources`.
 * @property {{minSpan?: Record<string, number>}} [normalize]  Per-field minimum span overrides.
 * @property {{field?: string, levels?: string[], prefix?: (frame: Frame, seconds: number) => string|null,
 *             motionWord?: string|null, flashWords?: [string, string]}} [describe]
 *   Wording for describeFrame (see engine/describe.js).
 * @property {number} rootMidi           Lowest note of the scale range (MIDI).
 * @property {number} octaves            Octaves the pitch can span.
 * @property {{warm: string, cool: string}} scales  Scale names from scales.js.
 * @property {Partial<Record<keyof Frame, number>>} weights  Multiplies each field before mapping
 *                                       (0 = ignore, 1 = as is, 3 = exaggerate small values).
 * @property {Sources} sources
 * @property {Mapping} mapping
 * @property {LayerSpec[]} layers      In preset files: { acoustic: LayerSpec[], electronic: LayerSpec[] }.
 */

/**
 * A value given once, or per instrument mix.
 * @template T
 * @typedef {T | {acoustic: T, electronic: T}} PerMix
 */

/**
 * A preset as written in presets/*.js (getPreset() turns it into a Preset for
 * one mix). Like Preset, but soundDescription, legendExtra, layers and
 * mapping.trimDb can be given per mix, and every field is optional except
 * id, name and soundDescription.
 * @typedef {Omit<Partial<Preset>, 'soundDescription'|'legendExtra'|'layers'|'mapping'|'alarm'> & {
 *   id: string, name: string,
 *   soundDescription: PerMix<string>,
 *   legendExtra?: PerMix<string>,
 *   layers?: PerMix<LayerSpec[]>,
 *   alarm?: Partial<AlarmConfig>,
 *   mapping?: Partial<Omit<Mapping, 'trimDb'>> & {trimDb?: PerMix<number>},
 *   mixMapping?: {acoustic?: Partial<Mapping>, electronic?: Partial<Mapping>},
 * }} PresetFile
 */

/**
 * Robust range of one field in a features.json (5th-95th percentile).
 * @typedef {object} ValueRange
 * @property {number} lo
 * @property {number} hi
 * @property {boolean} widened  True if the real range was narrower than the minimum span.
 */

/**
 * Output of analyzeRanges(file): how each field is rescaled to 0-1.
 * @typedef {object} Ranges
 * @property {string|null} dataset
 * @property {number} frameCount
 * @property {Record<'brightness'|'warmth'|'density'|'motion'|'value', ValueRange>} fields
 * @property {ValueRange} grid  Range of all grid cells (used for probe pitch).
 */

/**
 * Sound parameters computed from one frame (output of mapFrame).
 * @typedef {object} SoundParams
 * @property {boolean} alarm  The alarm field is in its top zone (always false if the preset has no alarm).
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
 * @property {Record<string, number>} levels  The frame's (normalized) numeric fields.
 */

/**
 * Result of probe(x, y).
 * @typedef {object} ProbeResult
 * @property {number} x       Column used (0-31).
 * @property {number} y       Row used (0-15).
 * @property {number} value   Raw grid value 0-1 at that cell (not normalized).
 * @property {boolean} empty  True if the cell is 0 = nothing there (a soft tick plays, no note).
 * @property {string|null} label  When empty: the preset's emptyLabel, e.g. 'land'.
 * @property {string|null} level  When not empty: 'very low' ... 'very high', relative to this dataset.
 * @property {number} pan     -1 to 1.
 * @property {number|null} midi  Note played (null when empty).
 * @property {string|null} note  Note name, e.g. 'E4' (null when empty).
 * @property {boolean} sounded  False if audio is not started yet.
 */

export {};
