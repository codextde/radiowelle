import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';

import { palette, type Palette } from './colors';

export type Theme = {
  scheme: 'light' | 'dark';
  colors: Palette;
};

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: palette.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const preference = useSettings((s) => s.appearance);
  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<Theme>(() => ({ scheme, colors: palette[scheme] }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const fonts = {
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
};

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4 },
  headline: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  section: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.4 },
} as const;
