import { AppState } from 'react-native';
import { RadioPlayer, type PlaybackError, type PlaybackState, type PlayableStation, type Song } from 'radio-player';
import { create } from 'zustand';

import { artworkUri } from '@/lib/artwork';
import type { Station } from '@/lib/types';

import { useLibrary } from './library';
import { useSettings } from './settings';

type PlayerState = {
  station: Station | null;
  queue: Station[];
  state: PlaybackState;
  error: PlaybackError | null;
  song: Song | null;
  sleepEndsAt: number | null;
  play: (station: Station, queue?: Station[]) => Promise<void>;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
};

const MAX_QUEUE = 60;

let playSeq = 0;

async function toPlayable(station: Station): Promise<PlayableStation> {
  const subtitle = station.tagline ?? station.city ?? null;
  return {
    id: station.id,
    url: station.url,
    title: station.name,
    subtitle,
    artwork: await artworkUri(station),
  };
}

function buildQueue(station: Station, queue?: Station[]) {
  if (!queue || queue.length === 0) {
    const favorites = useLibrary.getState().favorites;
    if (favorites.some((f) => f.id === station.id)) return favorites.slice(0, MAX_QUEUE);
    return [station];
  }
  const index = queue.findIndex((s) => s.id === station.id);
  if (index < 0) return [station, ...queue].slice(0, MAX_QUEUE);
  const start = Math.max(0, Math.min(index - Math.floor(MAX_QUEUE / 2), queue.length - MAX_QUEUE));
  return queue.slice(start, start + MAX_QUEUE);
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  station: null,
  queue: [],
  state: 'idle',
  error: null,
  song: null,
  sleepEndsAt: null,
  play: async (station, queue) => {
    const seq = ++playSeq;
    const list = buildQueue(station, queue);
    set({ station, queue: list, state: 'loading', error: null, song: null });
    useLibrary.getState().addRecent(station);
    const [current, ...rest] = await Promise.all([toPlayable(station), ...list.filter((s) => s.id !== station.id).map(toPlayable)]);
    const order = list.map((s) => (s.id === station.id ? current : rest.find((r) => r.id === s.id))).filter(Boolean) as PlayableStation[];
    if (seq !== playSeq) return;
    try {
      await RadioPlayer.play(current, order);
    } catch {
      set({ state: 'error', error: 'stream_unavailable' });
    }
  },
  toggle: () => {
    const { state, station } = get();
    if (!station) return;
    if (state === 'error' || state === 'idle') {
      get().play(station, get().queue);
      return;
    }
    if (state === 'playing' || state === 'loading') {
      set({ state: 'paused' });
      RadioPlayer.pause().catch(() => {});
    } else {
      set({ state: 'loading' });
      RadioPlayer.resume().catch(() => {});
    }
  },
  pause: () => {
    set({ state: 'paused' });
    RadioPlayer.pause().catch(() => {});
  },
  resume: () => {
    const { station, state } = get();
    if (!station) return;
    if (state === 'error' || state === 'idle') {
      get().play(station, get().queue);
      return;
    }
    set({ state: 'loading' });
    RadioPlayer.resume().catch(() => {});
  },
  stop: () => {
    set({ state: 'idle', song: null });
    RadioPlayer.stop().catch(() => {});
  },
  next: () => {
    if (get().queue.length < 2) return;
    RadioPlayer.next().catch(() => {});
  },
  previous: () => {
    if (get().queue.length < 2) return;
    RadioPlayer.previous().catch(() => {});
  },
  setSleepTimer: (minutes) => {
    set({ sleepEndsAt: Date.now() + minutes * 60_000 });
    RadioPlayer.setSleepTimer(minutes * 60).catch(() => {});
  },
  cancelSleepTimer: () => {
    set({ sleepEndsAt: null });
    RadioPlayer.cancelSleepTimer().catch(() => {});
  },
}));

let subscribed = false;

export function connectPlayer() {
  if (subscribed) return;
  subscribed = true;
  RadioPlayer.addListener('onStateChange', ({ state, error }) => {
    usePlayer.setState({ state, error: error ?? null });
  });
  RadioPlayer.addListener('onSongChange', ({ song }) => {
    usePlayer.setState({ song });
    const station = usePlayer.getState().station;
    if (song?.title && station && useSettings.getState().songHistory) {
      useLibrary.getState().addSong(song, station);
    }
  });
  RadioPlayer.addListener('onStationChange', ({ stationId }) => {
    const { station, queue } = usePlayer.getState();
    if (station?.id === stationId) return;
    const next = queue.find((s) => s.id === stationId);
    if (next) {
      usePlayer.setState({ station: next, song: null });
      useLibrary.getState().addRecent(next);
    }
  });
  RadioPlayer.addListener('onSleepTimerChange', ({ endsAt }) => {
    usePlayer.setState({ sleepEndsAt: endsAt ?? null });
  });
  const sync = () => {
    RadioPlayer.getStatus()
      .then((status) => {
        const current = usePlayer.getState();
        const station =
          status.stationId && current.station?.id !== status.stationId
            ? (current.queue.find((s) => s.id === status.stationId) ?? current.station)
            : current.station;
        usePlayer.setState({
          station,
          state: station ? status.state : 'idle',
          error: status.error,
          song: status.song,
          sleepEndsAt: status.sleepTimerEndsAt && status.sleepTimerEndsAt > Date.now() ? status.sleepTimerEndsAt : null,
        });
      })
      .catch(() => {});
  };
  sync();
  AppState.addEventListener('change', (next) => {
    if (next === 'active') sync();
  });
}
