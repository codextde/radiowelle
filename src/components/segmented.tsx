import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { useTheme } from '@/theme';

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ value, options, onChange }: Props<T>) {
  const { colors, scheme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) tap();
              onChange(option.value);
            }}
            style={[
              styles.item,
              active && {
                backgroundColor: scheme === 'dark' ? colors.surfacePressed : colors.surface,
                shadowColor: '#000',
                shadowOpacity: scheme === 'dark' ? 0 : 0.08,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: active ? 1 : 0,
              },
            ]}>
            <Text style={[styles.label, { color: active ? colors.text : colors.textSecondary }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 12, padding: 3, marginHorizontal: 20 },
  item: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '600' },
});
