// "Sound settings" group in the player panel: the text of the audio legend
// once it has played, and on/off switches (today: the climate alarm, added by
// alarm-setting.js with addSwitch()).
// The "Audio legend" button itself is in the control bar (transport.js) and
// calls playLegend() here, as does the G shortcut.

import { h } from './dom.js';
import * as audio from './adapters/audio.js';
import { announce } from './narrator.js';

/** @param {HTMLElement} container */
export function createSoundSettings(container) {
  // Shows the legend text while / after it plays. Not a live region: the
  // narrator speaks it once.
  const legendText = h('p', { id: 'legend-text', class: 'legend-text', hidden: true });
  const switches = h('div', { class: 'setting-switches' });

  container.replaceChildren(
    h(
      'div',
      { class: 'sound-settings', role: 'group', 'aria-labelledby': 'sound-settings-heading' },
      h('h3', { id: 'sound-settings-heading' }, 'Sound settings'),
      legendText,
      switches,
    ),
  );

  let hasData = false;

  function setEnabled(enabled) {
    hasData = enabled;
    if (!enabled) {
      legendText.hidden = true;
      legendText.textContent = '';
    }
  }

  /** Audio legend button or G. Starts audio inside the gesture, like Play. */
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

  setEnabled(false);

  return {
    playLegend,
    /** A record's data arrived (or went away). */
    setContext(record, data) {
      setEnabled(!!(record && data));
    },
    /**
     * Add an on/off switch to the group (e.g. the climate alarm), with optional
     * extra controls on the same row (e.g. a "Hear the alarm" button).
     * onChange(checked) runs on every change. Returns { input, help }.
     */
    addSwitch({ id, label, description, checked = false, onChange, extra = [] }) {
      const input = h('input', { type: 'checkbox', id, checked, 'aria-describedby': description ? `${id}-desc` : null });
      input.addEventListener('change', () => onChange(input.checked));
      const help = description ? h('p', { id: `${id}-desc`, class: 'setting-help setting-switch-help' }, description) : null;
      switches.append(
        h(
          'div',
          { class: 'setting-switch' },
          h('div', { class: 'setting-row' }, h('label', { class: 't-check', for: id }, input, label), extra),
          help,
        ),
      );
      return { input, help };
    },
  };
}
