// Climate alarm setting (Sound settings): a checkbox and a "Hear the alarm"
// button. The alarm is Person 2's (src/audio/CONTRACT.md §5–6): a soft,
// wordless voice that joins when the most carbon dioxide is in view. It exists
// only in presets with `alarm.on` (today: co2). Default: on.
//
// On other datasets both controls stay visible (no layout jump) but are
// aria-disabled, and the help text says why.

import { h } from './dom.js';
import { icon } from './icons.js';
import * as audio from './adapters/audio.js';
import { announce } from './narrator.js';
import { getPreset } from '../audio/presets/index.js';

export const ALARM_DEFAULT = true; // CONTRACT.md §5: "default on"
const PREVIEW_SECONDS = 10;
// previewAlarm() mutes the music for the example: 0.4 s in, `seconds` long, 1 s back.
const PREVIEW_MS = (0.4 + PREVIEW_SECONDS + 1) * 1000;

const ABOUT = 'A soft voice marks the moments when the most carbon dioxide is in view.';

/**
 * @param {{ soundSettings: ReturnType<import('./sound-settings.js').createSoundSettings>,
 *           player: ReturnType<import('./player.js').createPlayer>,
 *           narration: ReturnType<import('./narration.js').createLiveNarration>,
 *           alarmDatasets: string,   // e.g. "Carbon Dioxide"
 *           onChange?: (on: boolean) => void }} opts
 */
export function createAlarmSetting({ soundSettings, player, narration, alarmDatasets, onChange = () => {} }) {
  let enabled = ALARM_DEFAULT;
  let available = false; // the selected dataset has data and an alarm
  let previewUntil = 0;

  const onlyFor = `Only used with the ${alarmDatasets} dataset.`;

  const hearBtn = h(
    'button',
    { type: 'button', id: 'alarm-preview-btn', class: 'btn-secondary', 'aria-disabled': 'true', 'aria-describedby': 'alarm-switch-desc' },
    icon('wave'),
    'Hear the alarm',
  );

  const { input, help } = soundSettings.addSwitch({
    id: 'alarm-switch',
    label: 'Climate alarm',
    description: `${ABOUT} ${alarmDatasets} dataset only.`,
    checked: enabled,
    onChange: (on) => setEnabled(on),
    extra: [hearBtn],
  });

  // aria-disabled checkboxes still toggle natively: block the click itself.
  input.addEventListener('click', (event) => {
    if (input.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      announce(onlyFor, { force: true });
    }
  });

  function render() {
    input.setAttribute('aria-disabled', String(!available));
    hearBtn.setAttribute('aria-disabled', String(!available));
    help.textContent = available ? `${ABOUT} ${alarmDatasets} dataset only.` : `${onlyFor} ${ABOUT}`;
  }

  /** Turn the alarm on or off (checkbox, or the URL on load). */
  function setEnabled(on, { announceIt = true } = {}) {
    enabled = !!on;
    input.checked = enabled;
    audio.setAlarmEnabled(enabled);
    narration.setAlarmEnabled(enabled);
    if (announceIt) announce(`Climate alarm ${enabled ? 'on' : 'off'}`, { force: true });
    onChange(enabled);
  }

  /** "Hear the alarm": starts audio inside the gesture, like Play. */
  function preview() {
    if (!available) {
      announce(onlyFor, { force: true });
      return;
    }
    const started = audio.start(); // synchronously, inside the click / key handler
    const wasPlaying = player.isPlaying();
    // One sound at a time: pause playback for the example.
    if (wasPlaying) player.pause({ silent: true });
    announce(`${wasPlaying ? 'Paused. ' : ''}Playing an example of the climate alarm, about ${PREVIEW_SECONDS} seconds.`, { force: true });
    previewUntil = performance.now() + PREVIEW_MS;
    Promise.resolve(started)
      .catch(() => {})
      .then(() => audio.previewAlarm({ seconds: PREVIEW_SECONDS }))
      .then((result) => {
        if (!result?.sounded) {
          previewUntil = 0;
          if (result?.text) announce(result.text, { force: true });
        }
      });
  }

  hearBtn.addEventListener('click', preview);
  render();

  return {
    isEnabled: () => enabled,
    setEnabled,
    /** Remaining milliseconds of a running "Hear the alarm" example (0 = none). */
    previewRemaining: () => Math.max(0, previewUntil - performance.now()),
    /** A record's data arrived (or went away). */
    setContext(record, data) {
      available = !!(record && data && getPreset(record.id).alarm?.on);
      render();
    },
  };
}
