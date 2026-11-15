// Entry point for the Earth Information Jukebox UI.

import { loadIndex, loadFeatures } from './adapters/data.js';
import { mergeRecords, statusLabel, sourceLabel, RECORDS } from './config/datasets.js';
import { renderRecordList } from './records.js';
import { renderInfo } from './info.js';
import * as viewer from './viewer.js';
import { announce } from './narrator.js';
import { createPlayer } from './player.js';
import { installShortcuts, setSingleKeyShortcuts, singleKeyShortcutsEnabled, onSingleKeyShortcutsChange } from './shortcuts.js';
import { createShortcutsDialog } from './shortcuts-dialog.js';
import { createLiveDescription } from './live-description.js';
import { createSoundSettings } from './sound-settings.js';
import { createExplore } from './explore.js';
import { createAlarmSetting, ALARM_DEFAULT } from './alarm-setting.js';
import * as audio from './adapters/audio.js';
import { getPreset } from '../audio/presets/index.js';
import { handleInPageLinks, updateStateLinks } from './page-links.js';
import { createLayout, installTooltips, LEFT_STATES, INFO_STATES } from './layout.js';
import { createFullView } from './fullview.js';

const nowPlaying = document.getElementById('now-playing');
const infoBody = document.getElementById('info-body');
const recordList = document.getElementById('record-list');
const infoPanel = document.getElementById('info');
const sourcePill = document.getElementById('source-pill');
const sourcePillText = document.getElementById('source-pill-text');

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

// ---------- URL hash: #record=<id>[&keys=off][&alarm=off][&left=rail][&info=wide|hidden] ----------
// Any other parameter (e.g. narration=… from older links, or an old theme=…)
// is ignored and dropped on the next write.
// The layout keys (left, info) are written only when they differ from the default.

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const record = params.get('record');
  return {
    record: record && /^[\w-]+$/.test(record) ? record : null,
    singleKeys: params.get('keys') !== 'off', // on unless the hash says off
    alarm: params.has('alarm') ? params.get('alarm') !== 'off' : ALARM_DEFAULT,
    left: LEFT_STATES.includes(params.get('left')) ? params.get('left') : 'expanded',
    info: INFO_STATES.includes(params.get('info')) ? params.get('info') : 'default',
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.current) params.set('record', state.current.id);
  if (!singleKeyShortcutsEnabled()) params.set('keys', 'off');
  // Only when it differs from the default (on).
  if (alarmSetting && alarmSetting.isEnabled() !== ALARM_DEFAULT) params.set('alarm', alarmSetting.isEnabled() ? 'on' : 'off');
  if (layout.getLeft() !== 'expanded') params.set('left', layout.getLeft());
  if (layout.getInfo() !== 'default') params.set('info', layout.getInfo());
  // replaceState: no history entry per arrow press, and no hashchange event.
  history.replaceState(null, '', `#${params}`);
  // The header nav carries the same settings to "How to listen" and back.
  updateStateLinks(params);
}

// ---------- Layout: dataset list and "About this dataset" (layout.js) ----------

const tooltips = installTooltips({ main: document.getElementById('main') });
const layout = createLayout({
  main: document.getElementById('main'),
  leftBtn: document.getElementById('sidebar-toggle'),
  infoExpandBtn: document.getElementById('info-expand'),
  infoHideBtn: document.getElementById('info-hide'),
  onChange: () => writeHash(),
  onApply: () => {
    tooltips.refresh();
    // After this module has run (the first call comes from createLayout itself).
    queueMicrotask(syncInfoScrollStop);
  },
});

// ---------- Player, live description, shortcuts ----------

// The "Live description" card: written text only, never spoken.
const description = createLiveDescription({
  textEl: document.getElementById('narration-caption'),
  getIndex: () => player.currentIndex(),
  // The stub fallback has no alarm voice, so the description never mentions it there.
  canSoundAlarm: () => audio.canSoundAlarm(),
});

const player = createPlayer({
  transportEl: document.getElementById('transport'),
  soundStatusEl: document.getElementById('sound-status'),
  videoStatusEl: document.getElementById('video-status'),
  description,
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
});

const soundSettings = createSoundSettings(document.getElementById('sound-settings'));

// Climate alarm (Sound settings). Datasets whose preset has an alarm (co2).
let alarmSetting = null;
alarmSetting = createAlarmSetting({
  soundSettings,
  player,
  description,
  // Names of the datasets whose preset has an alarm, e.g. "Carbon Dioxide".
  alarmDatasets: RECORDS.filter((r) => getPreset(r.id).alarm?.on).map((r) => r.shortTitle).join(' and ') || 'Carbon Dioxide',
  onChange: () => {
    writeHash();
    if (state.current) renderInfo(infoBody, state.current, { alarm: alarmSetting.isEnabled(), data: state.data });
  },
});

installShortcuts({
  toggle: () => player.toggle(),
  back: () => player.step(-1),
  forward: () => player.step(1),
  explore: () => explore.focusMap(),
  whereAmI: () => explore.whereAmI(),
  compare: () => explore.compare(),
  legend: () => soundSettings.playLegend(),
  toggleSidebar: () => layout.toggleLeft({ fromKey: true }),
  help: () => shortcutsDialog.open(document.activeElement),
});

// ---------- Expand Earth: the stage in full view (fullview.js) ----------

createFullView({
  stage: document.getElementById('stage'),
  button: document.getElementById('expand-btn'),
  viewer: document.getElementById('viewer'),
  bottom: ['frame-caption', 'explore-readout', 'transport'].map((id) => document.getElementById(id)),
});

// ---------- Keyboard shortcuts dialog ----------

const shortcutsDialog = createShortcutsDialog(document.getElementById('shortcuts-dialog'));

// The header button opens it (the same module serves how-to-listen.html).
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-open-shortcuts]');
  if (opener) shortcutsDialog.open(opener);
});

// Turning single-key shortcuts on or off: remember it in the URL.
onSingleKeyShortcutsChange(() => {
  writeHash();
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
  const source = sourceLabel(record);
  sourcePillText.textContent = source;
  sourcePill.hidden = !source;
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
    // Frames and dates for the details row of the expanded panel.
    renderInfo(infoBody, record, { alarm: alarmSetting.isEnabled(), data });
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
// In the 3-column layout (styles.css: min-width 1024px, min-height 600px) the
// panel scrolls internally, so it becomes a Tab stop that scrolls with the
// arrow keys, Page Up / Down, Home and End. Elsewhere the page scrolls and the
// panel needs no Tab stop; nor does it when hidden. Its role and name
// (index.html) stay the same. A soft fade at its bottom edge shows that there
// is more, and goes away once scrolled to the end.

const WIDE_LAYOUT = window.matchMedia('(min-width: 1024px) and (min-height: 600px)');

function syncInfoScrollStop() {
  const own = WIDE_LAYOUT.matches && ['default', 'wide'].includes(layout.effective().info);
  if (own) infoPanel.setAttribute('tabindex', '0');
  else infoPanel.removeAttribute('tabindex');
  syncInfoFade();
}

function syncInfoFade() {
  const more = infoPanel.scrollHeight - infoPanel.scrollTop - infoPanel.clientHeight > 2;
  infoPanel.classList.toggle('has-more', more);
}

infoPanel.addEventListener('scroll', syncInfoFade, { passive: true });
new ResizeObserver(syncInfoFade).observe(infoBody);

// ---------- Startup ----------

async function init() {
  // Skip link: focus the player without overwriting the settings hash.
  document.addEventListener('click', handleInPageLinks);
  syncInfoScrollStop();
  WIDE_LAYOUT.addEventListener('change', syncInfoScrollStop);

  const fromHash = readHash();
  layout.restore(fromHash);
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
    layout.restore(next, { animate: true });
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
