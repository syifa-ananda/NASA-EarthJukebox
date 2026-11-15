// Global keyboard shortcuts. These lists are the single source of truth: the
// "?" dialog (shortcuts-dialog.js) renders SHORTCUTS, SHORTCUT_GROUPS and
// MAP_KEYS directly.
//
// Rules:
// - Single keys only, no Control/Option/Command combos (those belong to
//   VoiceOver and the browser).
// - Never fire while focus is in a text field, <select> or slider, so native
//   keys (arrows, Page Up/Down, Home/End, typing) keep working.
// - Single-key shortcuts can be switched off (WCAG 2.1.4 Character Key
//   Shortcuts): K, J, L, N, D, E, W, C, G, B and ?.
// - B toggles the dataset sidebar (not Command+B, which browsers use for
//   bookmarks). Space stays on, because it
//   only works while focus is on the player panel itself (WCAG 2.1.4 allows
//   shortcuts that are active only on focus). The "Keyboard shortcuts"
//   button always opens the list.

export const SHORTCUT_GROUPS = [
  { id: 'playback', title: 'Playback' },
  { id: 'sound', title: 'Narration and sound' },
  { id: 'explore', title: 'Explore' },
  { id: 'layout', title: 'Layout' },
  { id: 'general', title: 'This list' },
];

export const SHORTCUTS = [
  { action: 'toggle', group: 'playback', keys: ['K'], description: 'Play or pause' },
  { action: 'toggle', group: 'playback', keys: ['Space'], description: 'Play or pause, when focus is on the player panel itself (not on a button or slider)', focusOnly: true },
  { action: 'back', group: 'playback', keys: ['J'], description: 'Step back one frame' },
  { action: 'forward', group: 'playback', keys: ['L'], description: 'Step forward one frame' },
  { action: 'cycleNarration', group: 'sound', keys: ['N'], description: 'Change narration: off, brief, detailed' },
  { action: 'describe', group: 'sound', keys: ['D'], description: 'Describe the current frame in detail now' },
  { action: 'legend', group: 'sound', keys: ['G'], description: 'Play the audio legend: the notes from lowest to highest value' },
  { action: 'explore', group: 'explore', keys: ['E'], description: 'Explore the picture with the sound cursor' },
  { action: 'whereAmI', group: 'explore', keys: ['W'], description: 'Where is the sound cursor? Place, column, row and value' },
  { action: 'compare', group: 'explore', keys: ['C'], description: 'Compare the cursor spot with the average' },
  { action: 'toggleSidebar', group: 'layout', keys: ['B'], description: 'Show or hide the dataset list (thumbnails only when hidden)' },
  { action: 'help', group: 'general', keys: ['?'], description: 'Show this list of keyboard shortcuts' },
];

/** Keys inside the sound map (handled by explore.js, not global shortcuts). */
export const MAP_KEYS = [
  { keys: ['Arrow keys'], description: 'Move one cell', mac: null },
  { keys: ['Shift', 'Arrow keys'], description: 'Move 4 cells', mac: null },
  { keys: ['Home'], description: 'Jump to the left (west) edge', mac: ['Fn', 'Left arrow'] },
  { keys: ['End'], description: 'Jump to the right (east) edge', mac: ['Fn', 'Right arrow'] },
  { keys: ['Page Up'], description: 'Jump to the top (north) edge', mac: ['Fn', 'Up arrow'] },
  { keys: ['Page Down'], description: 'Jump to the bottom (south) edge', mac: ['Fn', 'Down arrow'] },
  { keys: ['Escape'], description: 'Leave the sound map and go back to Play', mac: null },
];

export const VOICEOVER_TIP =
  'With VoiceOver, turn Quick Nav off first (press Left arrow and Right arrow together), ' +
  'so the arrow keys reach the sound map.';

const settings = { singleKeyShortcuts: true };
const listeners = new Set();

export function singleKeyShortcutsEnabled() {
  return settings.singleKeyShortcuts;
}

export function setSingleKeyShortcuts(enabled) {
  const next = !!enabled;
  if (settings.singleKeyShortcuts === next) return;
  settings.singleKeyShortcuts = next;
  listeners.forEach((fn) => fn(next));
}

/** fn(enabled) runs whenever single-key shortcuts are turned on or off. */
export function onSingleKeyShortcutsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const NON_TYPING_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'color', 'file']);

/** Focus is somewhere that uses letter / space / arrow keys itself. */
function isTypingTarget(el) {
  if (!(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  if (el.closest('select, textarea, [role="slider"], [role="textbox"], [role="combobox"], [role="application"]')) return true;
  return el.tagName === 'INPUT' && !NON_TYPING_INPUTS.has(el.type);
}

/** Focus is on something where Space already has a meaning. */
function isControl(el) {
  return !!el.closest('button, a[href], input, select, textarea, summary, [role="button"], [role="checkbox"], [role="radio"]');
}

const KEY_ACTIONS = {
  k: 'toggle', j: 'back', l: 'forward', n: 'cycleNarration', d: 'describe', e: 'explore', w: 'whereAmI', c: 'compare',
  g: 'legend', b: 'toggleSidebar', '?': 'help',
};

/** actions: { toggle, back, forward, cycleNarration, describe, explore, whereAmI, compare, legend, toggleSidebar, help } */
export function installShortcuts(actions) {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (isTypingTarget(target) || target.closest?.('dialog')) return;

    let action = null;
    if (event.key === ' ' && target.closest?.('#player') && !isControl(target)) {
      action = 'toggle'; // focus-scoped, so it stays on (see the note at the top)
    } else if (settings.singleKeyShortcuts) {
      action = KEY_ACTIONS[event.key.toLowerCase()] ?? null;
    }
    if (!action) return;
    // Holding a key must not flap play/pause, spin through levels or repeat speech.
    if (event.repeat && action !== 'back' && action !== 'forward') return;
    // A page may install only some actions (how-to-listen.html: just "?"):
    // other keys keep their normal behaviour there.
    const run = actions[action];
    if (!run) return;

    event.preventDefault();
    run();
  });
}
