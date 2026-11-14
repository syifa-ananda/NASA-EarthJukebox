// Test page logic: manual sliders, preset switching, mock playback and the
// keyboard probe. Uses only the public engine API.

import * as audio from '../engine/index.js';

const DATA_URL = new URL('../../../public/data/', import.meta.url);
const COLS = 32;
const ROWS = 16;
const ANNOUNCE_EVERY_MS = 3000;

const FIELDS = [
  { key: 'brightness', min: 0, max: 1, step: 0.01 },
  { key: 'warmth', min: 0, max: 1, step: 0.01 },
  { key: 'density', min: 0, max: 1, step: 0.01 },
  { key: 'pan', min: -1, max: 1, step: 0.01 },
  { key: 'motion', min: 0, max: 1, step: 0.01 },
  { key: 'flashes', min: 0, max: 16, step: 1 },
  { key: 'value', min: 0, max: 1, step: 0.01 },
];

const $ = (id) => document.getElementById(id);
const ui = {
  play: $('play'), volume: $('volume'), volumeOut: $('volume-out'), preset: $('preset'),
  soundDesc: $('sound-description'), dataset: $('dataset'), mock: $('mock'), speed: $('speed'),
  frame: $('frame'), frameOut: $('frame-out'), mockStatus: $('mock-status'), sliders: $('sliders'),
  probe: $('probe'), canvas: $('probe-canvas'), probeOut: $('probe-out'),
  announce: $('announce'), describe: $('describe'), params: $('params'),
};

/** Current frame shown and sent to the engine. */
let frame = { t: 0, brightness: 0.5, warmth: 0.5, density: 0.5, pan: 0, motion: 0.2, flashes: 0, value: 0.5, grid: null };
let data = null;            // loaded features.json
let index = 0;              // current mock frame
let mockTimer = null;
let cursor = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
let lastAnnounce = 0;
const sliderEls = {};

// --------------------------------------------------------------------------- setup

function buildSliders() {
  for (const f of FIELDS) {
    const id = `f-${f.key}`;
    const label = Object.assign(document.createElement('label'), { htmlFor: id, textContent: f.key });
    const input = Object.assign(document.createElement('input'), {
      id, type: 'range', min: f.min, max: f.max, step: f.step, value: frame[f.key],
    });
    const out = Object.assign(document.createElement('output'), { htmlFor: id });
    input.addEventListener('input', () => {
      frame = { ...frame, [f.key]: Number(input.value) };
      if (f.key === 'value' && !data) frame.grid = null;   // flat grid follows `value`
      out.textContent = input.value;
      send();
    });
    ui.sliders.append(label, input, out);
    sliderEls[f.key] = { input, out };
  }
}

function syncSliders() {
  for (const f of FIELDS) {
    sliderEls[f.key].input.value = frame[f.key];
    sliderEls[f.key].out.textContent = String(frame[f.key]);
  }
}

function buildPresetMenu() {
  for (const p of audio.listPresets()) {
    ui.preset.append(new Option(`${p.name} (${p.id})`, p.id));
  }
  ui.preset.value = 'default';
  showSoundDescription();
}

async function buildDatasetMenu() {
  try {
    const idx = await fetch(new URL('index.json', DATA_URL)).then((r) => r.json());
    for (const d of idx.datasets) {
      const opt = new Option(d.title, d.id);
      opt.dataset.features = d.features;
      ui.dataset.append(opt);
    }
    await selectDataset();
  } catch (err) {
    ui.mockStatus.textContent = `Could not load public/data/index.json (${err.message}). Serve the repo root.`;
  }
}

// --------------------------------------------------------------------------- engine calls

/** Send the current frame to the engine and refresh everything that shows it. */
function send() {
  const fps = data?.fps ?? 2;
  const speed = Number(ui.speed.value);
  const params = audio.playFrame(frame, { frameSeconds: 1 / (fps * speed) });
  ui.params.textContent = JSON.stringify(params, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v), 2);
  draw();
  const text = audio.describeFrame(frame);
  ui.describe.dataset.latest = text;
  const now = performance.now();
  if (ui.announce.checked && now - lastAnnounce > ANNOUNCE_EVERY_MS) {
    ui.describe.textContent = text;
    lastAnnounce = now;
  }
}

function showSoundDescription() {
  const p = audio.listPresets().find((x) => x.id === ui.preset.value);
  ui.soundDesc.textContent = p ? p.soundDescription : '';
}

async function togglePlay() {
  if (audio.isPlaying()) {
    audio.pause();
  } else {
    await audio.play();   // first click also starts audio (user gesture)
    send();
  }
  ui.play.setAttribute('aria-pressed', String(audio.isPlaying()));
  ui.play.textContent = audio.isPlaying() ? 'Pause' : 'Play';
}

// --------------------------------------------------------------------------- mock playback

async function selectDataset() {
  const opt = ui.dataset.selectedOptions[0];
  if (!opt) return;
  stopMock();
  try {
    data = await fetch(new URL(opt.dataset.features, DATA_URL)).then((r) => r.json());
  } catch (err) {
    data = null;
    ui.mockStatus.textContent = `Could not load ${opt.dataset.features}: ${err.message}`;
    return;
  }
  ui.frame.max = data.frameCount - 1;
  ui.mockStatus.textContent = `${data.title}: ${data.frameCount} frames at ${data.fps} fps.`;
  // Matching preset, or the default one for ids without a preset.
  ui.preset.value = audio.hasPreset(data.dataset) ? data.dataset : 'default';
  await audio.loadPreset(data.dataset);
  showSoundDescription();
  lastAnnounce = 0;          // announce the new dataset straight away
  showMockFrame(0);
}

function showMockFrame(i) {
  index = i;
  frame = { ...data.frames[i] };
  ui.frame.value = i;
  ui.frameOut.textContent = `${i} (${(i / data.fps).toFixed(1)} s)`;
  syncSliders();
  send();
}

function step() {
  showMockFrame((index + 1) % data.frameCount);
  scheduleNext();
}

function scheduleNext() {
  const delay = 1000 / (data.fps * Number(ui.speed.value));   // fps from features.json x speed
  mockTimer = setTimeout(step, delay);
}

async function toggleMock() {
  if (mockTimer) {
    stopMock();
    return;
  }
  if (!data) return;
  if (!audio.isPlaying()) await togglePlay();
  ui.mock.setAttribute('aria-pressed', 'true');
  ui.mock.textContent = 'Stop mock';
  scheduleNext();
}

function stopMock() {
  clearTimeout(mockTimer);
  mockTimer = null;
  ui.mock.setAttribute('aria-pressed', 'false');
  ui.mock.textContent = 'Play mock';
}

// --------------------------------------------------------------------------- probe map

function cellValue(x, y) {
  return frame.grid ? frame.grid[y][x] : frame.value;
}

/** Heat map of the grid (blue = low, red = high) with the cursor outlined. */
function draw() {
  const ctx = ui.canvas.getContext('2d');
  const w = ui.canvas.width / COLS;
  const h = ui.canvas.height / ROWS;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = cellValue(x, y);
      ctx.fillStyle = `hsl(${240 - 240 * v} 70% ${20 + 40 * v}%)`;
      ctx.fillRect(x * w, y * h, w, h);
    }
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000';
  ctx.strokeRect(cursor.x * w + 1.5, cursor.y * h + 1.5, w - 3, h - 3);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(cursor.x * w + 1.5, cursor.y * h + 1.5, w - 3, h - 3);
}

async function probeCursor() {
  if (!audio.isReady()) await audio.init();   // key press / click is a user gesture
  const r = audio.probe(cursor.x, cursor.y);
  const side = r.pan < -0.2 ? 'left' : r.pan > 0.2 ? 'right' : 'centre';
  ui.probeOut.textContent =
    `Column ${r.x + 1} of ${COLS}, row ${r.y + 1} of ${ROWS}: value ${r.value.toFixed(2)}, note ${r.note}, ${side}.`;
  draw();
}

function onProbeKey(e) {
  const moves = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    Home: [-COLS, 0], End: [COLS, 0], PageUp: [0, -ROWS], PageDown: [0, ROWS],
  };
  if (moves[e.key]) {
    const [dx, dy] = moves[e.key];
    cursor = {
      x: Math.min(COLS - 1, Math.max(0, cursor.x + dx)),
      y: Math.min(ROWS - 1, Math.max(0, cursor.y + dy)),
    };
  } else if (e.key !== 'Enter' && e.key !== ' ') {
    return;
  }
  e.preventDefault();
  probeCursor();
}

function onProbeClick(e) {
  const rect = ui.canvas.getBoundingClientRect();
  cursor = {
    x: Math.min(COLS - 1, Math.floor(((e.clientX - rect.left) / rect.width) * COLS)),
    y: Math.min(ROWS - 1, Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)),
  };
  ui.probe.focus();
  probeCursor();
}

// --------------------------------------------------------------------------- wiring

ui.play.addEventListener('click', togglePlay);
ui.volume.addEventListener('input', () => {
  audio.setVolume(ui.volume.value / 100);
  ui.volumeOut.textContent = `${ui.volume.value}%`;
});
ui.preset.addEventListener('change', async () => {
  await audio.loadPreset(ui.preset.value);
  showSoundDescription();
  lastAnnounce = 0;
  send();
});
ui.dataset.addEventListener('change', selectDataset);
ui.mock.addEventListener('click', toggleMock);
ui.speed.addEventListener('change', () => {
  if (mockTimer) {           // apply the new speed straight away
    clearTimeout(mockTimer);
    scheduleNext();
  }
});
ui.frame.addEventListener('input', () => data && showMockFrame(Number(ui.frame.value)));
ui.probe.addEventListener('keydown', onProbeKey);
ui.canvas.addEventListener('click', onProbeClick);
ui.announce.addEventListener('change', () => {
  if (ui.announce.checked) ui.describe.textContent = ui.describe.dataset.latest ?? '';
});

audio.setVolume(ui.volume.value / 100);
buildSliders();
syncSliders();
buildPresetMenu();
draw();
buildDatasetMenu();
