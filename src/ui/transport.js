// The one control bar under the video:
//   main row:      Play/Pause · Timeline (+ readout) · Audio legend · Explore · Volume
//   second row:    Playback speed · Loop · shortcut hint
// Every control has visible text; icons are decoration only. Pure DOM: user
// input goes out through handlers, and setters update the bar. The playback
// logic lives in player.js.

import { h } from './dom.js';
import { icon } from './icons.js';

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
 *           onSpeed(r: number): void, onLoop(on: boolean): void,
 *           onExplore?(): void, onLegend?(): void }} handlers
 */
export function createTransport(container, handlers) {
  const label = h('span', { class: 'btn-label' }, 'Play');
  const playIcon = h('span', { class: 'icon icon-play', 'aria-hidden': 'true' });
  // Stays focusable when unavailable (aria-disabled, not disabled) so keyboard
  // and screen-reader users can find it and hear why via aria-describedby.
  const playBtn = h(
    'button',
    { type: 'button', id: 'play-btn', class: 'btn-play', 'aria-disabled': 'true', 'aria-describedby': 'transport-help' },
    playIcon,
    label,
  );

  const scrubber = h('input', {
    type: 'range', id: 'scrubber', min: 0, max: 0, step: 1, value: 0, disabled: true,
    'aria-valuetext': 'No record loaded',
  });
  const frameReadout = h('span', { class: 'readout', 'aria-hidden': 'true' }, '– / –');

  const legendBtn = h(
    'button',
    { type: 'button', id: 'legend-btn', class: 'btn-secondary', 'aria-disabled': 'true', 'aria-describedby': 'transport-help' },
    icon('note'),
    'Audio legend',
  );

  // Moves focus to the sound map.
  const exploreBtn = h(
    'button',
    { type: 'button', id: 'explore-btn', class: 'btn-secondary', 'aria-disabled': 'true', 'aria-describedby': 'transport-help' },
    icon('cursor'),
    'Explore',
  );

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
      h(
        'div',
        { class: 'transport-main' },
        playBtn,
        h('div', { class: 't-group t-timeline' }, h('label', { for: 'scrubber' }, 'Timeline'), scrubber, frameReadout),
        legendBtn,
        exploreBtn,
        h('div', { class: 't-group t-volume' }, h('label', { for: 'volume' }, icon('speaker'), 'Volume'), volume, volumeReadout),
      ),
      h(
        'div',
        { class: 'transport-more' },
        h('div', { class: 't-group' }, h('label', { for: 'speed' }, 'Playback speed'), speed),
        h('label', { class: 't-check', for: 'loop' }, loop, 'Loop'),
        help,
      ),
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
  exploreBtn.addEventListener('click', () => handlers.onExplore?.());
  legendBtn.addEventListener('click', () => handlers.onLegend?.());

  return {
    /** Enable/disable Play, Audio legend, Explore and the timeline; helpText explains the state. */
    setEnabled(enabled, helpText) {
      for (const btn of [playBtn, legendBtn, exploreBtn]) {
        btn.setAttribute('aria-disabled', String(!enabled));
        if (enabled) btn.removeAttribute('aria-describedby');
        else btn.setAttribute('aria-describedby', 'transport-help');
      }
      scrubber.disabled = !enabled;
      help.textContent = helpText;
    },

    setPlaying(playing) {
      label.textContent = playing ? 'Pause' : 'Play';
      playIcon.className = `icon ${playing ? 'icon-pause' : 'icon-play'}`;
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

    /**
     * Show frame `index`. valueText is the spoken form ("Frame 12 of 60, 2014");
     * when is the short date for the readout ("2014", "~Jul 2007") or null.
     */
    setFrame(index, frameCount, valueText, when) {
      if (scrubber.value !== String(index)) scrubber.value = String(index);
      scrubber.setAttribute('aria-valuetext', valueText);
      frameReadout.textContent = `${index + 1} / ${frameCount}${when ? ` · ${when}` : ''}`;
    },

    focusPlay() {
      playBtn.focus();
    },
  };
}
