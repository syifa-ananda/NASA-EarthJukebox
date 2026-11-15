// "Keyboard shortcuts" dialog. Native <dialog> + showModal(): the page behind
// becomes inert, Escape closes it, and focus returns to whatever opened it.
// Tab is also wrapped explicitly, so focus can't leave for the browser UI.
// Everything in it is rendered from the lists in shortcuts.js.

import { h } from './dom.js';
import {
  SHORTCUTS, SHORTCUT_GROUPS, MAP_KEYS,
  singleKeyShortcutsEnabled, setSingleKeyShortcuts, onSingleKeyShortcutsChange,
} from './shortcuts.js';

/** <kbd>Shift</kbd> + <kbd>Arrow keys</kbd> */
function keys(list) {
  return list.flatMap((k, i) => (i ? [' + ', h('kbd', {}, k)] : [h('kbd', {}, k)]));
}

/**
 * One group as a table: the key is the row header, so screen readers read
 * "K, Play or pause" row by row.
 */
function groupTable(id, title, rows) {
  return h(
    'section',
    { class: 'sc-group', 'aria-labelledby': id },
    h('h3', { id }, title),
    h(
      'table',
      { class: 'sc-table', 'aria-labelledby': id },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Key'), h('th', { scope: 'col' }, 'What it does'))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, keys(r.keys), r.mac ? h('span', { class: 'sc-mac' }, ' (MacBook: ', keys(r.mac), ')') : null),
            h('td', {}, r.description),
          ),
        ),
      ),
    ),
  );
}

/** @param {HTMLDialogElement} dialog */
export function createShortcutsDialog(dialog) {
  let opener = null;

  const closeBtn = h('button', { type: 'button', class: 'btn-secondary', id: 'shortcuts-close' }, 'Close');
  const toggle = h('input', { type: 'checkbox', id: 'single-keys', checked: singleKeyShortcutsEnabled(), 'aria-describedby': 'single-keys-help' });
  const body = h(
    'div',
    // Focusable so keyboard users can scroll the list with the arrow keys.
    { class: 'sc-body', tabindex: '0', role: 'region', 'aria-label': 'Shortcut list' },
    h('p', { class: 'sc-intro' }, 'Single keys work anywhere on the page, except while you type, use a menu or move a slider.'),
    SHORTCUT_GROUPS.map((g) => groupTable(`sc-${g.id}`, g.title, SHORTCUTS.filter((s) => s.group === g.id))),
    groupTable('sc-map', 'Inside the sound map', MAP_KEYS),
  );

  dialog.replaceChildren(
    h('div', { class: 'sc-head' }, h('h2', { id: 'shortcuts-title' }, 'Keyboard shortcuts'), closeBtn),
    h(
      'div',
      { class: 'sc-setting' },
      h('label', { class: 't-check', for: 'single-keys' }, toggle, 'Single-key shortcuts'),
      h(
        'p',
        { id: 'single-keys-help', class: 'setting-help' },
        'Turn off if single-letter keys get in your way. The Keyboard shortcuts button still opens this list.',
      ),
    ),
    body,
  );
  dialog.setAttribute('aria-labelledby', 'shortcuts-title');

  toggle.addEventListener('change', () => setSingleKeyShortcuts(toggle.checked));
  onSingleKeyShortcutsChange((on) => {
    toggle.checked = on;
  });

  closeBtn.addEventListener('click', () => dialog.close());

  // A click on the backdrop (outside the dialog box) closes it too.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // Keep Tab inside the dialog.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusables = [closeBtn, toggle, body];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Escape (native 'cancel'), Close and the backdrop all end here.
  dialog.addEventListener('close', () => {
    const target = opener;
    opener = null;
    if (target && document.contains(target)) target.focus();
  });

  return {
    /** Open the dialog; focus returns to `from` (default: the focused element). */
    open(from = document.activeElement) {
      if (dialog.open) return;
      opener = from instanceof HTMLElement ? from : null;
      dialog.showModal();
      closeBtn.focus();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    isOpen: () => dialog.open,
  };
}
