// Fallback audio engine, used only if Person 2's Tone.js engine fails to load.
// Uses only the built-in Web Audio API. It is intentionally simple: one
// pentatonic note per frame, a click for flashes, and a short blip for
// probe() / preview(). See ./audio.js for the interface.

// C major pentatonic, two octaves (MIDI note numbers).
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];

const PRESET_WAVES = {
  sst: 'sine',
  nightlights: 'triangle',
  lightning: 'square',
  co2: 'sawtooth',
};

let ctx = null;
let master = null;
let playing = false;
let wave = 'sine';
let volume = 0.7;
let lastFrame = null;

function midiToHz(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

function noteFor(value) {
  const v = Math.min(1, Math.max(0, value ?? 0));
  return SCALE[Math.round(v * (SCALE.length - 1))];
}

function tone({ value, pan = 0, gain = 0.3, dur = 0.35, type = wave }) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const panner = ctx.createStereoPanner();

  osc.type = type;
  osc.frequency.value = midiToHz(noteFor(value));
  panner.pan.value = Math.min(1, Math.max(-1, pan));

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(amp).connect(panner).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

function click(pan = 0, gain = 0.2) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const amp = ctx.createGain();
  const panner = ctx.createStereoPanner();
  src.buffer = buf;
  amp.gain.value = gain;
  panner.pan.value = Math.min(1, Math.max(-1, pan));
  src.connect(amp).connect(panner).connect(master);
  src.start(now);
}

export async function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') await ctx.resume();
}

export function isStarted() {
  return !!ctx && ctx.state === 'running';
}

export async function load(datasetId) {
  wave = PRESET_WAVES[datasetId] ?? 'sine';
}

export function update(frame, _opts) {
  if (frame) lastFrame = frame;
  if (!playing || !ctx || !frame) return;
  const gain = 0.08 + 0.3 * (frame.brightness ?? 0.5);
  tone({ value: frame.value, pan: frame.pan, gain });
  const hits = Math.min(4, Math.ceil((frame.flashes ?? 0) / 4));
  for (let i = 0; i < hits; i++) {
    setTimeout(() => click(frame.pan, 0.15), i * 90);
  }
}

export function play() {
  playing = true;
}

export function pause() {
  playing = false;
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

export function setRate(_r) {
  // The stub plays one note per frame, so rate is handled by the UI clock.
}

export function preview(frame, _opts) {
  if (frame) lastFrame = frame;
  if (ctx && frame) tone({ value: frame.value, pan: frame.pan, gain: 0.3, dur: 0.3 });
}

export function probe(x, y) {
  const grid = lastFrame?.grid;
  const rows = grid?.length || 16;
  const cols = grid?.[0]?.length || 32;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(y)));
  const value = grid ? grid[cy][cx] : 0.5;
  const pan = ((cx + 0.5) / cols) * 2 - 1;
  const midi = noteFor(value);
  if (ctx) tone({ value, pan, gain: 0.3, dur: 0.25, type: 'sine' });
  return { x: cx, y: cy, value, pan, midi, note: null, sounded: !!ctx };
}

export function stop() {
  playing = false;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(volume, ctx.currentTime + 0.05, 0.02);
  }
}
