// Entry point for the Earth Information Jukebox UI.
// Step 1 (scaffold): load the manifest and report status. Later steps add the
// record picker, player, narration and explore mode.

import { loadIndex } from './adapters/data.js';

const viewerStatus = document.getElementById('viewer-status');

async function init() {
  try {
    const datasets = await loadIndex();
    const n = datasets.length;
    viewerStatus.textContent = `${n} record${n === 1 ? '' : 's'} loaded. Choose a record to begin.`;
  } catch (err) {
    console.error(err);
    viewerStatus.classList.add('error');
    viewerStatus.textContent =
      'Could not load the dataset list. Serve the site from the repo root with "python3 -m http.server" and open http://localhost:8000.';
  }
}

init();
