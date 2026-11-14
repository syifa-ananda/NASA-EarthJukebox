// Colour ramps for the heatmap placeholder and the legend bar.
// A ramp is an array of hex colours spaced evenly from low (0) to high (1).

const FALLBACK = ['#000000', '#ffffff'];

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Returns [r, g, b] for value t (0–1) on the ramp. */
export function rampRgb(stops = FALLBACK, t = 0) {
  const s = stops.length > 1 ? stops : FALLBACK;
  const x = Math.min(1, Math.max(0, t)) * (s.length - 1);
  const i = Math.min(s.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(s[i]);
  const b = hexToRgb(s[i + 1]);
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
}

/** CSS gradient string for a legend bar. */
export function cssGradient(stops = FALLBACK) {
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
