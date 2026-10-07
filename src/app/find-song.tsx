import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { useT } from '@/i18n';
import { success, tap } from '@/lib/haptics';
import { songSearchUrl, songServices } from '@/lib/song-links';
import { type, useTheme } from '@/theme';

const serviceColors: Record<string, string> = {
  apple: '#FA2D48',
  spotify: '#1DB954',
  youtube: '#FF0000',
  deezer: '#A238FF',
};

export default function FindSongSheet() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { artist, title } = useLocalSearchParams<{ artist?: string; title: string }>();

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.head}>
        <Text style={[type.micro, { color: colors.textSecondary }]}>{t('player.openIn').toUpperCase()}</Text>
        <Text style={[type.headline, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>
          {title}
        </Text>
        {!!artist && (
          <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]} numberOfLines={1}>
            {artist}
          </Text>
        )}
      </View>
      <View style={[styles.list, { backgroundColor: colors.surfaceAlt }]}>
        {songServices.map((service, index) => (
          <Pressable
            key={service.id}
            onPress={() => {
              tap();
              Linking.openURL(songSearchUrl(service.id, artist, title)).catch(() => {});
              router.back();
            }}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.surfacePressed },
              index < songServices.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}>
            <View style={[styles.badge, { backgroundColor: serviceColors[service.id] }]}>
              <Icon name="music" size={16} color="#fff" />
            </View>
            <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{service.name}</Text>
            <Icon name="chevronRight" size={13} color={colors.textTertiary} weight="bold" />
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={async () => {
          await Clipboard.setStringAsync([artist, title].filter(Boolean).join(' – '));
          success();
          router.back();
        }}
        style={({ pressed }) => [styles.copy, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="copy" size={18} color={colors.accent} />
        <Text style={[type.bodyStrong, { color: colors.accent }]}>{t('player.copySong')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 28 },
  head: { alignItems: 'center', gap: 4, marginBottom: 20 },
  list: { borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 56 },
  badge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  copy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
});
