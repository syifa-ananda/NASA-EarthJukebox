// Record picker: a native radio group styled as vinyl record cards.
// Native radios give us the expected keyboard model for free: Tab enters and
// leaves the group as one stop, and arrow keys move (and select) within it.

import { h } from './dom.js';
import { statusLabel } from './config/datasets.js';

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
    'aria-describedby': `${base}-hint`,
  });

  const card = h(
    'label',
    { for: base, class: 'record-card', '--record-accent': record.accent },
    h('span', { class: 'record-disc', 'aria-hidden': 'true' }),
    h(
      'span',
      { class: 'record-text' },
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
      h('span', { class: 'record-hint', id: `${base}-hint` }, record.soundHint),
    ),
    h('span', { class: 'record-check', 'aria-hidden': 'true' }, '✓'),
  );

  return h('div', { class: 'record' }, input, card);
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
    h('legend', {}, 'Choose a record'),
    h('div', { class: 'record-items' }, records.map(recordItem)),
  );
  // Plain text, not a link or control: says the list can grow.
  const more = h('p', { class: 'records-more' }, 'More NASA datasets can be added, such as aerosols, air quality and forest height.');

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
