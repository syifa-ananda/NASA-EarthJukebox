// Player: the ONE playback clock. Every 1 / (fps × speed) seconds it advances a
// frame, redraws the viewer, updates the transport and feeds the audio engine,
// so picture, sound and controls can never drift apart.

import * as audio from './adapters/audio.js';
import * as viewer from './viewer.js';
import { announce } from './narrator.js';
import { createTransport, DEFAULT_VOLUME } from './transport.js';
import { frameLabel, yearAt } from './narration.js';

const PREVIEW_GAP_MS = 150; // scrub previews: at most one note per 150 ms

const NO_NARRATION = {
  setContext() {}, onPlay() {}, onStop() {}, onFrame() {}, onUserSeek() {},
};

/**
 * @param {{ transportEl: HTMLElement, engineStatusEl?: HTMLElement,
 *           narration?: ReturnType<import('./narration.js').createLiveNarration>,
 *           onPlayingChange?: (playing: boolean) => void }} opts
 */
export function createPlayer({ transportEl, engineStatusEl, narration = NO_NARRATION, onPlayingChange = () => {} }) {
  const s = {
    record: null,
    data: null,
    error: false,
    index: 0,
    playing: false,
    speed: 1,
    loop: false,
    engineReady: false,
    raf: 0,
    lastTs: null,
    acc: 0,
    session: 0, // bumps on every play / pause / record change
    resumeOnVisible: false,
    lastPreviewAt: 0,
    previewTimer: 0,
  };

  const transport = createTransport(transportEl, {
    onTogglePlay: toggle,
    onSeek: (i) => seek(i),
    onVolume: (v) => audio.setVolume(v / 100),
    onSpeed: (r) => {
      s.speed = r;
      audio.setRate(r);
    },
    onLoop: (on) => {
      s.loop = on;
    },
  });

  audio.setVolume(DEFAULT_VOLUME / 100);
  audio.whenReady().then(() => {
    s.engineReady = true;
    if (engineStatusEl) {
      engineStatusEl.textContent =
        audio.engineName() === 'tone' ? 'Sound: Tone.js engine' : 'Sound: simple fallback (Tone.js could not load)';
    }
    refresh();
  });

  document.addEventListener('visibilitychange', onVisibility);

  // ---------- helpers ----------

  const last = () => (s.data ? s.data.frameCount - 1 : 0);
  const frame = () => s.data.frames[s.index];
  const frameSeconds = () => 1 / (s.data.fps * s.speed);
  const canPlay = () => s.engineReady && !!s.data;

  /** "Frame 12 of 60, about 2014" — same wording as the narration. */
  const frameText = (i) => frameLabel(s.record, s.data, i);

  function helpText() {
    if (!s.record) return 'Choose a record to enable Play.';
    if (!s.record.playable) return `${s.record.title} is coming soon, so it can't play yet.`;
    if (s.error) return `${s.record.title} could not load.`;
    if (!s.data) return `Loading ${s.record.title}…`;
    if (!s.engineReady) return 'Loading the sound engine…';
    return 'Shortcuts: K plays and pauses, J and L step one frame back or forward.';
  }

  function refresh() {
    transport.setEnabled(canPlay(), helpText());
  }

  function render() {
    const text = frameText(s.index);
    viewer.showFrame(s.record, s.data, s.index, { caption: s.playing ? `Playing · ${text}` : text });
    transport.setFrame(s.index, s.data.frameCount, text, yearAt(s.record, s.data, s.index));
  }

  function setPlaying(on) {
    s.playing = on;
    transport.setPlaying(on);
    onPlayingChange(on);
  }

  function stopClock() {
    cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.lastTs = null;
    s.acc = 0;
  }

  function startClock() {
    stopClock();
    s.raf = requestAnimationFrame(tick);
  }

  // ---------- clock ----------

  function tick(ts) {
    if (!s.playing) return;
    if (s.lastTs === null) s.lastTs = ts;
    s.acc += (ts - s.lastTs) / 1000;
    s.lastTs = ts;

    const step = frameSeconds();
    if (s.acc > step * 4) s.acc = step; // after a long stall, don't fast-forward

    let advanced = false;
    while (s.acc >= step) {
      s.acc -= step;
      if (s.index < last()) {
        s.index += 1;
      } else if (s.loop) {
        s.index = 0;
      } else {
        finish();
        return;
      }
      advanced = true;
    }
    if (advanced) {
      render();
      audio.update(frame(), { frameSeconds: step });
      narration.onFrame(s.index);
    }
    s.raf = requestAnimationFrame(tick);
  }

  function finish() {
    s.session += 1;
    stopClock();
    narration.onStop();
    audio.pause();
    setPlaying(false);
    render();
    announce('Finished. Press Play to listen again.', { force: true });
  }

  // ---------- user actions ----------

  function play() {
    // audio.start() must run synchronously inside the click / key handler.
    const started = audio.start();
    if (s.index >= last() && !s.loop) s.index = 0;
    const session = ++s.session;
    setPlaying(true);
    render();
    // The picture starts at once; the sound joins as soon as the engine is up
    // (the first start can take a moment while Tone.js builds its graph).
    startClock();
    announce(`Playing ${s.record.title}.`, { force: true });
    narration.onPlay();

    Promise.resolve(started)
      .then(() => audio.play())
      .then(() => {
        if (session !== s.session) {
          // Paused or switched record while audio was starting.
          if (!s.playing) audio.pause();
          return;
        }
        audio.update(frame(), { frameSeconds: frameSeconds() });
      })
      .catch((err) => {
        console.error(err);
        if (session !== s.session) return;
        s.session += 1;
        stopClock();
        narration.onStop();
        setPlaying(false);
        render();
        announce('The sound could not start. Press Play to try again.', { force: true });
      });
  }

  function pause() {
    s.session += 1;
    stopClock();
    narration.onStop();
    audio.pause();
    setPlaying(false);
    render();
    const text = frameText(s.index);
    announce(`Paused at ${text.charAt(0).toLowerCase()}${text.slice(1)}.`, { force: true });
  }

  function toggle() {
    if (!canPlay()) {
      announce(helpText(), { force: true });
      return;
    }
    if (s.playing) pause();
    else play();
  }

  /** Jump to frame i (timeline, J / L). Paused: redraw and preview the sound. */
  function seek(i) {
    if (!s.data) return;
    s.index = Math.min(last(), Math.max(0, Math.round(i)));
    s.acc = 0;
    render();
    if (s.playing) audio.update(frame(), { frameSeconds: frameSeconds() });
    else schedulePreview();
    narration.onUserSeek(); // quiet while scrubbing, one summary when it stops
  }

  function schedulePreview() {
    clearTimeout(s.previewTimer);
    const run = (inGesture) => {
      s.lastPreviewAt = performance.now();
      if (!s.data) return;
      const opts = { frameSeconds: frameSeconds() };
      if (audio.isStarted()) {
        audio.preview(frame(), opts);
      } else if (inGesture) {
        // Scrubbing is a user gesture, so it may unlock audio too.
        Promise.resolve(audio.start())
          .then(() => audio.preview(frame(), opts))
          .catch(() => audio.update(frame(), opts));
      } else {
        audio.update(frame(), opts);
      }
    };
    const wait = PREVIEW_GAP_MS - (performance.now() - s.lastPreviewAt);
    if (wait <= 0) run(true);
    else s.previewTimer = setTimeout(() => run(false), wait);
  }

  function step(delta) {
    if (!canPlay()) return;
    seek(s.index + delta);
  }

  function onVisibility() {
    if (document.hidden) {
      if (s.playing) {
        s.resumeOnVisible = true;
        stopClock();
        narration.onStop();
        audio.pause();
      }
    } else if (s.resumeOnVisible) {
      s.resumeOnVisible = false;
      if (s.playing) {
        Promise.resolve(audio.play()).catch(() => {});
        startClock();
        narration.onPlay();
      }
    }
  }

  // ---------- record changes (called by main.js) ----------

  /** A new record was chosen: stop the old sound and wait for its data. */
  function clear(record, { error = false } = {}) {
    s.session += 1;
    stopClock();
    clearTimeout(s.previewTimer);
    s.resumeOnVisible = false;
    if (s.playing) setPlaying(false);
    audio.stop();
    s.record = record;
    s.data = null;
    s.error = error;
    s.index = 0;
    narration.setContext(record, null); // cancels anything pending for the old record
    transport.setRange(0);
    refresh();
  }

  /** Data for the current record arrived: load its preset, show frame 0, stay paused. */
  function setData(record, data) {
    if (record !== s.record) return;
    s.data = data;
    s.index = 0;
    s.acc = 0;
    transport.setRange(data.frameCount);
    audio.load(record.id);
    audio.update(frame(), { frameSeconds: frameSeconds() }); // silent; primes probe()
    narration.setContext(record, data);
    render();
    refresh();
  }

  return {
    clear,
    setData,
    toggle,
    step,
    isPlaying: () => s.playing,
    currentIndex: () => s.index,
    hasData: () => !!s.data,
    focusPlay: () => transport.focusPlay(),
  };
}
