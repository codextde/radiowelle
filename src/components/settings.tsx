import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme, type } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';

export function SettingsGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      {!!title && <Text style={[type.micro, styles.groupTitle, { color: colors.textSecondary }]}>{title.toUpperCase()}</Text>}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
      {!!footer && <Text style={[type.caption, styles.footer, { color: colors.textTertiary }]}>{footer}</Text>}
    </View>
  );
}

type RowProps = {
  icon?: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (value: boolean) => void };
  last?: boolean;
  chevron?: boolean;
  destructive?: boolean;
};

export function SettingsRow({ icon, iconColor, label, value, hint, onPress, toggle, last, chevron = true, destructive }: RowProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: iconColor ?? colors.accent }]}>
          <Icon name={icon} size={16} color="#fff" />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={[type.body, { color: destructive ? colors.live : colors.text }]}>{label}</Text>
        {!!hint && <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400', marginTop: 2 }]}>{hint}</Text>}
      </View>
      {!!value && (
        <Text style={[type.body, { color: colors.textSecondary, maxWidth: '45%' }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {toggle && (
        <Switch
          accessibilityLabel={label}
          accessibilityHint={hint}
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ true: colors.accent, false: Platform.OS === 'android' ? colors.surfaceAlt : undefined }}
          thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
        />
      )}
      {onPress && !toggle && chevron && <Icon name="chevronRight" size={13} color={colors.textTertiary} weight="bold" />}
    </View>
  );
  if (!onPress || toggle) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={hint}
      style={({ pressed }) => pressed && { backgroundColor: colors.surfacePressed }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 24, paddingHorizontal: 16 },
  groupTitle: { paddingHorizontal: 16, marginBottom: 8 },
  card: { borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: 16, marginTop: 8, fontWeight: '400' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, paddingRight: 16, marginLeft: 16 },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
