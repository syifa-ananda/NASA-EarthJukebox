// The "Live description" card under the player: a written, brief description
// of the frame on screen, for sighted listeners. It is NOT a live region and
// is never spoken (status messages still go through narrator.js). Also the
// shared time and frame wording used by the timeline, captions and explore.
//
// The text is Person 2's sound sentence, after "Now:":
//   "Now: year 2016, medium night light, rising pitch, centred."
// It comes from Person 2's engine/describe.js with the dataset's ranges
// (engine/normalize.js), so its words match what you hear. Both files,
// mapping.js and the presets are plain JS (no Tone.js), so the description
// keeps working when the audio engine falls back to the stub.

import { describeFrame as describeSound } from '../audio/engine/describe.js';
import { analyzeRanges, normalizeFrame } from '../audio/engine/normalize.js';
import { sanitizeFrame, withDerived, alarmState } from '../audio/engine/mapping.js';
import { getPreset } from '../audio/presets/index.js';

/** The card refreshes this often while playing (and at once on seek / pause). */
export const DESCRIPTION_INTERVAL_MS = 1000;

const IDLE_TEXT = 'A live description of the sound appears here once a record is loaded.';

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

// ---------- climate alarm (co2): when it sounds, frame by frame ----------

const alarmCache = new WeakMap();

/**
 * Whether the climate alarm sounds at each frame when the file plays through,
 * with the engine's own rule and hysteresis (mapping.js alarmState): on at the
 * preset's threshold, off only below threshold − hysteresis. All false for
 * presets without an alarm.
 */
export function alarmFrames(record, data) {
  if (!alarmCache.has(data)) {
    const preset = getPreset(record.id);
    const ranges = rangesFor(record, data);
    let on = false;
    alarmCache.set(
      data,
      data.frames.map((frame) => {
        const f = normalizeFrame(withDerived(sanitizeFrame(frame), preset), ranges);
        on = alarmState(f, preset.alarm, on);
        return on;
      }),
    );
  }
  return alarmCache.get(data);
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

/**
 * The description of frame `index`: "Now: <Person 2's sentence>." `prev` is
 * the frame the pitch trend is measured against ("rising pitch"). With
 * alarm: true it ends with the preset's alarm words ("alarm: highest carbon
 * dioxide in view"). Quiet stretches use the dataset's own words.
 */
export function describeNow(record, data, index, prev = previousFrame(data, index), { alarm = false } = {}) {
  if (isQuiet(record, data, index)) return `Now: ${record.quiet.text}.`;
  const sound = describeSound(data.frames[index], getPreset(record.id), prev, rangesFor(record, data), { alarm });
  return `Now: ${sound}.`;
}

// ---------- the card ----------

/**
 * Keeps the "Live description" text up to date, driven by the player:
 * about once a second while playing, at once on seek / J / L / pause, the
 * climate alarm words for as long as the alarm sounds (only while it is
 * switched on and can be heard: never with the stub), the idle text before a
 * dataset has loaded.
 *
 * @param {{ textEl: HTMLElement, getIndex: () => number, canSoundAlarm?: () => boolean }} opts
 */
export function createLiveDescription({ textEl, getIndex, canSoundAlarm = () => true }) {
  let alarmEnabled = true;
  let ctx = null; // { record, data }
  let shownAt = -Infinity;
  let shownIndex = null;

  function idle() {
    textEl.textContent = IDLE_TEXT;
    textEl.classList.add('is-idle');
    shownIndex = null;
  }

  /** The alarm sounds at this frame (switched on, audible, data at its top). */
  function alarmNow(index) {
    return alarmEnabled && canSoundAlarm() && !!ctx && alarmFrames(ctx.record, ctx.data)[index];
  }

  function update(index, { force = false } = {}) {
    if (!ctx) return;
    const now = performance.now();
    if (!force && now - shownAt < DESCRIPTION_INTERVAL_MS) return;
    if (force && index === shownIndex) return;
    // Trend against the frame shown last (about a second ago).
    const prev = shownIndex !== null && shownIndex !== index ? ctx.data.frames[shownIndex] : previousFrame(ctx.data, index);
    const text = describeNow(ctx.record, ctx.data, index, prev, { alarm: alarmNow(index) });
    shownAt = now;
    shownIndex = index;
    if (textEl.textContent === text) return;
    textEl.textContent = text;
    textEl.classList.remove('is-idle', 'is-fresh');
    void textEl.offsetWidth; // restart the fade-in
    textEl.classList.add('is-fresh');
  }

  idle();

  return {
    /** Climate alarm switched on or off: the words follow (never when off). */
    setAlarmEnabled(on) {
      alarmEnabled = !!on;
      if (ctx) {
        shownIndex = null;
        update(getIndex(), { force: true });
      }
    },

    /** New record (data = null while it loads). */
    setContext(record, data) {
      ctx = record && data ? { record, data } : null;
      shownAt = -Infinity;
      idle();
      if (ctx) update(0, { force: true });
    },

    /** Pause, finish, hidden tab. */
    onStop() {
      if (ctx) update(getIndex(), { force: true });
    },

    /** Every frame the clock advances to while playing. */
    onFrame(index) {
      update(index);
    },

    /** The user moved the timeline or pressed J / L. */
    onUserSeek() {
      if (ctx) update(getIndex(), { force: true });
    },
  };
}
