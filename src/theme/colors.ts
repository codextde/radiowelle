export const palette = {
  light: {
    background: '#F6F4EF',
    surface: '#FFFFFF',
    surfaceAlt: '#ECE9E2',
    surfacePressed: '#E3DFD6',
    text: '#15141A',
    textSecondary: '#67646F',
    textTertiary: '#9A97A1',
    border: 'rgba(21,20,26,0.08)',
    separator: 'rgba(21,20,26,0.1)',
    accent: '#F04A24',
    accentSoft: 'rgba(240,74,36,0.12)',
    onAccent: '#FFFFFF',
    logoTile: '#FFFFFF',
    overlay: 'rgba(14,13,18,0.4)',
    live: '#E5352B',
    success: '#1F9D5C',
  },
  dark: {
    background: '#0E0D12',
    surface: '#18171E',
    surfaceAlt: '#222129',
    surfacePressed: '#2C2B34',
    text: '#F3F1EC',
    textSecondary: '#A4A1AC',
    textTertiary: '#6F6C78',
    border: 'rgba(255,255,255,0.07)',
    separator: 'rgba(255,255,255,0.09)',
    accent: '#FF6340',
    accentSoft: 'rgba(255,99,64,0.16)',
    onAccent: '#FFFFFF',
    logoTile: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.55)',
    live: '#FF4A3D',
    success: '#3CCB7F',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

export const genreColors: Record<string, string> = {
  pop: '#F2507B',
  charts: '#FF7A1A',
  rock: '#C2412D',
  alternative: '#6C5CE7',
  metal: '#3B3A40',
  electronic: '#00A3B4',
  dance: '#8E44DD',
  hiphop: '#E2A400',
  rnb: '#B0457A',
  schlager: '#E8508C',
  volksmusik: '#4E8A3E',
  oldies: '#C98A2E',
  '80s': '#D9479C',
  '90s': '#2F7FD8',
  classical: '#8C6A4F',
  jazz: '#3D5A80',
  chill: '#4AA88F',
  news: '#2F5D8C',
  talk: '#5B6B7A',
  culture: '#7A4E8C',
  kids: '#F2A13B',
  sport: '#2E9D4F',
  christian: '#6D7FB3',
  country: '#A86B3C',
  latin: '#E0573A',
  world: '#2A9D8F',
  regional: '#5C7C5A',
};

export function withAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${full}${a}`;
}

export function luminance(hex: string) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mix(a: string, b: string, amount: number) {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const channel = (i: number) => {
    const ca = parseInt(pa.slice(i, i + 2), 16);
    const cb = parseInt(pb.slice(i, i + 2), 16);
    return Math.round(ca + (cb - ca) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
