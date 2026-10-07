import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { genreColors, luminance } from '@/theme/colors';
import { radius } from '@/theme';

import { PressableScale } from './pressable-scale';

type Props = { genre: string; onPress: () => void; width: number };

export function GenreTile({ genre, onPress, width }: Props) {
  const t = useT();
  const bg = genreColors[genre] ?? '#555';
  const fg = luminance(bg) > 0.6 ? '#15141A' : '#FFFFFF';
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={{ width }}>
      <View style={[styles.tile, { backgroundColor: bg }]}>
        <View style={[styles.ring, { borderColor: fg }]} />
        <View style={[styles.ringSmall, { borderColor: fg }]} />
        <Text style={[styles.label, { color: fg }]} numberOfLines={2}>
          {t(`genre.${genre}`)}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: 84,
    borderRadius: radius.lg,
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  label: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  ring: {
    position: 'absolute',
    right: -34,
    top: -34,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 10,
    opacity: 0.16,
  },
  ringSmall: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 8,
    opacity: 0.16,
  },
});
