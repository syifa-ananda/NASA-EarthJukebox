// Record picker: a native radio group styled as vinyl record cards.
// Native radios give us the expected keyboard model for free: Tab enters and
// leaves the group as one stop, and arrow keys move (and select) within it.

import { h } from './dom.js';
import { statusLabel } from './config/datasets.js';
import { icon } from './icons.js';

/**
 * Decorative crop of Person 1's check image: just the video part of
 * docs/images/<id>/frame_middle.png. The art box has the same shape as that
 * part, so background-size / -position in % crop it exactly.
 */
function artStyle(card) {
  if (!card) return null;
  const [imgW, imgH] = card.size;
  const [fx, fy, fw, fh] = card.frame;
  return {
    // Absolute URL: a url() inside a CSS variable resolves against the
    // stylesheet (src/ui/), not the page.
    '--art-image': `url("${new URL(card.image, document.baseURI).href}")`,
    '--art-size': `${((imgW / fw) * 100).toFixed(2)}% auto`,
    '--art-pos': `${((fx / (imgW - fw)) * 100).toFixed(2)}% ${((fy / (imgH - fh)) * 100).toFixed(2)}%`,
    '--art-aspect': `${fw} / ${fh}`,
  };
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
    'aria-describedby': `${base}-hint`,
  });

  const art = artStyle(record.card);
  const card = h(
    'label',
    { for: base, class: `record-card${art ? ' has-art' : ''}`, '--record-accent': record.accent },
    art && h('span', { class: 'record-art', 'aria-hidden': 'true', style: art }),
    icon(record.icon, 'record-icon'),
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
      // Visual state only: screen readers already hear "selected" from the
      // radio and Play / Pause from the Play button.
      h(
        'span',
        { class: 'record-state', 'aria-hidden': 'true' },
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
