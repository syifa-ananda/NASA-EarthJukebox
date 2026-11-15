// Per-file normalization. Each dataset uses only a small part of the
// contract's 0-1 range (real night lights brightness: 0.087-0.111), and
// those small changes are the real signal. Before mapping we rescale every
// field to the range the file actually uses, so they become clearly audible.
// Pure functions, no Tone.js.
//
// Raw values are never lost: probe() results keep the raw grid value; only
// the sound mapping and the description words use normalized values.

/** Contract fields that get rescaled. `pan` (a position) and `flashes` (a count) don't. */
export const NORMALIZED_FIELDS = ['brightness', 'warmth', 'density', 'motion', 'value'];

/**
 * How narrow a range may get before it is widened (the "minimum span"). A
 * real change must beat all three, otherwise it is treated as noise:
 *   ABS_FLOOR  absolute floor (data is rounded to 3 decimals)
 *   REL_SPAN   share of the field's typical level (5 % of the median)
 *   NOISE_K    times the typical frame-to-frame jitter (median |step|)
 * Presets can override the minimum span per field (preset.normalize.minSpan).
 */
export const SPAN_RULE = { ABS_FLOOR: 0.004, REL_SPAN: 0.05, NOISE_K: 3 };

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const round = (v) => Math.round(v * 10000) / 10000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Value at quantile q (0-1) of an already sorted array, linearly interpolated. */
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (pos - i);
}

/** Minimum span for a time series, following SPAN_RULE. */
export function minSpanFor(series) {
  const vals = series.filter(isNum);
  if (!vals.length) return SPAN_RULE.ABS_FLOOR;
  const median = quantile([...vals].sort((a, b) => a - b), 0.5);
  const steps = vals.slice(1).map((v, i) => Math.abs(v - vals[i])).sort((a, b) => a - b);
  const jitter = steps.length ? quantile(steps, 0.5) : 0;
  return Math.max(SPAN_RULE.ABS_FLOOR, SPAN_RULE.REL_SPAN * Math.abs(median), SPAN_RULE.NOISE_K * jitter);
}

/**
 * Robust low/high of a list of numbers: the 5th-95th percentile, so a few
 * outlier frames don't squash everything else. Ranges narrower than
 * `minSpan` are widened around their centre.
 * @returns {import('../types.js').ValueRange}
 */
export function robustRange(values, { low = 0.05, high = 0.95, minSpan = SPAN_RULE.ABS_FLOOR } = {}) {
  const sorted = values.filter(isNum).sort((a, b) => a - b);
  if (!sorted.length) return { lo: 0, hi: 1, widened: false };
  let lo = quantile(sorted, low);
  let hi = quantile(sorted, high);
  const widened = hi - lo < minSpan;
  if (widened) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  return { lo: round(lo), hi: round(hi), widened };
}

/**
 * Analyze a whole features.json and return the range of every normalized
 * field, any derived fields, and the grid cells. Call once per dataset.
 *
 * @param {import('../types.js').FeaturesFile} file
 * @param {object} [options]
 * @param {(frame: object) => Record<string, number>} [options.derive]
 *   Extra fields computed from each frame (a preset's `derive`), ranged too.
 * @param {Record<string, number>} [options.minSpan]  Per-field minimum span overrides.
 * @returns {import('../types.js').Ranges}
 */
export function analyzeRanges(file, { derive, minSpan = {} } = {}) {
  const frames = Array.isArray(file?.frames) ? file.frames : [];
  const extra = derive ? frames.map((f) => derive(f) ?? {}) : [];
  const keys = [...NORMALIZED_FIELDS, ...Object.keys(extra[0] ?? {})];

  const fields = {};
  for (const key of keys) {
    const series = NORMALIZED_FIELDS.includes(key) ? frames.map((f) => f[key]) : extra.map((e) => e[key]);
    fields[key] = robustRange(series, { minSpan: minSpan[key] ?? minSpanFor(series) });
  }

  // Grid: 0 means "nothing there" (land, unlit, no lightning, off the globe),
  // so only non-zero cells set the range.
  const cells = [];
  for (const f of frames) {
    if (Array.isArray(f.grid)) for (const row of f.grid) for (const c of row) if (c > 0) cells.push(c);
  }
  return {
    dataset: file?.dataset ?? null,
    fps: file?.fps ?? null,
    frameCount: frames.length,
    fields,
    grid: cells.length ? robustRange(cells, { minSpan: 0.05 }) : { lo: 0, hi: 1, widened: false },
  };
}

/** Rescale one number from `range` to 0-1 (clamped). Without a range: clamp only. */
export function normalizeValue(v, range) {
  if (!range) return clamp01(v);
  return clamp01((v - range.lo) / (range.hi - range.lo));
}

/**
 * Copy of `frame` with every field that has a range rescaled. `pan`,
 * `flashes`, `t` and `grid` are copied unchanged.
 * @param {object} frame  A sanitized frame (derived fields included).
 * @param {import('../types.js').Ranges | null} ranges
 */
export function normalizeFrame(frame, ranges) {
  if (!ranges) return frame;
  const out = { ...frame };
  for (const [key, range] of Object.entries(ranges.fields)) {
    if (isNum(frame[key])) out[key] = normalizeValue(frame[key], range);
  }
  return out;
}
