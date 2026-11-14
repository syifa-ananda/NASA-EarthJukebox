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

const KEY_ACTIONS = { k: 'toggle', j: 'back', l: 'forward' };

/** actions: { toggle(), back(), forward() } */
export function installShortcuts(actions) {
  document.addEventListener('keydown', (event) => {
    if (!settings.singleKeyShortcuts) return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (isTypingTarget(target) || target.closest?.('dialog')) return;

    let action = KEY_ACTIONS[event.key.toLowerCase()] ?? null;
    if (event.key === ' ' && target.closest?.('#player') && !isControl(target)) action = 'toggle';
    if (!action) return;
    if (action === 'toggle' && event.repeat) return; // holding the key must not flap

    event.preventDefault();
    actions[action]?.();
  });
}
