// Person 2's preset texts, ready to show or speak.
//
// Since the instruments update, preset texts can be given per instrument mix
// ({ acoustic, electronic }). getPreset() normally resolves them, but every
// place the UI shows preset text goes through presetText() anyway, so an
// object can never reach the page as "[object Object]".
//
// WORDING_FIXES: two phrases we asked Person 2 to change (banned-claims rules:
// CO2 never "rises", and the climate alarm must not sound like distress).
// Until their presets change, the UI rewrites them on the way out. Each fix
// matches the old wording exactly, so it stops doing anything once Person 2
// updates the text. Remove an entry when it no longer matches anything.

import { DEFAULT_MIX } from '../audio/presets/index.js';

const WORDING_FIXES = [
  // co2 legendExtra (acoustic): "The drum heartbeat quickens as carbon dioxide rises."
  [/quickens as carbon dioxide rises/g, 'quickens when more carbon dioxide is in view'],
  // Alarm legend / description: "a slow, low wailing voice" (co2 and the default alarm text).
  [/\b([Aa]) slow, low wailing voice/g, '$1 soft, low singing voice'],
  [/\bwailing voice\b/g, 'soft, low singing voice'],
  [/\bwailing sound\b/g, 'soft singing voice'],
];

/** Apply the interim wording fixes to a finished sentence. */
export function fixWording(text) {
  if (typeof text !== 'string' || !text) return '';
  return WORDING_FIXES.reduce((t, [from, to]) => t.replace(from, to), text);
}

/**
 * A preset text as a plain string: a string as is, a per-mix object resolved
 * for `mix` (falling back to the default mix, then to any string value), and
 * anything else as ''.
 */
export function presetText(value, mix = DEFAULT_MIX) {
  if (typeof value === 'string') return fixWording(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const picked = value[mix] ?? value[DEFAULT_MIX] ?? Object.values(value).find((v) => typeof v === 'string');
    return typeof picked === 'string' ? fixWording(picked) : '';
  }
  return '';
}
