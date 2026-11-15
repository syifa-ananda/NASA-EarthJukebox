// Narration verbosity: a native radio group (Off / Brief / Detailed).

import { h } from './dom.js';
import { LEVELS, LEVEL_LABELS } from './narration.js';

const HINTS = {
  off: 'Only play, pause and finish messages',
  brief: 'How the sound changes, every few seconds',
  detailed: 'Adds the year and where on the map',
};

export function renderNarrationControls(container, { level, onChange }) {
  const fieldset = h(
    'fieldset',
    { class: 'narration-controls' },
    h('legend', {}, 'Narration'),
    h(
      'div',
      { class: 'narration-options' },
      LEVELS.map((value) =>
        h(
          'div',
          { class: 'narration-option' },
          h(
            'label',
            { for: `narration-${value}` },
            h('input', {
              type: 'radio', name: 'narration', id: `narration-${value}`, value,
              checked: value === level, 'aria-describedby': `narration-${value}-hint`,
            }),
            LEVEL_LABELS[value],
          ),
          // Read as the description, after the name ("Brief, radio button, …").
          h('span', { class: 'visually-hidden', id: `narration-${value}-hint` }, HINTS[value]),
        ),
      ),
    ),
  );

  fieldset.addEventListener('change', (event) => {
    if (event.target.name === 'narration') onChange(event.target.value);
  });
  container.replaceChildren(fieldset);

  return {
    set(value) {
      const input = fieldset.querySelector(`#narration-${value}`);
      if (input) input.checked = true;
    },
  };
}
