// Explore mode: a "sound cursor" over the picture.
//
// The sound map is one focusable element (tabindex="0") laid over the viewer,
// with role="group" + aria-roledescription="sound map", an aria-label and
// aria-describedby instructions. No role="application": VoiceOver on macOS
// already passes plain arrow keys to the focused element when Quick Nav is off,
// and a group keeps the label and instructions readable in Chrome and Safari.
// The map is sized to the displayed picture (not the letterbox), so cells line
// up with what is on screen.
//
// Place words depend on the dataset (config/datasets.js → gridKind):
//   world map: region names from regions.js ("North Atlantic")
//   screen:    picture positions only ("upper left of the picture"); co2 is a
//              turning globe, so never region names and never "space".
// Empty cells (grid value 0 = nothing there) read Person 2's probe label, e.g.
// "Land, where there is no ocean data", with no level word and no note.
//
// Keys inside the map (not global shortcuts):
//   Arrows        move one cell        Shift+Arrows  move 4 cells
//   Home / End    left / right edge    Page Up / Down  top / bottom edge
//   Escape        leave, back to Play
// Global shortcuts that also work here: W (where am I), C (compare), J / L, K.

import * as audio from './adapters/audio.js';
import * as viewer from './viewer.js';
import { announce } from './narrator.js';
import { placeAt, compassAt } from './regions.js';
import { frameLabel, rangesFor } from './live-description.js';
import { levelWord } from '../audio/engine/describe.js';
import { normalizeValue } from '../audio/engine/normalize.js';
import { getPreset } from '../audio/presets/index.js';
import { presetText } from './preset-text.js';

const ANNOUNCE_DEBOUNCE_MS = 250; // holding an arrow: speak once it settles
const HOVER_GAP_MS = 100; // pointer probing: at most ~10 per second
const BIG_STEP = 4;

const KEY_MOVES = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const MAP_DIRECTIONS = { left: 'west', right: 'east', up: 'north', down: 'south' };
const PICTURE_DIRECTIONS = { left: 'left', right: 'right', up: 'top', down: 'bottom' };

const upperFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * @param {{ mapEl: HTMLElement, cursorEl: HTMLElement, readoutEl: HTMLElement,
 *           player: ReturnType<import('./player.js').createPlayer> }} opts
 */
export function createExplore({ mapEl, cursorEl, readoutEl, player }) {
  const s = {
    record: null,
    data: null,
    x: 16,
    y: 8,
    active: false,
    hovering: false,
    announceTimer: 0,
    lastHoverAt: 0,
    hoverTimer: 0,
    pendingHover: null,
  };

  const IDLE_READOUT = 'Explore the picture: press E, use the Explore button, or point at it.';

  // ---------- helpers ----------

  const cols = () => s.data?.grid?.cols ?? 32;
  const rows = () => s.data?.grid?.rows ?? 16;
  const frame = () => s.data.frames[player.currentIndex()];
  const isScreen = () => s.record?.gridKind !== 'world-map';
  const preset = () => getPreset(s.record.id);
  const place = (x = s.x, y = s.y) =>
    placeAt(x, y, {
      cols: cols(), rows: rows(), gridKind: s.record.gridKind, westLon: s.record.westLon,
      dataOn: s.record.dataOn, hasData: s.data.frames[player.currentIndex()].grid[y][x] > 0,
    });
  const areaWord = () => (isScreen() ? 'picture' : 'map');

  function cellValue(x = s.x, y = s.y) {
    return frame().grid[y][x];
  }

  /** Level word relative to this dataset (the engine's, or the same rule for the stub). */
  function levelOf(result) {
    if (result.level) return result.level;
    return levelWord(normalizeValue(result.value, rangesFor(s.record, s.data).grid));
  }

  /**
   * "about 28 °C" for sst, "0.42" for the others. With band: true, sst adds a
   * short descriptor: "about 28 °C, warm tropical water".
   */
  function amount(value, { band = false } = {}) {
    const u = s.record.valueUnit;
    if (!u) return value.toFixed(2);
    const real = value * u.scale;
    const words = band ? u.bands?.find((b) => real >= b.min)?.words : null;
    return `about ${Math.round(real)} ${u.unit}${words ? `, ${words}` : ''}`;
  }

  /** Lightning rows 0–2 and 13–15: beyond what the ISS can see (config → outside). */
  const isOutside = (y = s.y) => !!s.record.outside?.rows.includes(y);

  /**
   * What an empty cell means: the dataset's "outside" rows first, then an
   * empty cell over water on a water dataset (sst: sea ice, not land), then
   * the UI's own emptyLabel (co2), then the engine's probe label.
   */
  function emptyLabel(result) {
    if (isOutside()) return s.record.outside.label;
    if (s.record.emptyWaterLabel && !isScreen() && !place().isLand) return s.record.emptyWaterLabel;
    return s.record.emptyLabel ?? (presetText(result.label) || 'no data');
  }

  /** "Very high, about 28 °C, warm tropical water." / "High night light, 0.42." / "Land, where there is no ocean data." */
  function valueWords(result) {
    if (result.empty) return `${upperFirst(emptyLabel(result))}.`;
    const level = upperFirst(levelOf(result));
    if (s.record.valueUnit) return `${level}, ${amount(result.value, { band: true })}.`;
    return `${level} ${preset().valueLabel ?? 'value'}, ${amount(result.value)}.`;
  }

  function noteWords(result) {
    return !result.empty && result.note ? ` Note ${result.note}.` : '';
  }

  /** Probe the cursor cell. Returns the engine's result (value, empty, label, level, note, …). */
  function probe() {
    const value = cellValue();
    const fallback = { x: s.x, y: s.y, value, empty: value === 0, label: value === 0 ? 'no data' : null, level: null, note: null };
    const result = audio.probe(s.x, s.y);
    return Promise.resolve(result).then((r) => r ?? fallback, () => fallback);
  }

  /** Start audio if this is the first gesture, then probe. */
  function probeInGesture() {
    if (!audio.isStarted()) {
      // Synchronous start inside the key / click handler; ignore failures.
      Promise.resolve(audio.start()).catch(() => {});
    }
    return probe();
  }

  function showCursor() {
    const visible = !!s.data && (s.active || s.hovering);
    cursorEl.hidden = !visible;
    if (!visible) return;
    cursorEl.style.left = `${(s.x / cols()) * 100}%`;
    cursorEl.style.top = `${(s.y / rows()) * 100}%`;
    cursorEl.style.width = `${100 / cols()}%`;
    cursorEl.style.height = `${100 / rows()}%`;
    // Over the video's own label (co2 date): thin outline only.
    const k = s.record?.keepClear;
    const overlaps = !!k && (s.x + 1) / cols() > k.left && s.x / cols() < k.right && (s.y + 1) / rows() > k.top && s.y / rows() < k.bottom;
    cursorEl.classList.toggle('is-thin', overlaps);
  }

  function showReadout(result) {
    if (!s.data || !(s.active || s.hovering)) {
      readoutEl.textContent = IDLE_READOUT;
      readoutEl.classList.add('is-idle');
      return;
    }
    const r = result ?? { value: cellValue(), empty: cellValue() === 0, label: 'no data' };
    const parts = [upperFirst(place().name)];
    if (r.empty) {
      parts.push(emptyLabel(r));
    } else {
      parts.push(levelOf(r), amount(r.value));
      if (r.note) parts.push(r.note);
    }
    parts.push(`col ${s.x + 1}, row ${s.y + 1}`);
    readoutEl.textContent = parts.join(' · ');
    readoutEl.classList.remove('is-idle');
  }

  /** Debounced status announcement (holding an arrow speaks once). */
  function announceSoon(text) {
    clearTimeout(s.announceTimer);
    s.announceTimer = setTimeout(() => announce(text, { force: true }), ANNOUNCE_DEBOUNCE_MS);
  }

  /** "North Atlantic. Very high, about 28 °C. Note F5." */
  function cellSentence(result) {
    return `${upperFirst(place().name)}. ${valueWords(result)}${noteWords(result)}`;
  }

  // ---------- moving ----------

  function edgeSentence(direction) {
    const words = isScreen() ? PICTURE_DIRECTIONS : MAP_DIRECTIONS;
    return isScreen() ? `Edge of the picture, ${words[direction]}.` : `Edge of map, ${words[direction]}.`;
  }

  function moveTo(x, y, direction) {
    const nx = Math.min(cols() - 1, Math.max(0, x));
    const ny = Math.min(rows() - 1, Math.max(0, y));
    const blocked = nx === s.x && ny === s.y;
    s.x = nx;
    s.y = ny;
    showCursor();
    probeInGesture().then((result) => {
      showReadout(result);
      // At an edge the probe repeats as a soft "bump" and we say which edge.
      announceSoon(blocked && direction ? edgeSentence(direction) : cellSentence(result));
    });
  }

  function directionOf(dx, dy) {
    if (dx < 0) return 'left';
    if (dx > 0) return 'right';
    if (dy < 0) return 'up';
    return 'down';
  }

  function onKeyDown(event) {
    if (!s.data || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? BIG_STEP : 1;
    let handled = true;
    if (KEY_MOVES[event.key]) {
      const [dx, dy] = KEY_MOVES[event.key];
      moveTo(s.x + dx * step, s.y + dy * step, directionOf(dx, dy));
    } else if (event.key === 'Home') {
      moveTo(0, s.y, 'left');
    } else if (event.key === 'End') {
      moveTo(cols() - 1, s.y, 'right');
    } else if (event.key === 'PageUp') {
      moveTo(s.x, 0, 'up');
    } else if (event.key === 'PageDown') {
      moveTo(s.x, rows() - 1, 'down');
    } else if (event.key === 'Escape') {
      leave({ returnFocus: true });
    } else {
      handled = false;
    }
    if (handled) event.preventDefault();
  }

  // ---------- pointer ----------

  function cellFromPointer(event) {
    const rect = mapEl.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * cols());
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * rows());
    return [Math.min(cols() - 1, Math.max(0, x)), Math.min(rows() - 1, Math.max(0, y))];
  }

  function hoverProbe([x, y]) {
    s.lastHoverAt = performance.now();
    if (x === s.x && y === s.y && !cursorEl.hidden) return;
    s.x = x;
    s.y = y;
    showCursor();
    probe().then((result) => {
      showReadout(result);
      announceSoon(cellSentence(result));
    });
  }

  function onPointerMove(event) {
    if (!s.data) return;
    s.hovering = true;
    s.pendingHover = cellFromPointer(event);
    const wait = HOVER_GAP_MS - (performance.now() - s.lastHoverAt);
    if (wait <= 0) {
      clearTimeout(s.hoverTimer);
      s.hoverTimer = 0;
      hoverProbe(s.pendingHover);
    } else if (!s.hoverTimer) {
      s.hoverTimer = setTimeout(() => {
        s.hoverTimer = 0;
        if (s.hovering) hoverProbe(s.pendingHover);
      }, wait);
    }
  }

  function onPointerLeave() {
    s.hovering = false;
    clearTimeout(s.hoverTimer);
    s.hoverTimer = 0;
    showCursor();
    if (!s.active) showReadout();
  }

  /** Click / tap: put the cursor there; focusing the map then enters explore. */
  function onPointerDown(event) {
    if (!s.data) return;
    const [x, y] = cellFromPointer(event);
    if (s.active) {
      moveTo(x, y); // already exploring: a click / tap is just a move
      return;
    }
    s.x = x;
    s.y = y;
    showCursor();
  }

  // ---------- entering / leaving ----------

  function enter() {
    if (!s.data || s.active) return;
    s.active = true;
    mapEl.classList.add('is-exploring');
    player.setExploring(true);
    const wasPlaying = player.isPlaying();
    if (wasPlaying) player.pause({ silent: true });
    // Make sure the engine's "latest frame" (used by probe) is this frame.
    audio.update(frame());
    showCursor();
    const label = lowerFirst(frameLabel(s.record, s.data, player.currentIndex()));
    probeInGesture().then((result) => {
      showReadout(result);
      announce(`${wasPlaying ? 'Paused. ' : ''}Exploring ${label}. Cursor: ${place().name}.`, { force: true });
    });
  }

  function leave({ returnFocus = false } = {}) {
    if (s.active) {
      s.active = false;
      clearTimeout(s.announceTimer);
      mapEl.classList.remove('is-exploring');
      player.setExploring(false);
      showCursor();
      showReadout();
    }
    if (returnFocus) player.focusPlay();
  }

  mapEl.addEventListener('focus', enter);
  mapEl.addEventListener('blur', () => leave());
  mapEl.addEventListener('keydown', onKeyDown);
  mapEl.addEventListener('pointermove', onPointerMove);
  mapEl.addEventListener('pointerleave', onPointerLeave);
  mapEl.addEventListener('pointerdown', onPointerDown);

  // Keep the map exactly on the displayed picture (not on letterbox bars).
  viewer.onLayout(({ top, right, bottom, left }) => {
    mapEl.style.margin = `${top}px ${right}px ${bottom}px ${left}px`;
  });

  showReadout();
  showCursor();

  // ---------- public ----------

  return {
    /** New record or data (data = null hides the map). Cursor position is kept. */
    setContext(record, data) {
      if (s.active) leave();
      s.record = record;
      s.data = data;
      mapEl.hidden = !data;
      mapEl.tabIndex = data ? 0 : -1;
      if (data) {
        s.x = Math.min(s.x, cols() - 1);
        s.y = Math.min(s.y, rows() - 1);
        mapEl.setAttribute('aria-label', `Sound map of ${record.summary.subject}. Use arrow keys to explore.`);
      }
      showCursor();
      showReadout();
    },

    isActive: () => s.active,

    /** E / Explore map button. */
    focusMap() {
      if (!s.data) {
        announce('Choose a record first, then explore its picture.', { force: true });
        return;
      }
      mapEl.focus();
    },

    /** The user changed frame (J / L / timeline) while the map is in use. */
    onFrameChange(index) {
      if (!s.data || !(s.active || s.hovering)) return;
      if (s.active) audio.update(s.data.frames[index]);
      probe().then((result) => {
        showReadout(result);
        if (!s.active) return;
        const label = lowerFirst(frameLabel(s.record, s.data, index));
        announceSoon(`Same place, ${label}: ${lowerFirst(valueWords(result))}`);
      });
    },

    /** W: full description including coordinates. */
    whereAmI() {
      if (!s.data) {
        announce('Choose a record first.', { force: true });
        return;
      }
      clearTimeout(s.announceTimer);
      probeInGesture().then((result) => {
        showReadout(result);
        const where = isScreen()
          ? `${upperFirst(place().name)}.`
          : `${upperFirst(place().name)}, ${compassAt(s.x, s.y, cols(), rows())}.`;
        const label = frameLabel(s.record, s.data, player.currentIndex());
        announce(
          `${where} Column ${s.x + 1} of ${cols()}, row ${s.y + 1} of ${rows()}. ` +
            `${valueWords(result)}${noteWords(result)} ${label}.`,
          { force: true },
        );
      });
    },

    /** C: compare the cursor cell with the average of the cells that have data. */
    compare() {
      if (!s.data) {
        announce('Choose a record first.', { force: true });
        return;
      }
      clearTimeout(s.announceTimer);
      const value = cellValue();
      if (value === 0) {
        const why = isOutside() ? `${upperFirst(s.record.outside.label)}, nothing to compare.` : 'No data here to compare.';
        announce(why, { force: true });
        return;
      }
      const cells = frame().grid.flat().filter((v) => v > 0);
      const avg = cells.reduce((a, b) => a + b, 0) / cells.length;
      const span = Math.max(...cells) - Math.min(...cells) || 1;
      const d = (value - avg) / span; // relative to this frame's spread
      let words = 'About average';
      if (d >= 0.25) words = 'Much higher than average';
      else if (d >= 0.08) words = 'Higher than average';
      else if (d <= -0.25) words = 'Much lower than average';
      else if (d <= -0.08) words = 'Lower than average';
      announce(`${words}: ${amount(value)} here, ${areaWord()} average ${amount(avg)}.`, { force: true });
    },
  };
}
