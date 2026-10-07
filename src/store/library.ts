import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { bundledStation } from '@/lib/catalog';
import { kvStorage } from '@/lib/storage';
import type { Station } from '@/lib/types';

export type SongEntry = {
  id: string;
  artist: string | null;
  title: string;
  stationId: string;
  stationName: string;
  at: number;
};

type LibraryState = {
  favorites: Station[];
  recents: { station: Station; playedAt: number }[];
  songs: SongEntry[];
  toggleFavorite: (station: Station) => boolean;
  removeFavorite: (id: string) => void;
  moveFavorite: (from: number, to: number) => void;
  setFavorites: (stations: Station[]) => void;
  addRecent: (station: Station) => void;
  clearRecents: () => void;
  addSong: (song: { artist: string | null; title: string | null }, station: Station) => void;
  removeSong: (id: string) => void;
  clearSongs: () => void;
};

export function hydrate(station: Station): Station {
  if (station.bundled) return bundledStation(station.id) ?? station;
  return station;
}

function snapshot(station: Station): Station {
  return { ...station };
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recents: [],
      songs: [],
      toggleFavorite: (station) => {
        const exists = get().favorites.some((s) => s.id === station.id);
        set((s) => ({
          favorites: exists ? s.favorites.filter((f) => f.id !== station.id) : [...s.favorites, snapshot(station)],
        }));
        return !exists;
      },
      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),
      moveFavorite: (from, to) =>
        set((s) => {
          const list = [...s.favorites];
          const [item] = list.splice(from, 1);
          if (!item) return s;
          list.splice(Math.max(0, Math.min(list.length, to)), 0, item);
          return { favorites: list };
        }),
      setFavorites: (favorites) => set({ favorites }),
      addRecent: (station) =>
        set((s) => ({
          recents: [{ station: snapshot(station), playedAt: Date.now() }, ...s.recents.filter((r) => r.station.id !== station.id)].slice(0, 40),
        })),
      clearRecents: () => set({ recents: [] }),
      addSong: (song, station) =>
        set((s) => {
          const title = song.title?.trim();
          if (!title) return s;
          const last = s.songs[0];
          if (
            last &&
            last.stationId === station.id &&
            last.title === title &&
            last.artist === song.artist &&
            Date.now() - last.at < 30 * 60 * 1000
          ) {
            return s;
          }
          const entry: SongEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            artist: song.artist,
            title,
            stationId: station.id,
            stationName: station.name,
            at: Date.now(),
          };
          return { songs: [entry, ...s.songs].slice(0, 500) };
        }),
      removeSong: (id) => set((s) => ({ songs: s.songs.filter((x) => x.id !== id) })),
      clearSongs: () => set({ songs: [] }),
    }),
    { name: 'library', storage: kvStorage, version: 1 }
  )
);

export function useIsFavorite(id: string | undefined) {
  return useLibrary((s) => (id ? s.favorites.some((f) => f.id === id) : false));
}
