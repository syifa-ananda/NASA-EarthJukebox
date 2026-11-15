// Links shared by both pages (index.html and how-to-listen.html).
//
// The settings live in the URL hash (#record=…[&keys=off][&alarm=off][&left=…][&info=…]).
//   - Skip links and other in-page links move focus to their target without
//     overwriting that hash, so a reload still restores the settings.
//   - Links marked data-keep-state (the header nav, "Back to EarthTunes")
//     carry the same hash to the other page, so going to "How to listen" and
//     back keeps the dataset, layout and switches. The browser's Back
//     button keeps them anyway (it returns to the jukebox's own URL).

/** Click handler for links like href="#player": focus the target, keep the hash. */
export function handleInPageLinks(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target) return;
  event.preventDefault();
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}

/** Point every a[data-keep-state] at its own page plus these settings. */
export function updateStateLinks(params) {
  const hash = params.toString();
  document.querySelectorAll('a[data-keep-state]').forEach((link) => {
    const page = link.getAttribute('href').split('#')[0];
    link.setAttribute('href', hash ? `${page}#${hash}` : page);
  });
}
