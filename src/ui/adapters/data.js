// Data adapter: the only place the UI reads Person 1's output.
// Follows docs/data-contract.md. If the contract changes, only this file
// should need to change.

const DATA_ROOT = 'public/data/';

let indexPromise = null;
const featureCache = new Map();

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  }
  return res.json();
}

/** Load the dataset manifest (public/data/index.json). Cached. */
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = getJson(DATA_ROOT + 'index.json')
      .then((json) => json.datasets ?? [])
      .catch((err) => {
        indexPromise = null; // allow a retry
        throw err;
      });
  }
  return indexPromise;
}

/** Load one dataset's features.json, given its manifest entry. Cached. */
export function loadFeatures(entry) {
  if (!featureCache.has(entry.id)) {
    const p = getJson(DATA_ROOT + entry.features).catch((err) => {
      featureCache.delete(entry.id);
      throw err;
    });
    featureCache.set(entry.id, p);
  }
  return featureCache.get(entry.id);
}

/** URL of a manifest-relative media path (e.g. entry.video), or null. */
export function mediaUrl(path) {
  return path ? DATA_ROOT + path : null;
}

/** Frame i, clamped to the valid range. */
export function frameAt(data, i) {
  const last = data.frameCount - 1;
  return data.frames[Math.min(last, Math.max(0, Math.round(i)))];
}

/** Frame index for a playback time in seconds (time = t / fps). */
export function frameIndexAtTime(data, seconds) {
  return Math.min(data.frameCount - 1, Math.max(0, Math.floor(seconds * data.fps)));
}

/** Grid value at column x (west→east), row y (north→south). Row first! */
export function cell(frame, x, y) {
  return frame.grid[y][x];
}

/**
 * Optional slot for live in-browser analysis. The team currently precomputes
 * features in Python, so this stays null. If Person 1 ships a JS
 * analyzeFrame(canvas) later, import and re-export it here.
 */
export const analyzeFrame = null;
