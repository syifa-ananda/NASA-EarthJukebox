// Small inline SVG icons, drawn for this project (no icon library). They are
// always decorative: aria-hidden, never the only label of a control (icon-only
// buttons carry an aria-label).
// Stroke icons in currentColor, so they follow the text colour and forced colours.

const PATHS = {
  // Sound wave ("Hear the alarm" button).
  wave: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12M23 11v2"/>',
  // Controls.
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="m13 12 5 5"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
  // Layout.
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  expand: '<path d="M14 4h6v6"/><path d="m20 4-6.5 6.5"/><path d="M10 20H4v-6"/><path d="m4 20 6.5-6.5"/>',
  collapse: '<path d="M20 4l-6.5 6.5"/><path d="M14 5v5.5h5"/><path d="M4 20l6.5-6.5"/><path d="M10 19v-5.5H5"/>',
  // States.
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.8 2.8L16.2 9.8"/>',
  // "About this dataset" (expanded): section and detail icons.
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-1.9l-.4-1c-.5-1.2.4-2.6 1.7-2.6H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/>' +
    '<circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.2" r="1.2"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  // Placeholder mark inside thumbnails that have no photo yet.
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-4.5-4.5L8 19"/>',
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

/** Swap the drawing inside an icon made by icon() (e.g. a chevron that flips). */
export function setIcon(span, name) {
  const svg = span?.querySelector('svg');
  if (svg) svg.innerHTML = PATHS[name] ?? '';
}
