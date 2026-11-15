// Info panel for the selected record: description, colour legend,
// planned sound mappings, source and credit.

import { h } from './dom.js';
import { cssGradient } from './color.js';
import { statusLabel, statusKind } from './config/datasets.js';
// Plain JS, no Tone.js: works even when the audio engine falls back to the stub.
import { getPreset } from '../audio/presets/index.js';

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
    h('p', { class: 'legend-meaning' }, record.colorMeaning ? `In the picture: ${record.colorMeaning}.` : 'Colour key coming soon.'),
  );
  return h('div', { class: 'legend' }, parts);
}

function soundList(record) {
  // Playable records: Person 2's own description of the preset comes first.
  // Unknown ids get the engine's default preset, which is what actually plays.
  const description = record.playable ? getPreset(record.id).soundDescription : '';
  if (!record.sounds.length) {
    return h('p', {}, description || 'Sound design coming soon.');
  }
  return [
    description && h('p', { class: 'sound-description' }, description),
    h(
      'ul',
      { class: 'sound-list' },
      record.sounds.map((s) =>
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
    !record.playable && h('p', { class: 'muted small' }, 'Planned mapping. The final sounds may change.'),
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
        : 'Source link coming soon.',
    ),
  ];
}

export function renderInfo(container, record) {
  const status = statusLabel(record);
  const parts = [
    h('h3', { class: 'info-title' }, record.title),
    status && h('p', {}, h('span', { class: `record-badge badge-${statusKind(record)}` }, status)),
    !record.playable &&
      h(
        'p',
        { class: 'notice' },
        h('strong', {}, 'Data not ready yet. '),
        'This record is coming soon. The description and sounds below are placeholders.',
      ),
    record.description && h('p', {}, record.description),
    h('h4', {}, 'Colours'),
    legendBlock(record),
    h('h4', {}, 'How it sounds'),
    soundList(record),
    h('h4', {}, 'Source'),
    sourceBlock(record),
  ];
  // Drop the optional parts that evaluated to false / '' and flatten lists.
  container.replaceChildren(...parts.flat().filter(Boolean));
}
