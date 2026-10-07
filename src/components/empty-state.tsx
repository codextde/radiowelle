import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, type } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';

type Props = { icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } };

export function EmptyState({ icon, title, body, action }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>
      <Text style={[type.headline, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {!!body && <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>{body}</Text>}
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 36, paddingVertical: 48, gap: 10 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  button: { marginTop: 12, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
});
