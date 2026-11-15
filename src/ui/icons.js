// Small inline SVG icons, drawn for this project (no icon library). They are
// always decorative: aria-hidden, never the only label of a control.
// Stroke icons in currentColor, so they follow the text colour and forced colours.

const PATHS = {
  // Sound wave (logo, live narration).
  wave: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12M23 11v2"/>',
  // Dataset icons.
  waves: '<path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>',
  city: '<path d="M3 21h18"/><path d="M5 21V10h4v11"/><path d="M9 21V4h6v17"/><path d="M15 21v-8h4v8"/><path d="M11 7h2M11 10h2M11 13h2M7 13h0M17 16h0"/>',
  bolt: '<path d="M13 2 5 13h6l-1 9 8-12h-6l1-8z"/>',
  co2: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z"/><text x="12" y="16" text-anchor="middle" font-size="5.2" font-family="system-ui, sans-serif" font-weight="700" fill="currentColor" stroke="none">CO2</text>',
  // Controls.
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/><path d="m13 12 5 5"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h0M9 10h0M12 10h0M15 10h0M18 10h0M7 14h10"/>',
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
