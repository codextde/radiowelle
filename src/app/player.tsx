import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoutePickerView } from 'radio-player';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { PressableScale } from '@/components/pressable-scale';
import { StationLogo } from '@/components/station-logo';
import { useStationSubtitle } from '@/components/station-row';
import { useT } from '@/i18n';
import { impact, success, tap } from '@/lib/haptics';
import { links } from '@/lib/links';
import { useIsFavorite, useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { genreColors, mix } from '@/theme/colors';
import { type, useTheme } from '@/theme';

function LivePill() {
  const t = useT();
  const { colors } = useTheme();
  const state = usePlayer((s) => s.state);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'playing') {
      pulse.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 900 })),
        -1
      );
    } else {
      pulse.value = withTiming(1);
    }
  }, [state, pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const label = state === 'loading' ? t('player.connecting') : state === 'paused' ? t('player.paused') : t('player.live');
  const live = state === 'playing';
  return (
    <View style={[styles.pill, { backgroundColor: live ? colors.live : 'rgba(127,127,127,0.18)' }]}>
      {live && <Animated.View style={[styles.dot, dot]} />}
      <Text style={[styles.pillText, { color: live ? '#fff' : colors.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  color,
  size = 44,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: string;
  size?: number;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: active ? colors.accentSoft : 'transparent', opacity: pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={size * 0.5} color={active ? colors.accent : color} />
    </Pressable>
  );
}

function useCountdown(endsAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt || endsAt <= now) return null;
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const t = useT();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const station = usePlayer((s) => s.station);
  const state = usePlayer((s) => s.state);
  const error = usePlayer((s) => s.error);
  const song = usePlayer((s) => s.song);
  const sleepEndsAt = usePlayer((s) => s.sleepEndsAt);
  const canSkip = usePlayer((s) => s.queue.length > 1);
  const { toggle, next, previous, play } = usePlayer.getState();
  const favorite = useIsFavorite(station?.id);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const describe = useStationSubtitle();
  const countdown = useCountdown(sleepEndsAt);
  const [copied, setCopied] = useState(false);

  const active = state === 'playing' || state === 'loading';
  const artScale = useSharedValue(active ? 1 : 0.86);
  useEffect(() => {
    artScale.value = withSpring(active ? 1 : 0.86, { damping: 18, stiffness: 160 });
  }, [active, artScale]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.value }] }));

  useEffect(() => {
    if (!station) router.back();
  }, [station]);

  if (!station) return null;

  const brand = station.color ?? (station.genres[0] ? genreColors[station.genres[0]] : null) ?? colors.accent;
  const top = mix(brand.slice(0, 7), colors.background, scheme === 'dark' ? 0.55 : 0.72);
  const artSize = Math.min(width - 72, height * 0.38, 360);
  const songText = song?.title ? song.title : null;
  const artistText = song?.title ? song.artist : null;

  const share = () => {
    impact();
    const message = songText
      ? `${[artistText, songText].filter(Boolean).join(' – ')} · ${t('player.shareText', { station: station.name })} ${links.share}`
      : `${t('player.shareText', { station: station.name })} ${links.share}`;
    Share.share({ message }).catch(() => {});
  };

  const copy = async () => {
    if (!songText) return;
    await Clipboard.setStringAsync([artistText, songText].filter(Boolean).join(' – '));
    success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[top, colors.background]} locations={[0, 0.75]} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 18 }]}>
        <RoundButton icon="chevronDown" label={t('player.close')} onPress={() => router.back()} color={colors.text} />
        <LivePill />
        <RoundButton icon="share" label={t('player.share')} onPress={share} color={colors.text} />
      </View>

      <View style={styles.artWrap}>
        <Animated.View style={[styles.artShadow, artStyle]}>
          <StationLogo station={station} size={artSize} radius={Math.round(artSize * 0.12)} />
        </Animated.View>
      </View>

      <View style={styles.info}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[type.title, { color: colors.text }]} accessibilityRole="header">
              {station.name}
            </Text>
            <Text numberOfLines={1} style={[type.callout, { color: colors.textSecondary, marginTop: 2 }]}>
              {describe(station)}
            </Text>
          </View>
          <RoundButton
            icon={favorite ? 'heartFill' : 'heart'}
            label={favorite ? t('player.unfavorite') : t('player.favorite')}
            onPress={() => {
              const added = toggleFavorite(station);
              if (added) success();
              else tap();
            }}
            color={favorite ? colors.accent : colors.text}
            size={48}
          />
        </View>

        <View style={[styles.songCard, { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)', borderColor: colors.border }]}>
          {state === 'error' ? (
            <View style={styles.songRow}>
              <Icon name={error === 'offline' ? 'wifiOff' : 'warning'} size={20} color={colors.live} />
              <Text style={[type.callout, { color: colors.text, flex: 1 }]} numberOfLines={2}>
                {error === 'offline' ? t('player.errorOffline') : t('player.errorStream')}
              </Text>
              <Pressable onPress={() => play(station, usePlayer.getState().queue)} hitSlop={8}>
                <Text style={[type.callout, { color: colors.accent, fontWeight: '700' }]}>{t('player.retry')}</Text>
              </Pressable>
            </View>
          ) : songText ? (
            <Animated.View key={songText} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={styles.songRow}>
              <Icon name="music" size={18} color={colors.accent} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.text }]}>
                  {songText}
                </Text>
                {!!artistText && (
                  <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary, fontWeight: '400' }]}>
                    {artistText}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={copy}
                hitSlop={8}
                accessibilityLabel={t('player.copySong')}
                style={styles.songAction}>
                <Icon name={copied ? 'check' : 'copy'} size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/find-song', params: { artist: artistText ?? '', title: songText } })}
                hitSlop={8}
                accessibilityLabel={t('player.findSong')}
                style={[styles.findPill, { backgroundColor: colors.accent }]}>
                <Icon name="search" size={14} color={colors.onAccent} />
                <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>{t('player.findSong')}</Text>
              </Pressable>
            </Animated.View>
          ) : (
            <View style={styles.songRow}>
              <Icon name="antenna" size={18} color={colors.textSecondary} />
              <Text style={[type.callout, { color: colors.textSecondary }]}>
                {state === 'loading' ? t('player.connecting') : t('player.noSong')}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <RoundButton
          icon="previous"
          label={t('player.previous')}
          onPress={() => {
            tap();
            previous();
          }}
          color={canSkip ? colors.text : colors.textTertiary}
          size={64}
        />
        <PressableScale
          onPress={() => {
            impact();
            toggle();
          }}
          scaleTo={0.92}
          accessibilityRole="button"
          accessibilityLabel={active ? t('player.pause') : t('player.play')}
          style={[styles.play, { backgroundColor: colors.text }]}>
          {state === 'loading' ? (
            <ActivityIndicator color={colors.background} size="large" />
          ) : (
            <Icon name={active ? 'pause' : 'play'} size={38} color={colors.background} />
          )}
        </PressableScale>
        <RoundButton
          icon="next"
          label={t('player.next')}
          onPress={() => {
            tap();
            next();
          }}
          color={canSkip ? colors.text : colors.textTertiary}
          size={64}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Pressable
          onPress={() => router.push('/sleep-timer')}
          accessibilityRole="button"
          accessibilityLabel={t('player.sleepTimer')}
          style={({ pressed }) => [styles.bottomItem, { opacity: pressed ? 0.6 : 1 }]}>
          <View style={styles.iconBox}>
            <Icon name={sleepEndsAt ? 'moonFill' : 'moon'} size={22} color={sleepEndsAt ? colors.accent : colors.textSecondary} />
          </View>
          <Text style={[type.caption, { color: sleepEndsAt ? colors.accent : colors.textSecondary, fontVariant: ['tabular-nums'] }]}>
            {countdown ?? t('player.sleepTimer')}
          </Text>
        </Pressable>
        {Platform.OS === 'ios' && (
          <View style={styles.bottomItem} accessibilityLabel={t('player.airplay')}>
            <View style={styles.iconBox}>
              <RoutePickerView style={styles.route} tint={colors.textSecondary} activeTint={colors.accent} />
            </View>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t('player.airplay')}</Text>
          </View>
        )}
        {!!station.homepage && (
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(station.homepage as string, { controlsColor: colors.accent })}
            accessibilityRole="link"
            style={({ pressed }) => [styles.bottomItem, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.iconBox}>
              <Icon name="link" size={22} color={colors.textSecondary} />
            </View>
            <Text style={[type.caption, { color: colors.textSecondary }]}>{t('station.website')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  round: { alignItems: 'center', justifyContent: 'center' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
    borderRadius: 40,
  },
  info: { paddingHorizontal: 24, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  songCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, minHeight: 64, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  songAction: { padding: 6 },
  findPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 26 },
  play: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24 },
  bottomItem: { alignItems: 'center', gap: 4, minWidth: 80 },
  route: { width: 30, height: 30 },
  iconBox: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
