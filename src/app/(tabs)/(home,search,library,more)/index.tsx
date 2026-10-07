import { useQuery } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { GenreTile } from '@/components/genre-tile';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { SectionHeader, StationCarousel } from '@/components/section';
import { StationLogo } from '@/components/station-logo';
import { StationRow } from '@/components/station-row';
import { countryName, formatNumber, useLanguage, useT } from '@/i18n';
import { germanStations, stationsByGenres, stationsByNetwork, stationsByState } from '@/lib/catalog';
import { greetingKey } from '@/lib/greeting';
import { tap } from '@/lib/haptics';
import { stats, topStations } from '@/lib/radio-browser';
import { BROWSE_GENRES, GERMAN_STATES, type Station } from '@/lib/types';
import { hydrate, useLibrary } from '@/store/library';
import { usePlayer } from '@/store/player';
import { useSettings } from '@/store/settings';
import { radius, type, useTheme } from '@/theme';

function openList(kind: string, value: string, title?: string) {
  router.push({ pathname: '/list', params: { kind, value, title } });
}

function ContinueCard() {
  const { colors } = useTheme();
  const t = useT();
  const last = useLibrary((s) => s.recents[0]?.station);
  const current = usePlayer((s) => s.station);
  const play = usePlayer((s) => s.play);
  if (!last || current) return null;
  const station = hydrate(last);
  return (
    <PressableScale
      onPress={() => {
        tap();
        play(station);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${t('home.continue')}: ${station.name}`}
      style={[styles.continue, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <StationLogo station={station} size={64} radius={14} />
      <View style={styles.flex}>
        <Text style={[type.micro, { color: colors.accent, textTransform: 'uppercase' }]}>{t('home.continue')}</Text>
        <Text numberOfLines={1} style={[type.headline, { color: colors.text, marginTop: 2 }]}>
          {station.name}
        </Text>
        {!!station.tagline && (
          <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            {station.tagline}
          </Text>
        )}
      </View>
      <View style={[styles.playPill, { backgroundColor: colors.accent }]}>
        <Icon name="play" size={20} color={colors.onAccent} />
      </View>
    </PressableScale>
  );
}

function FavoritesRow() {
  const { colors } = useTheme();
  const t = useT();
  const favorites = useLibrary((s) => s.favorites);
  const stations = useMemo(() => favorites.map(hydrate), [favorites]);
  if (stations.length === 0) {
    return (
      <View style={[styles.hint, { backgroundColor: colors.accentSoft }]}>
        <Icon name="heartFill" size={22} color={colors.accent} />
        <View style={styles.flex}>
          <Text style={[type.bodyStrong, { color: colors.text }]}>{t('home.favoritesEmptyTitle')}</Text>
          <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2, fontWeight: '400' }]}>
            {t('home.favoritesEmptyBody')}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <StationCarousel
      title={t('home.favorites')}
      stations={stations}
      size={96}
      onSeeAll={() => router.navigate('/library')}
    />
  );
}

function RegionSection() {
  const { colors } = useTheme();
  const t = useT();
  const region = useSettings((s) => s.region);
  const setRegion = useSettings((s) => s.setRegion);
  const stations = useMemo(() => (region ? stationsByState(region) : []), [region]);
  if (region && stations.length > 0) {
    const name = t(`region.${region}`);
    return (
      <StationCarousel
        title={t('home.region', { region: name })}
        stations={stations}
        captions
        onSeeAll={() => openList('region', region, t('home.region', { region: name }))}
      />
    );
  }
  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.regionPick')} subtitle={t('home.regionPickHint')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {GERMAN_STATES.map((code) => (
          <Pressable
            key={code}
            onPress={() => {
              tap();
              setRegion(code);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderColor: colors.border },
            ]}>
            <Text style={[type.callout, { color: colors.text }]}>{t(`region.${code}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function GenreGrid({ genres }: { genres: string[] }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const tileWidth = (Math.min(width, 700) - 40 - 12) / 2;
  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.genres')} onSeeAll={() => router.push('/genres')} />
      <View style={styles.grid}>
        {genres.map((genre) => (
          <GenreTile key={genre} genre={genre} width={tileWidth} onPress={() => openList('genre', genre)} />
        ))}
      </View>
    </View>
  );
}

function WorldCard() {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const { data } = useQuery({ queryKey: ['stats'], queryFn: stats, staleTime: 1000 * 60 * 60 * 24 });
  return (
    <PressableScale
      onPress={() => router.push('/countries')}
      accessibilityRole="button"
      style={[styles.world, { backgroundColor: colors.text }]}>
      <View style={styles.flex}>
        <Text style={[type.title, { color: colors.background }]}>{t('home.world')}</Text>
        {data && (
          <Text style={[type.callout, { color: colors.background, opacity: 0.7, marginTop: 4 }]}>
            {t('home.worldBody', {
              count: formatNumber(language, Math.round((data.stations - data.stations_broken) / 1000) * 1000),
              countries: data.countries,
            })}
          </Text>
        )}
        <View style={[styles.worldCta, { backgroundColor: colors.accent }]}>
          <Text style={[type.callout, { color: colors.onAccent, fontWeight: '700' }]}>{t('home.worldCta')}</Text>
          <Icon name="chevronRight" size={14} color={colors.onAccent} weight="bold" />
        </View>
      </View>
      <Icon name="globe" size={84} color={colors.background} style={{ opacity: 0.18 }} />
    </PressableScale>
  );
}

function TopList({ stations, title, onSeeAll }: { stations: Station[]; title: string; onSeeAll: () => void }) {
  const top = stations.slice(0, 8);
  return (
    <View style={styles.section}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      {top.map((station, index) => (
        <StationRow key={station.id} station={station} queue={stations} rank={index + 1} />
      ))}
    </View>
  );
}

function GermanyHome() {
  const t = useT();
  const sections = useMemo(
    () => [
      { key: 'news', title: t('home.news'), genres: ['news', 'culture', 'talk'] },
      { key: 'rock', title: t('home.rock'), genres: ['rock', 'alternative', 'metal'] },
      { key: 'electronic', title: t('home.electronic'), genres: ['electronic', 'dance'] },
      { key: 'schlager', title: t('home.schlager'), genres: ['schlager', 'volksmusik'] },
      { key: 'decades', title: t('home.decades'), genres: ['80s', '90s', 'oldies'] },
      { key: 'hiphop', title: t('home.hiphop'), genres: ['hiphop', 'rnb'] },
      { key: 'classical', title: t('home.classical'), genres: ['classical', 'jazz'] },
      { key: 'chill', title: t('home.chill'), genres: ['chill'] },
    ],
    [t]
  );
  const publicStations = useMemo(
    () => [...stationsByNetwork('ARD'), ...stationsByNetwork('Deutschlandradio')].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)),
    []
  );

  return (
    <>
      <TopList stations={germanStations} title={t('home.topGermany')} onSeeAll={() => openList('top', 'DE', t('home.topGermany'))} />
      <RegionSection />
      <GenreGrid genres={BROWSE_GENRES.slice(0, 8)} />
      {sections.slice(0, 2).map((s) => (
        <StationCarousel
          key={s.key}
          title={s.title}
          stations={stationsByGenres(s.genres)}
          captions
          onSeeAll={() => openList('genres', s.genres.join(','), s.title)}
        />
      ))}
      <StationCarousel
        title={t('home.public')}
        stations={publicStations.slice(0, 20)}
        captions
        onSeeAll={() => openList('network', 'public', t('home.public'))}
      />
      {sections.slice(2).map((s) => (
        <StationCarousel
          key={s.key}
          title={s.title}
          stations={stationsByGenres(s.genres)}
          captions
          onSeeAll={() => openList('genres', s.genres.join(','), s.title)}
        />
      ))}
    </>
  );
}

function CountryHome({ code }: { code: string }) {
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const name = countryName(code, language);
  const query = useQuery({ queryKey: ['top', code], queryFn: () => topStations(code, 60) });
  return (
    <>
      {query.data && query.data.length > 0 ? (
        <TopList
          stations={query.data}
          title={t('home.top', { country: name })}
          onSeeAll={() => openList('country', code, t('home.top', { country: name }))}
        />
      ) : query.isError ? (
        <Pressable onPress={() => query.refetch()} style={styles.errorBox}>
          <Text style={[type.callout, { color: colors.textSecondary, textAlign: 'center' }]}>{t('home.loadError')}</Text>
          <Text style={[type.callout, { color: colors.accent, marginTop: 8 }]}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
      <GenreGrid genres={BROWSE_GENRES.slice(0, 8)} />
      <StationCarousel
        title={t('home.topGermany')}
        stations={germanStations.slice(0, 20)}
        captions
        onSeeAll={() => openList('top', 'DE', t('home.topGermany'))}
      />
    </>
  );
}

export default function HomeScreen() {
  const t = useT();
  const { colors } = useTheme();
  const country = useSettings((s) => s.country);
  return (
    <>
      <Stack.Screen options={{ title: t(greetingKey()) }} />
      <Screen>
        <View style={styles.top}>
          <ContinueCard />
        </View>
        <FavoritesRow />
        {country === 'DE' ? <GermanyHome /> : <CountryHome code={country} />}
        <View style={[styles.section, styles.padded]}>
          <WorldCard />
        </View>
        <Text style={[type.caption, styles.attribution, { color: colors.textTertiary }]}>{t('home.attribution')}</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { paddingHorizontal: 20, paddingTop: 8 },
  section: { marginTop: 28 },
  padded: { paddingHorizontal: 20 },
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  playPill: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  hint: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: radius.lg,
  },
  chips: { paddingHorizontal: 20, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  world: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    padding: 22,
    overflow: 'hidden',
  },
  worldCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  attribution: { textAlign: 'center', paddingHorizontal: 40, marginTop: 28, fontWeight: '400' },
  errorBox: { alignItems: 'center', padding: 24 },
});
