// Audio adapter: the UI imports audio ONLY from this file.
//
// Interface the UI expects (Person 2's engine should export the same names):
//
//   start(): Promise<void>      Unlock audio. Called from a user gesture only
//                               (click / key press). Real engine: await Tone.start().
//   isStarted(): boolean
//   load(datasetId): Promise    Switch to that dataset's preset.
//   update(frame)               Called once per frame while playing. `frame` is
//                               one entry of features.json "frames".
//   play() / pause()            Start / stop continuous playback.
//   setVolume(v)                Master volume, 0–1.
//   setRate(r)                  Playback speed multiplier (1 = normal). Optional.
//   probe(x, y, value, grid?)   Explore mode: play a single map point.
//                               x = column (0 = west), y = row (0 = north),
//                               value = 0–1 grid value at that cell,
//                               grid = { cols, rows } (defaults to 32 × 16).
//   stop()                      Silence everything immediately.
//
// To switch to Person 2's engine, change this ONE line:
export * from './audio-stub.js';
// export * from '../../audio/engine.js';
