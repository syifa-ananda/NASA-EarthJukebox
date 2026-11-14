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
//   soundHint    one line on how it will sound
//   accent       decorative colour for the record label. Chosen to reach at
//                least 3:1 against every panel background in both themes.
//                It is never used for text and never carries meaning alone.
//   description  placeholder, only shown while the record is not in index.json
//   legend       { stops: [low → high colours], low, high } for the heatmap
//                ramp and the legend bar; null if the colour key is unknown
//   summary      { subject, high } wording for the heatmap's text alternative
//   years        optional { start, end }: the date range the frames cover, so the
//                timeline can say "about 2014". Frames are assumed evenly spaced.
//   sounds       visual→sound mappings ({ from, to, detail }) for the info panel.
//                Playable records: kept in line with src/audio/presets/<id>.js and
//                src/audio/CONTRACT.md. Coming-soon records: planned placeholders.

export const RECORDS = [
  {
    id: 'sst',
    shortTitle: 'Sea Surface Temperature',
    title: 'Global Sea Surface Currents and Temperature',
    soundHint: 'Slow, warm pads that rise in pitch with ocean temperature',
    accent: '#d9480f',
    legend: {
      stops: ['#08306b', '#2171b5', '#6baed6', '#fdd49e', '#fd8d3c', '#d94801', '#7f0000'],
      low: 'Cold water',
      high: 'Warm water',
    },
    summary: { subject: 'sea surface temperature', high: 'Warmest water' },
    // Matches src/audio/presets/sst.js (merged over default.js) and CONTRACT.md §4.
    sounds: [
      { from: 'Water temperature', to: 'pitch', detail: 'Warmer water plays higher notes.' },
      { from: 'Brightness', to: 'loudness and tone', detail: 'A brighter picture sounds louder and more open; a darker one softer and more muffled.' },
      { from: 'Warm or cool colours', to: 'key', detail: 'Redder pictures move the music to a major key, bluer ones to a minor key.' },
      { from: 'Change between frames', to: 'pad swells', detail: 'When the currents move faster, the pads swell louder and the tempo lifts a little.' },
      { from: 'Busy areas on the map', to: 'number of notes', detail: 'A busier map adds more chord notes and more soft bells on top.' },
      { from: 'Where the activity is', to: 'left or right', detail: 'West is in your left ear, east in your right.' },
    ],
  },
  {
    id: 'nightlights',
    shortTitle: 'Night Lights',
    title: 'Change in Night Lights 2012–2023',
    soundHint: 'Glittering bell tones that multiply as cities grow',
    accent: '#a87a00',
    legend: {
      stops: ['#000000', '#2b2100', '#7a5c00', '#e0b000', '#fff2a8', '#ffffff'],
      low: 'Dark, no lights',
      high: 'Bright city lights',
    },
    summary: { subject: 'night lights', high: 'Brightest lights' },
    years: { start: 2012, end: 2023 },
    // Matches src/audio/presets/nightlights.js (merged over default.js).
    sounds: [
      { from: 'Brightness', to: 'number of bells', detail: 'The brighter the map, the more bells ring, so the music fills in from 2012 to 2023.' },
      { from: 'Light level', to: 'pitch', detail: 'Brighter nights play higher notes.' },
      { from: 'Lit area', to: 'harmony', detail: 'More lit land adds more notes to the chord.' },
      { from: 'Warm or cool colours', to: 'key', detail: 'Warmer colours move the music to a major key, cooler ones to a minor key.' },
      { from: 'Where the lights are', to: 'left or right', detail: 'The bells sit where the lights are: west in your left ear, east in your right.' },
    ],
  },
  {
    id: 'lightning',
    shortTitle: 'Lightning from the ISS',
    title: 'Lightning Events Detected from the ISS 2017–2023',
    soundHint: 'Sharp drum hits for every burst of lightning',
    accent: '#3b7dd8',
    legend: {
      stops: ['#000000', '#0b1f45', '#1f4f9e', '#4f8cff', '#c9dcff', '#ffffff'],
      low: 'No lightning',
      high: 'Lightning flash',
    },
    summary: { subject: 'lightning activity', high: 'Most lightning' },
    years: { start: 2017, end: 2023 },
    // Matches src/audio/presets/lightning.js (merged over default.js).
    sounds: [
      { from: 'New flashes', to: 'thunder and crackle', detail: 'Each flash is a deep thunder thump with a crackle on top. Big bursts sound like a drum roll.' },
      { from: 'Where the storms are', to: 'left or right', detail: 'You hear each storm on its side of the map: west in your left ear, east in your right.' },
      { from: 'Change between frames', to: 'trembling and tempo', detail: 'When storms move fast, the pad trembles and the tempo speeds up.' },
      { from: 'Lightning activity', to: 'pitch', detail: 'More activity raises the quiet pad underneath. It always stays in a minor key.' },
      { from: 'Brightness', to: 'loudness and tone', detail: 'A brighter picture sounds louder and more open.' },
    ],
  },
  {
    id: 'co2',
    shortTitle: 'Carbon Dioxide',
    title: 'DYAMOND Global Carbon Dioxide',
    soundHint: 'A low drone that drifts west to east and climbs as carbon dioxide builds up',
    accent: '#b14fc5',
    legend: {
      stops: ['#000000', '#2a1a00', '#6b4a00', '#d9a400', '#fff0a0', '#ffffff'],
      low: 'Less carbon dioxide',
      high: 'More carbon dioxide',
    },
    summary: { subject: 'carbon dioxide', high: 'Most carbon dioxide' },
    // Matches src/audio/presets/co2.js (merged over default.js).
    sounds: [
      { from: 'Amount of carbon dioxide', to: 'drone pitch', detail: 'The drone rises as concentrations rise.' },
      { from: 'Spread of the plumes', to: 'thicker drone', detail: 'As carbon dioxide spreads across the map, the drone adds more voices.' },
      { from: 'High carbon dioxide', to: 'clashing note', detail: 'When levels are high, a tense, clashing note creeps in.' },
      { from: 'Where the plumes are', to: 'left or right', detail: 'The drone drifts from your left ear to your right as the wind carries the plumes east.' },
      { from: 'Brightness', to: 'loudness and tone', detail: 'A brighter picture sounds louder and more open.' },
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
      years: cfg.years ?? null,
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
      years: null,
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
  return '';
}
