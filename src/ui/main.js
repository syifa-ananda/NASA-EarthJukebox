// Entry point for the Earth Information Jukebox UI.

import { loadIndex, loadFeatures } from './adapters/data.js';
import { mergeRecords, statusLabel } from './config/datasets.js';
import { renderRecordList } from './records.js';
import { renderInfo } from './info.js';
import * as viewer from './viewer.js';
import { announce } from './narrator.js';
import { createPlayer } from './player.js';
import { installShortcuts, setSingleKeyShortcuts, singleKeyShortcutsEnabled, onSingleKeyShortcutsChange } from './shortcuts.js';
import { createShortcutsDialog } from './shortcuts-dialog.js';
import { createLiveNarration, DEFAULT_LEVEL, LEVELS, isLevel } from './narration.js';
import { createSoundSettings } from './sound-settings.js';
import { createExplore } from './explore.js';

const nowPlaying = document.getElementById('now-playing');
const infoBody = document.getElementById('info-body');
const recordList = document.getElementById('record-list');

// Wait this long after the last selection change before announcing, so
// arrowing quickly through the list doesn't queue up a message per record.
const ANNOUNCE_DELAY_MS = 600;

const state = {
  records: [],
  current: null,
  data: null,
  loadToken: 0,
};

let picker = null;
let announceTimer = null;

// ---------- URL hash: #record=<id>&narration=<level>[&keys=off] ----------
// Any other parameter (e.g. an old theme=…) is ignored and dropped on the next write.

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const record = params.get('record');
  const narration = params.get('narration');
  return {
    record: record && /^[\w-]+$/.test(record) ? record : null,
    narration: isLevel(narration) ? narration : null,
    singleKeys: params.get('keys') !== 'off', // on unless the hash says off
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.current) params.set('record', state.current.id);
  params.set('narration', narration.getLevel());
  if (!singleKeyShortcutsEnabled()) params.set('keys', 'off');
  // replaceState: no history entry per arrow press, and no hashchange event.
  history.replaceState(null, '', `#${params}`);
}

// ---------- Player, narration, shortcuts ----------

const narration = createLiveNarration({
  captionEl: document.getElementById('narration-caption'),
  getIndex: () => player.currentIndex(),
});

const player = createPlayer({
  transportEl: document.getElementById('transport'),
  soundStatusEl: document.getElementById('sound-status'),
  videoStatusEl: document.getElementById('video-status'),
  narration,
  onPlayingChange: (playing) => document.body.classList.toggle('is-playing', playing),
  onUserSeek: (index) => explore.onFrameChange(index),
  onExplore: () => explore.focusMap(),
  onLegend: () => soundSettings.playLegend(),
});

const explore = createExplore({
  mapEl: document.getElementById('sound-map'),
  cursorEl: document.getElementById('map-cursor'),
  readoutEl: document.getElementById('explore-readout'),
  player,
  narration,
});

const soundSettings = createSoundSettings(document.getElementById('sound-settings'), {
  level: DEFAULT_LEVEL,
  onNarrationChange: (level) => setNarrationLevel(level),
});
const narrationControls = soundSettings.narrationControls;

function setNarrationLevel(level, { announceIt = true } = {}) {
  if (!isLevel(level)) return;
  narration.setLevel(level, { announceIt });
  narrationControls.set(level);
  writeHash();
}

installShortcuts({
  toggle: () => player.toggle(),
  back: () => player.step(-1),
  forward: () => player.step(1),
  cycleNarration: () => {
    const next = LEVELS[(LEVELS.indexOf(narration.getLevel()) + 1) % LEVELS.length];
    setNarrationLevel(next);
  },
  describe: () => narration.describeNow(),
  explore: () => explore.focusMap(),
  whereAmI: () => explore.whereAmI(),
  compare: () => explore.compare(),
  legend: () => soundSettings.playLegend(),
  help: () => shortcutsDialog.open(document.activeElement),
});

// ---------- Keyboard shortcuts dialog ----------

const shortcutsDialog = createShortcutsDialog(document.getElementById('shortcuts-dialog'));

// The header button and the "How to listen" button both open it.
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-shortcuts]');
  if (opener) shortcutsDialog.open(opener);
});

// Turning single-key shortcuts on or off: remember it and update the hint.
onSingleKeyShortcutsChange(() => {
  writeHash();
  player.refreshHelp();
});

// ---------- Selection ----------

function selectionMessage(record) {
  const status = statusLabel(record);
  return `Selected ${record.title}.${status ? ` ${status}.` : ''} Press Tab to reach the player.`;
}

function scheduleAnnouncement(record) {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => announce(selectionMessage(record)), ANNOUNCE_DELAY_MS);
}

async function selectRecord(id, { announceIt = true } = {}) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  const token = ++state.loadToken;
  state.current = record;
  state.data = null;

  // Stops the old record's clock and sound at once; Play waits for new data.
  player.clear(record);
  explore.setContext(record, null);
  soundSettings.setContext(record, null);

  writeHash();
  nowPlaying.textContent = record.title;
  renderInfo(infoBody, record);
  if (announceIt) scheduleAnnouncement(record);

  viewer.showLoading(record);
  try {
    const data = await loadFeatures(record.entry);
    if (token !== state.loadToken) return; // a newer selection won
    state.data = data;
    player.setData(record, data); // loads the preset, shows frame 0, stays paused
    explore.setContext(record, data);
    soundSettings.setContext(record, data);
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error(err);
    player.clear(record, { error: true });
    const msg = `Could not load ${record.title}. Check that the site is served from the repo root, then choose the record again.`;
    viewer.showError(msg);
    announce(msg, { force: true });
  }
}

// ---------- In-page links ----------
// Skip link and nav links move focus to their section without overwriting the
// #record=…&narration=… hash, so a reload still restores both.

function handleInPageLinks(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target) return;
  event.preventDefault();
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}

// ---------- Startup ----------

async function init() {
  document.addEventListener('click', handleInPageLinks);

  const fromHash = readHash();
  if (fromHash.narration) setNarrationLevel(fromHash.narration, { announceIt: false });
  setSingleKeyShortcuts(fromHash.singleKeys);

  let entries;
  try {
    entries = await loadIndex();
  } catch (err) {
    console.error(err);
    const msg =
      'Could not load the dataset list. Serve the site from the repo root with "python3 -m http.server" and open http://localhost:8000.';
    viewer.showError(msg);
    recordList.replaceChildren();
    announce(msg, { force: true });
    return;
  }

  state.records = mergeRecords(entries);
  picker = renderRecordList(recordList, state.records, { onSelect: (id) => selectRecord(id) });

  window.addEventListener('hashchange', () => {
    const next = readHash();
    if (next.narration && next.narration !== narration.getLevel()) setNarrationLevel(next.narration);
    setSingleKeyShortcuts(next.singleKeys);
    if (next.record && next.record !== state.current?.id) {
      picker.check(next.record);
      selectRecord(next.record);
    }
  });

  const restored = fromHash.record;
  if (restored && state.records.some((r) => r.id === restored)) {
    picker.check(restored);
    selectRecord(restored, { announceIt: false });
  } else {
    viewer.showIdle('Choose a record to begin.');
  }
}

init();
