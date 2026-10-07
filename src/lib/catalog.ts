import raw from '@/data/stations-de.json';

import { compact, normalize } from './text';
import type { Station } from './types';

export const germanStations: Station[] = (raw as Station[]).map((s, index) => ({
  ...s,
  genres: s.genres ?? [],
  rank: s.rank ?? index + 1,
  bundled: true,
}));

const byId = new Map(germanStations.map((s) => [s.id, s]));
const byRbId = new Map(germanStations.filter((s) => s.rbId).map((s) => [s.rbId as string, s]));
const byName = new Map(germanStations.map((s) => [compact(s.name), s]));

export function bundledStation(id: string) {
  return byId.get(id);
}

export function bundledByRbId(rbId: string) {
  return byRbId.get(rbId);
}

export function bundledByName(name: string) {
  return byName.get(compact(name));
}

export function stationsByGenre(genre: string) {
  return germanStations.filter((s) => s.genres.includes(genre));
}

export function stationsByGenres(genres: string[], limit = 20) {
  return germanStations.filter((s) => s.genres.some((g) => genres.includes(g))).slice(0, limit);
}

export function stationsByState(state: string) {
  return germanStations.filter((s) => s.state === state);
}

export function stationsByNetwork(network: string) {
  return germanStations.filter((s) => s.network === network);
}

const index = germanStations.map((s) => ({
  station: s,
  name: normalize(s.name),
  nameCompact: compact(s.name),
  extra: normalize([s.tagline, s.city, s.genres.join(' ')].filter(Boolean).join(' ')),
}));

export function searchBundled(query: string, genreMatcher?: (q: string) => string[]) {
  const q = normalize(query);
  if (!q) return [];
  const qc = q.replace(/\s+/g, '');
  const genres = genreMatcher?.(q) ?? [];
  const scored: { station: Station; score: number }[] = [];
  for (const entry of index) {
    let score = 0;
    if (entry.name === q || entry.nameCompact === qc) score = 100;
    else if (entry.name.startsWith(q) || entry.nameCompact.startsWith(qc)) score = 80;
    else if (entry.name.includes(q) || entry.nameCompact.includes(qc)) score = 60;
    else if (q.split(' ').every((part) => entry.name.includes(part) || entry.extra.includes(part))) score = 35;
    else if (genres.some((g) => entry.station.genres.includes(g))) score = 25;
    if (score > 0) scored.push({ station: entry.station, score: score - (entry.station.rank ?? 999) / 1000 });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.station);
}
