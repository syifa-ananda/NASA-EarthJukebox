// Keeps the audio in step with a <video> showing the same dataset.
//
//   const detach = syncToVideo(videoEl, featuresFile);
//   ...
//   detach();   // when switching datasets or leaving the page
//
// Frame index = floor(currentTime * fps). playFrame() is called only when
// the index changes; play/pause/seek/end of the video drive the audio.

import { loadDataset, playFrame, play, pause } from './core.js';

/**
 * @param {HTMLVideoElement} video
 * @param {import('../types.js').FeaturesFile} file
 * @param {object} [options]
 * @param {(frame: import('../types.js').Frame, index: number,
 *          params: import('../types.js').SoundParams) => void} [options.onFrame]
 *   Called after each new frame is sent to the engine (e.g. to update a live region).
 * @param {boolean} [options.loadDataset=true]  Also load the matching preset and ranges.
 * @returns {() => void} detach: stops syncing and pauses the audio.
 */
export function syncToVideo(video, file, { onFrame, loadDataset: load = true } = {}) {
  const fps = file.fps;
  const last = file.frames.length - 1;   // frame counts differ per dataset
  let lastIndex = -1;
  let callbackId = null;
  let usingVideoFrames = false;
  let detached = false;

  if (load) loadDataset(file);

  const indexAt = (seconds) => Math.min(last, Math.max(0, Math.floor(seconds * fps + 1e-6)));

  function update(seconds = video.currentTime, force = false) {
    if (detached) return;
    const i = indexAt(seconds);
    if (i === lastIndex && !force) return;
    lastIndex = i;
    const frame = file.frames[i];
    // Frame length follows the playback rate, so percussion stays in time at 2x.
    const params = playFrame(frame, { frameSeconds: 1 / (fps * (video.playbackRate || 1)) });
    onFrame?.(frame, i, params);
  }

  // Per-frame updates while playing: requestVideoFrameCallback when the
  // browser has it (exact media time of each shown frame), otherwise
  // requestAnimationFrame. 'timeupdate' below is a third, slower backup.
  function loop(now, metadata) {
    if (detached || video.paused) {
      callbackId = null;
      return;
    }
    update(metadata?.mediaTime ?? video.currentTime);
    schedule();
  }
  function schedule() {
    if ('requestVideoFrameCallback' in video) {
      usingVideoFrames = true;
      callbackId = video.requestVideoFrameCallback(loop);
    } else {
      callbackId = requestAnimationFrame(loop);
    }
  }
  function cancel() {
    if (callbackId === null) return;
    if (usingVideoFrames) video.cancelVideoFrameCallback(callbackId);
    else cancelAnimationFrame(callbackId);
    callbackId = null;
  }

  const onPlay = () => {
    play().catch(() => {});   // fails only if the browser blocks audio; the video keeps playing
    update(video.currentTime, true);
    if (callbackId === null) schedule();
  };
  const onPause = () => {
    cancel();
    pause();
  };
  const onSeeked = () => update(video.currentTime, true);
  const onTimeUpdate = () => update();

  const events = { play: onPlay, pause: onPause, ended: onPause, seeked: onSeeked, timeupdate: onTimeUpdate };
  for (const [name, fn] of Object.entries(events)) video.addEventListener(name, fn);

  // Start in the right state if the video is already playing or positioned.
  update(video.currentTime, true);
  if (!video.paused) onPlay();

  return function detach() {
    if (detached) return;
    detached = true;
    cancel();
    for (const [name, fn] of Object.entries(events)) video.removeEventListener(name, fn);
    pause();
  };
}
