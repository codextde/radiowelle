import { useQuery } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { countryName, languages, systemLanguage, useLanguage, useT } from '@/i18n';
import { tap } from '@/lib/haptics';
import { countries } from '@/lib/radio-browser';
import { normalize } from '@/lib/text';
import { GERMAN_STATES } from '@/lib/types';
import { useSettings, type Appearance } from '@/store/settings';
import { type, useTheme } from '@/theme';

type Option = { value: string; label: string; detail?: string };

export default function ChooseScreen() {
  const { kind } = useLocalSearchParams<{ kind: 'language' | 'country' | 'region' | 'appearance' }>();
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const settings = useSettings();
  const [filter, setFilter] = useState('');
  const countryQuery = useQuery({ queryKey: ['countries'], queryFn: countries, enabled: kind === 'country', staleTime: 1000 * 60 * 60 * 24 });

  const { title, options, selected, onSelect } = useMemo(() => {
    switch (kind) {
      case 'language':
        return {
          title: t('more.language'),
          selected: settings.language,
          options: [
            { value: 'system', label: t('more.languageSystem', { language: languages.find((l) => l.code === systemLanguage())?.name ?? '' }) },
            ...languages.map((l) => ({ value: l.code, label: l.name })),
          ] as Option[],
          onSelect: settings.setLanguage,
        };
      case 'region':
        return {
          title: t('more.region'),
          selected: settings.region ?? 'none',
          options: [
            { value: 'none', label: t('more.regionNone') },
            ...GERMAN_STATES.map((code) => ({ value: code, label: t(`region.${code}`) })).sort((a, b) => a.label.localeCompare(b.label)),
          ] as Option[],
          onSelect: (value: string) => settings.setRegion(value === 'none' ? null : value),
        };
      case 'appearance':
        return {
          title: t('more.appearance'),
          selected: settings.appearance,
          options: [
            { value: 'system', label: t('more.appearanceSystem') },
            { value: 'light', label: t('more.appearanceLight') },
            { value: 'dark', label: t('more.appearanceDark') },
          ] as Option[],
          onSelect: (value: string) => settings.setAppearance(value as Appearance),
        };
      case 'country':
      default: {
        const list = (countryQuery.data ?? [{ iso_3166_1: 'DE', name: 'Germany', stationcount: 0 }]).map((c) => ({
          value: c.iso_3166_1,
          label: countryName(c.iso_3166_1, language, c.name),
        }));
        if (!list.some((c) => c.value === settings.country)) list.unshift({ value: settings.country, label: countryName(settings.country, language) });
        const q = normalize(filter);
        return {
          title: t('more.country'),
          selected: settings.country,
          options: (q ? list.filter((c) => normalize(c.label).includes(q)) : list).sort((a, b) => a.label.localeCompare(b.label, language)) as Option[],
          onSelect: settings.setCountry,
        };
      }
    }
  }, [kind, t, settings, countryQuery.data, language, filter]);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLargeTitle: false,
          headerSearchBarOptions:
            kind === 'country'
              ? {
                  placeholder: t('countries.search'),
                  onChangeText: (e) => setFilter(e.nativeEvent.text),
                  hideWhenScrolling: false,
                  tintColor: colors.accent,
                  textColor: colors.text,
                  headerIconColor: colors.textSecondary,
                  hintTextColor: colors.textTertiary,
                }
              : undefined,
        }}
      />
      <FlatList
        data={options}
        keyExtractor={(o) => o.value}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => {
          const active = item.value === selected;
          return (
            <Pressable
              onPress={() => {
                tap();
                onSelect(item.value);
                router.back();
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                  borderTopLeftRadius: index === 0 ? 18 : 0,
                  borderTopRightRadius: index === 0 ? 18 : 0,
                  borderBottomLeftRadius: index === options.length - 1 ? 18 : 0,
                  borderBottomRightRadius: index === options.length - 1 ? 18 : 0,
                },
              ]}>
              <View style={[styles.inner, index < options.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[type.body, { color: colors.text, flex: 1 }]}>{item.label}</Text>
                {active && <Icon name="check" size={18} color={colors.accent} weight="bold" />}
              </View>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  row: { paddingLeft: 16 },
  inner: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingRight: 16 },
});
