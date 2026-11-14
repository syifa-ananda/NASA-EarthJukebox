// Narrator: the single way the UI talks to screen readers.
// Writes to the one polite live region, #announcer, in index.html.
//
// Two priorities:
//   'status'    Buttons, record selection, settings. Always spoken; replaces
//               anything still waiting to be written.
//   'narration' Live data while playing. Dropped (never queued) if a status
//               message was spoken in the last NARRATION_GUARD_MS, so it never
//               talks over "Playing…", "Paused…" and the like.

const region = document.getElementById('announcer');

const REPEAT_WINDOW_MS = 4000;
export const NARRATION_GUARD_MS = 1500;

let lastText = '';
let lastAt = 0;
let lastStatusAt = -Infinity;
let pending = null;

/** Milliseconds until a 'narration' message would be accepted (0 = now). */
export function msUntilNarrationAllowed() {
  return Math.max(0, lastStatusAt + NARRATION_GUARD_MS - performance.now());
}

/**
 * Announce a short plain-language message. Returns true if it will be spoken.
 * The same text is not repeated within a few seconds unless force is set.
 */
export function announce(text, { force = false, priority = 'status' } = {}) {
  if (!region || !text) return false;
  const now = performance.now();
  if (priority === 'narration' && now - lastStatusAt < NARRATION_GUARD_MS) return false;
  if (!force && text === lastText && now - lastAt < REPEAT_WINDOW_MS) return false;

  lastText = text;
  lastAt = now;
  if (priority !== 'narration') lastStatusAt = now;

  // Clear first, then set on the next tick, so screen readers treat it as
  // new content even when it matches what is already in the region.
  clearTimeout(pending);
  region.textContent = '';
  pending = setTimeout(() => {
    region.textContent = text;
  }, 60);
  return true;
}
