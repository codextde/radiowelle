import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { kvStorage } from '@/lib/storage';

export type Appearance = 'system' | 'light' | 'dark';

type SettingsState = {
  language: string;
  country: string;
  region: string | null;
  appearance: Appearance;
  autoplay: boolean;
  songHistory: boolean;
  recentSearches: string[];
  setLanguage: (language: string) => void;
  setCountry: (country: string) => void;
  setRegion: (region: string | null) => void;
  setAppearance: (appearance: Appearance) => void;
  setAutoplay: (value: boolean) => void;
  setSongHistory: (value: boolean) => void;
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
};

function defaultCountry() {
  const region = getLocales()[0]?.regionCode;
  return region && /^[A-Z]{2}$/.test(region) ? region : 'DE';
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'system',
      country: defaultCountry(),
      region: null,
      appearance: 'system',
      autoplay: false,
      songHistory: true,
      recentSearches: [],
      setLanguage: (language) => set({ language }),
      setCountry: (country) => set({ country }),
      setRegion: (region) => set({ region }),
      setAppearance: (appearance) => set({ appearance }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setSongHistory: (songHistory) => set({ songHistory }),
      addRecentSearch: (query) =>
        set((s) => {
          const value = query.trim();
          if (value.length < 2) return s;
          const rest = s.recentSearches.filter((q) => q.toLowerCase() !== value.toLowerCase());
          return { recentSearches: [value, ...rest].slice(0, 8) };
        }),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    { name: 'settings', storage: kvStorage, version: 1 }
  )
);
