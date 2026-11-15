// Public API of the audio engine. This is the only file the UI imports.
// Documented in src/audio/CONTRACT.md.
//
//   import * as audio from './src/audio/engine/index.js';
//   const detach = audio.syncToVideo(videoEl, featuresFile);   // one call wires everything

export {
  init, loadPreset, loadDataset, analyzeRanges, setRanges, getRanges,
  playFrame, play, pause, setVolume, probe, playLegend, previewAlarm, describeFrame, dispose,
  startRecording, stopRecording, isRecording, isRecordingSupported,
  isReady, isPlaying, currentPreset,
  setMix, getMix, setSwitch, getSwitches,
  setAlarmEnabled, isAlarmEnabled, isAlarmActive,
  getPreset, listPresets,
} from './core.js';
export { syncToVideo } from './sync.js';
export { hasPreset, MIXES } from '../presets/index.js';
