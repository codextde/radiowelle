import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { StationRow } from '@/components/station-row';
import { useBottomInset } from '@/components/use-bottom-inset';
import { countryName, useLanguage, useT } from '@/i18n';
import { germanStations, stationsByGenre, stationsByGenres, stationsByNetwork, stationsByState } from '@/lib/catalog';
import { searchStations, stationsByGenre as remoteByGenre, topStations } from '@/lib/radio-browser';
import type { Genre, Station } from '@/lib/types';
import { useSettings } from '@/store/settings';
import { type, useTheme } from '@/theme';

const PAGE = 50;

type Params = { kind: string; value: string; title?: string };

function useLocal({ kind, value }: Params): Station[] {
  return useMemo(() => {
    if (!value) return [];
    switch (kind) {
      case 'top':
        return value === 'DE' ? germanStations : [];
      case 'country':
        return value === 'DE' ? germanStations : [];
      case 'genre':
        return stationsByGenre(value);
      case 'genres':
        return stationsByGenres(value.split(','), 500);
      case 'region':
        return stationsByState(value);
      case 'network':
        if (value === 'public')
          return [...stationsByNetwork('ARD'), ...stationsByNetwork('Deutschlandradio')].sort(
            (a, b) => (a.rank ?? 0) - (b.rank ?? 0)
          );
        return stationsByNetwork(value);
      default:
        return [];
    }
  }, [kind, value]);
}

function remoteFetcher(kind: string, value: string, homeCountry: string) {
  if (!value) return null;
  if (kind === 'country' || kind === 'top') return (offset: number) => topStations(value, PAGE, offset);
  if (kind === 'genre') return (offset: number) => remoteByGenre(value as Genre, homeCountry, PAGE, offset);
  if (kind === 'language') return (offset: number) => searchStations({ language: value, limit: PAGE, offset });
  return null;
}

export default function ListScreen() {
  const params = useLocalSearchParams<Params>();
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const bottom = useBottomInset();
  const homeCountry = useSettings((s) => s.country);
  const local = useLocal(params);
  const fetcher = remoteFetcher(params.kind, params.value, homeCountry);

  const query = useInfiniteQuery({
    queryKey: ['list', params.kind, params.value, homeCountry],
    enabled: !!fetcher,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => (fetcher ? fetcher(pageParam) : Promise.resolve([])),
    getNextPageParam: (last, pages) => (last.length >= PAGE - 10 ? pages.length * PAGE : undefined),
  });

  const data = useMemo(() => {
    const seen = new Set(local.map((s) => s.id));
    const remote: Station[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const station of page) {
        if (seen.has(station.id)) continue;
        seen.add(station.id);
        remote.push(station);
      }
    }
    return [...local, ...remote];
  }, [local, query.data]);

  const title =
    params.title ||
    (params.kind === 'genre'
      ? t(`genre.${params.value}`)
      : params.kind === 'region'
        ? t(`region.${params.value}`)
        : params.kind === 'country' && params.value
          ? countryName(params.value, language)
          : '');

  const ranked = params.kind === 'top' || params.kind === 'country';

  return (
    <>
      <Stack.Screen options={{ title, headerLargeTitle: false }} />
      <FlatList
        data={data}
        keyExtractor={(s) => s.id}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottom, paddingTop: 8 }}
        renderItem={({ item, index }) => <StationRow station={item} queue={data} rank={ranked ? index + 1 : undefined} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
        }}
        ListHeaderComponent={
          data.length > 0 ? (
            <Text style={[type.caption, styles.count, { color: colors.textSecondary }]}>
              {t('list.stations', { count: data.length })}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : query.isError ? (
            <Pressable onPress={() => query.refetch()} style={styles.loading}>
              <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>{t('home.loadError')}</Text>
              <Text style={[type.callout, { color: colors.accent, marginTop: 8, textAlign: 'center' }]}>{t('common.retry')}</Text>
            </Pressable>
          ) : (
            <EmptyState icon="radio" title={t('list.empty')} />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : null
        }
        initialNumToRender={14}
        windowSize={11}
      />
    </>
  );
}

const styles = StyleSheet.create({
  count: { paddingHorizontal: 20, paddingBottom: 6, fontWeight: '400' },
  loading: { marginTop: 80, paddingHorizontal: 32 },
  footer: { paddingVertical: 24 },
});
