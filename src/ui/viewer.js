// Frame viewer: the dataset's real video, or (no video / video failed) a
// heatmap of the frame's grid on a <canvas>.
//
// The video is decoration for sighted users: it is muted (the files have no
// audio track; sound comes from the engine), has no native controls, never
// autoplays and is aria-hidden. The explore map, captions and narration
// describe what it shows. The player (player.js) controls it.

import { frameAt } from './adapters/data.js';
import { rampRgb } from './color.js';
import { describeFrame } from './describe.js';

const GREY_RAMP = ['#000000', '#ffffff'];

const viewerEl = document.getElementById('viewer');
const statusEl = document.getElementById('viewer-status'); // messages inside the box
const captionEl = document.getElementById('frame-caption'); // frame + date, below the picture
let canvas = null;
let video = null;
let mode = 'none'; // 'none' | 'video' | 'heatmap'
let contentAspect = 2;
let videoCleanup = null;
const layoutListeners = new Set();

/** A message in the middle of the viewer box (loading, errors, not ready). */
function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `viewer-status${kind ? ` is-${kind}` : ''}`;
  statusEl.hidden = false;
  if (captionEl) captionEl.hidden = true;
}

/**
 * Frame and date, shown BELOW the picture so no overlay covers the video
 * (co2 has its own date label in the bottom-right corner).
 */
function setCaption(text) {
  statusEl.hidden = true;
  if (!captionEl) return;
  captionEl.textContent = text;
  captionEl.hidden = false;
}

// ---------- layout: the picture area inside the viewer ----------

/**
 * The displayed picture inside the viewer box (object-fit: contain), as insets
 * in px. The explore grid must line up with this area, not with black bars.
 */
export function pictureInsets() {
  const w = viewerEl.clientWidth;
  const h = viewerEl.clientHeight;
  if (!w || !h || mode !== 'video') return { top: 0, right: 0, bottom: 0, left: 0, width: w, height: h };
  const boxAspect = w / h;
  if (boxAspect > contentAspect) {
    const pw = h * contentAspect;
    const side = (w - pw) / 2;
    return { top: 0, right: side, bottom: 0, left: side, width: pw, height: h };
  }
  const ph = w / contentAspect;
  const band = (h - ph) / 2;
  return { top: band, right: 0, bottom: band, left: 0, width: w, height: ph };
}

function emitLayout() {
  const insets = pictureInsets();
  layoutListeners.forEach((fn) => fn(insets));
}

/** Called whenever the picture area moves or resizes. */
export function onLayout(fn) {
  layoutListeners.add(fn);
  fn(pictureInsets());
}

new ResizeObserver(emitLayout).observe(viewerEl);

/** Make the viewer box match the picture's shape (width / height). */
export function setAspect(aspect) {
  if (!(aspect > 0)) return;
  contentAspect = aspect;
  viewerEl.style.aspectRatio = String(aspect);
  emitLayout();
}

// ---------- heatmap ----------

function hideCanvas() {
  if (canvas) canvas.hidden = true;
}

function getCanvas(cols, rows) {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'heatmap';
    canvas.setAttribute('role', 'img');
    viewerEl.prepend(canvas);
  }
  if (canvas.width !== cols) canvas.width = cols;
  if (canvas.height !== rows) canvas.height = rows;
  canvas.hidden = false;
  return canvas;
}

function drawHeatmap(target, grid, stops) {
  const rows = grid.length;
  const cols = grid[0].length;
  const ctx = target.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const [r, g, b] = rampRgb(stops, grid[y][x]);
      const o = (y * cols + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- video ----------

function getVideo() {
  if (!video) {
    video = document.createElement('video');
    video.className = 'video';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.controls = false;
    video.disablePictureInPicture = true;
    video.setAttribute('disableremoteplayback', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.hidden = true;
    viewerEl.prepend(video);
  }
  return video;
}

/** True if the browser can seek anywhere in the video (needs HTTP range support). */
function isSeekable(v) {
  const r = v.seekable;
  return r.length > 0 && r.end(r.length - 1) >= v.duration - 0.5;
}

let objectUrl = null;

/**
 * Start loading a video. onReady(video) fires once its first frame can be
 * shown AND it can be seeked; onError(error) if it can't load. Never plays it.
 *
 * Seeking needs HTTP range requests. `python3 -m http.server` doesn't support
 * them, so Chrome can't seek (video.seekable is empty) and the timeline would
 * snap back to 0. In that case the whole file is downloaded once and played
 * from a Blob URL, which is always seekable. Servers with range support (e.g.
 * GitHub Pages) skip the download.
 */
export function loadVideo(url, { onReady, onError }) {
  unloadVideo();
  const v = getVideo();
  let done = false;
  let needsBlob = false;
  let usingBlob = false;
  const ready = () => {
    if (done || (needsBlob && !usingBlob)) return;
    done = true;
    if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
    onReady(v);
  };
  const failed = (err) => {
    if (done) return;
    done = true;
    onError(err ?? v.error);
  };
  const metadata = () => {
    if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
    if (usingBlob || isSeekable(v)) return;
    needsBlob = true;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (done || v.getAttribute('data-src') !== url) return; // record changed meanwhile
        objectUrl = URL.createObjectURL(blob);
        usingBlob = true;
        v.src = objectUrl;
        v.load(); // fires loadeddata again → ready()
      })
      .catch(failed);
  };
  const errored = () => {
    if (!usingBlob && needsBlob) return; // swapping to the Blob; ignore the old source
    failed(v.error);
  };
  v.addEventListener('loadedmetadata', metadata);
  v.addEventListener('loadeddata', ready);
  v.addEventListener('error', errored);
  videoCleanup = () => {
    v.removeEventListener('loadedmetadata', metadata);
    v.removeEventListener('loadeddata', ready);
    v.removeEventListener('error', errored);
  };
  v.setAttribute('data-src', url);
  mode = 'video';
  hideCanvas();
  v.hidden = false;
  v.src = url;
  v.load();
  emitLayout();
  return v;
}

/** Stop and forget the current video (record change or fallback). */
export function unloadVideo() {
  videoCleanup?.();
  videoCleanup = null;
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.removeAttribute('data-src');
  video.load();
  video.hidden = true;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  if (mode === 'video') mode = 'none';
}

/** Switch to the heatmap (no video, or the video failed). */
export function useHeatmap() {
  unloadVideo();
  mode = 'heatmap';
  emitLayout();
}

export function getMode() {
  return mode;
}

// ---------- status messages ----------

export function showIdle(text) {
  unloadVideo();
  hideCanvas();
  setStatus(text);
}

export function showLoading(record) {
  unloadVideo();
  hideCanvas();
  setStatus(`Loading ${record.title}…`);
}

export function showNotReady(record) {
  unloadVideo();
  hideCanvas();
  setStatus(
    `Data not ready yet. ${record.title} is coming soon. Choose a record marked "Ready to play" to listen now.`,
    'notice',
  );
}

export function showError(text) {
  unloadVideo();
  hideCanvas();
  setStatus(text, 'error');
}

/**
 * Show frame `index`: in video mode only the caption changes (the video is
 * already on that frame); in heatmap mode the grid is drawn.
 */
export function showFrame(record, data, index, { caption } = {}) {
  setCaption(caption ?? `Frame ${index + 1} of ${data.frameCount}`);
  if (mode === 'video') return;
  const frame = frameAt(data, index);
  const c = getCanvas(data.grid.cols, data.grid.rows);
  drawHeatmap(c, frame.grid, record.legend?.stops ?? GREY_RAMP);
  c.setAttribute('aria-label', describeFrame(record, frame, index, data.frameCount));
}
