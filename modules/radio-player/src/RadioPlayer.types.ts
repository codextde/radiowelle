export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type PlaybackError = 'offline' | 'stream_unavailable' | 'invalid_url';

export type PlayableStation = {
  id: string;
  url: string;
  title: string;
  subtitle?: string | null;
  artwork?: string | null;
};

export type Song = {
  artist: string | null;
  title: string | null;
  raw: string;
};

export type PlayerStatus = {
  state: PlaybackState;
  error: PlaybackError | null;
  stationId: string | null;
  song: Song | null;
  sleepTimerEndsAt: number | null;
};

export type RadioPlayerEvents = {
  onStateChange: (event: { state: PlaybackState; error: PlaybackError | null }) => void;
  onSongChange: (event: { song: Song | null }) => void;
  onStationChange: (event: { stationId: string }) => void;
  onSleepTimerChange: (event: { endsAt: number | null }) => void;
};
