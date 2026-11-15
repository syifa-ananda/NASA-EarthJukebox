// Sampled instruments: recorded notes from VSCO 2 Community Edition (CC0),
// served from src/audio/vendor/samples/ like Tone.js itself (works offline,
// no npm install). Sources and credits: vendor/samples/CREDITS.md.
//
// Each set is fetched and decoded once, the first time a preset needs it.
// If a file fails or the set takes longer than 8 s, the set is marked
// 'failed' and the instruments fall back to their synth versions.

import { Tone } from '../tone.js';   // loaded by init() before anything here runs

const BASE = new URL('../vendor/samples/', import.meta.url);
export const SAMPLE_TIMEOUT_MS = 8000;

/** Note -> file. Tone.Sampler repitches the notes in between. */
export const SAMPLE_SETS = {
  // Solo violin (arco, vibrato, soft) from G3 up; cello section for the two lowest notes.
  strings: {
    G2: 'cello-G2.mp3', D3: 'cello-D3.mp3',
    G3: 'violin-G3.mp3', C4: 'violin-C4.mp3', G4: 'violin-G4.mp3',
    C5: 'violin-C5.mp3', G5: 'violin-G5.mp3', C6: 'violin-C6.mp3',
  },
  // Upright piano, softest layer.
  piano: {
    F3: 'piano-F3.mp3', 'C#4': 'piano-Cs4.mp3', A4: 'piano-A4.mp3',
    F5: 'piano-F5.mp3', 'C#6': 'piano-Cs6.mp3', A6: 'piano-A6.mp3',
  },
};

/** kind -> { status: 'loading'|'ready'|'failed', buffers?: Record<note, AudioBuffer>, promise } */
const sets = {};

/** 'idle' | 'loading' | 'ready' | 'failed' */
export const sampleStatus = (kind) => sets[kind]?.status ?? 'idle';

/** Decoded AudioBuffers by note, or null if the set isn't ready. */
export const sampleBuffers = (kind) => (sets[kind]?.status === 'ready' ? sets[kind].buffers : null);

/** Forget a failed set so the next loadSampleSet() tries again. */
export function resetFailed() {
  for (const k of Object.keys(sets)) if (sets[k].status === 'failed') delete sets[k];
}

/**
 * Fetch and decode one set (once). Resolves to true when ready, false when a
 * file failed or the 8 s timeout passed. Never rejects.
 * @param {keyof SAMPLE_SETS} kind
 */
export function loadSampleSet(kind, timeoutMs = SAMPLE_TIMEOUT_MS) {
  if (sets[kind]) return sets[kind].promise;
  const entry = { status: 'loading', buffers: null, promise: null };
  sets[kind] = entry;
  const load = Promise.all(Object.entries(SAMPLE_SETS[kind]).map(async ([note, file]) => {
    const res = await fetch(new URL(file, BASE));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const audio = await Tone.getContext().decodeAudioData(await res.arrayBuffer());
    return [note, trimLeadingSilence(audio)];
  }));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000} s`)), timeoutMs);
  });
  entry.promise = Promise.race([load, timeout])
    .then((pairs) => {
      entry.buffers = Object.fromEntries(pairs);
      entry.status = 'ready';
      return true;
    })
    .catch((err) => {
      entry.status = 'failed';
      entry.error = err.message;
      return false;
    })
    .finally(() => clearTimeout(timer));
  load.catch(() => {});   // a late failure after the timeout is already handled
  return entry.promise;
}

/** MP3 files start with ~25 ms of encoder padding: cut it so notes start on time. */
function trimLeadingSilence(audio) {
  const ch = audio.getChannelData(0);
  let start = 0;
  while (start < ch.length && Math.abs(ch[start]) < 0.0005) start++;
  start = Math.max(0, start - Math.floor(0.001 * audio.sampleRate));   // keep 1 ms before the note
  if (start === 0) return audio;
  const out = Tone.getContext().createBuffer(audio.numberOfChannels, audio.length - start, audio.sampleRate);
  for (let c = 0; c < audio.numberOfChannels; c++) out.copyToChannel(audio.getChannelData(c).subarray(start), c);
  return out;
}
