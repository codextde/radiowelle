export type Station = {
  id: string;
  rbId: string | null;
  name: string;
  tagline: string | null;
  url: string;
  homepage: string | null;
  logo: string | null;
  color: string | null;
  country: string;
  state: string | null;
  city: string | null;
  network: string | null;
  genres: string[];
  language: string | null;
  codec: string | null;
  bitrate: number | null;
  hls: boolean;
  icy?: boolean;
  bundled?: boolean;
  rank?: number;
  votes?: number;
};

export const GENRES = [
  'pop',
  'charts',
  'rock',
  'alternative',
  'metal',
  'electronic',
  'dance',
  'hiphop',
  'rnb',
  'schlager',
  'volksmusik',
  'oldies',
  '80s',
  '90s',
  'classical',
  'jazz',
  'chill',
  'news',
  'talk',
  'culture',
  'kids',
  'sport',
  'christian',
  'country',
  'latin',
  'world',
  'regional',
] as const;

export type Genre = (typeof GENRES)[number];

export const BROWSE_GENRES: Genre[] = [
  'charts',
  'pop',
  'rock',
  'news',
  'electronic',
  'schlager',
  'hiphop',
  'classical',
  '80s',
  '90s',
  'oldies',
  'jazz',
  'chill',
  'culture',
  'alternative',
  'metal',
  'dance',
  'kids',
  'sport',
  'christian',
];

export const GERMAN_STATES = [
  'DE-BW',
  'DE-BY',
  'DE-BE',
  'DE-BB',
  'DE-HB',
  'DE-HH',
  'DE-HE',
  'DE-MV',
  'DE-NI',
  'DE-NW',
  'DE-RP',
  'DE-SL',
  'DE-SN',
  'DE-ST',
  'DE-SH',
  'DE-TH',
] as const;

export const GENRE_TAGS: Record<Genre, string[]> = {
  pop: ['pop'],
  charts: ['top 40', 'hits', 'charts', 'top40', 'chart'],
  rock: ['rock', 'classic rock', 'hard rock'],
  alternative: ['alternative', 'indie'],
  metal: ['metal', 'heavy metal'],
  electronic: ['electronic', 'techno', 'house', 'trance', 'edm'],
  dance: ['dance', 'disco', 'eurodance'],
  hiphop: ['hip hop', 'hiphop', 'rap'],
  rnb: ['rnb', 'r&b', 'soul', 'funk'],
  schlager: ['schlager'],
  volksmusik: ['volksmusik', 'folk'],
  oldies: ['oldies', '60s', '70s'],
  '80s': ['80s'],
  '90s': ['90s'],
  classical: ['classical', 'klassik'],
  jazz: ['jazz', 'smooth jazz'],
  chill: ['chillout', 'lounge', 'ambient', 'chill'],
  news: ['news', 'information', 'nachrichten'],
  talk: ['talk'],
  culture: ['culture', 'kultur'],
  kids: ['kids', 'children'],
  sport: ['sport', 'sports', 'football'],
  christian: ['christian', 'religious', 'gospel'],
  country: ['country'],
  latin: ['latin', 'salsa', 'reggaeton'],
  world: ['world music', 'world', 'ethnic'],
  regional: ['local', 'regional'],
};
