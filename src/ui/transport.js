// Transport controls under the viewer: Play/Pause, timeline, volume, speed, loop.
// Pure DOM: it reports user input through handlers and exposes setters. The
// playback logic lives in player.js.

import { h } from './dom.js';

const SPEEDS = [
  { value: '0.5', label: '0.5×' },
  { value: '1', label: '1× (normal)', selected: true },
  { value: '2', label: '2×' },
  { value: '4', label: '4×' },
];

export const DEFAULT_VOLUME = 70;

/**
 * @param {HTMLElement} container
 * @param {{ onTogglePlay(): void, onSeek(i: number): void, onVolume(v: number): void,
 *           onSpeed(r: number): void, onLoop(on: boolean): void }} handlers
 */
export function createTransport(container, handlers) {
  const label = h('span', { class: 'btn-label' }, 'Play');
  const icon = h('span', { class: 'icon icon-play', 'aria-hidden': 'true' });
  // Stays focusable when unavailable (aria-disabled, not disabled) so keyboard
  // and screen-reader users can find it and hear why via aria-describedby.
  const playBtn = h(
    'button',
    { type: 'button', id: 'play-btn', class: 'btn-play', 'aria-disabled': 'true', 'aria-describedby': 'transport-help' },
    icon,
    label,
  );

  const scrubber = h('input', {
    type: 'range', id: 'scrubber', min: 0, max: 0, step: 1, value: 0, disabled: true,
    'aria-valuetext': 'No record loaded',
  });
  const frameReadout = h('span', { class: 'readout', 'aria-hidden': 'true' }, '– / –');

  const volume = h('input', {
    type: 'range', id: 'volume', min: 0, max: 100, step: 1, value: DEFAULT_VOLUME,
    'aria-valuetext': `Volume ${DEFAULT_VOLUME} percent`,
  });
  const volumeReadout = h('span', { class: 'readout', 'aria-hidden': 'true' }, `${DEFAULT_VOLUME}%`);

  const speed = h(
    'select',
    { id: 'speed' },
    SPEEDS.map((s) => h('option', { value: s.value, selected: s.selected }, s.label)),
  );

  const loop = h('input', { type: 'checkbox', id: 'loop' });

  const help = h('p', { id: 'transport-help', class: 'transport-help' }, 'Choose a record to enable Play.');

  container.replaceChildren(
    h(
      'div',
      { class: 'transport', role: 'group', 'aria-label': 'Playback controls' },
      playBtn,
      h('div', { class: 't-group t-timeline' }, h('label', { for: 'scrubber' }, 'Timeline'), scrubber, frameReadout),
      h('div', { class: 't-group' }, h('label', { for: 'volume' }, 'Volume'), volume, volumeReadout),
      h('div', { class: 't-group' }, h('label', { for: 'speed' }, 'Playback speed'), speed),
      h('label', { class: 't-check', for: 'loop' }, loop, 'Loop'),
      help,
    ),
  );

  playBtn.addEventListener('click', () => handlers.onTogglePlay());
  scrubber.addEventListener('input', () => handlers.onSeek(Number(scrubber.value)));
  volume.addEventListener('input', () => {
    const v = Number(volume.value);
    volume.setAttribute('aria-valuetext', `Volume ${v} percent`);
    volumeReadout.textContent = `${v}%`;
    handlers.onVolume(v);
  });
  speed.addEventListener('change', () => handlers.onSpeed(Number(speed.value)));
  loop.addEventListener('change', () => handlers.onLoop(loop.checked));

  return {
    /** Enable/disable Play and the timeline; helpText explains the state. */
    setEnabled(enabled, helpText) {
      playBtn.setAttribute('aria-disabled', String(!enabled));
      if (enabled) playBtn.removeAttribute('aria-describedby');
      else playBtn.setAttribute('aria-describedby', 'transport-help');
      scrubber.disabled = !enabled;
      help.textContent = helpText;
    },

    setPlaying(playing) {
      label.textContent = playing ? 'Pause' : 'Play';
      icon.className = `icon ${playing ? 'icon-pause' : 'icon-play'}`;
    },

    /** Number of frames on the timeline (0 = nothing loaded). */
    setRange(frameCount) {
      scrubber.max = String(Math.max(0, frameCount - 1));
      scrubber.value = '0';
      if (!frameCount) {
        scrubber.setAttribute('aria-valuetext', 'No record loaded');
        frameReadout.textContent = '– / –';
      }
    },

    /** Show frame `index`; valueText is the full spoken form, e.g. "Frame 12 of 60, about 2014". */
    setFrame(index, frameCount, valueText, year) {
      if (scrubber.value !== String(index)) scrubber.value = String(index);
      scrubber.setAttribute('aria-valuetext', valueText);
      frameReadout.textContent = `${index + 1} / ${frameCount}${year ? ` · ~${year}` : ''}`;
    },

    focusPlay() {
      playBtn.focus();
    },
  };
}
