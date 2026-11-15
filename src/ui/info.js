// Info panel for the selected record: description, colour legend,
// planned sound mappings, source and credit.
//
// The same content, in the same order, in every layout state. The expanded
// panel (data-info="wide" / "stacked", styles.css) only lays it out
// differently and shows three extras that are hidden in the narrow panel:
// section icons with an "Overview" label, a row of details (source, time
// range, frames) and, for datasets with temperature bands (sst), a swatch per
// band. The extras use real data only; anything unknown is left out.

import { h } from './dom.js';
import { icon } from './icons.js';
import { cssGradient, rampRgb } from './color.js';
import { statusLabel, sourceLabel } from './config/datasets.js';
import { shortTime } from './narration.js';
// Plain JS, no Tone.js: works even when the audio engine falls back to the stub.
import { getPreset } from '../audio/presets/index.js';
import { presetText } from './preset-text.js';

/** A section heading with a decorative icon (the icon shows only when expanded). */
function sectionHeading(text, iconName) {
  return h('h4', { class: 'info-section-title' }, icon(iconName, 'info-section-icon'), text);
}

/** "Mar 2007 – Mar 2008", "2012 – 2023", "14 Jan 2020 – 3 Mar 2020", or null. */
function timeRange(record, data) {
  if (!record.time || !data) return null;
  // The first and last frames are the exact start and end dates of the
  // config, so no "~" (about) there.
  const at = (i) => shortTime(record, data, i)?.replace(/^~/, '');
  const first = at(0);
  const last = at(data.frameCount - 1);
  if (!first || !last) return null;
  return first === last ? first : `${first} – ${last}`;
}

/** Details row (expanded only): only the cells whose value is known. */
function detailsBlock(record, data) {
  const cells = [
    ['database', 'Source', sourceLabel(record)],
    ['calendar', 'Time range', timeRange(record, data)],
    ['layers', 'Frames', data ? String(data.frameCount) : null],
  ].filter(([, , value]) => value);
  if (!cells.length) return null;
  return h(
    'dl',
    { class: 'info-details info-extra' },
    cells.map(([iconName, label, value]) =>
      h('div', { class: 'info-detail' }, icon(iconName, 'info-detail-icon'), h('dt', {}, label), h('dd', {}, value)),
    ),
  );
}

/**
 * Swatches for the dataset's value bands (config → valueUnit.bands, today
 * only sst), lowest first. Each colour is the legend colour in the middle of
 * that band; each range comes from the band thresholds in the config.
 */
function bandsBlock(record) {
  const u = record.valueUnit;
  const stops = record.legend?.stops;
  if (!u?.bands?.length || !stops?.length) return null;
  const bands = [...u.bands].reverse(); // config lists the highest first
  const rows = bands.map((band, i) => {
    const next = bands[i + 1]?.min;
    const lo = Number.isFinite(band.min) ? band.min : 0;
    const hi = next ?? u.scale;
    const [r, g, b] = rampRgb(stops, ((lo + hi) / 2) / u.scale);
    let range;
    if (!Number.isFinite(band.min)) range = `below ${next} ${u.unit}`;
    else if (next === undefined) range = `${band.min} ${u.unit} and above`;
    else range = `${band.min} to ${next} ${u.unit}`;
    const words = band.words.charAt(0).toUpperCase() + band.words.slice(1);
    return h(
      'li',
      { class: 'info-band' },
      h('span', { class: 'info-swatch', 'aria-hidden': 'true', style: { backgroundColor: `rgb(${r}, ${g}, ${b})` } }),
      h('span', { class: 'info-band-text' }, h('span', { class: 'info-band-name' }, words), h('span', { class: 'info-band-range' }, range)),
    );
  });
  return h('ul', { class: 'info-bands info-extra', 'aria-label': 'Temperature bands' }, rows);
}

function legendBlock(record) {
  const parts = [];
  if (record.legend?.stops?.length) {
    parts.push(
      h('div', { class: 'legend-bar', 'aria-hidden': 'true', style: { backgroundImage: cssGradient(record.legend.stops) } }),
      h(
        'p',
        { class: 'legend-ends' },
        h('span', {}, h('span', { class: 'visually-hidden' }, 'Low end of the colour scale: '), record.legend.low),
        h('span', {}, h('span', { class: 'visually-hidden' }, '. High end: '), record.legend.high),
      ),
    );
  }
  parts.push(
    h('p', { class: 'legend-meaning' }, record.colorMeaning ? `In the picture: ${record.colorMeaning}.` : 'No colour key was given for this dataset.'),
  );
  return h('div', { class: 'legend' }, parts);
}

function soundList(record, alarm) {
  // Person 2's own description of the preset comes first (with or without its
  // alarm sentence), resolved for the instrument mix that plays (acoustic).
  // Unknown ids get the engine's default preset, which is what actually plays.
  const description = presetText(getPreset(record.id, { alarm }).soundDescription);
  // Lines marked alarmOnly describe the climate alarm: hidden while it is off.
  const sounds = record.sounds.filter((s) => alarm || !s.alarmOnly);
  if (!sounds.length) {
    return h('p', {}, description || 'This dataset plays with the general sound preset.');
  }
  return [
    description && h('p', { class: 'sound-description' }, description),
    h(
      'ul',
      { class: 'sound-list' },
      sounds.map((s) =>
        h(
          'li',
          {},
          h(
            'strong',
            {},
            s.from,
            h('span', { 'aria-hidden': 'true' }, ' → '),
            h('span', { class: 'visually-hidden' }, ' controls '),
            s.to,
            '.',
          ),
          ' ',
          s.detail,
        ),
      ),
    ),
  ];
}

function sourceBlock(record) {
  const url = record.source;
  const valid = typeof url === 'string' && url.startsWith('https://');
  const svsId = valid ? url.match(/svs\.gsfc\.nasa\.gov\/(\d+)/)?.[1] : null;
  return [
    h('p', { class: 'credit' }, `Credit: ${record.credit || 'NASA/SVS'}.`),
    h(
      'p',
      {},
      valid
        ? h('a', { href: url }, `View the original visualization on NASA's Scientific Visualization Studio${svsId ? ` (SVS #${svsId})` : ''}`)
        : 'No source link was given for this dataset.',
    ),
  ];
}

const section = (name, ...children) => h('section', { class: `info-section info-section-${name}` }, children.flat().filter(Boolean));

/**
 * alarm: whether the climate alarm is switched on (it changes the sound text).
 * data: the record's features once loaded (frames and dates for the details row).
 */
export function renderInfo(container, record, { alarm = true, data = null } = {}) {
  const status = statusLabel(record);
  const parts = [
    section(
      'overview',
      // Visual label of the expanded layout; the h3 below is the real heading.
      h('p', { class: 'info-kicker info-extra', 'aria-hidden': 'true' }, icon('info', 'info-section-icon'), 'Overview'),
      h('h3', { class: 'info-title' }, record.title),
      status && h('p', {}, h('span', { class: 'record-badge badge-mock' }, status)),
      record.description && h('p', { class: 'info-description' }, record.description),
      detailsBlock(record, data),
    ),
    section('colours', sectionHeading('Colours', 'palette'), legendBlock(record), bandsBlock(record)),
    section('sound', sectionHeading('How it sounds', 'wave'), soundList(record, alarm)),
    section('source', sectionHeading('Source', 'database'), sourceBlock(record)),
  ];
  container.replaceChildren(...parts);
}
