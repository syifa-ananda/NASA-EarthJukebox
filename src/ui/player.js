// Player: playback state, transport and the clock.
//
// Two clocks, one at a time:
//   video   The record has a video (entry.video). The <video> is the clock.
//           Audio follows it through the engine's syncToVideo(); the UI
//           follows the same sync's onFrame callback (requestVideoFrameCallback
//           with a requestAnimationFrame fallback), so timeline, captions,
//           narration and explore always see the frame the sound is on.
//           Play / Pause / timeline / speed / loop control the <video>.
//   heatmap No video, or it failed to load: our own requestAnimationFrame
//           clock advances one frame every 1 / (fps × speed) seconds and feeds
//           the audio with update().
// Frame index = floor(seconds × fps), capped at the last frame. The videos run
// up to 0.2 s longer than frameCount / fps; the last frame simply holds.

import * as audio from './adapters/audio.js';
import * as viewer from './viewer.js';
import { mediaUrl } from './adapters/data.js';
import { announce } from './narrator.js';
import { createTransport, DEFAULT_VOLUME } from './transport.js';
import { frameLabel, shortTime } from './narration.js';
import { singleKeyShortcutsEnabled } from './shortcuts.js';

const PREVIEW_GAP_MS = 150; // scrub previews: at most one note per 150 ms

const NO_NARRATION = {
  setContext() {}, onPlay() {}, onStop() {}, onFrame() {}, onUserSeek() {},
};

const SOUND_STATUS = {
  loading: 'Sound: loading…',
  'tone-idle': 'Sound: Tone.js engine (starts when you press Play)',
  tone: 'Sound: Tone.js engine',
  stub: 'Sound: simple fallback (Tone.js could not load)',
};

/**
 * @param {{ transportEl: HTMLElement, soundStatusEl?: HTMLElement, videoStatusEl?: HTMLElement,
 *           narration?: ReturnType<import('./narration.js').createLiveNarration>,
 *           onPlayingChange?: (playing: boolean) => void,
 *           onUserSeek?: (index: number) => void, onExplore?: () => void }} opts
 */
export function createPlayer({
  transportEl,
  soundStatusEl,
  videoStatusEl,
  narration = NO_NARRATION,
  onPlayingChange = () => {},
  onUserSeek = () => {}, // the user changed frame (timeline, J / L)
  onExplore = () => {}, // the "Explore map" button
}) {
  const s = {
    record: null,
    data: null,
    error: false,
    index: 0,
    playing: false,
    speed: 1,
    loop: false,
    engineLoaded: false,
    exploring: false,
    clock: 'none', // 'none' | 'video' | 'heatmap'
    video: null,
    videoReady: false,
    buffering: false,
    detachSync: null,
    videoOff: [], // remove our <video> listeners
    raf: 0,
    lastTs: null,
    acc: 0,
    session: 0, // bumps on every play / pause / record change
    suspended: false, // paused because the tab is hidden
    lastPreviewAt: 0,
    previewTimer: 0,
  };

  const transport = createTransport(transportEl, {
    onTogglePlay: toggle,
    onSeek: (i) => seek(i),
    onVolume: (v) => audio.setVolume(v / 100),
    onSpeed: (r) => {
      s.speed = r;
      if (s.video) s.video.playbackRate = r;
      audio.setRate(r);
    },
    onLoop: (on) => {
      s.loop = on;
      if (s.video) s.video.loop = on;
    },
    onExplore: () => onExplore(),
  });

  audio.setVolume(DEFAULT_VOLUME / 100);
  const showSoundStatus = (state) => {
    if (soundStatusEl) soundStatusEl.textContent = SOUND_STATUS[state] ?? SOUND_STATUS.loading;
  };
  showSoundStatus(audio.engineStatus());
  audio.onEngineChange(showSoundStatus);
  audio.whenReady().then(() => {
    s.engineLoaded = true;
    refresh();
  });

  document.addEventListener('visibilitychange', onVisibility);

  // ---------- helpers ----------

  const last = () => (s.data ? s.data.frameCount - 1 : 0);
  const frame = () => s.data.frames[s.index];
  const frameSeconds = () => 1 / (s.data.fps * s.speed);
  const usingVideo = () => s.clock === 'video';
  const canPlay = () => s.engineLoaded && !!s.data && (s.clock === 'heatmap' || s.videoReady);
  const frameText = (i) => frameLabel(s.record, s.data, i);
  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  function helpText() {
    if (!s.record) return 'Choose a record to enable Play.';
    if (s.error) return `${s.record.title} could not load.`;
    if (!s.data) return `Loading ${s.record.title}…`;
    if (!s.engineLoaded) return 'Loading the sound engine…';
    if (usingVideo() && !s.videoReady) return 'Loading the video…';
    if (!singleKeyShortcutsEnabled()) {
      return 'Single-key shortcuts are off. Turn them back on under Keyboard shortcuts at the top of the page.';
    }
    return 'Shortcuts: K play or pause, J and L step a frame, E explore the map, N narration level, D describe now, G legend. Press ? for all shortcuts.';
  }

  function refresh() {
    transport.setEnabled(canPlay(), helpText());
  }

  function setVideoStatus(text) {
    if (videoStatusEl) {
      videoStatusEl.textContent = text;
      videoStatusEl.hidden = !text;
    }
  }

  function render() {
    if (!s.data) return;
    const text = frameText(s.index);
    let caption = text;
    if (s.buffering && s.playing) caption = `Buffering… · ${text}`;
    else if (s.playing) caption = `Playing · ${text}`;
    viewer.showFrame(s.record, s.data, s.index, { caption });
    transport.setFrame(s.index, s.data.frameCount, text, shortTime(s.record, s.data, s.index));
  }

  function setPlaying(on) {
    if (s.playing === on) return;
    s.playing = on;
    transport.setPlaying(on);
    onPlayingChange(on);
  }

  /** A new frame index from the running clock (video or heatmap). */
  function advanceTo(i) {
    if (i === s.index) return;
    s.index = i;
    render();
    if (s.playing && !s.suspended) narration.onFrame(i);
  }

  // ---------- heatmap clock ----------

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

  function tick(ts) {
    if (!s.playing || usingVideo()) return;
    if (s.lastTs === null) s.lastTs = ts;
    s.acc += (ts - s.lastTs) / 1000;
    s.lastTs = ts;

    const step = frameSeconds();
    if (s.acc > step * 4) s.acc = step; // after a long stall, don't fast-forward

    let next = s.index;
    let advanced = false;
    while (s.acc >= step) {
      s.acc -= step;
      if (next < last()) {
        next += 1;
      } else if (s.loop) {
        next = 0;
      } else {
        finish();
        return;
      }
      advanced = true;
    }
    if (advanced) {
      advanceTo(next);
      audio.update(frame(), { frameSeconds: step });
    }
    s.raf = requestAnimationFrame(tick);
  }

  // ---------- video clock ----------

  function videoSeekTime(i) {
    // Middle of frame i, so floor(t × fps) is exactly i; never past the end.
    const t = (i + 0.5) / s.data.fps;
    const end = Number.isFinite(s.video.duration) ? s.video.duration - 0.05 : t;
    return Math.max(0, Math.min(t, end));
  }

  function attachVideo(record, data) {
    s.clock = 'video';
    s.videoReady = false;
    viewer.setAspect(record.aspect);
    const v = viewer.loadVideo(mediaUrl(record.entry.video), {
      onReady: () => {
        if (s.video !== v) return;
        s.videoReady = true;
        render();
        refresh();
      },
      onError: () => {
        if (s.video !== v) return;
        fallBackToHeatmap('Video could not load; showing the data map instead.');
      },
    });
    s.video = v;
    v.playbackRate = s.speed;
    v.defaultPlaybackRate = s.speed;
    v.loop = s.loop;

    const on = (name, fn) => {
      v.addEventListener(name, fn);
      s.videoOff.push(() => v.removeEventListener(name, fn));
    };
    on('pause', () => {
      if (s.suspended || v.ended) return; // hidden tab, or 'ended' handles it
      if (s.playing) {
        // Paused by something other than our button (e.g. the system).
        narration.onStop();
        setPlaying(false);
        render();
      }
    });
    on('ended', () => {
      if (!s.loop) finish();
    });
    on('waiting', () => {
      s.buffering = true;
      render();
    });
    on('playing', () => {
      s.buffering = false;
      render();
    });

    // Audio follows the video; the UI follows the same frame changes.
    s.detachSync = audio.syncToVideo(v, data, {
      onFrame: (_frame, index) => {
        if (s.video === v) advanceTo(index);
      },
    });
  }

  function detachVideo() {
    s.detachSync?.();
    s.detachSync = null;
    s.videoOff.forEach((off) => off());
    s.videoOff = [];
    s.video = null;
    s.videoReady = false;
    s.buffering = false;
  }

  function fallBackToHeatmap(message) {
    const wasPlaying = s.playing;
    detachVideo();
    viewer.useHeatmap();
    s.clock = 'heatmap';
    setVideoStatus(message);
    if (s.data) {
      audio.load(s.data);
      audio.update(frame(), { frameSeconds: frameSeconds() });
    }
    if (wasPlaying) {
      s.session += 1;
      narration.onStop();
      audio.pause();
      setPlaying(false);
    }
    render();
    refresh();
    announce(message, { force: true });
  }

  // ---------- shared play / pause / finish ----------

  function finish() {
    s.session += 1;
    stopClock();
    narration.onStop();
    if (!usingVideo()) audio.pause(); // with video, syncToVideo pauses on 'ended'
    setPlaying(false);
    if (usingVideo()) s.index = last();
    render();
    announce('Finished. Press Play to listen again.', { force: true });
  }

  function play() {
    // audio.start() must run synchronously inside the click / key handler.
    const started = audio.start();
    const session = ++s.session;
    const atEnd = usingVideo() ? s.video.ended || s.index >= last() : s.index >= last();
    if (atEnd && !s.loop) {
      s.index = 0;
      if (usingVideo()) s.video.currentTime = 0;
    }
    setPlaying(true);
    render();
    announce(`Playing ${s.record.title}.`, { force: true });
    narration.onPlay();

    const fail = (err) => {
      console.error(err);
      if (session !== s.session) return;
      s.session += 1;
      stopClock();
      narration.onStop();
      if (usingVideo()) s.video.pause();
      setPlaying(false);
      render();
      announce('Playback could not start. Press Play to try again.', { force: true });
    };

    if (usingVideo()) {
      // The video is the clock; syncToVideo starts the audio on its 'play'.
      s.video.playbackRate = s.speed;
      s.video.play().catch((err) => {
        if (err?.name === 'AbortError') return; // paused again before it started
        fail(err);
      });
      Promise.resolve(started).catch(() => {}); // the adapter falls back by itself
      return;
    }

    // Heatmap clock: the picture starts at once; the sound joins when ready.
    startClock();
    Promise.resolve(started)
      .then(() => audio.play())
      .then(() => {
        if (session !== s.session) {
          if (!s.playing) audio.pause();
          return;
        }
        audio.update(frame(), { frameSeconds: frameSeconds() });
      })
      .catch(fail);
  }

  /** silent: the caller announces instead (explore mode says "Paused. Exploring …"). */
  function pause({ silent = false } = {}) {
    s.session += 1;
    stopClock();
    narration.onStop();
    if (usingVideo()) s.video.pause();
    else audio.pause();
    setPlaying(false);
    render();
    if (silent) return;
    announce(`Paused at ${lowerFirst(frameText(s.index))}.`, { force: true });
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
    if (usingVideo()) s.video.currentTime = videoSeekTime(s.index);
    render();
    if (s.playing) {
      if (!usingVideo()) audio.update(frame(), { frameSeconds: frameSeconds() });
    } else if (s.exploring) {
      audio.update(frame()); // explore re-probes the cursor cell instead
    } else {
      schedulePreview();
    }
    narration.onUserSeek(); // quiet while scrubbing, one summary when it stops
    onUserSeek(s.index);
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
      if (!s.playing) return;
      s.suspended = true;
      narration.onStop();
      if (usingVideo()) {
        s.video.pause(); // syncToVideo pauses the audio
      } else {
        stopClock();
        audio.pause();
      }
    } else if (s.suspended) {
      s.suspended = false;
      if (!s.playing) return;
      if (usingVideo()) {
        s.video.play().catch(() => {});
      } else {
        Promise.resolve(audio.play()).catch(() => {});
        startClock();
      }
      narration.onPlay();
    }
  }

  // ---------- record changes (called by main.js) ----------

  /** A new record was chosen: stop the old picture and sound, wait for data. */
  function clear(record, { error = false } = {}) {
    s.session += 1;
    stopClock();
    clearTimeout(s.previewTimer);
    s.suspended = false;
    detachVideo(); // detach() pauses the old record's audio
    viewer.unloadVideo();
    if (s.playing) setPlaying(false);
    audio.stop();
    s.clock = 'none';
    s.record = record;
    s.data = null;
    s.error = error;
    s.index = 0;
    setVideoStatus('');
    narration.setContext(record, null); // cancels anything pending for the old record
    transport.setRange(0);
    refresh();
  }

  /** Data for the current record arrived: video (or heatmap), frame 0, paused. */
  function setData(record, data) {
    if (record !== s.record) return;
    s.data = data;
    s.index = 0;
    s.acc = 0;
    transport.setRange(data.frameCount);
    if (record.entry?.video) {
      attachVideo(record, data); // syncToVideo loads the preset and ranges
    } else {
      s.clock = 'heatmap';
      viewer.setAspect(record.aspect);
      viewer.useHeatmap();
      setVideoStatus('No video for this record; showing the data map instead.');
      audio.load(data);
      audio.update(frame(), { frameSeconds: frameSeconds() }); // silent; primes probe()
    }
    narration.setContext(record, data);
    render();
    refresh();
  }

  return {
    clear,
    setData,
    toggle,
    step,
    pause,
    setExploring: (on) => {
      s.exploring = !!on;
    },
    isPlaying: () => s.playing,
    currentIndex: () => s.index,
    hasData: () => !!s.data,
    clockKind: () => s.clock,
    focusPlay: () => transport.focusPlay(),
    refreshHelp: () => refresh(),
  };
}
