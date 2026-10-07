export type SongService = 'apple' | 'spotify' | 'youtube' | 'deezer';

export const songServices: { id: SongService; name: string }[] = [
  { id: 'apple', name: 'Apple Music' },
  { id: 'spotify', name: 'Spotify' },
  { id: 'youtube', name: 'YouTube Music' },
  { id: 'deezer', name: 'Deezer' },
];

export function songSearchUrl(service: SongService, artist: string | null | undefined, title: string) {
  const term = [artist, title].filter(Boolean).join(' ').trim();
  const q = encodeURIComponent(term);
  switch (service) {
    case 'apple':
      return `https://music.apple.com/search?term=${q}`;
    case 'spotify':
      return `https://open.spotify.com/search/${q}`;
    case 'youtube':
      return `https://music.youtube.com/search?q=${q}`;
    case 'deezer':
      return `https://www.deezer.com/search/${q}`;
  }
}
