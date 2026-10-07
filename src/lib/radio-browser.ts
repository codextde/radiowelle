import { Platform } from 'react-native';

import { bundledByName, bundledByRbId } from './catalog';
import { cleanStationName, compact } from './text';
import { GENRE_TAGS, type Genre, type Station } from './types';

const SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
];

const USER_AGENT = `Radiowelle/1.0 (${Platform.OS}; codext.de)`;

let preferred = 0;

export type RBStation = {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  countrycode: string;
  iso_3166_2: string | null;
  state: string;
  language: string;
  languagecodes: string;
  votes: number;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  clickcount: number;
  clicktrend: number;
  has_extended_info?: boolean;
};

export type RBCountry = { name: string; iso_3166_1: string; stationcount: number };

async function request<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const query = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  let lastError: unknown;
  for (let attempt = 0; attempt < SERVERS.length; attempt++) {
    const serverIndex = (preferred + attempt) % SERVERS.length;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${SERVERS[serverIndex]}${path}${query}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as T;
      preferred = serverIndex;
      return data;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

const tagToGenre = new Map<string, Genre>();
for (const [genre, tags] of Object.entries(GENRE_TAGS) as [Genre, string[]][]) {
  for (const tag of tags) if (!tagToGenre.has(tag)) tagToGenre.set(tag, genre);
}

export function genresFromTags(tags: string) {
  const result: Genre[] = [];
  for (const raw of tags.split(',')) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    const genre = tagToGenre.get(tag) ?? (/\b80/.test(tag) ? '80s' : /\b90/.test(tag) ? '90s' : undefined);
    if (genre && !result.includes(genre)) result.push(genre);
    if (result.length >= 3) break;
  }
  return result;
}

export function fromRadioBrowser(rb: RBStation): Station {
  const bundled = bundledByRbId(rb.stationuuid);
  if (bundled) return bundled;
  const name = cleanStationName(rb.name) || rb.name.trim();
  if (rb.countrycode === 'DE') {
    const byName = bundledByName(name);
    if (byName) return byName;
  }
  const favicon = rb.favicon?.trim();
  return {
    id: rb.stationuuid,
    rbId: rb.stationuuid,
    name,
    tagline: null,
    url: rb.url_resolved || rb.url,
    homepage: rb.homepage || null,
    logo: favicon && /^https?:\/\//.test(favicon) ? favicon : null,
    color: null,
    country: (rb.countrycode || '').toUpperCase(),
    state: rb.iso_3166_2 || null,
    city: null,
    network: null,
    genres: genresFromTags(rb.tags ?? ''),
    language: rb.languagecodes?.split(',')[0]?.toLowerCase() || null,
    codec: rb.codec || null,
    bitrate: rb.bitrate || null,
    hls: rb.hls === 1,
    votes: rb.votes,
  };
}

function dedupe(list: RBStation[]) {
  const seen = new Map<string, Station>();
  const order: string[] = [];
  for (const rb of list) {
    if (rb.lastcheckok !== 1) continue;
    const url = rb.url_resolved || rb.url;
    if (!url || !/^https?:\/\//.test(url)) continue;
    const station = fromRadioBrowser(rb);
    const key = station.bundled ? `b:${station.id}` : `${compact(station.name)}:${station.country}`;
    if (!seen.has(key)) {
      seen.set(key, station);
      order.push(key);
    }
  }
  return order.map((k) => seen.get(k) as Station);
}

type SearchOptions = {
  name?: string;
  countrycode?: string;
  tagList?: string;
  tag?: string;
  language?: string;
  state?: string;
  limit?: number;
  offset?: number;
  order?: 'clickcount' | 'votes' | 'clicktrend' | 'name' | 'bitrate';
};

export async function searchStations(options: SearchOptions) {
  const { limit = 50, offset = 0, order = 'clickcount', ...rest } = options;
  const list = await request<RBStation[]>('/json/stations/search', {
    ...rest,
    limit,
    offset,
    order,
    reverse: order !== 'name',
    hidebroken: true,
  });
  return dedupe(list);
}

export function topStations(countrycode: string, limit = 60, offset = 0) {
  return searchStations({ countrycode, limit, offset, order: 'clickcount' });
}

export function stationsByGenre(genre: Genre, countrycode?: string, limit = 60, offset = 0) {
  const tag = GENRE_TAGS[genre]?.[0] ?? genre;
  return searchStations({ tag, countrycode, limit, offset, order: 'clickcount' });
}

export async function stationsByUuids(uuids: string[]) {
  if (uuids.length === 0) return [];
  const list = await request<RBStation[]>('/json/stations/byuuid', { uuids: uuids.join(',') });
  return list.map(fromRadioBrowser);
}

export async function countries() {
  const list = await request<RBCountry[]>('/json/countries', { order: 'stationcount', reverse: true, hidebroken: true });
  const merged = new Map<string, RBCountry>();
  for (const c of list) {
    const code = c.iso_3166_1?.toUpperCase();
    if (!code || code.length !== 2 || c.stationcount < 3) continue;
    const existing = merged.get(code);
    if (existing) existing.stationcount += c.stationcount;
    else merged.set(code, { ...c, iso_3166_1: code });
  }
  return [...merged.values()].sort((a, b) => b.stationcount - a.stationcount);
}

export async function stats() {
  return request<{ stations: number; stations_broken: number; countries: number }>('/json/stats');
}
