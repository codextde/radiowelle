import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';

import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { Segmented } from '@/components/segmented';
import { StationRow } from '@/components/station-row';
import { useBottomInset } from '@/components/use-bottom-inset';
import { formatTime, useLanguage, useT } from '@/i18n';
import { tap } from '@/lib/haptics';
import { songSearchUrl } from '@/lib/song-links';
import type { Station } from '@/lib/types';
import { hydrate, useLibrary, type SongEntry } from '@/store/library';
import { type, useTheme } from '@/theme';

type Tab = 'favorites' | 'recent' | 'songs';

function FavoriteItem({ station, queue, editing }: { station: Station; queue: Station[]; editing: boolean }) {
  const { colors } = useTheme();
  const t = useT();
  const drag = useReorderableDrag();
  const remove = useLibrary((s) => s.removeFavorite);
  if (!editing) return <StationRow station={station} queue={queue} onLongPress={drag} />;
  return (
    <View style={[styles.editRow, { backgroundColor: colors.background }]}>
      <Pressable
        onPress={() => {
          tap();
          remove(station.id);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('player.unfavorite')}>
        <Icon name="minus" size={24} color={colors.live} />
      </Pressable>
      <View style={styles.flex}>
        <StationRow station={station} queue={queue} subtitle={null} />
      </View>
      <Pressable onPressIn={drag} hitSlop={12} accessibilityLabel="reorder" style={styles.handle}>
        <Icon name="reorder" size={22} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

function timeLabel(at: number, language: string) {
  const date = new Date(at);
  return formatTime(language, date, date.toDateString() !== new Date().toDateString());
}

function SongRow({ song }: { song: SongEntry }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const remove = useLibrary((s) => s.removeSong);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/find-song', params: { artist: song.artist ?? '', title: song.title } })}
      onLongPress={() =>
        Alert.alert(song.title, song.artist ?? undefined, [
          { text: t('player.findSong'), onPress: () => Linking.openURL(songSearchUrl('apple', song.artist, song.title)) },
          { text: t('common.delete'), style: 'destructive', onPress: () => remove(song.id) },
          { text: t('common.cancel'), style: 'cancel' },
        ])
      }
      style={({ pressed }) => [styles.songRow, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <View style={[styles.songIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Icon name="music" size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.text }]}>
          {song.title}
        </Text>
        <Text numberOfLines={1} style={[type.caption, { color: colors.textSecondary, marginTop: 2, fontWeight: '400' }]}>
          {[song.artist, song.stationName].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[type.caption, { color: colors.textTertiary, fontWeight: '400' }]}>{timeLabel(song.at, language)}</Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const t = useT();
  const { colors } = useTheme();
  const bottom = useBottomInset();
  const [tab, setTab] = useState<Tab>('favorites');
  const [editing, setEditing] = useState(false);
  const favoritesRaw = useLibrary((s) => s.favorites);
  const recentsRaw = useLibrary((s) => s.recents);
  const songs = useLibrary((s) => s.songs);
  const setFavorites = useLibrary((s) => s.setFavorites);
  const clearRecents = useLibrary((s) => s.clearRecents);
  const clearSongs = useLibrary((s) => s.clearSongs);
  const favorites = useMemo(() => favoritesRaw.map(hydrate), [favoritesRaw]);
  const recents = useMemo(() => recentsRaw.map((r) => hydrate(r.station)), [recentsRaw]);

  const header = (
    <View style={styles.segment}>
      <Segmented<Tab>
        value={tab}
        onChange={(value) => {
          setTab(value);
          setEditing(false);
        }}
        options={[
          { value: 'favorites', label: t('library.favorites') },
          { value: 'recent', label: t('library.recent') },
          { value: 'songs', label: t('library.songs') },
        ]}
      />
    </View>
  );

  const confirmClear = (action: () => void, title: string) =>
    Alert.alert(title, t('library.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: action },
    ]);

  const headerRight = () => {
    if (tab === 'favorites' && favorites.length > 1)
      return (
        <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10}>
          <Text style={[type.bodyStrong, { color: colors.accent }]}>{editing ? t('library.done') : t('library.edit')}</Text>
        </Pressable>
      );
    if (tab === 'recent' && recents.length > 0)
      return (
        <Pressable onPress={() => confirmClear(clearRecents, t('library.clearHistory'))} hitSlop={10}>
          <Icon name="trash" size={20} color={colors.accent} />
        </Pressable>
      );
    if (tab === 'songs' && songs.length > 0)
      return (
        <Pressable onPress={() => confirmClear(clearSongs, t('library.clearSongs'))} hitSlop={10}>
          <Icon name="trash" size={20} color={colors.accent} />
        </Pressable>
      );
    return null;
  };

  const discover = { label: t('library.discover'), onPress: () => router.navigate('/') };

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      {tab === 'favorites' ? (
        <ReorderableList
          data={favorites}
          keyExtractor={(s) => s.id}
          onReorder={({ from, to }) => {
            tap();
            setFavorites(reorderItems(favoritesRaw, from, to));
          }}
          renderItem={({ item }) => <FavoriteItem station={item} queue={favorites} editing={editing} />}
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: bottom }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="heart"
              title={t('library.emptyFavoritesTitle')}
              body={t('library.emptyFavoritesBody')}
              action={discover}
            />
          }
        />
      ) : tab === 'recent' ? (
        <FlatList
          data={recents}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <StationRow station={item} queue={recents} />}
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: bottom }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState icon="clock" title={t('library.emptyRecentTitle')} body={t('library.emptyRecentBody')} action={discover} />
          }
        />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <SongRow song={item} />}
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: bottom }}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState icon="musicList" title={t('library.emptySongsTitle')} body={t('library.emptySongsBody')} />
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  segment: { paddingTop: 8, paddingBottom: 12 },
  editRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20 },
  handle: { paddingHorizontal: 20, paddingVertical: 16 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 10 },
  songIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
