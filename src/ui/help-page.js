// Entry point for how-to-listen.html: the keyboard shortcuts dialog (same
// module as the jukebox) and the links back. No player, description or audio.
//
// The URL hash carries the jukebox settings (#record=…&keys=off…).
// This page uses keys=off itself (single-key shortcuts, here only "?") and
// hands the whole hash back through the "Jukebox" links (minus the narration
// key of older links, which no longer exists).

import { createShortcutsDialog } from './shortcuts-dialog.js';
import { installShortcuts, setSingleKeyShortcuts, singleKeyShortcutsEnabled, onSingleKeyShortcutsChange } from './shortcuts.js';
import { handleInPageLinks, updateStateLinks } from './page-links.js';

const params = new URLSearchParams(location.hash.slice(1));
params.delete('narration');
setSingleKeyShortcuts(params.get('keys') !== 'off');

const shortcutsDialog = createShortcutsDialog(document.getElementById('shortcuts-dialog'));

// The header button and "Show all keyboard shortcuts" open it.
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-shortcuts]');
  if (opener) shortcutsDialog.open(opener);
});

// Skip link: focus <main> without replacing the settings hash.
document.addEventListener('click', handleInPageLinks);

// Only "?" on this page; the other single keys keep their normal behaviour.
installShortcuts({ help: () => shortcutsDialog.open(document.activeElement) });

/** Keep the hash and the links in step with the single-key setting. */
function syncSettings() {
  if (singleKeyShortcutsEnabled()) params.delete('keys');
  else params.set('keys', 'off');
  const hash = params.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  updateStateLinks(params);
}

onSingleKeyShortcutsChange(syncSettings);
syncSettings();
