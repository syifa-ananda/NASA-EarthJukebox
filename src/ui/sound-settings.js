// "Sound settings" group in the player panel: narration level, Play legend,
// and room for more switches (e.g. Person 2's upcoming climate alarm: call
// addSwitch() once its API is known).

import { h } from './dom.js';
import * as audio from './adapters/audio.js';
import { announce } from './narrator.js';
import { renderNarrationControls } from './narration-controls.js';

/**
 * @param {HTMLElement} container
 * @param {{ level: string, onNarrationChange: (level: string) => void }} opts
 */
export function createSoundSettings(container, { level, onNarrationChange }) {
  const narrationSlot = h('div', { class: 'setting-narration' });
  const legendBtn = h(
    'button',
    { type: 'button', id: 'legend-btn', class: 'btn-secondary', 'aria-disabled': 'true', 'aria-describedby': 'legend-help' },
    'Play legend',
  );
  const legendHelp = h('p', { id: 'legend-help', class: 'setting-help' }, 'Choose a record to hear its legend.');
  // Shows the legend text while / after it plays. Not a live region: the
  // narrator speaks it once.
  const legendText = h('p', { id: 'legend-text', class: 'legend-text', hidden: true });
  const switches = h('div', { class: 'setting-switches' });

  container.replaceChildren(
    h(
      'div',
      { class: 'sound-settings', role: 'group', 'aria-labelledby': 'sound-settings-heading' },
      h('h3', { id: 'sound-settings-heading' }, 'Sound settings'),
      narrationSlot,
      h('div', { class: 'setting-row' }, legendBtn, legendHelp),
      legendText,
      switches,
    ),
  );

  const narrationControls = renderNarrationControls(narrationSlot, { level, onChange: onNarrationChange });

  let hasData = false;

  function setEnabled(enabled) {
    hasData = enabled;
    legendBtn.setAttribute('aria-disabled', String(!enabled));
    if (enabled) {
      legendBtn.removeAttribute('aria-describedby');
      legendHelp.textContent = 'Plays the notes from lowest to highest value, about 3 seconds. Shortcut: G.';
    } else {
      legendBtn.setAttribute('aria-describedby', 'legend-help');
      legendHelp.textContent = 'Choose a record to hear its legend.';
      legendText.hidden = true;
      legendText.textContent = '';
    }
  }

  /** Button or G. Starts audio inside the gesture, like Play. */
  function playLegend() {
    if (!hasData) {
      announce('Choose a record first, then play its legend.', { force: true });
      return;
    }
    const started = audio.start(); // synchronously, inside the click / key handler
    Promise.resolve(started)
      .catch(() => {})
      .then(() => audio.playLegend())
      .then((result) => {
        if (!result?.text) return;
        legendText.textContent = `Legend: ${result.text}`;
        legendText.hidden = false;
        announce(result.text, { force: true });
      });
  }

  legendBtn.addEventListener('click', playLegend);
  setEnabled(false);

  return {
    narrationControls,
    playLegend,
    /** A record's data arrived (or went away). */
    setContext(record, data) {
      setEnabled(!!(record && data));
    },
    /**
     * Add an on/off switch to the group (e.g. the climate alarm). Returns the
     * checkbox. onChange(checked) runs on every change.
     */
    addSwitch({ id, label, description, onChange }) {
      const input = h('input', { type: 'checkbox', id, 'aria-describedby': description ? `${id}-desc` : null });
      input.addEventListener('change', () => onChange(input.checked));
      switches.append(
        h(
          'div',
          { class: 'setting-row' },
          h('label', { class: 't-check', for: id }, input, label),
          description && h('p', { id: `${id}-desc`, class: 'setting-help' }, description),
        ),
      );
      return input;
    },
  };
}
