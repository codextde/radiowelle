import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { EmptyState } from '@/components/empty-state';
import { GenreTile } from '@/components/genre-tile';
import { Icon } from '@/components/icon';
import { SectionHeader } from '@/components/section';
import { StationRow } from '@/components/station-row';
import { useBottomInset } from '@/components/use-bottom-inset';
import { dictionaries, useLanguage, useT } from '@/i18n';
import { searchBundled } from '@/lib/catalog';
import { tap } from '@/lib/haptics';
import { searchStations } from '@/lib/radio-browser';
import { normalize } from '@/lib/text';
import { BROWSE_GENRES, GENRES, GENRE_TAGS, GERMAN_STATES, type Station } from '@/lib/types';
import { useSettings } from '@/store/settings';
import { type, useTheme } from '@/theme';

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const genreIndex = (() => {
  const entries: { term: string; genre: string }[] = [];
  for (const genre of GENRES) {
    for (const dict of Object.values(dictionaries)) {
      const label = (dict as Record<string, string>)[`genre.${genre}`];
      if (label) entries.push({ term: normalize(label), genre });
    }
    for (const tag of GENRE_TAGS[genre]) entries.push({ term: normalize(tag), genre });
  }
  return entries;
})();

function matchGenres(q: string) {
  if (q.length < 3) return [];
  const result = new Set<string>();
  for (const entry of genreIndex) {
    if (entry.term.startsWith(q) || (q.length >= 4 && entry.term.includes(q))) result.add(entry.genre);
  }
  return [...result];
}

function Browse({ onPickRecent }: { onPickRecent: (q: string) => void }) {
  const t = useT();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const recent = useSettings((s) => s.recentSearches);
  const clearRecent = useSettings((s) => s.clearRecentSearches);
  const tileWidth = (Math.min(width, 700) - 40 - 12) / 2;
  return (
    <View>
      {recent.length > 0 && (
        <View style={styles.block}>
          <SectionHeader
            title={t('search.recent')}
            right={
              <Pressable onPress={clearRecent} hitSlop={10}>
                <Text style={[type.callout, { color: colors.accent }]}>{t('search.clear')}</Text>
              </Pressable>
            }
          />
          <View style={styles.chips}>
            {recent.map((q) => (
              <Pressable
                key={q}
                onPress={() => onPickRecent(q)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
                ]}>
                <Icon name="clock" size={14} color={colors.textTertiary} />
                <Text style={[type.callout, { color: colors.text }]}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={styles.block}>
        <SectionHeader title={t('search.browseGenres')} />
        <View style={styles.grid}>
          {BROWSE_GENRES.map((genre) => (
            <GenreTile
              key={genre}
              genre={genre}
              width={tileWidth}
              onPress={() => router.push({ pathname: '/list', params: { kind: 'genre', value: genre } })}
            />
          ))}
        </View>
      </View>
      <View style={styles.block}>
        <SectionHeader title={t('search.browseRegions')} />
        <View style={styles.chips}>
          {GERMAN_STATES.map((code) => (
            <Pressable
              key={code}
              onPress={() => {
                tap();
                router.push({ pathname: '/list', params: { kind: 'region', value: code } });
              }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
              ]}>
              <Text style={[type.callout, { color: colors.text }]}>{t(`region.${code}`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.block}>
        <Pressable
          onPress={() => router.push('/countries')}
          style={({ pressed }) => [
            styles.countries,
            { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
          ]}>
          <Icon name="globe" size={26} color={colors.accent} />
          <Text style={[type.bodyStrong, { color: colors.text, flex: 1 }]}>{t('search.browseCountries')}</Text>
          <Icon name="chevronRight" size={14} color={colors.textTertiary} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const bottom = useBottomInset();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 350);
  const addRecent = useSettings((s) => s.addRecentSearch);
  const searchBar = useRef<SearchBarCommands>(null);

  const local = useMemo(() => searchBundled(query, matchGenres).slice(0, 40), [query]);
  const remote = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchStations({ name: debounced, limit: 60 }),
    enabled: debounced.length >= 2,
    staleTime: 1000 * 60 * 10,
  });

  const sections = useMemo(() => {
    const list: { key: string; title: string; data: Station[] }[] = [];
    if (local.length > 0) list.push({ key: 'local', title: t('search.local'), data: local });
    const seen = new Set(local.map((s) => s.id));
    const world = (remote.data ?? []).filter((s) => !seen.has(s.id));
    if (world.length > 0) list.push({ key: 'world', title: t('search.worldwide'), data: world });
    return list;
  }, [local, remote.data, t]);

  const searching = query.trim().length > 0;
  const loading = remote.isFetching && sections.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            ref: searchBar,
            placeholder: t('search.placeholder'),
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onSearchButtonPress: (e) => addRecent(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
            hideWhenScrolling: false,
            autoCapitalize: 'none',
            tintColor: colors.accent,
            textColor: colors.text,
            headerIconColor: colors.textSecondary,
            hintTextColor: colors.textTertiary,
          },
        }}
      />
      <SectionList
        sections={searching ? sections : []}
        keyExtractor={(s) => s.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottom }}
        renderSectionHeader={({ section }) => (
          <Text style={[type.micro, styles.sectionTitle, { color: colors.textSecondary }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item, section }) => (
          <View onTouchStart={() => addRecent(query)}>
            <StationRow station={item} queue={section.data} />
          </View>
        )}
        ListHeaderComponent={
          !searching ? (
            <Browse
              onPickRecent={(q) => {
                searchBar.current?.setText(q);
                setQuery(q);
              }}
            />
          ) : null
        }
        ListEmptyComponent={
          searching ? (
            loading || debounced !== query.trim() ? (
              <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
            ) : (
              <EmptyState icon="search" title={t('search.noResults', { query: query.trim() })} body={t('search.noResultsHint')} />
            )
          ) : null
        }
        ListFooterComponent={
          searching && remote.isFetching && sections.length > 0 ? (
            <ActivityIndicator style={styles.footer} color={colors.textSecondary} />
          ) : null
        }
        extraData={language}
      />
    </>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countries: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 },
  loading: { marginTop: 60 },
  footer: { paddingVertical: 20 },
});
