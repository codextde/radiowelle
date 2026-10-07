import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { Station } from '@/lib/types';
import { useTheme, type } from '@/theme';

import { StationTile } from './station-tile';

type HeaderProps = { title: string; subtitle?: string; onSeeAll?: () => void; right?: ReactNode };

export function SectionHeader({ title, subtitle, onSeeAll, right }: HeaderProps) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={styles.header}>
      <Pressable
        disabled={!onSeeAll}
        onPress={onSeeAll}
        accessibilityRole={onSeeAll ? 'button' : 'header'}
        style={styles.headerText}>
        <View style={styles.titleRow}>
          <Text style={[type.section, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {!!subtitle && <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>{subtitle}</Text>}
      </Pressable>
      {right}
      {onSeeAll && !right && (
        <Pressable onPress={onSeeAll} hitSlop={10} accessibilityRole="button">
          <Text style={[type.callout, { color: colors.accent }]}>{t('home.seeAll')}</Text>
        </Pressable>
      )}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  stations: Station[];
  onSeeAll?: () => void;
  size?: number;
  captions?: boolean;
};

export function StationCarousel({ title, subtitle, stations, onSeeAll, size = 112, captions }: RowProps) {
  if (stations.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={subtitle} onSeeAll={onSeeAll} />
      <FlatList
        horizontal
        data={stations}
        keyExtractor={(s) => s.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        renderItem={({ item }) => (
          <StationTile station={item} queue={stations} size={size} caption={captions ? item.tagline ?? item.city : null} />
        )}
        initialNumToRender={6}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 12,
  },
  headerText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  carousel: { paddingHorizontal: 20, gap: 14 },
});
