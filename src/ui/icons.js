// Small inline SVG icons, drawn for this project (no icon library). They are
// always decorative: aria-hidden, never the only label of a control.
// Stroke icons in currentColor, so they follow the text colour and forced colours.

const PATHS = {
  // Sound wave ("Hear the alarm" button).
  wave: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12M23 11v2"/>',
  // Controls.
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="m13 12 5 5"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
};

/**
 * A decorative icon element: <span class="icon-svg …" aria-hidden="true"><svg>…</svg></span>.
 * The markup is our own constant strings, never user data.
 */
export function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon-svg${className ? ` ${className}` : ''}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round" focusable="false">${PATHS[name] ?? ''}</svg>`;
  return span;
}
