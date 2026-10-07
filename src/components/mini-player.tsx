import { router } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { tap } from '@/lib/haptics';
import { usePlayer } from '@/store/player';
import { useTheme } from '@/theme';

import { Icon } from './icon';
import { StationLogo } from './station-logo';

export function useNowPlayingLine() {
  const t = useT();
  const state = usePlayer((s) => s.state);
  const error = usePlayer((s) => s.error);
  const song = usePlayer((s) => s.song);
  if (state === 'error') return error === 'offline' ? t('player.errorOffline') : t('player.errorStream');
  if (state === 'loading') return t('player.connecting');
  if (song?.title) return [song.artist, song.title].filter(Boolean).join(' – ');
  if (state === 'paused') return t('player.paused');
  return t('player.noSong');
}

function PlayButton({ size = 40, color }: { size?: number; color: string }) {
  const t = useT();
  const state = usePlayer((s) => s.state);
  const toggle = usePlayer((s) => s.toggle);
  const active = state === 'playing' || state === 'loading';
  return (
    <Pressable
      onPress={() => {
        tap();
        toggle();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={active ? t('player.pause') : t('player.play')}
      style={[styles.button, { width: size, height: size }]}>
      {state === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color} />
        </View>
      ) : (
        <Icon name={active ? 'pause' : 'play'} size={size * 0.6} color={color} />
      )}
    </Pressable>
  );
}

export function MiniPlayerContent({ compact }: { compact?: boolean }) {
  const { colors } = useTheme();
  const t = useT();
  const station = usePlayer((s) => s.station);
  const line = useNowPlayingLine();
  const next = usePlayer((s) => s.next);
  const canSkip = usePlayer((s) => s.queue.length > 1);
  if (!station) return null;
  return (
    <Pressable
      onPress={() => router.push('/player')}
      accessibilityRole="button"
      accessibilityLabel={`${station.name}, ${line}`}
      style={[styles.content, compact && styles.contentCompact]}>
      <StationLogo station={station} size={compact ? 28 : 38} radius={compact ? 7 : 9} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {station.name}
        </Text>
        {!compact && (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSecondary }]}>
            {line}
          </Text>
        )}
      </View>
      <PlayButton color={colors.text} size={compact ? 32 : 40} />
      {!compact && canSkip && (
        <Pressable
          onPress={() => {
            tap();
            next();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('player.next')}
          style={[styles.button, { width: 36, height: 40 }]}>
          <Icon name="next" size={22} color={colors.text} />
        </Pressable>
      )}
    </Pressable>
  );
}

export const TAB_BAR_HEIGHT = Platform.select({ ios: 49, default: 80 });
export const MINI_PLAYER_HEIGHT = 64;

export function FloatingMiniPlayer() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const station = usePlayer((s) => s.station);
  if (!station) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={[styles.floating, { bottom: TAB_BAR_HEIGHT + insets.bottom + 8 }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: scheme === 'dark' ? colors.surfaceAlt : colors.surface,
            borderColor: colors.border,
          },
        ]}>
        <MiniPlayerContent />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    gap: 12,
  },
  contentCompact: { paddingLeft: 8, gap: 10 },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 13, marginTop: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  loading: { transform: [{ scale: 0.9 }] },
  floating: { position: 'absolute', left: 10, right: 10 },
  card: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
  },
});
