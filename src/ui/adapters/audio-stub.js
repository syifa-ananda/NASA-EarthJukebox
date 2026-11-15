// Fallback audio engine, used only if Person 2's Tone.js engine can't start.
// Uses only the built-in Web Audio API. It is intentionally simple: one
// pentatonic note per frame, a click for flashes, a short blip for probe() /
// preview(), a rising scale for the legend, and a simple video sync.
// Same interface as the engine path in ./audio.js.

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

function tone({ value, midi = noteFor(value), pan = 0, gain = 0.3, dur = 0.35, type = wave, at = 0 }) {
  if (!ctx) return;
  const now = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const panner = ctx.createStereoPanner();

  osc.type = type;
  osc.frequency.value = midiToHz(midi);
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

/** Create and resume the AudioContext. Call synchronously inside a user gesture. */
export function start() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('Web Audio is not supported'));
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  return ctx.state === 'running' ? Promise.resolve() : ctx.resume();
}

/** Release the AudioContext (used when the real engine started after all). */
export function close() {
  playing = false;
  if (ctx) ctx.close().catch(() => {});
  ctx = null;
  master = null;
}

export function isStarted() {
  return !!ctx && ctx.state === 'running';
}

/** Takes a dataset id or a features.json object. */
export async function load(datasetOrFile) {
  const id = typeof datasetOrFile === 'string' ? datasetOrFile : datasetOrFile?.dataset;
  wave = PRESET_WAVES[id] ?? 'sine';
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

export function preview(frame, _opts) {
  if (frame) lastFrame = frame;
  if (ctx && frame) tone({ value: frame.value, pan: frame.pan, gain: 0.3, dur: 0.3 });
}

export function play() {
  playing = true;
  return Promise.resolve();
}

export function pause() {
  playing = false;
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

export function setRate(_r) {
  // The stub plays one note per frame, so speed is handled by the clock.
}

/** Same shape as the engine's probe(); a cell of exactly 0 is empty. */
export function probe(x, y) {
  const grid = lastFrame?.grid;
  const rows = grid?.length || 16;
  const cols = grid?.[0]?.length || 32;
  const cx = Math.min(cols - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(rows - 1, Math.max(0, Math.floor(y)));
  const value = grid ? grid[cy][cx] : 0.5;
  const pan = ((cx + 0.5) / cols) * 2 - 1;
  const empty = !!grid && value === 0;
  const midi = empty ? null : noteFor(value);
  if (ctx) {
    if (empty) click(pan, 0.06);
    else tone({ midi, pan, gain: 0.3, dur: 0.25, type: 'sine' });
  }
  return {
    x: cx, y: cy, value, pan, empty,
    label: empty ? 'no data' : null,
    level: null, // the UI works out the level word itself
    midi, note: null, sounded: !!ctx,
  };
}

/** Rising scale, lowest to highest value, in about `duration` seconds. */
export function playLegend({ duration = 3, text = '' } = {}) {
  if (!ctx) return { text, duration: 0, sounded: false };
  const dt = duration / SCALE.length;
  SCALE.forEach((midi, i) => tone({ midi, gain: 0.25, dur: dt * 0.9, type: 'triangle', at: i * dt }));
  return { text, duration, sounded: true };
}

/** Simple version of the engine's syncToVideo(): same events, same frame rule. */
export function syncToVideo(video, file, { onFrame } = {}) {
  load(file);
  const last = file.frames.length - 1;
  const indexAt = (t) => Math.min(last, Math.max(0, Math.floor(t * file.fps + 1e-6)));
  let lastIndex = -1;
  let raf = null;
  let detached = false;

  function sync(force = false) {
    if (detached) return;
    const i = indexAt(video.currentTime);
    if (i === lastIndex && !force) return;
    lastIndex = i;
    update(file.frames[i], { frameSeconds: 1 / (file.fps * (video.playbackRate || 1)) });
    onFrame?.(file.frames[i], i);
  }
  function loop() {
    if (detached || video.paused) {
      raf = null;
      return;
    }
    sync();
    raf = requestAnimationFrame(loop);
  }
  const onPlay = () => {
    play();
    sync(true);
    if (raf === null) raf = requestAnimationFrame(loop);
  };
  const onPause = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    pause();
  };
  const onSeeked = () => sync(true);
  const onTimeUpdate = () => sync();
  const events = { play: onPlay, pause: onPause, ended: onPause, seeked: onSeeked, timeupdate: onTimeUpdate };
  for (const [name, fn] of Object.entries(events)) video.addEventListener(name, fn);
  sync(true);
  if (!video.paused) onPlay();

  return function detach() {
    if (detached) return;
    detached = true;
    if (raf !== null) cancelAnimationFrame(raf);
    for (const [name, fn] of Object.entries(events)) video.removeEventListener(name, fn);
    pause();
  };
}

export function stop() {
  playing = false;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(volume, ctx.currentTime + 0.05, 0.02);
  }
}
