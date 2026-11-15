// UI-only catalogue of jukebox records. Add, remove or reorder records here.
//
// This file never replaces public/data/index.json (Person 1's manifest).
// At load time mergeRecords() combines the two:
//   - Only datasets listed in index.json are shown. An entry here that is not
//     in index.json is ignored, so UI settings can be prepared ahead of the data.
//   - index.json wins for title, description, colorMeaning, source, credit.
//   - A dataset in index.json with no entry here still appears, with neutral
//     defaults (screen-grid place words, no dates), so new data shows up at once.
//
// Fields:
//   id           folder / manifest id
//   shortTitle   compact title for the record card
//   title        fallback full title (index.json's title wins)
//   shortDescription  one line of UI copy under the card title
//   soundHint    one line on how it sounds (read with the card, visually hidden)
//   accent       decorative tint for the record card's background gradient.
//                It is never used for text and never carries meaning alone.
//   photo        decorative card thumbnail (CSS background, cover, never read
//                out), relative to index.html. null = a CSS placeholder for this
//                id (styles.css → .thumb). To add photos: put them in
//                src/ui/img/cards/, set photo: 'src/ui/img/cards/<id>.jpg' and
//                credit them in src/ui/img/cards/CREDITS.md.
//   legend       { stops: [low → high colours], low, high } for the heatmap
//                fallback and the legend bar; null if the colour key is unknown
//   summary      { subject, high, preposition? } wording for "where is it highest"
//                sentences, e.g. "Brightest lights over Japan" (preposition defaults to 'over')
//   gridKind     'world-map': the 32 × 16 grid is a whole-world flat map, so
//                explore mode names regions (src/ui/regions.js).
//                'screen': the grid covers the picture, not the Earth (co2's
//                turning globe), so only picture positions are used.
//   westLon      world maps only: longitude of the grid's left edge (default −180)
//   dataOn       world maps only: 'water' | 'land' | 'any', where the values live,
//                so coastal cells can be named "Coast near …" (see regions.js)
//   aspect       width / height of the video (docs/sources.md); used until the
//                video's own size is known, and for the heatmap fallback
//   time         what a frame means in time, for the timeline and narration.
//                Taken from docs/sources.md; frames are spread evenly between
//                start and end. null = no dates (lightning has none on purpose).
//                  { kind: 'yearBlocks', startYear, framesPerYear }
//                  { kind: 'dates', start, end, precision: 'month' | 'day' }
//   valueUnit    optional { scale, unit, round }: grid value × scale = a real
//                quantity (sst: value = °C / 32, docs/data-contract.md §4)
//   quiet        optional { field, frames, text }: when `field` is 0 for this
//                many frames in a row, narration says `text` once and waits
//   emptyLabel   optional: what an empty grid cell (value 0) means, for explore.
//                Wins over the engine's probe label when set.
//   emptyWaterLabel  optional, world maps only: what an empty cell means where
//                the map is water (sst: sea ice near the poles, not land).
//   outside      optional { rows, label }: grid rows the instrument can't see at
//                all; explore reads their (always 0) cells with `label`
//   keepClear    optional { left, top, right, bottom } (fractions of the picture):
//                part of the video that UI overlays must not cover (co2 date label)
//   valueUnit.bands  optional [{ min, words }], highest min first: a short plain
//                descriptor after the number ("about 28 °C, warm tropical water")
//   sounds       visual→sound mappings ({ from, to, detail, alarmOnly? }) for the info
//                panel, kept in line with src/audio/CONTRACT.md §6–7 and the acoustic mix
//                in src/audio/presets/<id>.js. alarmOnly lines show only while the
//                climate alarm is switched on.

export const RECORDS = [
  {
    id: 'sst',
    photo: null,
    shortTitle: 'Sea Surface Temperature',
    title: 'Global Sea Surface Currents and Temperature',
    shortDescription: 'Ocean surface warmth through the seasons.',
    soundHint: 'Slow strings and a wordless choir that follow the seasons',
    accent: '#d9480f',
    legend: {
      // The SVS colorbar: blue 0 °C → green → yellow → red 32 °C.
      stops: ['#1b3a9e', '#1f7fd1', '#27b0b0', '#3fb34f', '#d8d33a', '#f08c1e', '#d7191c'],
      low: 'Cold, 0 °C',
      high: 'Hot, 32 °C',
    },
    // 'near': the warmest cells are often coastal cells named after the land (Persian Gulf → Middle East).
    summary: { subject: 'sea surface temperature', high: 'Warmest water', preposition: 'near' },
    gridKind: 'world-map',
    dataOn: 'water',
    westLon: -180,
    // Empty cells over the sea are sea ice (Arctic, around Antarctica); the
    // engine's label ("land, where there is no ocean data") is right for land only.
    emptyWaterLabel: 'sea ice or no ocean data',
    aspect: 640 / 320,
    // docs/sources.md → sst → "Data dates: 2007-03-25 to 2008-03-03".
    time: { kind: 'dates', start: '2007-03-25', end: '2008-03-03', precision: 'month' },
    // docs/data-contract.md §4: value = temperature / 32 °C.
    valueUnit: {
      scale: 32,
      unit: '°C',
      round: 1,
      // Person 1's wording tips: ≥ 25 °C warm tropical, 10–25 °C mild, < 10 °C cold.
      bands: [
        { min: 25, words: 'warm tropical water' },
        { min: 10, words: 'mild water' },
        { min: -Infinity, words: 'cold water' },
      ],
    },
    sounds: [
      { from: 'The seasons', to: 'melody', detail: 'The melody climbs as the northern oceans warm toward the northern summer, is highest around August and September, and sinks again as the southern oceans warm.' },
      { from: 'Change in the currents', to: 'choir swells', detail: 'When the currents change faster, the wordless choir swells and the tempo lifts a little.' },
      { from: 'Brightness', to: 'loudness and tone', detail: 'A brighter picture sounds louder and more open.' },
      { from: 'Warm water on the map', to: 'number of notes', detail: 'More warm ocean adds notes to the strings and a few harp notes on top.' },
      { from: 'Where the activity is', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
      { from: 'Explore mode', to: 'notes and ticks', detail: 'Warmer water plays higher notes; land and sea ice play a soft tick.' },
    ],
  },
  {
    id: 'nightlights',
    photo: null,
    shortTitle: 'Night Lights',
    title: 'Change in Night Lights 2012–2023',
    shortDescription: 'City lights across the globe.',
    soundHint: 'Bamboo angklung and harp that fill in as cities grow',
    accent: '#a87a00',
    legend: {
      stops: ['#000000', '#2b2100', '#7a5c00', '#e0b000', '#fff2a8', '#ffffff'],
      low: 'Dark, no lights',
      high: 'Bright city lights',
    },
    summary: { subject: 'night lights', high: 'Brightest lights' },
    gridKind: 'world-map',
    dataOn: 'land',
    // docs/sources.md → nightlights: "column 0 starts at about 168° W".
    westLon: -168,
    aspect: 1280 / 720,
    // docs/data-contract.md §4: frames 5k to 5k+4 belong to year 2012 + k.
    time: { kind: 'yearBlocks', startYear: 2012, framesPerYear: 5 },
    sounds: [
      { from: 'Amount of light', to: 'loudness and number of notes', detail: 'The more light on the map, the louder and brighter the angklung plays and the more notes ring, so it fills in from 2012 to 2023.' },
      { from: 'Light level', to: 'pitch', detail: 'More light plays higher notes. It dips a little in 2020 and climbs most in 2022 and 2023.' },
      { from: 'A new year', to: 'low angklung chord', detail: 'A low angklung chord marks the start of each year.' },
      { from: 'Brightness', to: 'bass', detail: 'A wooden marimba bass holds the low root and fifth and grows with the light.' },
      { from: 'Where the lights are', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'lightning',
    photo: null,
    shortTitle: 'Lightning from the ISS',
    title: 'Lightning Events Detected from the ISS 2017–2023',
    shortDescription: 'Every lightning burst from space.',
    soundHint: 'A hand-drum stroke for every storm burst',
    accent: '#3b7dd8',
    legend: {
      stops: ['#000000', '#2b2a10', '#6e6a12', '#c9c21a', '#ffef3a', '#fffbb0'],
      low: 'No lightning',
      high: 'Lightning (yellow dots)',
    },
    summary: { subject: 'lightning activity', high: 'Most lightning' },
    gridKind: 'world-map',
    dataOn: 'any', // lightning strikes over land and sea
    westLon: -180,
    aspect: 1440 / 720,
    // docs/sources.md → lightning: "The video has no date labels, so we do not
    // assign dates to frames." The timeline says "frame N of 200" instead.
    time: null,
    // The first ~13 s and the last ~20 s have no storm bursts (docs/data-contract.md §4).
    // Mid-video gaps are at most 2 frames, so 4 frames = a real quiet stretch.
    quiet: { field: 'flashes', frames: 4, text: 'no lightning right now' },
    // Rows 0–2 and 13–15 are beyond about ±52°, which the ISS can't see (Person 1).
    outside: { rows: [0, 1, 2, 13, 14, 15], label: "outside the space station's view" },
    sounds: [
      { from: 'Storm bursts', to: 'hand drums', detail: 'Each storm bursting on the map is a hand-drum stroke. Busy moments become a drum roll with deep frame-drum booms, and the biggest bursts add a wooden log drum.' },
      { from: 'Where the storm bursts', to: 'left or right', detail: 'Each stroke is placed where the storm bursts: west in your left ear, east in your right.' },
      { from: 'Lightning activity', to: 'choir', detail: 'A soft wordless choir grows louder and higher once a year, when storms spread across the north in the northern summer.' },
      { from: 'Change between frames', to: 'trembling and tempo', detail: 'When storms move fast, the choir trembles and the tempo speeds up.' },
      { from: 'Start and end', to: 'quiet', detail: 'The start and the last twenty seconds are quiet, while the video fades in and out.' },
    ],
  },
  {
    id: 'co2',
    photo: null,
    shortTitle: 'Carbon Dioxide',
    title: 'DYAMOND Global Carbon Dioxide',
    shortDescription: 'Atmospheric CO₂ around the world.',
    soundHint: 'An overtone drone and drum heartbeat that follow the turning globe',
    accent: '#b14fc5',
    legend: {
      // Colorbar: faint grey/white haze for lower amounts, then tan → orange → red (highest).
      stops: ['#000000', '#4a4a4a', '#d8d2c4', '#d9a066', '#f07a1a', '#c81e1e'],
      low: 'Faint haze: lower',
      high: 'Red: highest',
    },
    summary: { subject: 'carbon dioxide in view', high: 'Most carbon dioxide in view' },
    // docs/data-contract.md §2: a screen grid on a turning globe, not a map.
    gridKind: 'screen',
    // Person 1: empty cells include both the globe's low-CO2 areas and the black
    // background, so never say "space" or "outside the Earth".
    emptyLabel: 'low or no carbon dioxide here',
    // The video's own date label (docs/sources.md: x 1520–1910, y 1005–1055 of
    // 1920 × 1080), as fractions of the picture. Nothing of ours may cover it.
    keepClear: { left: 0.79, top: 0.93, right: 1, bottom: 0.98 },
    aspect: 1280 / 720,
    // docs/sources.md → co2: date label "14 Jan 2020 22:00" to "03 Mar 2020 08:00".
    time: { kind: 'dates', start: '2020-01-14T22:00', end: '2020-03-03T08:00', precision: 'day' },
    sounds: [
      { from: 'Carbon dioxide in view', to: 'drone and overtone', detail: 'When places with a lot of carbon dioxide come into view, the drone and its whistling overtone sound higher.' },
      { from: 'Spread of high carbon dioxide', to: 'thicker, louder drone', detail: 'The more of the globe shows high carbon dioxide, the more voices the drone has.' },
      { from: 'Carbon dioxide in view', to: 'drum heartbeat', detail: 'A frame-drum heartbeat beats faster when more carbon dioxide is in view and slower when less is.' },
      { from: 'Highest levels in view', to: 'clashing note', detail: 'A tense, clashing note creeps in when the highest levels are in view.' },
      { from: 'Most carbon dioxide in view', to: 'climate alarm', detail: 'A soft wordless voice joins while the most carbon dioxide is in view: East Asia at the start, the Amazon at the end. Switch it off under Sound settings.', alarmOnly: true },
      { from: 'The turning globe', to: 'the whole sound', detail: 'East Asia at the start and the Amazon at the end sound thick and tense; Africa and the Atlantic sound thin.' },
      { from: 'Position on screen', to: 'left or right', detail: 'Sounds on the left come from the left side of the globe on screen, sounds on the right from the right side.' },
    ],
  },
];

const DEFAULT_ACCENT = '#6f7ba0';

/**
 * Combine the UI catalogue with the manifest entries from index.json.
 * Returns the index.json datasets: catalogue order first, then any datasets
 * the catalogue does not know about yet (so new data shows up automatically).
 */
export function mergeRecords(indexEntries = []) {
  const byId = new Map(indexEntries.map((e) => [e.id, e]));
  const known = new Set(RECORDS.map((r) => r.id));

  const merged = RECORDS.filter((cfg) => byId.has(cfg.id)).map((cfg) => {
    const entry = byId.get(cfg.id);
    return {
      id: cfg.id,
      shortTitle: cfg.shortTitle,
      title: entry.title ?? cfg.title,
      description: entry.description ?? '',
      colorMeaning: entry.colorMeaning ?? '',
      source: entry.source ?? '',
      credit: entry.credit ?? 'NASA/SVS',
      shortDescription: cfg.shortDescription ?? '',
      soundHint: cfg.soundHint,
      accent: cfg.accent ?? DEFAULT_ACCENT,
      photo: cfg.photo ?? null,
      legend: cfg.legend ?? null,
      summary: cfg.summary ?? { subject: cfg.shortTitle.toLowerCase(), high: 'Highest values' },
      gridKind: cfg.gridKind ?? 'world-map',
      westLon: cfg.westLon ?? -180,
      dataOn: cfg.dataOn ?? 'any',
      aspect: cfg.aspect ?? 2,
      time: cfg.time ?? null,
      valueUnit: cfg.valueUnit ?? null,
      quiet: cfg.quiet ?? null,
      emptyLabel: cfg.emptyLabel ?? null,
      emptyWaterLabel: cfg.emptyWaterLabel ?? null,
      outside: cfg.outside ?? null,
      keepClear: cfg.keepClear ?? null,
      sounds: cfg.sounds ?? [],
      mock: !!entry.mock,
      entry,
    };
  });

  for (const entry of indexEntries) {
    if (known.has(entry.id)) continue;
    merged.push({
      id: entry.id,
      shortTitle: entry.title,
      title: entry.title,
      description: entry.description ?? '',
      colorMeaning: entry.colorMeaning ?? '',
      source: entry.source ?? '',
      credit: entry.credit ?? 'NASA/SVS',
      shortDescription: '',
      soundHint: 'NASA data, played as music',
      accent: DEFAULT_ACCENT,
      photo: null,
      legend: null,
      summary: { subject: entry.title.toLowerCase(), high: 'Highest values' },
      // Unknown new datasets: describe positions in the picture, never guess places.
      gridKind: 'screen',
      westLon: -180,
      dataOn: 'any',
      aspect: 2,
      time: null,
      valueUnit: null,
      quiet: null,
      emptyLabel: null,
      outside: null,
      keepClear: null,
      sounds: [],
      mock: !!entry.mock,
      entry,
    });
  }

  return merged;
}

/**
 * Badge text for a record, or '' for none. Every listed record is real and
 * ready to play, so only generated test data ("mock": true) gets a badge.
 */
export function statusLabel(record) {
  return record.mock ? 'Mock data' : '';
}

/**
 * Short label for the source pill on the picture ("NASA SVS"), from the
 * record's real source link; '' when the source is not a known host.
 */
export function sourceLabel(record) {
  try {
    if (new URL(record.source).hostname === 'svs.gsfc.nasa.gov') return 'NASA SVS';
  } catch {
    // No or invalid source link: no pill.
  }
  return '';
}
