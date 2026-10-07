import { Stack, router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { GenreTile } from '@/components/genre-tile';
import { Screen } from '@/components/screen';
import { useT } from '@/i18n';
import { BROWSE_GENRES } from '@/lib/types';

export default function GenresScreen() {
  const t = useT();
  const { width } = useWindowDimensions();
  const tileWidth = (Math.min(width, 700) - 40 - 12) / 2;
  return (
    <>
      <Stack.Screen options={{ title: t('home.genres'), headerLargeTitle: false }} />
      <Screen>
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
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
});
