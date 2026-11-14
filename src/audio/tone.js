// Tone.js 15.1.22 (MIT), vendored at src/audio/vendor/Tone.js.
// Copied unchanged from the npm package so the site works without `npm install`
// and offline. To upgrade: `npm install -D tone@<version>`, copy
// node_modules/tone/build/Tone.js (+ LICENSE.md, Tone.js.LICENSE.txt) into
// src/audio/vendor/, and update the version in this comment and package.json.
//
// Tone is loaded lazily, on the first init(). Loading the script creates an
// AudioContext straight away, and browsers warn ("AudioContext was not allowed
// to start") if that happens before the user has clicked or pressed a key.
// So pages should NOT include vendor/Tone.js with a <script> tag.
//
// Order inside init():
//   1. unlockAudio(): synchronously, inside the user gesture, create and
//      resume our own AudioContext (Safari only allows this in the gesture).
//   2. loadTone(): load the script, then give Tone that context and dispose
//      the one Tone created for itself while loading.

/**
 * The Tone namespace, or null until loadTone() has finished. This is a live
 * binding: modules that import it see the value once it is loaded.
 * @type {any}
 */
export let Tone = globalThis.Tone ?? null;

let audioContext = null;
let loading = null;

/**
 * Create (once) and resume the AudioContext. Call synchronously from a
 * click/key handler, before any `await`.
 * @returns {Promise<void>}
 */
export function unlockAudio() {
  if (Tone) return Tone.start();
  const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctx) return Promise.reject(new Error('Web Audio is not supported in this browser'));
  audioContext ??= new Ctx({ latencyHint: 'interactive' });
  return audioContext.resume();
}

/**
 * Load the vendored Tone.js (once) and switch it to the unlocked context.
 * @returns {Promise<any>} the Tone namespace
 */
export function loadTone() {
  if (Tone) return Promise.resolve(Tone);
  loading ??= new Promise((resolve, reject) => {
    if (globalThis.Tone) return resolve();
    const script = document.createElement('script');
    script.src = new URL('./vendor/Tone.js', import.meta.url).href;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;   // allow a retry
      reject(new Error(`Could not load Tone.js from ${script.src}`));
    };
    document.head.append(script);
  }).then(() => {
    const T = globalThis.Tone;
    if (audioContext) T.setContext(audioContext, true);   // true = dispose Tone's own context
    Tone = T;
    return T;
  });
  return loading;
}
