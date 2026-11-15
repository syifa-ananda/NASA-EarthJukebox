// Explore mode: a "sound cursor" over the map.
//
// The sound map is one focusable element (tabindex="0") laid over the viewer,
// with role="group" + aria-roledescription="sound map", an aria-label and
// aria-describedby instructions. No role="application": VoiceOver on macOS
// already passes plain arrow keys to the focused element when Quick Nav is off,
// and a group keeps the label and instructions readable in Chrome and Safari.
//
// Keys inside the map (not global shortcuts):
//   Arrows        move one cell        Shift+Arrows  move 4 cells
//   Home / End    west / east edge     Page Up / Down  north / south edge
//   Escape        leave, back to Play
// Global shortcuts that also work here: W (where am I), C (compare), J / L, K.

import * as audio from './adapters/audio.js';
import { announce } from './narrator.js';
import { regionAt, compassAt } from './regions.js';
import { frameLabel } from './narration.js';
import { levelWord } from '../audio/engine/describe.js';
import { getPreset } from '../audio/presets/index.js';

const ANNOUNCE_DEBOUNCE_MS = 250; // holding an arrow: speak once it settles
const HOVER_GAP_MS = 100; // pointer probing: at most ~10 per second
const BIG_STEP = 4;

const KEY_MOVES = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * @param {{ mapEl: HTMLElement, cursorEl: HTMLElement, readoutEl: HTMLElement,
 *           player: ReturnType<import('./player.js').createPlayer>,
 *           narration: ReturnType<import('./narration.js').createLiveNarration> }} opts
 */
export function createExplore({ mapEl, cursorEl, readoutEl, player, narration }) {
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

  const IDLE_READOUT = 'Explore the map: press E, use the Explore map button, or point at the picture.';

  // ---------- helpers ----------

  const cols = () => s.data?.grid?.cols ?? 32;
  const rows = () => s.data?.grid?.rows ?? 16;
  const frame = () => s.data.frames[player.currentIndex()];
  const valueLabel = () => getPreset(s.record.id).valueLabel ?? 'value';
  const region = (x = s.x, y = s.y) => regionAt(x, y, cols(), rows());

  function cellValue(x = s.x, y = s.y) {
    return frame().grid[y][x];
  }

  /** "High water temperature, 0.81." */
  function valueWords(value) {
    return `${upperFirst(levelWord(value))} ${valueLabel()}, ${value.toFixed(2)}.`;
  }

  /** Probe the cursor cell. Returns the engine's result (value, note, …). */
  function probe() {
    const fallback = { x: s.x, y: s.y, value: cellValue(), note: null };
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
  }

  function showReadout(result) {
    if (!s.data || !(s.active || s.hovering)) {
      readoutEl.textContent = IDLE_READOUT;
      readoutEl.classList.add('is-idle');
      return;
    }
    const value = result?.value ?? cellValue();
    const parts = [region(), levelWord(value), value.toFixed(2)];
    if (result?.note) parts.push(result.note);
    parts.push(`col ${s.x + 1}, row ${s.y + 1}`);
    readoutEl.textContent = parts.join(' · ');
    readoutEl.classList.remove('is-idle');
  }

  /** Debounced status announcement (holding an arrow speaks once). */
  function announceSoon(text) {
    clearTimeout(s.announceTimer);
    s.announceTimer = setTimeout(() => announce(text, { force: true }), ANNOUNCE_DEBOUNCE_MS);
  }

  function cellSentence(result) {
    const note = result.note ? ` Note ${result.note}.` : '';
    return `${upperFirst(region())}. ${valueWords(result.value)}${note}`;
  }

  // ---------- moving ----------

  function moveTo(x, y, edgeWord) {
    const nx = Math.min(cols() - 1, Math.max(0, x));
    const ny = Math.min(rows() - 1, Math.max(0, y));
    const blocked = nx === s.x && ny === s.y;
    s.x = nx;
    s.y = ny;
    showCursor();
    probeInGesture().then((result) => {
      showReadout(result);
      // At an edge the probe repeats as a soft "bump" and we say which edge.
      announceSoon(blocked && edgeWord ? `Edge of map, ${edgeWord}.` : cellSentence(result));
    });
  }

  function edgeFor(dx, dy) {
    if (dx < 0) return 'west';
    if (dx > 0) return 'east';
    if (dy < 0) return 'north';
    return 'south';
  }

  function onKeyDown(event) {
    if (!s.data || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? BIG_STEP : 1;
    let handled = true;
    if (KEY_MOVES[event.key]) {
      const [dx, dy] = KEY_MOVES[event.key];
      moveTo(s.x + dx * step, s.y + dy * step, edgeFor(dx, dy));
    } else if (event.key === 'Home') {
      moveTo(0, s.y, 'west');
    } else if (event.key === 'End') {
      moveTo(cols() - 1, s.y, 'east');
    } else if (event.key === 'PageUp') {
      moveTo(s.x, 0, 'north');
    } else if (event.key === 'PageDown') {
      moveTo(s.x, rows() - 1, 'south');
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
    narration.setExploring(true);
    player.setExploring(true);
    const wasPlaying = player.isPlaying();
    if (wasPlaying) player.pause({ silent: true });
    // Make sure the engine's "latest frame" (used by probe) is this frame.
    audio.update(frame());
    showCursor();
    const label = lowerFirst(frameLabel(s.record, s.data, player.currentIndex()));
    probeInGesture().then((result) => {
      showReadout(result);
      announce(`${wasPlaying ? 'Paused. ' : ''}Exploring ${label}. Cursor: ${region()}.`, { force: true });
    });
  }

  function leave({ returnFocus = false } = {}) {
    if (s.active) {
      s.active = false;
      clearTimeout(s.announceTimer);
      mapEl.classList.remove('is-exploring');
      narration.setExploring(false);
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
        announce('Choose a record marked "Mock data" first, then explore its map.', { force: true });
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
        announceSoon(`Same place, ${label}: ${lowerFirst(valueWords(result.value))}`);
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
        const note = result.note ? ` Note ${result.note}.` : '';
        const label = frameLabel(s.record, s.data, player.currentIndex());
        announce(
          `${upperFirst(region())}, ${compassAt(s.x, s.y, cols(), rows())}. ` +
            `Column ${s.x + 1} of ${cols()}, row ${s.y + 1} of ${rows()}. ` +
            `${valueWords(result.value)}${note} ${label}.`,
          { force: true },
        );
      });
    },

    /** C: compare the cursor cell with the frame average. */
    compare() {
      if (!s.data) {
        announce('Choose a record first.', { force: true });
        return;
      }
      clearTimeout(s.announceTimer);
      const grid = frame().grid;
      const all = grid.flat();
      const avg = all.reduce((a, b) => a + b, 0) / all.length;
      const value = cellValue();
      const d = value - avg;
      const words =
        d >= 0.25 ? 'Much higher than average' :
        d >= 0.05 ? 'Higher than average' :
        d <= -0.25 ? 'Much lower than average' :
        d <= -0.05 ? 'Lower than average' : 'About average';
      announce(`${words}: ${value.toFixed(2)} here, map average ${avg.toFixed(2)}.`, { force: true });
    },
  };
}
