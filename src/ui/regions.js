// Region names for the explore-mode cursor.
//
// APPROXIMATE. Hand-drawn for a 32 × 16 grid over a whole-world
// equirectangular map (longitude −180…180 west → east, latitude 90…−90
// north → south), matching docs/data-contract.md: grid[row][col], row 0 =
// north, col 0 = west. Each cell is 11.25° × 11.25°, so coastlines are rough
// and small places (islands, narrow seas) disappear. If a dataset's frames
// are not a whole-world equirectangular map, these names will be wrong, so
// check them when Person 1's real frames arrive.
//
// Cell centres: longitude = −174.4 + 11.25 × col, latitude = 84.4 − 11.25 × row.

const NAMES = {
  // Land
  G: 'Greenland',
  K: 'Alaska',
  C: 'Canada',
  U: 'United States',
  M: 'Mexico and Central America',
  S: 'Amazon and northern South America',
  T: 'southern South America',
  E: 'Europe',
  H: 'Sahara and North Africa',
  F: 'Central and West Africa',
  Z: 'southern Africa',
  g: 'Madagascar',
  Y: 'Middle East',
  I: 'Central Asia',
  R: 'Russia and Siberia',
  D: 'India and South Asia',
  N: 'China and East Asia',
  J: 'Japan',
  W: 'Southeast Asia and Indonesia',
  O: 'Australia',
  n: 'New Zealand',
  X: 'Antarctica',
  // Water
  A: 'Arctic Ocean',
  h: 'Hudson Bay',
  Q: 'Gulf of Mexico and Caribbean',
  m: 'Mediterranean Sea',
  v: 'Caspian Sea',
  w: 'South China Sea',
  p: 'North Pacific',
  q: 'Equatorial Pacific',
  r: 'South Pacific',
  a: 'North Atlantic',
  b: 'Equatorial Atlantic',
  c: 'South Atlantic',
  i: 'Indian Ocean',
  k: 'South Indian Ocean',
  s: 'Southern Ocean',
};

// One string per row, north (row 0) to south (row 15); one letter per column,
// west (col 0) to east (col 31).
//          col: 0         1         2         3
//               01234567890123456789012345678901
const ROWS = [
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', //  0  84°N
  'AAAAACCCCCAGGGAAAAAAAARRRRRRAAAA', //  1  73°N
  'pKKKCCCChCaGGaaaEEEERRRRRRRRRRRR', //  2  62°N
  'pppppCCCCCCaaaaaEEEEIIIINNNNRppp', //  3  51°N
  'pppppUUUUaaaaaaEmEYYvIINNNNNJppp', //  4  39°N
  'ppppppMQQaaaaaaHHHHYYYDDDNNppppp', //  5  28°N
  'qqqqqqqMMQQbbbFHHHHYYiDiWWwqqqqq', //  6  17°N
  'qqqqqqqqqSSbbbbFFFFFiiiiWwWqqqqq', //  7   6°N
  'qqqqqqqqqSSSSbbbbFFFiiiiiWWWWWqq', //  8   6°S
  'rrrrrrrrrrSSScccZZZZgiiiiiiOOrrr', //  9  17°S
  'rrrrrrrrrrTTcccccZZkkkkkkkOOOOrr', // 10  28°S
  'rrrrrrrrrTTccccccckkkkkkkkkkkrrn', // 11  39°S
  'sssssssssTssssssssssssssssssssss', // 12  51°S
  'ssssssssssssssssssssssssssssssss', // 13  62°S
  'sXXXXXXXXXXsssXXXXXXXXXXXXXXXXXs', // 14  73°S
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // 15  84°S
];

export const REGION_COLS = 32;
export const REGION_ROWS = 16;

/** Scale a cell from any grid size onto the 32 × 16 table. */
function toTable(x, y, cols, rows) {
  const tx = Math.min(REGION_COLS - 1, Math.floor(((x + 0.5) / cols) * REGION_COLS));
  const ty = Math.min(REGION_ROWS - 1, Math.floor(((y + 0.5) / rows) * REGION_ROWS));
  return [tx, ty];
}

/** Compass words for any cell, e.g. "far north, west of centre". */
export function compassAt(x, y, cols = REGION_COLS, rows = REGION_ROWS) {
  const fx = (x + 0.5) / cols;
  const fy = (y + 0.5) / rows;
  const ns = fy < 0.2 ? 'far north' : fy < 0.4 ? 'north' : fy <= 0.6 ? 'near the equator' : fy <= 0.8 ? 'south' : 'far south';
  const ew = fx < 0.25 ? 'west' : fx < 0.45 ? 'west of centre' : fx <= 0.55 ? 'centre' : fx <= 0.75 ? 'east of centre' : 'east';
  return `${ns}, ${ew}`;
}

/** Approximate region name for grid cell (x, y). Falls back to compass words. */
export function regionAt(x, y, cols = REGION_COLS, rows = REGION_ROWS) {
  const [tx, ty] = toTable(x, y, cols, rows);
  return NAMES[ROWS[ty]?.[tx]] ?? compassAt(x, y, cols, rows);
}

/** For tests: every row has 32 letters and every letter has a name. */
export function checkTable() {
  const problems = [];
  if (ROWS.length !== REGION_ROWS) problems.push(`expected ${REGION_ROWS} rows, got ${ROWS.length}`);
  ROWS.forEach((row, i) => {
    if (row.length !== REGION_COLS) problems.push(`row ${i} has ${row.length} letters`);
    for (const ch of row) if (!NAMES[ch]) problems.push(`row ${i}: unknown letter ${ch}`);
  });
  return problems;
}
