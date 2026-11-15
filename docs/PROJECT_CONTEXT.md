# Project Context: The Earth Information Jukebox

NASA Space Apps Challenge 2026 · 3-person team

## The challenge

Build an "Earth Jukebox" that pairs NASA Earth Information Center (EIC) visualizations (made by the Scientific Visualization Studio, svs.gsfc.nasa.gov) with sonifications generated in real time. Goals:

- Make Earth science accessible to blind and low-vision users.
- Keep the output musical: use scales and harmony, not raw frequencies.
- Document why we chose each data-to-sound mapping.

## Our approach

A static web app (HTML + JavaScript + Tone.js). The user picks a dataset, its video plays, and per-frame features drive the audio in sync. Features are precomputed in Python into JSON, which is reliable and smooth, and the browser plays them back frame by frame. An explore mode lets users move a cursor or use arrow keys over the map and hear the value at that point.

## Datasets (from the challenge Resources)

| id | Dataset | Character |
|----|---------|-----------|
| `sst` | Global Sea Surface Currents and Temperature | slow, continuous change |
| `nightlights` | Change in Night Lights 2012–2023, EIC version | high contrast, growth over time |
| `lightning` | Lightning Events Detected from the ISS 2017–2023 | sudden flashes, percussive |
| `co2` | DYAMOND Global Carbon Dioxide | evolving plumes, rising concentration |
| `aerosols` (stretch) | GEOS Aerosols | multi-layer, multi-track |

## Team

- **Person 1, Data & Analysis**: download SVS media, extract frames with ffmpeg, compute features with Python (numpy, pillow), calibrate with each dataset's colorbar, publish JSON, write plain-language dataset descriptions.
- **Person 2, Audio Engine**: Tone.js presets per dataset, musical scales, `probe(x, y)` for explore mode.
- **Person 3, UI & Accessibility**: jukebox UI, keyboard explore mode, ARIA and screen-reader narration, documentation, demo video.

## Repo structure

```
/public/data/index.json               dataset manifest
/public/data/<dataset>/features.json  per-frame features
/public/data/<dataset>/video.mp4      web-sized video (≤ 720p, no audio)
/src/analysis/                        Python analysis (Person 1)
/src/audio/                           Person 2
/src/ui/                              Person 3
/scripts/                             helper scripts
/raw/                                 downloaded source media (gitignored)
/docs/                                PROJECT_CONTEXT.md, data-contract.md, sources.md
index.html                            (Person 3 will build this)
```

## Data contract (shared by all 3 people; never change it without telling the team)

`public/data/<dataset>/features.json`:

```json
{
  "dataset": "sst",
  "title": "Global Sea Surface Temperature",
  "fps": 2,
  "frameCount": 60,
  "grid": { "cols": 32, "rows": 16 },
  "frames": [
    {
      "t": 0,
      "brightness": 0.42,
      "warmth": 0.61,
      "density": 0.18,
      "pan": -0.2,
      "motion": 0.05,
      "flashes": 0,
      "value": 0.55,
      "grid": [[0.1, 0.3, "...32 numbers"], "...16 rows"]
    }
  ]
}
```

Rules:

- All values are in 0–1, except `pan` (−1 = left, 1 = right) and `flashes` (integer 0–16).
- Round features to 3 decimals and grid cells to 2 decimals.
- `grid` is rows × cols (16 × 32); row 0 = north/top; each cell holds the main quantity (`value`) for that area.
- `value` is the scientifically calibrated main quantity (e.g. normalized SST read from the colorbar); it falls back to brightness when no colorbar is available.
- Meanings: brightness = mean luminance; warmth = red-vs-blue balance; density = share of bright/active pixels; pan = horizontal centre of activity; motion = change from the previous frame; flashes = count of newly bright spots.
- `t` is the frame index (0, 1, 2, …); playback time in seconds is `t / fps`.

`public/data/index.json`:

```json
{ "datasets": [ { "id": "sst", "title": "...", "description": "plain-language, screen-reader friendly",
  "colorMeaning": "red = warm, blue = cold", "source": "SVS page URL", "credit": "NASA/SVS",
  "features": "sst/features.json", "video": "sst/video.mp4", "mock": true } ] }
```

See [data-contract.md](data-contract.md) for the readable version with JS examples.

## Conventions

- Python 3.10+, numpy, pillow; ffmpeg for frames.
- `/raw/` and large media are gitignored; web videos ≤ 720p and ≤ 20 MB.
- Every dataset's source URL and credit goes in `docs/sources.md`.
- Feature branches: `data`, `audio`, `ui`; keep `main` runnable.
