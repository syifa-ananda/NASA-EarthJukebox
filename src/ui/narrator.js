// Narrator: the single way the UI talks to screen readers.
// Writes to the polite live region #announcer in index.html.
// Step 4 will add throttling and verbosity levels on top of announce().

const region = document.getElementById('announcer');

const REPEAT_WINDOW_MS = 4000;

let lastText = '';
let lastAt = 0;
let pending = null;

/**
 * Announce a short plain-language message.
 * The same text is not repeated within a few seconds unless force is set.
 */
export function announce(text, { force = false } = {}) {
  if (!region || !text) return;
  const now = performance.now();
  if (!force && text === lastText && now - lastAt < REPEAT_WINDOW_MS) return;
  lastText = text;
  lastAt = now;

  // Clear first, then set on the next tick, so screen readers treat it as
  // new content even when it matches what is already in the region.
  clearTimeout(pending);
  region.textContent = '';
  pending = setTimeout(() => {
    region.textContent = text;
  }, 60);
}
