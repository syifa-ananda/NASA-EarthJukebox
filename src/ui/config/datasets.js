// UI-only catalogue of jukebox records. Add, remove or reorder records here.
//
// This file never replaces public/data/index.json (Person 1's manifest).
// At load time mergeRecords() combines the two:
//   - index.json wins for title, description, colorMeaning, source, credit.
//   - A record listed in index.json is playable; any other record is shown
//     as "Coming soon" using the placeholder text below.
//
// Fields:
//   id           folder / manifest id
//   shortTitle   compact title for the record card
//   title        fallback full title (index.json's title wins)
//   soundHint    one line on how it sounds
//   accent       decorative colour for the record label. Chosen to reach at
//                least 3:1 against every panel background in both themes.
//                It is never used for text and never carries meaning alone.
//   description  placeholder, only shown while the record is not in index.json
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
//   sounds       visual→sound mappings ({ from, to, detail }) for the info panel.
//                Playable records: kept in line with src/audio/CONTRACT.md §6 and
//                src/audio/presets/<id>.js. Coming-soon records: planned placeholders.

export const RECORDS = [
  {
    id: 'sst',
    shortTitle: 'Sea Surface Temperature',
    title: 'Global Sea Surface Currents and Temperature',
    soundHint: 'Flowing pads whose melody follows the seasons',
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
    aspect: 640 / 320,
    // docs/sources.md → sst → "Data dates: 2007-03-25 to 2008-03-03".
    time: { kind: 'dates', start: '2007-03-25', end: '2008-03-03', precision: 'month' },
    // docs/data-contract.md §4: value = temperature / 32 °C.
    valueUnit: { scale: 32, unit: '°C', round: 1 },
    sounds: [
      { from: 'The seasons', to: 'melody', detail: 'The melody climbs as the northern oceans warm toward the northern summer, is highest around August and September, and sinks again as the southern oceans warm.' },
      { from: 'Change in the currents', to: 'pad swells', detail: 'When the currents change faster, the pads swell louder and the tempo lifts a little.' },
      { from: 'Brightness', to: 'loudness and tone', detail: 'A brighter picture sounds louder and more open.' },
      { from: 'Warm water on the map', to: 'number of notes', detail: 'More warm ocean adds chord notes and soft bells on top.' },
      { from: 'Where the activity is', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
      { from: 'Explore mode', to: 'notes and ticks', detail: 'Warmer water plays higher notes; land plays a soft tick.' },
    ],
  },
  {
    id: 'nightlights',
    shortTitle: 'Night Lights',
    title: 'Change in Night Lights 2012–2023',
    soundHint: 'Bells that multiply year by year as cities grow',
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
      { from: 'Amount of light', to: 'loudness and number of bells', detail: 'The more light on the map, the louder and brighter the music and the more bells ring, so it fills in from 2012 to 2023.' },
      { from: 'Light level', to: 'pitch', detail: 'More light plays higher notes. It dips a little in 2020 and climbs most in 2022 and 2023.' },
      { from: 'A new year', to: 'low chime', detail: 'A low chime marks the start of each year.' },
      { from: 'Lit area', to: 'harmony', detail: 'More lit land adds notes to the quiet pad underneath.' },
      { from: 'Where the lights are', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'lightning',
    shortTitle: 'Lightning from the ISS',
    title: 'Lightning Events Detected from the ISS 2017–2023',
    soundHint: 'A thunder thump for every storm burst',
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
    sounds: [
      { from: 'Storm bursts', to: 'thunder and crackle', detail: 'Each storm bursting on the map is a deep thunder thump with a crackle on top. Busy moments sound like a drum roll.' },
      { from: 'Where the storm bursts', to: 'left or right', detail: 'Each hit is placed where the storm bursts: west in your left ear, east in your right.' },
      { from: 'Lightning activity', to: 'pad', detail: 'A quiet minor-key pad grows louder and higher once a year, when storms spread across the north in the northern summer.' },
      { from: 'Change between frames', to: 'trembling and tempo', detail: 'When storms move fast, the pad trembles and the tempo speeds up.' },
      { from: 'Start and end', to: 'quiet', detail: 'The start and the last twenty seconds are quiet while the video builds up and fades out.' },
    ],
  },
  {
    id: 'co2',
    shortTitle: 'Carbon Dioxide',
    title: 'DYAMOND Global Carbon Dioxide',
    soundHint: 'A low drone that thickens over East Asia and the Amazon',
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
    aspect: 1280 / 720,
    // docs/sources.md → co2: date label "14 Jan 2020 22:00" to "03 Mar 2020 08:00".
    time: { kind: 'dates', start: '2020-01-14T22:00', end: '2020-03-03T08:00', precision: 'day' },
    sounds: [
      { from: 'Carbon dioxide in view', to: 'drone pitch and brightness', detail: 'When places with a lot of carbon dioxide come into view, the drone lifts and sounds brighter.' },
      { from: 'Spread of high carbon dioxide', to: 'thicker, louder drone', detail: 'The more of the globe shows high carbon dioxide, the more voices the drone has.' },
      { from: 'Highest levels', to: 'clashing note', detail: 'A tense, clashing note creeps in when the highest levels are in view.' },
      { from: 'The turning globe', to: 'the whole sound', detail: 'East Asia at the start and the Amazon at the end sound thick and tense; Africa and the Atlantic sound thin.' },
      { from: 'Position on screen', to: 'left or right', detail: 'Sounds on the left come from the left side of the globe on screen, sounds on the right from the right side.' },
    ],
  },
  {
    id: 'aerosols',
    shortTitle: 'Aerosols',
    title: 'GEOS Aerosols',
    soundHint: 'Layered textures, one voice for each kind of particle',
    accent: '#b5651d',
    description:
      'A computer model of tiny particles in the air, such as dust, sea salt, smoke and pollution, as the wind carries them around the globe.',
    legend: null,
    summary: { subject: 'aerosols', high: 'Most aerosols' },
    sounds: [
      { from: 'Kind of particle', to: 'instrument', detail: 'Dust, sea salt and smoke each get their own voice.' },
      { from: 'Amount', to: 'loudness', detail: 'Thicker haze plays louder.' },
    ],
  },
  {
    id: 'air-quality',
    shortTitle: 'Air Quality',
    title: 'Air Quality Model Runs',
    soundHint: 'A hum that thickens as pollution builds up',
    accent: '#2b8a3e',
    description:
      'Computer forecasts of air pollution near the ground, showing how pollution builds up over cities and drifts with the weather.',
    legend: null,
    summary: { subject: 'air pollution', high: 'Most pollution' },
    sounds: [
      { from: 'Pollution level', to: 'pitch and texture', detail: 'Dirtier air makes the hum higher and thicker.' },
      { from: 'Where pollution builds up', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'perpetual-ocean',
    shortTitle: 'Perpetual Ocean 2',
    title: 'Perpetual Ocean 2',
    soundHint: 'Flowing arpeggios that follow the ocean currents',
    accent: '#1c7ed6',
    description:
      'Ocean surface currents drawn as flowing streaks, showing swirling eddies and great currents like the Gulf Stream that carry water and heat around the planet.',
    legend: null,
    summary: { subject: 'ocean currents', high: 'Fastest currents' },
    sounds: [
      { from: 'Current speed', to: 'tempo', detail: 'Faster currents play faster arpeggios.' },
      { from: 'Where the currents are', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'atmospheric-river',
    shortTitle: 'Atmospheric River 3D',
    title: 'Atmospheric River 3D',
    soundHint: 'A rising wash of sound as moisture flows ashore',
    accent: '#5c7cfa',
    description:
      'A 3D view of an atmospheric river: a long, narrow band of water vapour flowing through the sky that can bring heavy rain and snow when it reaches land.',
    legend: null,
    summary: { subject: 'water vapour', high: 'Most water vapour' },
    sounds: [
      { from: 'Water vapour', to: 'loudness and pitch', detail: 'Wetter air swells louder and higher.' },
      { from: 'Where the river flows', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'gedi-forest',
    shortTitle: 'GEDI Forest Height',
    title: 'GEDI Forest Height',
    soundHint: 'Deep notes for tall forests, light notes for open land',
    accent: '#5c940d',
    description:
      'Forest canopy height measured by GEDI, a laser instrument on the International Space Station. Taller forests usually store more carbon.',
    legend: null,
    summary: { subject: 'forest height', high: 'Tallest forests' },
    sounds: [
      { from: 'Canopy height', to: 'pitch', detail: 'Taller forests play lower, deeper notes.' },
      { from: 'Forest cover', to: 'number of notes', detail: 'Denser forest adds more notes.' },
    ],
  },
];

const DEFAULT_ACCENT = '#6f7ba0';

/**
 * Combine the UI catalogue with the manifest entries from index.json.
 * Returns records in catalogue order, followed by any manifest entries the
 * catalogue does not know about yet (so new data shows up automatically).
 */
export function mergeRecords(indexEntries = []) {
  const byId = new Map(indexEntries.map((e) => [e.id, e]));
  const known = new Set(RECORDS.map((r) => r.id));

  const merged = RECORDS.map((cfg) => {
    const entry = byId.get(cfg.id) ?? null;
    return {
      id: cfg.id,
      shortTitle: cfg.shortTitle,
      title: entry?.title ?? cfg.title,
      description: entry?.description ?? cfg.description ?? '',
      colorMeaning: entry?.colorMeaning ?? cfg.colorMeaning ?? '',
      source: entry?.source ?? '',
      credit: entry?.credit ?? 'NASA/SVS',
      soundHint: cfg.soundHint,
      accent: cfg.accent ?? DEFAULT_ACCENT,
      legend: cfg.legend ?? null,
      summary: cfg.summary ?? { subject: cfg.shortTitle.toLowerCase(), high: 'Highest values' },
      gridKind: cfg.gridKind ?? 'world-map',
      westLon: cfg.westLon ?? -180,
      dataOn: cfg.dataOn ?? 'any',
      aspect: cfg.aspect ?? 2,
      time: cfg.time ?? null,
      valueUnit: cfg.valueUnit ?? null,
      quiet: cfg.quiet ?? null,
      sounds: cfg.sounds ?? [],
      playable: !!entry,
      mock: !!entry?.mock,
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
      soundHint: 'Sound design coming soon',
      accent: DEFAULT_ACCENT,
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
      sounds: [],
      playable: true,
      mock: !!entry.mock,
      entry,
    });
  }

  return merged;
}

/** Short status phrase used on badges and in announcements. */
export function statusLabel(record) {
  if (!record.playable) return 'Coming soon';
  if (record.mock) return 'Mock data';
  return 'Ready to play';
}

/** Badge style for a record: 'ready' | 'mock' | 'soon'. */
export function statusKind(record) {
  if (!record.playable) return 'soon';
  return record.mock ? 'mock' : 'ready';
}
