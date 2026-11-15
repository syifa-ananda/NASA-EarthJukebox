// Record picker: a native radio group styled as cards with an icon thumbnail.
// Native radios give us the expected keyboard model for free: Tab enters and
// leaves the group as one stop, and arrow keys move (and select) within it.
//
// The collapsed sidebar (data-left="rail" on <main>, see layout.js) is the SAME
// radio group restyled: only the thumbnails show, and the text parts (class
// rail-hide) become visually hidden, so every radio keeps its name and its
// position ("1 of 4").

import { h } from './dom.js';
import { icon } from './icons.js';
import { statusLabel } from './config/datasets.js';

/**
 * Decorative thumbnail: the dataset's icon (config → icon) on a tinted tile
 * (styles.css → .thumb[data-thumb]). The title says the same in words.
 */
function thumb(record) {
  return h('span', { class: 'thumb', 'data-thumb': record.id, 'aria-hidden': 'true' }, icon(record.icon ?? 'globe', 'thumb-icon'));
}

function recordItem(record) {
  const base = `record-${record.id}`;
  const status = statusLabel(record);
  const labelledBy = status ? `${base}-title ${base}-badge` : `${base}-title`;

  const input = h('input', {
    type: 'radio',
    name: 'record',
    id: base,
    value: record.id,
    class: 'record-input',
    'aria-labelledby': labelledBy,
    // The short description, then how it sounds (soundHint, visually hidden).
    'aria-describedby': record.shortDescription ? `${base}-hint ${base}-sound` : `${base}-hint`,
    // Rail tooltip (layout.js); the radio's own name comes from the title.
    'data-tooltip': record.shortTitle,
    'data-tooltip-when': 'rail',
  });

  const card = h(
    'label',
    { for: base, class: 'record-card', '--record-accent': record.accent },
    thumb(record),
    h(
      'span',
      { class: 'record-text rail-hide' },
      h(
        'span',
        { class: 'record-head' },
        h('span', { class: 'record-title', id: `${base}-title` }, record.shortTitle),
        status &&
          h(
            'span',
            { class: 'record-badge badge-mock', id: `${base}-badge` },
            h('span', { class: 'visually-hidden' }, ', '),
            status,
          ),
      ),
      h('span', { class: 'record-hint', id: `${base}-hint` }, record.shortDescription || record.soundHint),
      record.shortDescription && h('span', { class: 'visually-hidden', id: `${base}-sound` }, ` ${record.soundHint}`),
      // Visual state only: screen readers already hear "selected" from the
      // radio and Play / Pause from the Play button.
      h(
        'span',
        { class: 'record-state', 'aria-hidden': 'true' },
        icon('checkCircle'),
        h('span', { class: 'state-selected' }, 'Selected'),
        h('span', { class: 'state-playing' }, 'Now playing'),
      ),
    ),
  );

  return h('div', { class: `record record-${record.id}` }, input, card);
}

/**
 * Render the record list into `container`.
 * onSelect(id) fires whenever the user picks a record (click, Space or arrows).
 * Returns { check(id) } to set the selection without firing onSelect.
 */
export function renderRecordList(container, records, { onSelect }) {
  const fieldset = h(
    'fieldset',
    { class: 'record-list' },
    // The visible heading says "Select a dataset"; the group name stays short.
    h('legend', { class: 'visually-hidden' }, 'Datasets'),
    h('div', { class: 'record-items' }, records.map(recordItem)),
  );
  // Plain text, not a link or control: says the list can grow.
  const more = h('p', { class: 'records-more rail-hide' }, 'More NASA datasets can be added, such as aerosols, air quality and forest height.');

  fieldset.addEventListener('change', (event) => {
    if (event.target.name === 'record') onSelect(event.target.value);
  });

  container.replaceChildren(fieldset, more);

  return {
    check(id) {
      const input = fieldset.querySelector(`input[value="${CSS.escape(id)}"]`);
      if (input) input.checked = true;
    },
  };
}
