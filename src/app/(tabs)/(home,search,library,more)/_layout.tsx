import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useT } from '@/i18n';
import { useTheme } from '@/theme';

export const unstable_settings = {
  anchor: 'index',
  search: { anchor: 'search' },
  library: { anchor: 'library' },
  more: { anchor: 'more' },
};

export default function SharedLayout({ segment }: { segment: string }) {
  const t = useT();
  const { colors } = useTheme();
  const root =
    segment === '(search)' ? 'search' : segment === '(library)' ? 'library' : segment === '(more)' ? 'more' : 'index';
  const title =
    root === 'search' ? t('search.title') : root === 'library' ? t('library.title') : root === 'more' ? t('more.title') : t('home.title');

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: Platform.OS === 'ios',
        headerTransparent: Platform.OS === 'ios',
        headerBlurEffect: undefined,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        headerLargeTitleStyle: { color: colors.text },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name={root} options={{ title }} />
    </Stack>
  );
}
