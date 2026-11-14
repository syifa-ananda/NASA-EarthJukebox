// Plain-language descriptions of a frame, for text alternatives and narration.

const TOP_SHARE = 0.1; // look at the top 10% of cells

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function spread(xs, m) {
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Where the highest values sit on the map, e.g.
 * "Warmest water in a band across the middle of the map."
 * Row 0 is north, column 0 is west (see docs/data-contract.md).
 */
export function whereHighest(grid, highWord = 'Highest values') {
  const rows = grid.length;
  const cols = grid[0].length;
  const cells = [];
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = grid[y][x];
      cells.push([v, (x + 0.5) / cols, (y + 0.5) / rows]);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max - min < 0.05) return 'Values are nearly even across the map.';

  cells.sort((a, b) => b[0] - a[0]);
  const top = cells.slice(0, Math.max(1, Math.ceil(cells.length * TOP_SHARE)));
  const xs = top.map((c) => c[1]);
  const ys = top.map((c) => c[2]);
  const cx = mean(xs);
  const cy = mean(ys);
  const sx = spread(xs, cx);
  const sy = spread(ys, cy);

  const ns = cy < 1 / 3 ? 'north' : cy > 2 / 3 ? 'south' : '';
  const ew = cx < 1 / 3 ? 'west' : cx > 2 / 3 ? 'east' : '';

  if (sx > 0.22 && sy > 0.2) return `${highWord} scattered across the map.`;
  if (sx > 0.22) return `${highWord} in a band across the ${ns || 'middle'} of the map.`;
  if (sy > 0.22) return `${highWord} in a band down the ${ew || 'middle'} of the map.`;
  if (!ns && !ew) return `${highWord} near the centre of the map.`;
  return `${highWord} in the ${ns}${ns && ew ? '-' : ''}${ew} of the map.`;
}

/** Text alternative for the heatmap canvas. */
export function describeFrame(record, frame, index, frameCount) {
  return `Heatmap of ${record.summary.subject}, frame ${index + 1} of ${frameCount}. ${whereHighest(frame.grid, record.summary.high)}`;
}
