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
// When the last status message actually reached the live region. The guard
// counts from here, not from announce(): on a busy main thread (e.g. the
// first Play, while the audio graph is built) the short write timer can fire
// a few hundred ms late.
let lastStatusAt = -Infinity;
let statusPending = false;
let pending = null;

/** Milliseconds until a 'narration' message would be accepted (0 = now). */
export function msUntilNarrationAllowed() {
  if (statusPending) return NARRATION_GUARD_MS;
  return Math.max(0, lastStatusAt + NARRATION_GUARD_MS - performance.now());
}

/**
 * Announce a short plain-language message. Returns true if it will be spoken.
 * The same text is not repeated within a few seconds unless force is set.
 */
export function announce(text, { force = false, priority = 'status' } = {}) {
  if (!region || !text) return false;
  const now = performance.now();
  const isStatus = priority !== 'narration';
  if (!isStatus && (statusPending || now - lastStatusAt < NARRATION_GUARD_MS)) return false;
  if (!force && text === lastText && now - lastAt < REPEAT_WINDOW_MS) return false;

  lastText = text;
  lastAt = now;
  if (isStatus) {
    statusPending = true;
    lastStatusAt = now;
  }

  // Clear first, then set on the next tick, so screen readers treat it as
  // new content even when it matches what is already in the region.
  clearTimeout(pending);
  region.textContent = '';
  pending = setTimeout(() => {
    region.textContent = text;
    if (isStatus) {
      statusPending = false;
      lastStatusAt = performance.now(); // the guard starts when it is really there
    } else {
      // A narration never replaces a pending status, so nothing to reset.
    }
  }, 60);
  return true;
}
