import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import type { Station } from '@/lib/types';
import { usePlayer } from '@/store/player';
import { useTheme, type } from '@/theme';

import { Equalizer } from './equalizer';
import { PressableScale } from './pressable-scale';
import { StationLogo } from './station-logo';

type Props = { station: Station; queue?: Station[]; size?: number; caption?: string | null };

export const StationTile = memo(function StationTile({ station, queue, size = 112, caption }: Props) {
  const { colors } = useTheme();
  const isCurrent = usePlayer((s) => s.station?.id === station.id);
  const playing = usePlayer((s) => s.station?.id === station.id && (s.state === 'playing' || s.state === 'loading'));
  const play = usePlayer((s) => s.play);
  return (
    <PressableScale
      onPress={() => {
        tap();
        play(station, queue);
      }}
      accessibilityRole="button"
      accessibilityLabel={station.name}
      style={{ width: size }}>
      <View>
        <StationLogo station={station} size={size} radius={Math.round(size * 0.2)} />
        {isCurrent && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Equalizer color="#fff" playing={playing} size={12} />
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={[type.caption, styles.name, { color: colors.text }]}>
        {station.name}
      </Text>
      {!!caption && (
        <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary, fontWeight: '400' }]}>
          {caption}
        </Text>
      )}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  name: { marginTop: 8, fontWeight: '600' },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
