// Preset registry. Each dataset preset only lists what differs from the
// default; resolvePreset() fills in the rest. Unknown ids get the default
// preset, so a new dataset from Person 1 still makes sound.

import base from './default.js';
import sst from './sst.js';
import nightlights from './nightlights.js';
import lightning from './lightning.js';
import co2 from './co2.js';

const PRESETS = { default: base, sst, nightlights, lightning, co2 };

/** Merge a partial preset over the default one. */
function resolvePreset(p) {
  return {
    ...base,
    ...p,
    weights: { ...base.weights, ...p.weights },
    sources: { ...base.sources, ...p.sources },
    mapping: {
      ...base.mapping,
      ...p.mapping,
      reverb: { ...base.mapping.reverb, ...p.mapping?.reverb },
    },
    layers: p.layers ?? base.layers,
  };
}

/**
 * Full preset for a dataset id. Unknown ids get the default preset.
 * @param {string} id
 * @returns {import('../types.js').Preset}
 */
export function getPreset(id) {
  return resolvePreset(PRESETS[id] ?? base);
}

/** True if `id` has its own preset (not the default fallback). */
export function hasPreset(id) {
  return id !== 'default' && id in PRESETS;
}

/** Short list for menus: id, name and screen-reader description. */
export function listPresets() {
  return Object.values(PRESETS).map(({ id, name, soundDescription }) => ({ id, name, soundDescription }));
}
