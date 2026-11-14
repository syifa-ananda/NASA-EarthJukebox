// Frame viewer. Until videos / frame images exist (step 3), it draws a frame's
// grid as a heatmap on a <canvas>, using the record's colour ramp.

import { frameAt } from './adapters/data.js';
import { rampRgb } from './color.js';
import { describeFrame } from './describe.js';

const GREY_RAMP = ['#000000', '#ffffff'];

const viewerEl = document.getElementById('viewer');
const statusEl = document.getElementById('viewer-status');
let canvas = null;

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `viewer-status${kind ? ` is-${kind}` : ''}`;
}

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

export function showIdle(text) {
  hideCanvas();
  setStatus(text);
}

export function showLoading(record) {
  hideCanvas();
  setStatus(`Loading ${record.title}…`);
}

export function showNotReady(record) {
  hideCanvas();
  setStatus(
    `Data not ready yet. ${record.title} is coming soon. Choose a record marked "Mock data" to listen now.`,
    'notice',
  );
}

export function showError(text) {
  hideCanvas();
  setStatus(text, 'error');
}

export function showFrame(record, data, index) {
  const frame = frameAt(data, index);
  const c = getCanvas(data.grid.cols, data.grid.rows);
  drawHeatmap(c, frame.grid, record.legend?.stops ?? GREY_RAMP);
  c.setAttribute('aria-label', describeFrame(record, frame, index, data.frameCount));
  setStatus(`Ready. Frame ${index + 1} of ${data.frameCount}.`, 'caption');
}
