// Entry point for the Earth Information Jukebox UI.

import { loadIndex, loadFeatures } from './adapters/data.js';
import { mergeRecords, statusLabel } from './config/datasets.js';
import { renderRecordList } from './records.js';
import { renderInfo } from './info.js';
import * as viewer from './viewer.js';
import { announce } from './narrator.js';
import { createPlayer } from './player.js';
import { installShortcuts } from './shortcuts.js';
import { createLiveNarration, DEFAULT_LEVEL, LEVELS, isLevel } from './narration.js';
import { renderNarrationControls } from './narration-controls.js';

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

// ---------- URL hash: #record=<id>&narration=<level> ----------

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const record = params.get('record');
  const narration = params.get('narration');
  return {
    record: record && /^[\w-]+$/.test(record) ? record : null,
    narration: isLevel(narration) ? narration : null,
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.current) params.set('record', state.current.id);
  params.set('narration', narration.getLevel());
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
  engineStatusEl: document.getElementById('engine-status'),
  narration,
  onPlayingChange: (playing) => document.body.classList.toggle('is-playing', playing),
});

const narrationControls = renderNarrationControls(document.getElementById('narration-controls'), {
  level: DEFAULT_LEVEL,
  onChange: (level) => setNarrationLevel(level),
});

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
});

// ---------- Selection ----------

function selectionMessage(record) {
  if (!record.playable) {
    return `Selected ${record.title}. Coming soon, data not ready yet.`;
  }
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

  writeHash();
  nowPlaying.textContent = record.title;
  renderInfo(infoBody, record);
  if (announceIt) scheduleAnnouncement(record);

  if (!record.playable) {
    viewer.showNotReady(record);
    return;
  }

  viewer.showLoading(record);
  try {
    const data = await loadFeatures(record.entry);
    if (token !== state.loadToken) return; // a newer selection won
    state.data = data;
    player.setData(record, data); // loads the preset, shows frame 0, stays paused
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
