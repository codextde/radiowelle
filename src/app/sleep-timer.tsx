import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { formatTime, useLanguage, useT } from '@/i18n';
import { success, tap } from '@/lib/haptics';
import { usePlayer } from '@/store/player';
import { type, useTheme } from '@/theme';

const OPTIONS = [15, 30, 45, 60, 90, 120];

export default function SleepTimerSheet() {
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const endsAt = usePlayer((s) => s.sleepEndsAt);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const cancel = usePlayer((s) => s.cancelSleepTimer);

  const label = (minutes: number) =>
    minutes % 60 !== 0 ? t('sleep.minutes', { count: minutes }) : minutes === 60 ? t('sleep.hour') : t('sleep.hours', { count: minutes / 60 });

  const endTime = endsAt ? formatTime(language, new Date(endsAt)) : null;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Icon name="moonFill" size={24} color={colors.accent} />
        </View>
        <Text style={[type.title, { color: colors.text }]}>{t('sleep.title')}</Text>
        <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>
          {endTime ? t('sleep.active', { time: endTime }) : t('sleep.body')}
        </Text>
      </View>
      <View style={styles.grid}>
        {OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            onPress={() => {
              success();
              setSleepTimer(minutes);
              router.back();
            }}
            style={({ pressed }) => [styles.option, { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt }]}>
            <Text style={[type.bodyStrong, { color: colors.text }]}>{label(minutes)}</Text>
          </Pressable>
        ))}
      </View>
      {endsAt && (
        <Pressable
          onPress={() => {
            tap();
            cancel();
            router.back();
          }}
          style={({ pressed }) => [styles.off, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[type.bodyStrong, { color: colors.live }]}>{t('sleep.off')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 28 },
  head: { alignItems: 'center', gap: 8, marginBottom: 22 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { width: '31.5%', flexGrow: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  off: { alignItems: 'center', paddingVertical: 18, marginTop: 6 },
});
