// Global keyboard shortcuts. This list is the single source of truth: the
// "?" help dialog (step 6) renders SHORTCUTS directly.
//
// Rules:
// - Single keys only, no Control/Option/Command combos (those belong to
//   VoiceOver and the browser).
// - Never fire while focus is in a text field, <select> or slider, so native
//   keys (arrows, Page Up/Down, Home/End, typing) keep working.
// - Single-key shortcuts can be switched off (WCAG 2.1.4 Character Key
//   Shortcuts). A visible toggle will use setSingleKeyShortcuts().

export const SHORTCUTS = [
  { action: 'toggle', keys: ['K'], description: 'Play or pause' },
  { action: 'toggle', keys: ['Space'], description: 'Play or pause, when focus is in the player panel but not on a control' },
  { action: 'back', keys: ['J'], description: 'Step back one frame' },
  { action: 'forward', keys: ['L'], description: 'Step forward one frame' },
  { action: 'cycleNarration', keys: ['N'], description: 'Change narration: off, brief, detailed' },
  { action: 'describe', keys: ['D'], description: 'Describe the current frame in detail now' },
  { action: 'explore', keys: ['E'], description: 'Explore the map with the sound cursor (arrow keys move, Escape leaves)' },
  { action: 'whereAmI', keys: ['W'], description: 'Where is the sound cursor? Region, column, row and value' },
  { action: 'compare', keys: ['C'], description: 'Compare the cursor cell with the map average' },
  { action: 'legend', keys: ['G'], description: 'Play the audio legend: the notes from lowest to highest value' },
];

const settings = { singleKeyShortcuts: true };

export function singleKeyShortcutsEnabled() {
  return settings.singleKeyShortcuts;
}

export function setSingleKeyShortcuts(enabled) {
  settings.singleKeyShortcuts = !!enabled;
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
  g: 'legend',
};

/** actions: { toggle, back, forward, cycleNarration, describe, explore, whereAmI, compare, legend } */
export function installShortcuts(actions) {
  document.addEventListener('keydown', (event) => {
    if (!settings.singleKeyShortcuts) return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (isTypingTarget(target) || target.closest?.('dialog')) return;

    let action = KEY_ACTIONS[event.key.toLowerCase()] ?? null;
    if (event.key === ' ' && target.closest?.('#player') && !isControl(target)) action = 'toggle';
    if (!action) return;
    // Holding a key must not flap play/pause, spin through levels or repeat speech.
    if (event.repeat && action !== 'back' && action !== 'forward') return;

    event.preventDefault();
    actions[action]?.();
  });
}
