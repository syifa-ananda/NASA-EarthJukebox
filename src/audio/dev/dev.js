// Test page logic: manual sliders, preset switching, mock playback, video
// sync, audio legend, recording and the keyboard probe. Uses only the public
// engine API (engine/index.js).

import * as audio from '../engine/index.js';

const DATA_URL = new URL('../../../public/data/', import.meta.url);
const COLS = 32;
const ROWS = 16;
const ANNOUNCE_EVERY_MS = 3000;
const RECORD_TAIL_MS = 2500;   // let the reverb ring out at the end of a recording

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
  soundDesc: $('sound-description'), legend: $('legend'), legendOut: $('legend-out'),
  dataset: $('dataset'), mock: $('mock'), speed: $('speed'), frame: $('frame'), frameOut: $('frame-out'),
  mockStatus: $('mock-status'), normalize: $('normalize'), ranges: $('ranges'),
  video: $('video'), videoFile: $('video-file'), videoStatus: $('video-status'), sync: $('sync'),
  record: $('record'), recordCancel: $('record-cancel'), recordLink: $('record-link'),
  recordStatus: $('record-status'), recordMock: $('record-mock'),
  sliders: $('sliders'), probe: $('probe'), canvas: $('probe-canvas'), probeOut: $('probe-out'),
  announce: $('announce'), describe: $('describe'), params: $('params'),
};

/** Current frame shown and sent to the engine. */
let frame = { t: 0, brightness: 0.5, warmth: 0.5, density: 0.5, pan: 0, motion: 0.2, flashes: 0, value: 0.5, grid: null };
let entries = {};           // index.json entries by id
let data = null;            // loaded features.json
let ranges = null;          // analyzeRanges() result for `data`
let index = 0;              // current mock frame
let mockTimer = null;
let detachSync = null;      // set while the video is synced
let recording = null;       // { cancelled } while recording
let localVideoUrl = null;
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
      entries[d.id] = d;
      ui.dataset.append(new Option(d.mock ? `${d.title} (mock)` : d.title, d.id));
    }
    await selectDataset();
  } catch (err) {
    ui.mockStatus.textContent = `Could not load public/data/index.json (${err.message}). Serve the repo root.`;
  }
}

// --------------------------------------------------------------------------- engine calls

/** Send the current frame to the engine, then refresh the page. */
function send(frameSeconds) {
  const fps = data?.fps ?? 2;
  const params = audio.playFrame(frame, { frameSeconds: frameSeconds ?? 1 / (fps * Number(ui.speed.value)) });
  showFrame(params);
}

/** Refresh everything that shows the current frame. */
function showFrame(params) {
  ui.params.textContent = JSON.stringify(params, (_, v) => (typeof v === 'number' ? +v.toFixed(3) : v), 2);
  draw();
  ui.describe.dataset.latest = audio.describeFrame(frame);
  announceLatest();
}

/**
 * Throttled live region: at most one announcement every ANNOUNCE_EVERY_MS,
 * and the latest sentence is always delivered once the window opens (so a
 * seek or the last frame is never left unannounced).
 */
let announceTimer = null;
function announceLatest() {
  if (!ui.announce.checked || announceTimer) return;
  const wait = lastAnnounce + ANNOUNCE_EVERY_MS - performance.now();
  if (wait > 0) {
    announceTimer = setTimeout(() => {
      announceTimer = null;
      announceLatest();
    }, wait);
    return;
  }
  const text = ui.describe.dataset.latest ?? '';
  if (text !== ui.describe.textContent) ui.describe.textContent = text;
  lastAnnounce = performance.now();
}

function showSoundDescription() {
  const p = audio.listPresets().find((x) => x.id === ui.preset.value);
  ui.soundDesc.textContent = p ? p.soundDescription : '';
}

function setPlayButton() {
  ui.play.setAttribute('aria-pressed', String(audio.isPlaying()));
  ui.play.textContent = audio.isPlaying() ? 'Pause' : 'Play';
}

async function togglePlay() {
  if (audio.isPlaying()) {
    audio.pause();
  } else {
    await audio.play();   // first click also starts audio (user gesture)
    send();
  }
  setPlayButton();
}

async function playLegend() {
  if (!audio.isReady()) await audio.init();   // the click is the user gesture
  const { text } = audio.playLegend();
  ui.legendOut.textContent = text;
}

// --------------------------------------------------------------------------- datasets + normalization

async function selectDataset() {
  const entry = entries[ui.dataset.value];
  if (!entry) return;
  stopMock();
  stopSync();
  try {
    data = await fetch(new URL(entry.features, DATA_URL)).then((r) => r.json());
  } catch (err) {
    data = null;
    ui.mockStatus.textContent = `Could not load ${entry.features}: ${err.message}`;
    return;
  }
  ui.frame.max = data.frameCount - 1;
  ui.mockStatus.textContent = `${data.title}: ${data.frameCount} frames at ${data.fps} fps` +
    (entry.mock ? ' (mock data).' : '.');
  ui.recordMock.hidden = !entry.mock;

  // Matching preset (or default) + this file's ranges.
  ui.preset.value = audio.hasPreset(data.dataset) ? data.dataset : 'default';
  ({ ranges } = await audio.loadDataset(data));
  applyNormalizeSetting();
  showRanges();
  showSoundDescription();
  loadDatasetVideo(entry);
  lastAnnounce = 0;          // announce the new dataset straight away
  showMockFrame(0);
}

function applyNormalizeSetting() {
  audio.setRanges(ui.normalize.checked ? ranges : null);
}

function showRanges() {
  ui.ranges.replaceChildren();
  if (!ranges) return;
  const rows = [...Object.entries(ranges.fields), ['grid (probe)', ranges.grid]];
  for (const [name, r] of rows) {
    const tr = document.createElement('tr');
    const note = r.widened ? 'nearly constant: widened to the minimum span' : '';
    for (const text of [name, r.lo.toFixed(3), r.hi.toFixed(3), note]) {
      tr.append(Object.assign(document.createElement('td'), { textContent: text }));
    }
    ui.ranges.append(tr);
  }
}

// --------------------------------------------------------------------------- mock playback

function showMockFrame(i, frameSeconds) {
  index = i;
  frame = { ...data.frames[i] };
  ui.frame.value = i;
  ui.frameOut.textContent = `${i} (${(i / data.fps).toFixed(1)} s)`;
  syncSliders();
  send(frameSeconds);
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
  stopSync();
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

// --------------------------------------------------------------------------- video sync

/** Try the dataset's own video (index.json `video`); fine if it doesn't exist yet. */
async function loadDatasetVideo(entry) {
  if (localVideoUrl) return;   // a local file the user picked wins
  const url = new URL(entry.video, DATA_URL);
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) throw new Error(String(res.status));
    ui.video.src = url.href;
    ui.videoStatus.textContent = `Using public/data/${entry.video}.`;
  } catch {
    ui.video.removeAttribute('src');
    ui.video.load();
    ui.videoStatus.textContent = `No video at public/data/${entry.video} yet. Pick a local video file to test syncing.`;
  }
}

function useLocalVideo() {
  const file = ui.videoFile.files[0];
  if (!file) return;
  stopSync();
  if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
  localVideoUrl = URL.createObjectURL(file);
  ui.video.src = localVideoUrl;
  ui.videoStatus.textContent = `Using local file "${file.name}" with the ${data?.title ?? ''} data.`;
}

async function toggleSync() {
  if (detachSync) {
    stopSync();
    return;
  }
  if (!data || !ui.video.currentSrc) {
    ui.videoStatus.textContent = 'Load a video first (dataset video or a local file).';
    return;
  }
  stopMock();
  await audio.init();          // the click is the user gesture
  detachSync = audio.syncToVideo(ui.video, data, {
    onFrame(f, i, params) {
      index = i;
      frame = { ...f };
      ui.frame.value = i;
      ui.frameOut.textContent = `${i} (${(i / data.fps).toFixed(1)} s)`;
      syncSliders();
      showFrame(params);
      setPlayButton();
    },
  });
  applyNormalizeSetting();     // syncToVideo reloads the ranges
  ui.sync.setAttribute('aria-pressed', 'true');
  ui.sync.textContent = 'Stop syncing';
  ui.videoStatus.textContent = 'Synced: play, pause or seek the video and the audio follows.';
}

function stopSync() {
  if (!detachSync) return;
  detachSync();
  detachSync = null;
  setPlayButton();
  ui.sync.setAttribute('aria-pressed', 'false');
  ui.sync.textContent = 'Sync audio to video';
}

// --------------------------------------------------------------------------- recording

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

function extensionFor(type) {
  if (type.includes('webm')) return 'webm';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4')) return 'm4a';
  return 'audio';
}

function setRecordingUi(on) {
  for (const el of [ui.record, ui.dataset, ui.preset, ui.mock, ui.sync, ui.frame, ui.speed, ui.play]) el.disabled = on;
  ui.recordCancel.hidden = !on;
}

async function recordFullPass() {
  if (!data) return;
  if (!audio.isRecordingSupported()) {
    ui.recordStatus.textContent = 'Recording is not supported in this browser.';
    return;
  }
  const ready = audio.init();  // start audio inside the click (user gesture)
  stopMock();
  stopSync();
  recording = { cancelled: false };
  setRecordingUi(true);
  ui.recordLink.hidden = true;

  try {
    await ready;
    await audio.loadDataset(data);
    applyNormalizeSetting();
    showMockFrame(0, 1 / data.fps);
    if (!audio.isPlaying()) await audio.play();
    setPlayButton();
    await audio.startRecording();

    // Step through every frame at 1x on a fixed clock (no drift).
    const period = 1000 / data.fps;
    const start = performance.now();
    for (let i = 0; i < data.frameCount; i++) {
      if (recording.cancelled) break;
      if (i > 0) showMockFrame(i, 1 / data.fps);
      if (i % 10 === 0) ui.recordStatus.textContent = `Recording frame ${i + 1} of ${data.frameCount}...`;
      await sleep(start + (i + 1) * period - performance.now());
    }
    if (!recording.cancelled) {
      ui.recordStatus.textContent = 'Finishing...';
      await sleep(RECORD_TAIL_MS);
    }
    const blob = await audio.stopRecording();
    audio.pause();
    setPlayButton();

    if (recording.cancelled || !blob) {
      ui.recordStatus.textContent = 'Recording cancelled.';
      return;
    }
    const mock = entries[data.dataset]?.mock;
    const name = `${data.dataset}${mock ? '-mock' : ''}.${extensionFor(blob.type)}`;
    if (ui.recordLink.href) URL.revokeObjectURL(ui.recordLink.href);
    Object.assign(ui.recordLink, { href: URL.createObjectURL(blob), download: name, textContent: `Download ${name} again` });
    ui.recordLink.hidden = false;
    ui.recordLink.click();
    ui.recordStatus.textContent =
      `Done: ${name}, ${(blob.size / 1024).toFixed(0)} KB${mock ? ' (mock data, practice only)' : ''}.`;
  } catch (err) {
    if (audio.isRecording()) await audio.stopRecording();
    ui.recordStatus.textContent = `Recording failed: ${err.message}`;
  } finally {
    recording = null;
    setRecordingUi(false);
  }
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
  const where = `Column ${r.x + 1} of ${COLS}, row ${r.y + 1} of ${ROWS}`;
  ui.probeOut.textContent = r.empty
    ? `${where}: empty (${r.label}), ${side}.`
    : `${where}: ${r.level}, value ${r.value.toFixed(2)}, note ${r.note}, ${side}.`;
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
ui.legend.addEventListener('click', playLegend);
ui.dataset.addEventListener('change', selectDataset);
ui.mock.addEventListener('click', toggleMock);
ui.speed.addEventListener('change', () => {
  if (mockTimer) {           // apply the new speed straight away
    clearTimeout(mockTimer);
    scheduleNext();
  }
});
ui.frame.addEventListener('input', () => data && showMockFrame(Number(ui.frame.value)));
ui.normalize.addEventListener('change', () => {
  applyNormalizeSetting();
  send();
});
ui.videoFile.addEventListener('change', useLocalVideo);
ui.sync.addEventListener('click', toggleSync);
ui.video.addEventListener('pause', () => setTimeout(setPlayButton, 0));   // sync pauses the audio too
ui.record.addEventListener('click', recordFullPass);
ui.recordCancel.addEventListener('click', () => {
  if (recording) recording.cancelled = true;
});
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
