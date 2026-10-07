import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { tap } from '@/lib/haptics';
import type { Station } from '@/lib/types';
import { usePlayer } from '@/store/player';
import { useTheme, type } from '@/theme';

import { Equalizer } from './equalizer';
import { StationLogo } from './station-logo';

type Props = {
  station: Station;
  queue?: Station[];
  subtitle?: string | null;
  rank?: number;
  right?: React.ReactNode;
  onLongPress?: () => void;
};

export function useStationSubtitle() {
  const t = useT();
  return (station: Station) => {
    const parts: string[] = [];
    if (station.tagline) parts.push(station.tagline);
    else {
      if (station.genres[0]) parts.push(t(`genre.${station.genres[0]}`));
      if (station.city) parts.push(station.city);
      else if (station.state && station.state.startsWith('DE-')) parts.push(t(`region.${station.state}`));
    }
    return parts.join(' · ');
  };
}

export const StationRow = memo(function StationRow({ station, queue, subtitle, rank, right, onLongPress }: Props) {
  const { colors } = useTheme();
  const isCurrent = usePlayer((s) => s.station?.id === station.id);
  const playing = usePlayer((s) => s.station?.id === station.id && (s.state === 'playing' || s.state === 'loading'));
  const play = usePlayer((s) => s.play);
  const describe = useStationSubtitle();
  const sub = subtitle === undefined ? describe(station) : subtitle;

  return (
    <Pressable
      onPress={() => {
        tap();
        play(station, queue);
      }}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={station.name}
      accessibilityHint={sub ?? undefined}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      {rank !== undefined && (
        <Text style={[styles.rank, { color: rank <= 3 ? colors.accent : colors.textTertiary }]}>{rank}</Text>
      )}
      <StationLogo station={station} size={52} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: isCurrent ? colors.accent : colors.text }]}>
          {station.name}
        </Text>
        {!!sub && (
          <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            {sub}
          </Text>
        )}
      </View>
      {isCurrent && <Equalizer color={colors.accent} playing={playing} size={16} />}
      {right}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 14,
  },
  rank: { width: 26, fontSize: 17, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  text: { flex: 1, minWidth: 0 },
});
