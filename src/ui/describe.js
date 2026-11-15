// "Where is it highest?" sentences for the detailed narration and the heatmap
// fallback's text alternative. Grid-aware (config/datasets.js → gridKind):
//   world map: names the region of the highest cell ("over China and East Asia")
//   screen:    picture positions only ("near the centre of the picture"); never
//              region names, because the co2 grid is a turning globe on screen.

import { placeAt } from './regions.js';

const TOP_SHARE = 0.1; // look at the top 10% of non-empty cells

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function spread(xs, m) {
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Picture position of a spot given as fractions (0–1) of width and height. */
function pictureSpot(fx, fy) {
  const v = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : '';
  const h = fx < 1 / 3 ? 'left' : fx > 2 / 3 ? 'right' : '';
  if (!v && !h) return 'near the centre of the picture';
  if (v && h) return `in the ${v === 'top' ? 'upper' : 'lower'} ${h} of the picture`;
  return v ? `at the ${v} of the picture` : `on the ${h} side of the picture`;
}

/**
 * Where the highest values sit, e.g. "Brightest lights over China and East Asia."
 * Empty cells (0 = nothing there) are ignored. Returns '' when the grid is empty.
 * @param {number[][]} grid
 * @param {string} highWord  e.g. 'Brightest lights'
 * @param {{ gridKind?: string, westLon?: number }} [opts]
 */
export function whereHighest(grid, highWord = 'Highest values', { gridKind = 'world-map', westLon = -180, dataOn = 'any', preposition = 'over' } = {}) {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] > 0) cells.push([grid[y][x], x, y]);
    }
  }
  if (!cells.length) return '';
  cells.sort((a, b) => b[0] - a[0]);

  if (gridKind === 'world-map') {
    const [, x, y] = cells[0];
    const place = placeAt(x, y, { cols, rows, gridKind, westLon, dataOn, hasData: true });
    return `${highWord} ${place.coastal ? 'along' : preposition} ${place.phrase}.`;
  }

  const top = cells.slice(0, Math.max(1, Math.ceil(cells.length * TOP_SHARE)));
  const xs = top.map((c) => (c[1] + 0.5) / cols);
  const ys = top.map((c) => (c[2] + 0.5) / rows);
  const cx = mean(xs);
  const cy = mean(ys);
  if (spread(xs, cx) > 0.22 && spread(ys, cy) > 0.2) return `${highWord} scattered across the picture.`;
  return `${highWord} ${pictureSpot(cx, cy)}.`;
}

/** Text alternative for the heatmap fallback canvas. */
export function describeFrame(record, frame, index, frameCount) {
  const where = whereHighest(frame.grid, record.summary.high, { ...record, preposition: record.summary.preposition });
  return `Heatmap of ${record.summary.subject}, frame ${index + 1} of ${frameCount}.${where ? ` ${where}` : ' Nothing to show in this frame.'}`;
}
