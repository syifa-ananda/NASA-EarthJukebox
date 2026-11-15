// Entry point for the Earth Information Jukebox UI.

import { loadIndex, loadFeatures } from './adapters/data.js';
import { mergeRecords, statusLabel, RECORDS } from './config/datasets.js';
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
import { createAlarmSetting, ALARM_DEFAULT } from './alarm-setting.js';
import * as audio from './adapters/audio.js';
import { getPreset } from '../audio/presets/index.js';
import { handleInPageLinks, updateStateLinks } from './page-links.js';

const nowPlaying = document.getElementById('now-playing');
const infoBody = document.getElementById('info-body');
const recordList = document.getElementById('record-list');
const infoPanel = document.getElementById('info');

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

// ---------- URL hash: #record=<id>&narration=<level>[&keys=off][&alarm=off] ----------
// Any other parameter (e.g. an old theme=…) is ignored and dropped on the next write.

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const record = params.get('record');
  const narration = params.get('narration');
  return {
    record: record && /^[\w-]+$/.test(record) ? record : null,
    narration: isLevel(narration) ? narration : null,
    singleKeys: params.get('keys') !== 'off', // on unless the hash says off
    alarm: params.has('alarm') ? params.get('alarm') !== 'off' : ALARM_DEFAULT,
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.current) params.set('record', state.current.id);
  params.set('narration', narration.getLevel());
  if (!singleKeyShortcutsEnabled()) params.set('keys', 'off');
  // Only when it differs from the default (on).
  if (alarmSetting && alarmSetting.isEnabled() !== ALARM_DEFAULT) params.set('alarm', alarmSetting.isEnabled() ? 'on' : 'off');
  // replaceState: no history entry per arrow press, and no hashchange event.
  history.replaceState(null, '', `#${params}`);
  // The header nav carries the same settings to "How to listen" and back.
  updateStateLinks(params);
}

// ---------- Player, narration, shortcuts ----------

const narration = createLiveNarration({
  captionEl: document.getElementById('narration-caption'),
  getIndex: () => player.currentIndex(),
  // The stub fallback has no alarm voice, so narration never mentions it there.
  canSoundAlarm: () => audio.canSoundAlarm(),
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
  // The engine can't stop an alarm example early (no stopAlarmPreview() yet), so say so.
  playNote: () => (alarmSetting?.previewRemaining() > 0 ? ' The music joins when the alarm example ends.' : ''),
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

// Climate alarm (Sound settings). Datasets whose preset has an alarm (co2).
let alarmSetting = null;
alarmSetting = createAlarmSetting({
  soundSettings,
  player,
  narration,
  // Names of the datasets whose preset has an alarm, e.g. "Carbon Dioxide".
  alarmDatasets: RECORDS.filter((r) => getPreset(r.id).alarm?.on).map((r) => r.shortTitle).join(' and ') || 'Carbon Dioxide',
  onChange: () => {
    writeHash();
    if (state.current) renderInfo(infoBody, state.current, { alarm: alarmSetting.isEnabled() });
  },
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
  explore: () => explore.focusMap(),
  whereAmI: () => explore.whereAmI(),
  compare: () => explore.compare(),
  legend: () => soundSettings.playLegend(),
  help: () => shortcutsDialog.open(document.activeElement),
});

// ---------- Keyboard shortcuts dialog ----------

const shortcutsDialog = createShortcutsDialog(document.getElementById('shortcuts-dialog'));

// The header button opens it (the same module serves how-to-listen.html).
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
  renderInfo(infoBody, record, { alarm: alarmSetting.isEnabled() });
  infoPanel.scrollTop = 0; // wide screens: the panel scrolls on its own; start at the top
  alarmSetting.setContext(record, null);
  if (announceIt) scheduleAnnouncement(record);

  viewer.showLoading(record);
  try {
    const data = await loadFeatures(record.entry);
    if (token !== state.loadToken) return; // a newer selection won
    state.data = data;
    player.setData(record, data); // loads the preset, shows frame 0, stays paused
    explore.setContext(record, data);
    soundSettings.setContext(record, data);
    alarmSetting.setContext(record, data);
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error(err);
    player.clear(record, { error: true });
    const msg = `Could not load ${record.title}. Check that the site is served from the repo root, then choose the record again.`;
    viewer.showError(msg);
    announce(msg, { force: true });
  }
}

// ---------- "About this dataset": its own scroll area on wide screens ----------
// In the 3-column layout (styles.css: min-width 1200px, min-height 600px) the
// panel scrolls internally, so it becomes a Tab stop that scrolls with the
// arrow keys, Page Up / Down, Home and End. Elsewhere the page scrolls and the
// panel needs no Tab stop. Its role and name (index.html) stay the same.

const WIDE_LAYOUT = window.matchMedia('(min-width: 1200px) and (min-height: 600px)');

function syncInfoScrollStop() {
  if (WIDE_LAYOUT.matches) infoPanel.setAttribute('tabindex', '0');
  else infoPanel.removeAttribute('tabindex');
}

// ---------- Startup ----------

async function init() {
  // Skip link: focus the player without overwriting the settings hash.
  document.addEventListener('click', handleInPageLinks);
  syncInfoScrollStop();
  WIDE_LAYOUT.addEventListener('change', syncInfoScrollStop);

  const fromHash = readHash();
  if (fromHash.narration) setNarrationLevel(fromHash.narration, { announceIt: false });
  setSingleKeyShortcuts(fromHash.singleKeys);
  if (fromHash.alarm !== alarmSetting.isEnabled()) alarmSetting.setEnabled(fromHash.alarm, { announceIt: false });

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
    if (next.alarm !== alarmSetting.isEnabled()) alarmSetting.setEnabled(next.alarm);
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
