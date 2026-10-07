import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { logoSource } from '@/lib/artwork';
import { initials } from '@/lib/text';
import type { Station } from '@/lib/types';
import { genreColors, luminance } from '@/theme/colors';
import { useTheme } from '@/theme';

const BLEED = 1;

type Props = {
  station: Pick<Station, 'logo' | 'name' | 'color' | 'genres'>;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

function fallbackColor(station: Props['station']) {
  if (station.color) return station.color;
  const genre = station.genres?.[0];
  if (genre && genreColors[genre]) return genreColors[genre];
  let hash = 0;
  for (const ch of station.name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const keys = Object.keys(genreColors);
  return genreColors[keys[Math.abs(hash) % keys.length]];
}

export function StationLogo({ station, size, radius, style }: Props) {
  const { colors, scheme } = useTheme();
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState(0);
  const source = logoSource(station);
  const r = radius ?? Math.round(size * 0.22);
  const remote = !!source && typeof source === 'object' && 'uri' in source;
  const inner = remote && natural ? Math.min(size * 0.84, Math.max(size * 0.5, natural * 1.5)) : size * 0.84;
  const border = scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  if (!source || failed) {
    const bg = fallbackColor(station);
    const fg = luminance(bg) > 0.55 ? '#15141A' : '#FFFFFF';
    const label = initials(station.name);
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: r, backgroundColor: bg, borderColor: border },
          styles.center,
          styles.border,
          style,
        ]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: fg,
            fontSize: size * (label.length > 2 ? 0.26 : 0.36),
            fontWeight: '800',
            letterSpacing: -0.5,
            paddingHorizontal: size * 0.08,
          }}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: r }, styles.clip, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.logoTile }]} />
      <Image
        source={source}
        style={
          remote
            ? { width: inner, height: inner, margin: (size - inner) / 2 }
            : { width: size + BLEED * 2, height: size + BLEED * 2, margin: -BLEED }
        }
        contentFit="contain"
        transition={120}
        recyclingKey={station.logo ?? station.name}
        onError={() => setFailed(true)}
        onLoad={(e) => {
          const longest = Math.max(e.source.width, e.source.height);
          if (remote && longest < 48) setFailed(true);
          else setNatural(longest);
        }}
        cachePolicy="memory-disk"
      />
      {scheme === 'light' && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, { borderRadius: r, borderColor: border }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  border: { borderWidth: StyleSheet.hairlineWidth },
  clip: { overflow: 'hidden' },
});
