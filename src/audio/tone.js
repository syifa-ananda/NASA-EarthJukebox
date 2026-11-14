// Tone.js 15.1.22 (MIT), vendored at src/audio/vendor/Tone.js.
// Copied unchanged from the npm package so the site works without `npm install`
// and offline. To upgrade: `npm install -D tone@<version>`, copy
// node_modules/tone/build/Tone.js (+ LICENSE.md, Tone.js.LICENSE.txt) into
// src/audio/vendor/, and update the version in this comment and package.json.
//
// Every audio module gets Tone from here. If a page already loaded the script
// (<script src=".../src/audio/vendor/Tone.js">), that copy is used; otherwise
// it is loaded automatically, relative to this file.

if (!globalThis.Tone) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/Tone.js', import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load Tone.js from ${script.src}`));
    document.head.append(script);
  });
}

/** @type {any} The global Tone namespace from the vendored UMD build. */
const Tone = globalThis.Tone;
export default Tone;
