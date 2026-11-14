# Sources and Credits

Every dataset used in the jukebox, with its source page and credit.

| id | Dataset | Source (SVS page) | Media file used | Colorbar | Credit | Status |
|----|---------|-------------------|-----------------|----------|--------|--------|
| `sst` | Global Sea Surface Currents and Temperature | [SVS #3912](https://svs.gsfc.nasa.gov/3912/) | `ecco2_sst_flow.m4v` | `sst_ecco2_cbar.png`, 0–32 °C | NASA/Goddard Space Flight Center Scientific Visualization Studio | **real** |
| `nightlights` | Change in Night Lights 2012–2023 (EIC version) | [SVS #5313](https://svs.gsfc.nasa.gov/5313/) | `nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4` | none (luminance-based) | NASA's Scientific Visualization Studio. Data: NASA Black Marble (Suomi NPP VIIRS) | **real** (re-paced) |
| `lightning` | Lightning Events Detected from the ISS 2017–2023 | [SVS #5011](https://svs.gsfc.nasa.gov/5011/) | `iss_lightning_sos_yearly_07312023_2048p60.mp4` | none (dot detection) | NASA's Scientific Visualization Studio. Data: Lightning Imaging Sensor (LIS) on the ISS | **real** |
| `co2` | DYAMOND Global Carbon Dioxide | [SVS #5196](https://svs.gsfc.nasa.gov/5196/) | `dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4` | `dyamondCbar_6-27-2024a.png` (no ppm labels) | NASA's Scientific Visualization Studio. Data: DYAMOND GEOS model | **real** (globe tour) |
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
- **Page:** https://svs.gsfc.nasa.gov/5313/ (SVS #5313)
- **Credit:** NASA's Scientific Visualization Studio. Data: NASA Black Marble (Suomi NPP VIIRS).
- **Video:** `nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4`, saved as `raw/nightlights/source.mp4`. 7680×2160 (ultra-wide EIC display), HEVC, 30 fps, 43.3 s (1300 frames).
- **Data dates:** annual night lights 2012–2023.
- **Colorbar:** none for the yearly series, so `value` is luminance-based (see Method). The change map has a legend ("Change in Lighting Intensity from 2012 to 2023": orange = lights out, white = no change, purple = new lights) with no numbers; it is **not used** in `features.json`.
- **Sections of the source video** (seconds / 0-based frame numbers at 30 fps):
  - A. 0.00–9.2 s (frames 0–276): yearly series 2012→2023, world only. About 0.6 s (18 frames) per year; 2023 holds from 6.43 s. **This is the only section used.**
  - 9.2–10.2 s: crossfade to the change map.
  - B. 10.2–20.6 s (305–617): change map 2012→2023, world only.
  - 20.6–22.5 s: fade back to 2012 and four zoom boxes appear.
  - C. 22.5–36.4 s (675–1091): yearly series again, with fixed zoom boxes ("Western Europe", "Eastern Mediterranean", "Ukraine", "India") drawn over the map.
  - D. 37.3–43.3 s (1119–1300): change map with the zoom boxes.
- **Frame layout:** the 7680-px frame holds two copies of the world side by side (period ≈ 3840 px). We crop the left copy, **`crop=3840:2160:0:0`**, which runs from about 160°W eastward around the globe. It is 16:9, not 2:1, so latitude is only approximate in explore mode. The year label (x 3982–4149, y 1080–1135) is in the right copy and falls outside the crop. No title or logo.
- **Timing was re-paced.** The original shows each year for only about 0.6 s (12 years in 6.4 s, then 2023 held for ~3 s). That is too fast for the music and gives uneven frame counts per year. We take **one still per year** from the middle of each year's hold in section A and rebuild the timeline at **2.5 s per year**, with a **0.5 s crossfade** into the next year: 30 s, 60 data frames at 2 fps (5 per year). The web video is built from the same timeline, so video and features line up exactly. **This is not the original SVS timing.**
- **Source frame used for each year** (0-based, 30 fps): 2012 → 7, 2013 → 24, 2014 → 42, 2015 → 60, 2016 → 78, 2017 → 95, 2018 → 113, 2019 → 131, 2020 → 148, 2021 → 166, 2022 → 184, 2023 → 240.
- **Method (light above the land base):** city lights are drawn on top of a static base map (black ocean, grey snow and ice, brownish deserts, dark forests) that is the same in every year. The base is estimated per pixel as the darkest value that pixel ever has, followed by a 31×31 px morphological opening (removes anything smaller than a city cluster). Light = luminance − base − 3 (noise margin). Neutral grey pixels (saturation < 0.12) are ignored: every light pixel is yellowish (saturation ≥ 0.19), while snow, ice and shaded relief are grey, and that is where the base estimate is least reliable.
- **Fixed scale, same for all years:** a grid cell of 1.0 = an average of 30 luminance units of light above the base across the cell (the brightest cell in 2023 is 27.6, so 0.92). `brightness` = mean light over land pixels ÷ 30. `value` = mean of the land grid cells. `density` = share of land pixels with at least 10 units of light. `warmth` = light-weighted red-vs-blue balance of lit pixels. `flashes` = 0.
- **Known limits:** dim lights over grey snow (e.g. northern Russia) are partly ignored, and a faint static residue remains over some deserts; both are the same every year, so they don't affect the trend.
- **Processing:** `python3 scripts/build_series.py nightlights` (stills, analysis frames, 1280×720 H.264 web video, about 0.5 MB); then `python3 src/analysis/analyze.py nightlights raw/nightlights/frames`.

### lightning
- **Page:** https://svs.gsfc.nasa.gov/5011/ (SVS #5011)
- **Credit:** NASA's Scientific Visualization Studio. Data: Lightning Imaging Sensor (LIS) on the International Space Station.
- **Video:** `iss_lightning_sos_yearly_07312023_2048p60.mp4`, saved as `raw/lightning/source.mp4`. 4096×2048 Science On a Sphere flat map, H.264, 60 fps, 100.0 s (6002 frames).
- **Data dates:** about March 2017 – July 2023, shown with a 10-day roving window (each flash stays on the map for 10 days of data). **The video has no date labels**, so we do not assign dates to frames. Activity peaks about every 12 s, once per northern summer (peaks near 16.5, 29, 41, 53, 64, 74.5 and 88.5 s), which fits roughly one second per month, but this is an estimate only.
- **Colorbar:** none. Lightning is a single colour (yellow dots).
- **Map:** full 2:1 equirectangular world, 180° W at the left edge to 180° E at the right, 90° N to 90° S (the dashed tropic lines sit exactly at ±23.4°). The grid therefore maps directly to latitude/longitude.
- **Overlays / cropping:** none needed. No title, date label, legend or logo. Static overlays are the grey base map with country borders, a solid equator line, dashed tropic lines, and darker bands beyond about ±52° (outside what the ISS can see). None of them is yellow, so the colour test ignores them. Nothing is cropped or masked.
- **Sections:** one continuous sequence. 0–3 s: empty map; 3–10 s: lightning builds up; 10–95 s: continuous; 95–100 s: fades out. All of it is used, at the original pace.
- **What a flash looks like:** a yellow dot about 3–5 px across at 4096 px wide (around RGB 255, 255, 20 at the centre). It switches on, stays about 0.4–0.7 s and switches off, with no fade. The picture updates almost every 1/60 s; busy regions merge into large yellow blobs.
- **Method (events mode):** the video is decoded at 30 fps and 2048×1024. A pixel is lightning when (R+G)/2 − B > 30. Each data frame (0.5 s) adds up its 15 decoded frames: *new lightning* = pixels that turn yellow from one decoded frame to the next; *coverage* = share of each grid cell that is yellow, averaged over the frame. `flashes` = cells with new lightning ≥ 20 % of the cell area (capped at 16). `pan` = centre of those cells weighted by new lightning, or the shared `pan_of(grid)` when there are none. Grid = coverage ÷ 0.5, rows 0–2 and 13–15 always 0 (outside ISS coverage). `value` = mean grid over rows 3–12. `brightness` = mean luminance of rows 3–12 above the emptiest frame (the start of the video), ÷ 10 luminance units. `density` = share of rows 3–12 cells with ≥ 2 % coverage. `motion` = shared definition. `warmth` = red-vs-blue balance of lightning pixels.
- **Known limits:** from about 80 s on, fewer new dots appear per half second while coverage stays high, so there are fewer `flashes` in the last ~20 s.
- **Processing:** `scripts/extract_frames.sh lightning 2 --video-only --video-fps 30` (web video 1440×720, 30 fps, H.264 CRF 23, no audio, faststart, 10.1 MB, 100.1 s; same timestamps as the source, so it stays in sync with the 200 data frames); then `python3 src/analysis/analyze.py lightning raw/lightning/source.mp4` (reads the video directly; no PNG frames are written).

### co2
- **Page:** https://svs.gsfc.nasa.gov/5196/ (SVS #5196, "DYAMOND Global Carbon Dioxide")
- **Credit:** NASA's Scientific Visualization Studio. Data: DYAMOND GEOS model (global CO₂, January–March 2020).
- **Video:** `dyamondPointCloud_12-1-2023b_dyamond_co2_anim_globe_orbit_1080p30_h265.mp4`, saved as `raw/co2/source.mp4`. 1920×1080, HEVC, 30 fps, 39.2 s (1176 frames). A 3D globe with the camera orbiting; **not a flat map**. The SVS page offers no flat-map or fixed-camera version (its other videos are zooms on the US and a fly-through).
- **Data dates:** the video has a date label, from "14 Jan 2020 22:00:00.000" to "03 Mar 2020 08:00", about one model hour per video frame.
- **Colorbar:** `dyamondCbar_6-27-2024a.png`, saved as `raw/co2/colorbar.png`. The strip is at x 239–1681, y 324–539 of the 1920×1080 image. **It has no ppm labels**, and the SVS page gives no range either (only "Global CO2 ppm"), so `value` is a relative 0–1 position on the colorbar, not ppm. The strip shows colour *and* opacity: 0–0.25 grey → white, opacity rising from about 0 to 0.5; 0.25–0.5 white → cream, about 50 % opaque; from about 0.6 fully opaque tan → yellow-orange → orange → red at 1.0. Unlabelled ticks sit at 0, 0.5, 0.75 and 1.0.
- **Overlays / masking:** the date label (bottom right, about x 1551–1881, y 1018–1039; masked with padding as x 1520–1910, y 1005–1055 because its width varies). Only pixels inside the globe disc are analysed (centre about (955, 538), radius about 468 px at 1920×1080; the outer 2 % is skipped because of the bright limb). No cropping.
- **Camera (time → region facing the viewer):**

  | Video time | Dates (approx.) | Facing |
  |---|---|---|
  | 0–7 s | 14–23 Jan | East Asia, Southeast Asia and Australia (about 120° E) |
  | 7–13 s | 23–31 Jan | India and the Indian Ocean |
  | 13–23 s | 31 Jan – 12 Feb | Africa (east first, then west) |
  | 23–29 s | 12–20 Feb | Gulf of Guinea and the Atlantic Ocean |
  | 29–39 s | 20 Feb – 3 Mar | South America and the Amazon (about 70° W at the end) |

  The camera turns about 190° westward in total and tilts slightly from a northern view toward the equator. The globe itself does not move or zoom on screen.
- **Daily pulse:** high CO₂ near the ground (Amazon, central Africa, Southeast Asia) grows and fades once per model day, every 24 frames (0.8 s), swinging between about 0.2 % and 9 % of the visible disc.
- **Method (globe mode):** decoded at 1280×720 (the web video size). A pixel inside the disc is read when it is bright enough (max channel ≥ 60), saturated (≥ 0.45) and its hue lies on the opaque part of the colorbar; its colorbar position (0.6–1.0) comes from nearest-hue lookup (the colorbar hue is flat below 0.6, so tan reads as 0.6). All other disc pixels count as 0. Grid = average level per screen cell (40 × 45 px) over the disc pixels in it; `value` = average level over the disc; `density` = share of the disc that is readable; `brightness` = mean luminance of the disc; `warmth` = red-vs-blue balance of the disc. Each data frame averages the 24 source frames (one model day) centred on it. `pan` and `motion` use the shared definitions on the screen grid, so they include the camera turn. `flashes` = 0.
- **Known limits:** relative values only (no ppm); low and medium CO₂ can't be read; the numbers follow which region faces the camera, not a global trend; the grid is a screen grid, not a map.
- **Processing:** `scripts/extract_frames.sh co2 2 --video-only` (web video 1280×720, 30 fps, H.264 CRF 23, no audio, faststart, 3.5 MB, 39.2 s; same frames and timing as the source); then `python3 src/analysis/analyze.py co2 raw/co2/source.mp4 --colorbar raw/co2/colorbar.png`.

### Tools
- Tone.js for audio synthesis (MIT licence).
