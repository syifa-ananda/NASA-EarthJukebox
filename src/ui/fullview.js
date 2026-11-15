// "Expand Earth": the player's stage (picture, overlays, sound map, captions
// and controls) in full view, like a map app's full-screen button.
//
//   - With the Fullscreen API: the stage goes full screen. The browser's own
//     Escape exits; 'fullscreenchange' keeps the button's label right.
//   - Without it (e.g. iPhone Safari) or if the request fails: the stage is
//     fixed over the whole window (class is-fullview), with the same layout.
//     Escape exits, unless explore mode handled it first (the sound map's own
//     Escape, which marks the event as handled).
//
// Only the layout changes: the same elements stay in the page, so the
// dataset, frame, playback, sound and explore state carry on. No zoom or pan
// inside the picture: the sound map must stay on the real picture.
// Focus stays on the Expand Earth / Exit full view button.

import { h } from './dom.js';
import { icon, setIcon } from './icons.js';

/**
 * @param {{ stage: HTMLElement, button: HTMLButtonElement, viewer: HTMLElement, bottom: HTMLElement[] }} opts
 *   bottom: the parts under the picture (in order); their height is left free for them.
 */
export function createFullView({ stage, button, viewer, bottom }) {
  const canFullscreen = typeof stage.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
  let fallback = false;

  const glyph = icon('expand');
  const label = h('span', {}, 'Expand Earth');
  button.replaceChildren(glyph, label);

  const isActive = () => document.fullscreenElement === stage || fallback;

  // In full view the picture gets the height that the captions and controls
  // below it leave free (styles.css → .is-fullview, --fullview-bottom).
  const ro = new ResizeObserver(measure);
  function measure() {
    if (!isActive()) return;
    // From the picture's bottom edge to the end of the controls, margins included.
    const cs = getComputedStyle(stage);
    const below = bottom[bottom.length - 1].getBoundingClientRect().bottom - viewer.getBoundingClientRect().bottom;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    stage.style.setProperty('--fullview-bottom', `${Math.ceil(below + pad + 2)}px`);
  }

  function render() {
    const on = isActive();
    stage.classList.toggle('is-fullview', on);
    stage.classList.toggle('is-fallback', fallback);
    document.documentElement.classList.toggle('has-fullview', fallback); // no page scroll behind
    setIcon(glyph, on ? 'collapse' : 'expand');
    label.textContent = on ? 'Exit full view' : 'Expand Earth';
    if (on) {
      bottom.forEach((el) => ro.observe(el));
      measure();
    } else {
      ro.disconnect();
      stage.style.removeProperty('--fullview-bottom');
    }
  }

  async function enter() {
    if (canFullscreen) {
      try {
        await stage.requestFullscreen({ navigationUI: 'hide' });
        return; // 'fullscreenchange' renders
      } catch {
        // Not allowed here: use the in-page full view instead.
      }
    }
    fallback = true;
    render();
    button.focus();
  }

  function exit() {
    if (document.fullscreenElement === stage) {
      document.exitFullscreen().catch(() => {});
    } else if (fallback) {
      fallback = false;
      render();
    }
    button.focus();
  }

  button.addEventListener('click', () => (isActive() ? exit() : enter()));
  document.addEventListener('fullscreenchange', () => {
    render();
    if (document.activeElement === document.body) button.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !fallback || event.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return; // Escape closes the dialog first
    event.preventDefault();
    exit();
  });

  return { isActive, exit };
}
