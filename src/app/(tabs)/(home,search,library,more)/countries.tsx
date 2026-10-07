import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useBottomInset } from '@/components/use-bottom-inset';
import { countryName, formatNumber, useLanguage, useT } from '@/i18n';
import { tap } from '@/lib/haptics';
import { countries } from '@/lib/radio-browser';
import { normalize } from '@/lib/text';
import { type, useTheme } from '@/theme';

export default function CountriesScreen() {
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const bottom = useBottomInset();
  const [filter, setFilter] = useState('');
  const query = useQuery({ queryKey: ['countries'], queryFn: countries, staleTime: 1000 * 60 * 60 * 24 });

  const list = useMemo(() => {
    const items = (query.data ?? []).map((c) => ({
      code: c.iso_3166_1,
      count: c.stationcount,
      name: countryName(c.iso_3166_1, language, c.name),
    }));
    const q = normalize(filter);
    return q ? items.filter((c) => normalize(c.name).includes(q) || c.code.toLowerCase() === q) : items;
  }, [query.data, language, filter]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('countries.title'),
          headerSearchBarOptions: {
            placeholder: t('countries.search'),
            onChangeText: (e) => setFilter(e.nativeEvent.text),
            hideWhenScrolling: false,
            tintColor: colors.accent,
            textColor: colors.text,
            headerIconColor: colors.textSecondary,
            hintTextColor: colors.textTertiary,
          },
        }}
      />
      <FlatList
        data={list}
        keyExtractor={(c) => c.code}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottom, paddingTop: Platform.OS === 'android' ? 8 : 0 }}
        ListEmptyComponent={query.isLoading ? <ActivityIndicator style={styles.loading} color={colors.textSecondary} /> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              tap();
              router.push({ pathname: '/list', params: { kind: 'country', value: item.code } });
            }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
            <View style={[styles.code, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.codeText, { color: colors.textSecondary }]}>{item.code}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[type.caption, { color: colors.textSecondary, fontWeight: '400' }]}>
                {t('list.stations', { count: item.count })}
              </Text>
            </View>
            <Text style={[type.caption, { color: colors.textTertiary }]}>{formatNumber(language, item.count)}</Text>
            <Icon name="chevronRight" size={14} color={colors.textTertiary} weight="bold" />
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  code: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  flex: { flex: 1 },
  loading: { marginTop: 80 },
});
