// Live narration: what to say about a frame, when it is worth saying, and how
// often. All narration wording lives in this file.
//
// Brief:    "Now: high water temperature, rising pitch, panned left."
// Detailed: "Now: frame 24 of 60, about 2016. High night light, rising pitch,
//            panned left. Brightest lights in the north-west of the map."
//
// The sound sentence comes from Person 2's engine/describe.js. That file, its
// mapping.js and the presets are plain JS (no Tone.js), so narration keeps
// working when the audio engine falls back to the stub.

import { describeFrame as describeSound, levelWord, panWord } from '../audio/engine/describe.js';
import { sanitizeFrame } from '../audio/engine/mapping.js';
import { getPreset } from '../audio/presets/index.js';
import { whereHighest } from './describe.js';
import { announce, msUntilNarrationAllowed } from './narrator.js';

export const LEVELS = ['off', 'brief', 'detailed'];
export const LEVEL_LABELS = { off: 'Off', brief: 'Brief', detailed: 'Detailed' };
export const DEFAULT_LEVEL = 'brief';

/** Minimum gap between two live narrations while playing (time-based, any speed). */
export const NARRATION_INTERVAL_MS = 3000;
export const DETAILED_INTERVAL_MS = 5000;
/** After scrubbing / J / L stops for this long, describe the frame once. */
export const SCRUB_SETTLE_MS = 600;

const TREND_EPSILON = 0.01; // same threshold as engine/describe.js

const IDLE_CAPTION = 'Live narration appears here while playing.';
const OFF_CAPTION = 'Narration is off. Press D to describe the current frame.';

export const intervalFor = (level) => (level === 'detailed' ? DETAILED_INTERVAL_MS : NARRATION_INTERVAL_MS);

export function isLevel(value) {
  return LEVELS.includes(value);
}

// ---------- wording ----------

/** Approximate year for frame `index`, if the record has a year range. */
export function yearAt(record, data, index) {
  const years = record?.years;
  if (!years || !data) return null;
  const f = data.frameCount > 1 ? index / (data.frameCount - 1) : 0;
  return Math.round(years.start + f * (years.end - years.start));
}

/** "Frame 12 of 60, about 2014" (also used by the timeline). */
export function frameLabel(record, data, index) {
  const year = yearAt(record, data, index);
  return `Frame ${index + 1} of ${data.frameCount}${year ? `, about ${year}` : ''}`;
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Person 2's sentence, with the real previous frame so the pitch trend is right after seeking. */
function soundSentence(record, data, index) {
  const prev = index > 0 ? data.frames[index - 1] : undefined;
  return describeSound(data.frames[index], getPreset(record.id), prev);
}

/** Text for one narration. level: 'brief' | 'detailed'. */
export function describeForNarration(record, data, index, level) {
  const sound = soundSentence(record, data, index);
  if (level === 'detailed') {
    const where = whereHighest(data.frames[index].grid, record.summary.high);
    return `Now: ${lowerFirst(frameLabel(record, data, index))}. ${upperFirst(sound)}. ${where}`;
  }
  return `Now: ${sound}.`;
}

// ---------- "meaningful change" ----------

/**
 * The parts of a frame that matter to a listener. Narration only speaks when
 * one of these differs from the last narration. Tune here.
 */
export function narrationSignature(record, data, index, level) {
  const f = sanitizeFrame(data.frames[index]);
  const prev = data.frames[index - 1];
  let trend = 'none';
  if (prev && typeof prev.value === 'number') {
    const d = f.value - prev.value;
    trend = d > TREND_EPSILON ? 'rising' : d < -TREND_EPSILON ? 'falling' : 'steady';
  }
  return {
    level: levelWord(f.value),
    trend,
    pan: panWord(f.pan),
    flashes: f.flashes > 0,
    region: level === 'detailed' ? whereHighest(data.frames[index].grid, record.summary.high) : null,
  };
}

export function hasMeaningfulChange(before, after) {
  if (!before) return true;
  return Object.keys(after).some((key) => before[key] !== after[key]);
}

// ---------- scheduler ----------

/**
 * Throttled live narration, driven by the player.
 * @param {{ captionEl: HTMLElement, getIndex: () => number }} opts
 */
export function createLiveNarration({ captionEl, getIndex }) {
  let level = DEFAULT_LEVEL;
  let ctx = null; // { record, data }
  let playing = false;
  let scrubbing = false;
  let lastAt = -Infinity;
  let lastSig = null;
  let settleTimer = 0;
  let retryTimer = 0;

  function cancelTimers() {
    clearTimeout(settleTimer);
    clearTimeout(retryTimer);
    scrubbing = false;
  }

  function resetCaption() {
    captionEl.textContent = level === 'off' ? OFF_CAPTION : IDLE_CAPTION;
    captionEl.classList.add('is-idle');
  }

  function showCaption(text) {
    captionEl.textContent = text;
    captionEl.classList.remove('is-idle', 'is-fresh');
    void captionEl.offsetWidth; // restart the fade-in
    captionEl.classList.add('is-fresh');
  }

  function speak(index, { priority = 'narration', force = false, textLevel = level } = {}) {
    const text = describeForNarration(ctx.record, ctx.data, index, textLevel);
    if (!announce(text, { priority, force })) return false;
    lastAt = performance.now();
    lastSig = narrationSignature(ctx.record, ctx.data, index, level);
    showCaption(text);
    return true;
  }

  /** Scrub summary: once, after the guard window if a status message just played. */
  function speakSettled() {
    if (!ctx || level === 'off') return;
    const wait = msUntilNarrationAllowed();
    if (wait > 0) {
      retryTimer = setTimeout(speakSettled, wait + 20);
      return;
    }
    speak(getIndex(), { force: true });
  }

  resetCaption();

  return {
    getLevel: () => level,

    setLevel(next, { announceIt = true } = {}) {
      if (!isLevel(next)) return;
      level = next;
      lastSig = null;
      if (level === 'off') cancelTimers();
      resetCaption();
      if (announceIt) announce(`Narration: ${LEVEL_LABELS[level].toLowerCase()}`, { force: true });
    },

    /** New record (data = null while loading / not playable). */
    setContext(record, data) {
      cancelTimers();
      playing = false;
      ctx = record && data ? { record, data } : null;
      lastSig = null;
      lastAt = -Infinity;
      resetCaption();
    },

    onPlay() {
      playing = true;
      lastSig = null; // describe the first frame that clears the guard
    },

    /** Pause, finish, hidden tab. */
    onStop() {
      playing = false;
      cancelTimers();
    },

    /** Every frame the clock advances to while playing. */
    onFrame(index) {
      if (!playing || !ctx || level === 'off' || scrubbing) return;
      if (performance.now() - lastAt < intervalFor(level)) return;
      const sig = narrationSignature(ctx.record, ctx.data, index, level);
      if (!hasMeaningfulChange(lastSig, sig)) return;
      speak(index);
    },

    /** The user moved the timeline or pressed J / L. */
    onUserSeek() {
      if (!ctx) return;
      scrubbing = true;
      clearTimeout(settleTimer);
      clearTimeout(retryTimer);
      settleTimer = setTimeout(() => {
        scrubbing = false;
        speakSettled();
      }, SCRUB_SETTLE_MS);
    },

    /** D: detailed description right now, whatever the level. */
    describeNow() {
      if (!ctx) {
        announce('Choose a record first, then press D to describe it.', { force: true });
        return;
      }
      clearTimeout(retryTimer);
      speak(getIndex(), { priority: 'status', force: true, textLevel: 'detailed' });
    },
  };
}
