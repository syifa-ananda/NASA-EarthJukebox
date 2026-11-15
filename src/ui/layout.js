// Layout state of the jukebox page, as attributes on <main> (styles.css does
// the rest):
//   data-left = "expanded" | "rail"                 the dataset list
//   data-info = "default" | "wide" | "hidden"       "About this dataset"
//             | "stacked"                           (under the player, < 1024px)
//
// The attributes hold the state IN EFFECT at this window width; the user's
// own choice (saved in the URL hash by main.js: left=rail, info=wide,
// info=hidden; defaults left out) is kept separately, so a narrow window
// never overwrites it:
//   >= 1280px    the user's choice.
//   1024–1279px  the user's choice, but while the info panel is wide the
//                dataset list shows as a rail (the player would get too narrow).
//   720–1023px   the list starts as a rail (the toggle opens it for this visit);
//                the info panel sits under the player, laid out like "wide".
//   < 720px      one column: everything in full, no toggles.
//
// Changing the layout only changes these attributes: the same elements stay
// in the page, so the dataset, frame, playback, sound settings, description and
// explore state are never reset. Each toggle keeps focus: the pressed button
// stays (Expand ↔ Collapse and Hide ↔ Show are the same buttons).
//
// Also here: tooltips for icon buttons and the rail thumbnails.

import { h } from './dom.js';
import { icon, setIcon } from './icons.js';
import { announce } from './narrator.js';
import { singleKeyShortcutsEnabled } from './shortcuts.js';

export const LEFT_STATES = ['expanded', 'rail'];
export const INFO_STATES = ['default', 'wide', 'hidden'];

// Same breakpoints as styles.css.
const NARROW = window.matchMedia('(max-width: 719.98px)');
const MEDIUM = window.matchMedia('(min-width: 720px) and (max-width: 1023.98px)');
const LARGE = window.matchMedia('(min-width: 1024px) and (max-width: 1279.98px)');

/** Icon + label + tooltip of an icon-only button. */
function setIconButton(btn, iconSpan, iconName, label) {
  btn.replaceChildren(iconSpan);
  setIcon(iconSpan, iconName);
  btn.setAttribute('aria-label', label);
  btn.dataset.tooltip = label;
}

/**
 * @param {{ main: HTMLElement, leftBtn: HTMLButtonElement, infoExpandBtn: HTMLButtonElement,
 *           infoHideBtn: HTMLButtonElement, onChange: () => void,
 *           onApply?: (state: { left: string, info: string }) => void }} opts
 *   onChange: the user changed the layout (save it); onApply: the layout in effect changed.
 */
export function createLayout({ main, leftBtn, infoExpandBtn, infoHideBtn, onChange, onApply = () => {} }) {
  const pref = { left: 'expanded', info: 'default' };
  let mediumListOpen = false; // 720–1023px: the list opened for this visit (not saved)

  const leftIcon = icon('chevronLeft');
  const expandIcon = icon('expand');
  const hideIcon = icon('chevronRight');

  function effective() {
    if (NARROW.matches) return { left: 'expanded', info: 'stacked' };
    if (MEDIUM.matches) return { left: mediumListOpen ? 'expanded' : 'rail', info: 'stacked' };
    const left = LARGE.matches && pref.info === 'wide' ? 'rail' : pref.left;
    return { left, info: pref.info };
  }

  function render() {
    const e = effective();
    main.dataset.left = e.left;
    main.dataset.info = e.info;

    // Dataset list toggle. Tooltip = its name, plus the B key chip.
    const rail = e.left === 'rail';
    setIconButton(leftBtn, leftIcon, rail ? 'chevronRight' : 'chevronLeft', rail ? 'Expand dataset list' : 'Collapse dataset list');
    leftBtn.setAttribute('aria-expanded', String(!rail));

    // "About this dataset": Expand / Collapse (one button) and Hide / Show (one button).
    const wide = e.info === 'wide';
    const hidden = e.info === 'hidden';
    if (wide) {
      setIcon(expandIcon, 'collapse');
      infoExpandBtn.replaceChildren(expandIcon, h('span', {}, 'Collapse'));
      infoExpandBtn.setAttribute('aria-label', 'Collapse dataset information');
      delete infoExpandBtn.dataset.tooltip; // the text is visible
      infoExpandBtn.classList.add('is-pill');
    } else {
      setIconButton(infoExpandBtn, expandIcon, 'expand', 'Expand dataset information');
      infoExpandBtn.classList.remove('is-pill');
    }
    infoExpandBtn.setAttribute('aria-expanded', String(wide));
    infoExpandBtn.hidden = hidden;

    setIconButton(infoHideBtn, hideIcon, hidden ? 'chevronLeft' : 'chevronRight', hidden ? 'Show dataset information' : 'Hide dataset information');
    infoHideBtn.setAttribute('aria-expanded', String(!hidden));
    infoHideBtn.hidden = wide;

    onApply(e);
  }

  /** Re-render without the column animation (first paint, window resize). */
  function renderStill() {
    main.classList.add('no-anim');
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => main.classList.remove('no-anim')));
  }

  function save() {
    render();
    onChange();
  }

  /** Toggle button or B. fromKey: say what happened (the button's own state says it otherwise). */
  function toggleLeft({ fromKey = false } = {}) {
    if (NARROW.matches) {
      if (fromKey) announce('On narrow screens the dataset list is always shown in full.', { force: true });
      return;
    }
    if (MEDIUM.matches) {
      mediumListOpen = !mediumListOpen;
      render();
    } else if (effective().left !== pref.left) {
      // 1024–1279px with the info panel wide: opening the list narrows the info panel again.
      pref.info = 'default';
      pref.left = 'expanded';
      save();
    } else {
      pref.left = pref.left === 'rail' ? 'expanded' : 'rail';
      save();
    }
    if (fromKey) announce(effective().left === 'rail' ? 'Dataset list collapsed to thumbnails.' : 'Dataset list expanded.', { force: true });
  }

  function setInfo(next) {
    if (!INFO_STATES.includes(next) || next === pref.info) return;
    pref.info = next;
    save();
  }

  leftBtn.addEventListener('click', () => toggleLeft());
  infoExpandBtn.setAttribute('aria-controls', 'info');
  infoHideBtn.setAttribute('aria-controls', 'info');
  infoExpandBtn.addEventListener('click', () => setInfo(pref.info === 'wide' ? 'default' : 'wide'));
  infoHideBtn.addEventListener('click', () => setInfo(pref.info === 'hidden' ? 'default' : 'hidden'));
  [NARROW, MEDIUM, LARGE].forEach((mq) => mq.addEventListener('change', renderStill));
  renderStill();

  return {
    getLeft: () => pref.left,
    getInfo: () => pref.info,
    effective,
    toggleLeft,
    /** From the URL (load or hashchange): no saving, no animation on load. */
    restore({ left, info }, { animate = false } = {}) {
      if (LEFT_STATES.includes(left)) pref.left = left;
      if (INFO_STATES.includes(info)) pref.info = info;
      if (animate) render();
      else renderStill();
    },
  };
}

/**
 * Tooltips for elements with data-tooltip="text" (optional data-tooltip-key="B",
 * and data-tooltip-when="rail" to show them only in the rail). Shown on hover
 * and on keyboard focus, beside the element (right, or left near the window's
 * right edge), above everything else. They are aria-hidden (each control
 * already has the same name) and follow WCAG 1.4.13: Escape hides them without
 * doing anything else, the pointer can move onto them, and they stay until
 * the pointer or focus leaves.
 */
export function installTooltips({ main }) {
  const text = h('span', {});
  const key = h('kbd', {});
  const tip = h('div', { class: 'tooltip', 'aria-hidden': 'true', hidden: true }, text, key);
  document.body.append(tip);

  let anchor = null;
  let dismissed = null; // hidden with Escape: stays hidden until pointer / focus moves on
  let hideTimer = 0;

  const tooltipTarget = (node) => (node instanceof Element ? node.closest('[data-tooltip]') : null);

  function eligible(el) {
    if (!el?.dataset.tooltip || NARROW.matches) return false;
    if (el.dataset.tooltipWhen === 'rail' && main.dataset.left !== 'rail') return false;
    return el.getClientRects().length > 0; // rendered
  }

  function show(el) {
    clearTimeout(hideTimer);
    if (!eligible(el) || el === dismissed) return;
    anchor = el;
    text.textContent = el.dataset.tooltip;
    const k = el.dataset.tooltipKey;
    key.textContent = k ?? '';
    key.hidden = !k || !singleKeyShortcutsEnabled();
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const onRight = r.right + 14 + t.width <= window.innerWidth - 8;
    tip.classList.toggle('is-left', !onRight);
    const top = Math.max(8, Math.min(window.innerHeight - t.height - 8, r.top + r.height / 2 - t.height / 2));
    tip.style.left = `${Math.round(onRight ? r.right + 14 : r.left - 14 - t.width)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function hide() {
    clearTimeout(hideTimer);
    tip.hidden = true;
    anchor = null;
  }

  // A short delay, so the pointer can cross the gap onto the tooltip.
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 150);
  };

  document.addEventListener('pointerover', (event) => {
    if (tip.contains(event.target)) {
      clearTimeout(hideTimer);
      return;
    }
    const el = tooltipTarget(event.target);
    if (el) show(el);
  });
  document.addEventListener('pointerout', (event) => {
    const el = tooltipTarget(event.target);
    const to = event.relatedTarget;
    if (el && el === dismissed && !el.contains(to)) dismissed = null;
    if (!anchor) return;
    if ((el === anchor || tip.contains(event.target)) && !anchor.contains(to) && !tip.contains(to)) hideSoon();
  });
  document.addEventListener('focusin', (event) => {
    const el = tooltipTarget(event.target);
    if (el && el.matches(':focus-visible')) show(el);
  });
  document.addEventListener('focusout', (event) => {
    const el = tooltipTarget(event.target);
    if (el && el === dismissed) dismissed = null;
    if (el && el === anchor) hide();
  });
  // Escape: only hide the tooltip. Capture phase, so no other Escape handler
  // (sound map, full view) runs for this press. With a dialog open the
  // tooltip is behind it: just hide it and let the dialog close as usual.
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || tip.hidden) return;
      const inDialog = !!document.querySelector('dialog[open]');
      dismissed = anchor;
      hide();
      if (inDialog) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener('resize', hide);
  document.addEventListener('scroll', hide, true);

  return {
    hide,
    /** The anchor's label changed (e.g. Expand → Collapse): show the new text, or hide. */
    refresh() {
      if (!anchor) return;
      const el = anchor;
      hide();
      if (document.activeElement === el && el.matches(':focus-visible')) show(el);
    },
  };
}
