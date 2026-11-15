// Preset registry. Each dataset preset only lists what differs from the
// default; resolvePreset() fills in the rest. Unknown ids get the default
// preset, so a new dataset from Person 1 still makes sound.
//
// Presets have two instrument mixes (`layers: { acoustic, electronic }`);
// getPreset() returns the preset resolved for one mix: plain `layers`,
// `mapping.trimDb` and `soundDescription` for that mix, with the preset's
// `mixMapping[mix]` (e.g. a gentler top end for the electronic mix) merged
// over its mapping.

import base from './default.js';
import sst from './sst.js';
import nightlights from './nightlights.js';
import lightning from './lightning.js';
import co2 from './co2.js';

const PRESETS = { default: base, sst, nightlights, lightning, co2 };

/** Instrument mixes, in menu order. The first one is the default. */
export const MIXES = ['acoustic', 'electronic'];
export const DEFAULT_MIX = MIXES[0];

/** A value given per mix ({ acoustic, electronic }) or the same for both. */
const forMix = (v, mix) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v[mix] ?? v[DEFAULT_MIX] : v);

/**
 * Merge a partial preset over the default one, for one mix.
 * @param {object} p
 * @param {{mix?: string, alarm?: boolean}} opts  alarm: false = the user turned the alarm off.
 */
function resolvePreset(p, { mix = DEFAULT_MIX, alarm = true } = {}) {
  const label = p.valueLabel ?? base.valueLabel;
  const alarmCfg = {
    words: `alarm: very high ${label}`,
    legend: `A slow, low wailing voice means very high ${label}.`,
    description: `At very high ${label}, a slow, low wailing voice fades in.`,
    ...base.alarm,
    ...p.alarm,
  };
  const description = forMix(p.soundDescription ?? base.soundDescription, mix);
  const alarmSentence = alarmCfg.on && alarm ? ` ${alarmCfg.description}` : '';
  return {
    ...base,
    ...p,
    mix,
    soundDescription: description + alarmSentence,
    legendExtra: forMix(p.legendExtra ?? base.legendExtra, mix),
    weights: { ...base.weights, ...p.weights },
    sources: { ...base.sources, ...p.sources },
    switches: { ...p.switches },
    alarm: alarmCfg,
    mapping: {
      ...base.mapping,
      ...p.mapping,
      ...p.mixMapping?.[mix],
      trimDb: forMix(p.mapping?.trimDb ?? base.mapping.trimDb, mix),
      reverb: { ...base.mapping.reverb, ...p.mapping?.reverb },
    },
    layers: forMix(p.layers ?? base.layers, mix),
  };
}

/**
 * Full preset for a dataset id, for one instrument mix. Unknown ids get the
 * default preset.
 * @param {string} id
 * @param {{mix?: 'acoustic'|'electronic', alarm?: boolean}} [opts]
 * @returns {import('../types.js').Preset}
 */
export function getPreset(id, opts) {
  return resolvePreset(PRESETS[id] ?? base, opts);
}

/** True if `id` has its own preset (not the default fallback). */
export function hasPreset(id) {
  return id !== 'default' && id in PRESETS;
}

/**
 * Short list for menus: id, name and screen-reader description.
 * @param {{mix?: 'acoustic'|'electronic', alarm?: boolean}} [opts]
 */
export function listPresets(opts) {
  return Object.keys(PRESETS).map((id) => {
    const { name, soundDescription } = getPreset(id, opts);
    return { id, name, soundDescription };
  });
}
