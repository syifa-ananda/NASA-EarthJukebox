# Sources and Credits

Every dataset used in the jukebox, with its source page and credit. Fill in each TODO when the real media is downloaded.

| id | Dataset | Source (SVS page) | Media file used | Colorbar | Credit | Status |
|----|---------|-------------------|-----------------|----------|--------|--------|
| `sst` | Global Sea Surface Currents and Temperature | [SVS #3912](https://svs.gsfc.nasa.gov/3912/) | `ecco2_sst_flow.m4v` | `sst_ecco2_cbar.png`, 0–32 °C | NASA/Goddard Space Flight Center Scientific Visualization Studio | **real** |
| `nightlights` | Change in Night Lights 2012–2023 (EIC version) | TODO | TODO | TODO | NASA/SVS (TODO: full credit line from page) | mock |
| `lightning` | Lightning Events Detected from the ISS 2017–2023 | TODO | TODO | TODO | NASA/SVS (TODO: full credit line from page) | mock |
| `co2` | DYAMOND Global Carbon Dioxide | TODO | TODO | TODO | NASA/SVS (TODO: full credit line from page) | mock |
| `aerosols` (stretch) | GEOS Aerosols | TODO | TODO | TODO | NASA/SVS (TODO: full credit line from page) | not started |

## Notes per dataset

For each one, record: the exact page URL, the media file name and resolution downloaded, the date range shown, the colorbar's units and min/max, and any processing (crop, frame rate, trim).

### sst
- **Page:** https://svs.gsfc.nasa.gov/3912/ (SVS #3912)
- **Credit:** NASA/Goddard Space Flight Center Scientific Visualization Studio
- **Video:** `ecco2_sst_flow.m4v`, saved as `raw/sst/source.mp4`. 640×320 equirectangular (flat 2:1) global map, H.264, 30 fps, 66.7 s (2001 frames). The underlying model is ECCO2 (ocean currents and temperature).
- **Data dates:** 2007-03-25 to 2008-03-03.
- **Colorbar:** `sst_ecco2_cbar.png`, saved as `raw/sst/colorbar.png`. "Sea Surface Temp (°C)", linear from 0 °C (blue, left) to 32 °C (red, right); green ≈ 10–20 °C, yellow ≈ 24–25 °C. Only the coloured strip is sampled (rows 28–68, columns 15–290 of the 310×95 image; the title, tick labels, black border and the anti-aliased edge pixels are skipped). `value` = temperature / 32, so 0.5 = 16 °C.
- **Overlays / cropping:** none needed. The video has no date stamp, title, logo or fade. Nothing is cropped.
- **Masking:** land is flat grey and is excluded with a fixed land mask (pixels that are grey in ≥ 95 % of frames, 30.5 % of the map, Antarctica included). Black ocean between the streaks, faded trail ends (max channel < 60), washed-out white highlights (saturation < 0.25), and any hue that is not on the colorbar are also excluded.
- **Calibration method:** the map shows flow streaks *coloured* by temperature over black ocean. Streak trails fade toward black and overlapping streaks are brightened toward white, so the RGB values rarely match the colorbar exactly, but the hue does. The colorbar hue changes monotonically from blue to red, so each pixel is read by nearest-hue lookup against the colorbar. Only 0.05 % of coloured ocean pixels fall off the colorbar.
- **Coverage:** about 39 % of ocean pixels give a reading in each frame (the rest are gaps between streaks). Grid cells with no reading in a frame keep their last reading (about 11 % of ocean cells per frame). Land-only cells, and 36 coastal/polar ocean cells that are never read, are 0.
- **Global value:** `value` and `density` are area-weighted (cos latitude × ocean area per grid cell), so regions with many streaks don't count extra. The mean is about 19 °C, which is close to the real global mean SST.
- **Processing:** `scripts/extract_frames.sh sst 2` → 133 frames at 2 fps (`raw/sst/frames/0000.png` …); web video re-encoded to H.264 CRF 23, no audio, faststart, 640×320, about 8 MB. Features: `python3 src/analysis/analyze.py sst raw/sst/frames --colorbar raw/sst/colorbar.png`.

### nightlights
- TODO

### lightning
- TODO

### co2
- TODO

### Tools
- Tone.js for audio synthesis (MIT licence).
