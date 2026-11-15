// Narrator: the single way the UI talks to screen readers.
// Writes to the one polite live region, #announcer, in index.html.
//
// Status messages only: Play, Paused, Finished, errors, the selected dataset,
// sample loading, settings, Hear the alarm, the legend, and explore mode
// (W, C, cursor moves). Each one replaces anything still waiting to be
// written. There is no periodic spoken narration: the "Live description"
// card under the player is written text only (live-description.js).

const region = document.getElementById('announcer');

const REPEAT_WINDOW_MS = 4000;

let lastText = '';
let lastAt = 0;
let pending = null;

/**
 * Announce a short plain-language message. Returns true if it will be spoken.
 * The same text is not repeated within a few seconds unless force is set.
 */
export function announce(text, { force = false } = {}) {
  if (!region || !text) return false;
  const now = performance.now();
  if (!force && text === lastText && now - lastAt < REPEAT_WINDOW_MS) return false;

  lastText = text;
  lastAt = now;

  // Clear first, then set on the next tick, so screen readers treat it as
  // new content even when it matches what is already in the region.
  clearTimeout(pending);
  region.textContent = '';
  pending = setTimeout(() => {
    region.textContent = text;
  }, 60);
  return true;
}
