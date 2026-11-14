// Per-file normalization. Each dataset uses only part of the contract's 0-1
// range (e.g. a dark night map has brightness 0.03-0.28), so before mapping we
// rescale every field to the range that file actually uses. Presets then work
// the same on mock and real data. Pure functions, no Tone.js.
//
// Raw values are never lost: the engine keeps them for describeFrame() and
// probe() results; only the sound mapping sees normalized values.

/** Fields that get rescaled. `pan` (a real position) and `flashes` (a count) don't. */
export const NORMALIZED_FIELDS = ['brightness', 'warmth', 'density', 'motion', 'value'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Value at quantile q (0-1) of an already sorted array, linearly interpolated. */
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const frac = pos - i;
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * frac;
}

/**
 * Robust low/high of a list of numbers: the 5th-95th percentile, so a few
 * outlier frames don't squash everything else. Ranges narrower than
 * `minSpan` are widened around their centre: otherwise tiny noise in a
 * nearly constant field would swing across the whole 0-1 range.
 * @returns {import('../types.js').ValueRange}
 */
export function robustRange(values, { low = 0.05, high = 0.95, minSpan = 0.1 } = {}) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return { lo: 0, hi: 1, widened: false };
  let lo = quantile(sorted, low);
  let hi = quantile(sorted, high);
  const widened = hi - lo < minSpan;
  if (widened) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
    // Keep inside 0-1 by shifting, not shrinking.
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > 1) { lo -= hi - 1; hi = 1; }
  }
  return { lo: round(lo), hi: round(hi), widened };
}

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Analyze a whole features.json and return the range of every normalized
 * field plus the grid cells. Call once when a dataset is loaded.
 * @param {import('../types.js').FeaturesFile} file
 * @returns {import('../types.js').Ranges}
 */
export function analyzeRanges(file, options) {
  const frames = Array.isArray(file?.frames) ? file.frames : [];
  const fields = {};
  for (const key of NORMALIZED_FIELDS) {
    fields[key] = robustRange(frames.map((f) => f[key]), options);
  }
  const cells = [];
  for (const f of frames) {
    if (Array.isArray(f.grid)) for (const row of f.grid) cells.push(...row);
  }
  return {
    dataset: file?.dataset ?? null,
    frameCount: frames.length,
    fields,
    grid: cells.length ? robustRange(cells, options) : fields.value,
  };
}

/** Rescale one number from `range` to 0-1 (clamped). */
export function normalizeValue(v, range) {
  if (!range) return clamp01(v);
  return clamp01((v - range.lo) / (range.hi - range.lo));
}

/**
 * Copy of `frame` with every NORMALIZED_FIELDS entry rescaled. `pan`,
 * `flashes`, `t` and `grid` are copied unchanged.
 * @param {import('../types.js').Frame} frame  A sanitized frame.
 * @param {import('../types.js').Ranges | null} ranges
 */
export function normalizeFrame(frame, ranges) {
  if (!ranges) return frame;
  const out = { ...frame };
  for (const key of NORMALIZED_FIELDS) out[key] = normalizeValue(frame[key], ranges.fields[key]);
  return out;
}
