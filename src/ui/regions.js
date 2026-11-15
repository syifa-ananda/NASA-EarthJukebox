// Place words for the explore-mode cursor and the heatmap's text alternative.
//
// Two kinds of grid (config/datasets.js → gridKind):
//
// 'world-map'  A whole-world flat (equirectangular) map: rows run evenly from
//              90° N (top) to 90° S, columns evenly around 360° of longitude.
//              regionAt() names the area under a cell from the table below.
// 'screen'     The grid covers the picture, not the Earth (co2: a turning
//              globe). pictureAt() gives positions such as "upper left of the
//              picture". Never use region names for these.
//
// THE TABLE IS APPROXIMATE. 32 × 16 cells of 11.25° × 11.25°, longitude
// −180…180 west → east (column 0 starts at 180° W), latitude 90…−90.
// Land and sea for rows 2–12 (about 62° N to 51° S) were redrawn from the real
// sst video (public/data/sst/video.mp4): land is the flat grey there, and a
// cell counts as land when at least 40 % of it is land. Island regions
// (Southeast Asia and Indonesia, Japan, Madagascar, New Zealand, Greenland)
// keep their names even where they are mostly sea, and named inland waters
// (Hudson Bay, Caspian Sea) stay water. The polar rows 0–1 and 13–15 stay
// hand-drawn. Names are hand-assigned per area.
//
// Cell centres: longitude = −174.4 + 11.25 × col, latitude = 84.4 − 11.25 × row.

/** name, plus whether it takes "the" in a sentence ("over the North Atlantic"). */
const NAMES = {
  // Land
  G: ['Greenland'],
  K: ['Alaska'],
  C: ['Canada'],
  U: ['United States', true],
  M: ['Mexico and Central America'],
  S: ['Amazon and northern South America', true],
  T: ['southern South America'],
  E: ['Europe'],
  H: ['Sahara and North Africa', true],
  F: ['Central and West Africa'],
  Z: ['southern Africa'],
  g: ['Madagascar'],
  Y: ['Middle East', true],
  I: ['Central Asia'],
  R: ['Russia and Siberia'],
  D: ['India and South Asia'],
  N: ['China and East Asia'],
  J: ['Japan'],
  W: ['Southeast Asia and Indonesia'],
  O: ['Australia'],
  n: ['New Zealand'],
  X: ['Antarctica'],
  // Water
  A: ['Arctic Ocean', true],
  h: ['Hudson Bay'],
  Q: ['Gulf of Mexico and Caribbean', true],
  m: ['Mediterranean Sea', true],
  v: ['Caspian Sea', true],
  w: ['South China Sea', true],
  p: ['North Pacific', true],
  q: ['Equatorial Pacific', true],
  r: ['South Pacific', true],
  a: ['North Atlantic', true],
  b: ['Equatorial Atlantic', true],
  c: ['South Atlantic', true],
  i: ['Indian Ocean', true],
  k: ['South Indian Ocean', true],
  s: ['Southern Ocean', true],
};

// One string per row, north (row 0) to south (row 15); one letter per column,
// west (col 0, 180° W) to east (col 31).
//          col: 0         1         2         3
//               01234567890123456789012345678901
const ROWS = [
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', //  0  84°N
  'AAAAACCCCCAGGGAAAAAAAARRRRRRAAAA', //  1  73°N
  'pKKKCCCChCaGGaaaaEEERRRRRRRRRRRR', //  2  62°N
  'ppppCCCCCCCaaaaaEEEEIIIINNNNRppp', //  3  51°N
  'pppppUUUUaaaaaaEmmYYvIINNNNNJppp', //  4  39°N
  'ppppppMMQaaaaaaHHHHYYYDDDNNppppp', //  5  28°N
  'qqqqqqqqQQQbbbFHHHHYYiiiWWwqqqqq', //  6  17°N
  'qqqqqqqqqSSbbbbFFFFFiiiiWwWqqqqq', //  7   6°N
  'qqqqqqqqqSSSSbbbbFFFiiiiiWWWWWqq', //  8   6°S
  'rrrrrrrrrSSSSccccZZkgiiiiiiOOrrr', //  9  17°S
  'rrrrrrrrrrTTcccccZZkkkkkkkOOOOrr', // 10  28°S
  'rrrrrrrrrTTccccccckkkkkkkkkkkrrn', // 11  39°S
  'sssssssssTssssssssssssssssssssss', // 12  51°S
  'ssssssssssssssssssssssssssssssss', // 13  62°S
  'sXXXXXXXXXXsssXXXXXXXXXXXXXXXXXs', // 14  73°S
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // 15  84°S
];

export const REGION_COLS = 32;
export const REGION_ROWS = 16;

const LAND_LETTERS = new Set('GKCUMSTEHFZgYIRDNJWOnX');

/**
 * Table cell for grid cell (x, y) of a world map whose left edge is at
 * longitude `westLon` (−180 for most maps; nightlights starts near −168).
 */
function tableCell(x, y, cols, rows, westLon) {
  const lon = westLon + ((x + 0.5) / cols) * 360;
  const wrapped = ((((lon + 180) % 360) + 360) % 360); // 0…360 from 180° W
  const tx = Math.min(REGION_COLS - 1, Math.floor((wrapped / 360) * REGION_COLS));
  const ty = Math.min(REGION_ROWS - 1, Math.floor(((y + 0.5) / rows) * REGION_ROWS));
  return ROWS[ty][tx];
}

/** Compass words for a world-map cell, e.g. "far north, west of centre". */
export function compassAt(x, y, cols = REGION_COLS, rows = REGION_ROWS) {
  const fx = (x + 0.5) / cols;
  const fy = (y + 0.5) / rows;
  const ns = fy < 0.2 ? 'far north' : fy < 0.4 ? 'north' : fy <= 0.6 ? 'near the equator' : fy <= 0.8 ? 'south' : 'far south';
  const ew = fx < 0.25 ? 'west' : fx < 0.45 ? 'west of centre' : fx <= 0.55 ? 'centre' : fx <= 0.75 ? 'east of centre' : 'east';
  return `${ns}, ${ew}`;
}

/** Position in the picture for a screen-grid cell, e.g. "upper left of the picture". */
export function pictureAt(x, y, cols = REGION_COLS, rows = REGION_ROWS) {
  const fx = (x + 0.5) / cols;
  const fy = (y + 0.5) / rows;
  const v = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : 'middle';
  const h = fx < 1 / 3 ? 'left' : fx > 2 / 3 ? 'right' : 'centre';
  const words = {
    'top left': 'upper left', 'top centre': 'top centre', 'top right': 'upper right',
    'middle left': 'left side', 'middle centre': 'centre', 'middle right': 'right side',
    'bottom left': 'lower left', 'bottom centre': 'bottom centre', 'bottom right': 'lower right',
  };
  return `${words[`${v} ${h}`]} of the picture`;
}

/**
 * Place of a cell for one dataset, as { name, phrase, isPicture, isLand, coastal }:
 *   world map: { name: 'North Atlantic', phrase: 'the North Atlantic' }
 *   screen:    { name: 'upper left of the picture', phrase: 'the upper left of the picture' }
 *
 * `dataOn` ('water' | 'land' | 'any') says where the dataset's values live
 * (config/datasets.js). Cells are 11.25° wide, so a coastal cell often carries
 * data from the other side of the coastline (sst water in a cell named after
 * the land, city lights in a cell named after the sea). When `hasData` is true
 * and the name is on the wrong side, the name says so:
 *   water data, land name → "Coast near the Sahara and North Africa"
 *   land data, water name → "Coast of the North Atlantic"
 */
export function placeAt(x, y, { cols = REGION_COLS, rows = REGION_ROWS, gridKind = 'world-map', westLon = -180, dataOn = 'any', hasData = false } = {}) {
  if (gridKind !== 'world-map') {
    const name = pictureAt(x, y, cols, rows);
    return { name, phrase: `the ${name}`, isPicture: true, isLand: false, coastal: false };
  }
  const letter = tableCell(x, y, cols, rows, westLon);
  const [name, the] = NAMES[letter] ?? [compassAt(x, y, cols, rows)];
  const phrase = the ? `the ${name}` : name;
  const isLand = LAND_LETTERS.has(letter);
  const mismatch = hasData && ((dataOn === 'water' && isLand) || (dataOn === 'land' && !isLand));
  if (!mismatch) return { name, phrase, isPicture: false, isLand, coastal: false };
  const coastal = isLand ? `coast near ${phrase}` : `coast of ${phrase}`;
  return { name: coastal, phrase: `the ${coastal}`, isPicture: false, isLand, coastal: true };
}

/** Region name for a world-map cell (kept for callers that only need the name). */
export function regionAt(x, y, cols = REGION_COLS, rows = REGION_ROWS, westLon = -180) {
  return placeAt(x, y, { cols, rows, westLon }).name;
}

/** True if the table marks this world-map cell as land (used by tests). */
export function isLandAt(x, y, cols = REGION_COLS, rows = REGION_ROWS, westLon = -180) {
  return LAND_LETTERS.has(tableCell(x, y, cols, rows, westLon));
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
