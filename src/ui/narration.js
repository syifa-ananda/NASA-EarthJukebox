// Live narration: what to say about a frame, when it is worth saying, and how
// often. All narration wording lives in this file.
//
// Brief:    Person 2's sentence as is, after "Now:":
//           "Now: year 2016, medium night light, rising pitch, centred."
// Detailed: our date (if Person 2 doesn't already say one), Person 2's
//           sentence, and where the highest values are:
//           "Now: about July 2007. Northern oceans warmer, steady pitch,
//            centred. Warmest water over the Equatorial Pacific."
//           Nothing is said twice: no year for nightlights (Person 2 says it),
//           no region names for co2 (Person 2 says "over Africa"), no season
//           words for sst (Person 2's level words are the seasons).
//
// The sound sentence comes from Person 2's engine/describe.js with the
// dataset's ranges (engine/normalize.js), so its words match what you hear.
// Both files, mapping.js and the presets are plain JS (no Tone.js), so
// narration keeps working when the audio engine falls back to the stub.

import { describeFrame as describeSound } from '../audio/engine/describe.js';
import { analyzeRanges } from '../audio/engine/normalize.js';
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
/** The visible caption (sighted users) refreshes this often while playing. */
export const CAPTION_INTERVAL_MS = 1000;

const IDLE_CAPTION = 'A live description of the sound appears here once a record is loaded.';

export const intervalFor = (level) => (level === 'detailed' ? DETAILED_INTERVAL_MS : NARRATION_INTERVAL_MS);

export function isLevel(value) {
  return LEVELS.includes(value);
}

// ---------- dataset ranges (same as the engine's loadDataset) ----------

const rangesCache = new WeakMap();

/** Per-file ranges, exactly as the engine computes them (core.js analyzeRanges). */
export function rangesFor(record, data) {
  if (!rangesCache.has(data)) {
    const preset = getPreset(record.id);
    rangesCache.set(data, analyzeRanges(data, { derive: preset.derive, minSpan: preset.normalize?.minSpan }));
  }
  return rangesCache.get(data);
}

// ---------- time words (config/datasets.js → time, from docs/sources.md) ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const toUtc = (iso) => Date.parse(iso.includes('T') ? `${iso}Z` : `${iso}T00:00Z`);

function dateAt(time, data, index) {
  const a = toUtc(time.start);
  const b = toUtc(time.end);
  const f = data.frameCount > 1 ? index / (data.frameCount - 1) : 0;
  return new Date(a + f * (b - a));
}

/** "2014" | "about July 2007" | "about 8 February 2020" | null (no dates). */
export function timeWords(record, data, index) {
  const t = record?.time;
  if (!t || !data) return null;
  if (t.kind === 'yearBlocks') return String(t.startYear + Math.floor(index / t.framesPerYear));
  const d = dateAt(t, data, index);
  const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return t.precision === 'day' ? `about ${d.getUTCDate()} ${month}` : `about ${month}`;
}

/** Compact form for the timeline readout: "2014" | "~Jul 2007" | "~8 Feb 2020" | null. */
export function shortTime(record, data, index) {
  const t = record?.time;
  if (!t || !data) return null;
  if (t.kind === 'yearBlocks') return timeWords(record, data, index);
  const d = dateAt(t, data, index);
  const month = `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
  return t.precision === 'day' ? `~${d.getUTCDate()} ${month}` : `~${month}`;
}

/** "Frame 12 of 60, 2014" / "Frame 40 of 133, about July 2007" / "Frame 100 of 200". */
export function frameLabel(record, data, index) {
  const when = timeWords(record, data, index);
  return `Frame ${index + 1} of ${data.frameCount}${when ? `, ${when}` : ''}`;
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The frame before `index`, or undefined for the first frame. */
const previousFrame = (data, index) => (index > 0 ? data.frames[index - 1] : undefined);

// ---------- quiet stretches (config/datasets.js → quiet) ----------

/** True when `quiet.field` has been 0 for the last `quiet.frames` frames (fewer at the start). */
export function isQuiet(record, data, index) {
  const q = record?.quiet;
  if (!q) return false;
  for (let k = Math.max(0, index - q.frames + 1); k <= index; k++) {
    if ((data.frames[k][q.field] ?? 0) !== 0) return false;
  }
  return true;
}

// ---------- wording ----------

/** Person 2's sentence for frame `index`, with the dataset's ranges. */
function soundSentence(record, data, index, prev) {
  return describeSound(data.frames[index], getPreset(record.id), prev, rangesFor(record, data));
}

/** Where the highest values are, in words that fit the grid kind. */
function whereWords(record, data, index) {
  return whereHighest(data.frames[index].grid, record.summary.high, { ...record, preposition: record.summary.preposition });
}

/** Time words for Detailed, unless Person 2's sentence already says the year. */
function detailedTime(record, data, index) {
  if (record.time?.kind === 'yearBlocks') return null; // Person 2 says "year 2016, …"
  if (!record.time) return lowerFirst(`Frame ${index + 1} of ${data.frameCount}`); // lightning: no dates
  return timeWords(record, data, index);
}

/**
 * Text for one narration. level: 'brief' | 'detailed'.
 * `prev` is the frame the pitch trend is measured against ("rising pitch"):
 * spoken narration passes the last frame it actually spoke.
 */
export function describeForNarration(record, data, index, level, prev = previousFrame(data, index)) {
  if (isQuiet(record, data, index)) return `Now: ${record.quiet.text}.`;
  const sound = soundSentence(record, data, index, prev);
  if (level !== 'detailed') return `Now: ${sound}.`;
  const when = detailedTime(record, data, index);
  const where = whereWords(record, data, index);
  const head = when ? `Now: ${when}. ${upperFirst(sound)}.` : `Now: ${sound}.`;
  return where ? `${head} ${where}` : head;
}

// ---------- "meaningful change" ----------

/**
 * What a listener would notice. Narration only speaks when this differs from
 * the last narration: Person 2's sentence (level, pitch trend, pan, year or
 * region prefix, storm bursts appearing, fast change) with exact counts
 * ignored, the "where" sentence in Detailed, and quiet stretches. Tune here.
 */
export function narrationSignature(record, data, index, level, prev = previousFrame(data, index)) {
  if (isQuiet(record, data, index)) return { quiet: true };
  return {
    quiet: false,
    sentence: soundSentence(record, data, index, prev).replace(/\b\d+ /g, '# '),
    where: level === 'detailed' ? whereWords(record, data, index) : null,
  };
}

export function hasMeaningfulChange(before, after) {
  if (!before) return true;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].some((key) => before[key] !== after[key]);
}

// ---------- scheduler ----------

/**
 * Throttled live narration, driven by the player.
 *
 * Spoken (live region): at most every 3 s (brief) / 5 s (detailed), only on a
 * meaningful change, pitch trend measured against the last SPOKEN frame.
 * Caption (visible, not a live region): brief wording for the current frame,
 * about once a second while playing and at once on seek / pause.
 *
 * @param {{ captionEl: HTMLElement, getIndex: () => number }} opts
 */
export function createLiveNarration({ captionEl, getIndex }) {
  let level = DEFAULT_LEVEL;
  let ctx = null; // { record, data }
  let playing = false;
  let exploring = false;
  let scrubbing = false;
  let lastAt = -Infinity;
  let lastSig = null;
  let lastSpokenFrame = null;
  let settleTimer = 0;
  let retryTimer = 0;
  let captionAt = -Infinity;
  let captionIndex = null;

  function cancelTimers() {
    clearTimeout(settleTimer);
    clearTimeout(retryTimer);
    scrubbing = false;
  }

  // ---- visible caption ----

  function idleCaption() {
    captionEl.textContent = IDLE_CAPTION;
    captionEl.classList.add('is-idle');
    captionIndex = null;
  }

  function updateCaption(index, { force = false } = {}) {
    if (!ctx) return;
    const now = performance.now();
    if (!force && now - captionAt < CAPTION_INTERVAL_MS) return;
    if (force && index === captionIndex) return;
    // Trend against the frame the caption showed last (about a second ago).
    const prev = captionIndex !== null && captionIndex !== index ? ctx.data.frames[captionIndex] : previousFrame(ctx.data, index);
    const text = describeForNarration(ctx.record, ctx.data, index, 'brief', prev);
    captionAt = now;
    captionIndex = index;
    if (captionEl.textContent === text) return;
    captionEl.textContent = text;
    captionEl.classList.remove('is-idle', 'is-fresh');
    void captionEl.offsetWidth; // restart the fade-in
    captionEl.classList.add('is-fresh');
  }

  // ---- spoken narration ----

  const trendBase = (index) => lastSpokenFrame ?? previousFrame(ctx.data, index);

  function speak(index, { priority = 'narration', force = false, textLevel = level } = {}) {
    const prev = trendBase(index);
    const text = describeForNarration(ctx.record, ctx.data, index, textLevel, prev);
    if (!announce(text, { priority, force })) return false;
    lastAt = performance.now();
    lastSig = narrationSignature(ctx.record, ctx.data, index, level, prev);
    lastSpokenFrame = ctx.data.frames[index];
    return true;
  }

  /** Scrub summary: once, after the guard window if a status message just played. */
  function speakSettled() {
    if (!ctx || level === 'off' || exploring) return;
    const wait = msUntilNarrationAllowed();
    if (wait > 0) {
      retryTimer = setTimeout(speakSettled, wait + 20);
      return;
    }
    speak(getIndex(), { force: true });
  }

  idleCaption();

  return {
    getLevel: () => level,

    setLevel(next, { announceIt = true } = {}) {
      if (!isLevel(next)) return;
      level = next;
      lastSig = null;
      if (level === 'off') cancelTimers();
      if (announceIt) announce(`Narration: ${LEVEL_LABELS[level].toLowerCase()}`, { force: true });
    },

    /** New record (data = null while loading / not playable). */
    setContext(record, data) {
      cancelTimers();
      playing = false;
      ctx = record && data ? { record, data } : null;
      lastSig = null;
      lastSpokenFrame = null;
      lastAt = -Infinity;
      captionAt = -Infinity;
      idleCaption();
      if (ctx) updateCaption(0, { force: true });
    },

    /** Explore mode: the map does the talking, so no spoken scrub summaries. */
    setExploring(on) {
      exploring = !!on;
      if (exploring) cancelTimers();
    },

    onPlay() {
      playing = true;
      lastSig = null; // describe the first frame that clears the guard
    },

    /** Pause, finish, hidden tab. */
    onStop() {
      playing = false;
      cancelTimers();
      if (ctx) updateCaption(getIndex(), { force: true });
    },

    /** Every frame the clock advances to while playing. */
    onFrame(index) {
      if (!ctx) return;
      updateCaption(index);
      if (!playing || level === 'off' || scrubbing) return;
      if (performance.now() - lastAt < intervalFor(level)) return;
      const sig = narrationSignature(ctx.record, ctx.data, index, level, trendBase(index));
      if (!hasMeaningfulChange(lastSig, sig)) return;
      speak(index);
    },

    /** The user moved the timeline or pressed J / L. */
    onUserSeek() {
      if (!ctx) return;
      updateCaption(getIndex(), { force: true });
      if (exploring) return;
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
