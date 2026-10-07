import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { iconFonts } from '@/lib/fonts';
import { useLibrary } from '@/store/library';
import { connectPlayer, usePlayer } from '@/store/player';
import { useSettings } from '@/store/settings';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 30, gcTime: 1000 * 60 * 60 * 6, retry: 1 },
  },
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function Navigator() {
  const { colors, scheme } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.separator,
      },
    };
  }, [scheme, colors]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'fullScreenModal',
            animation: Platform.OS === 'ios' ? 'default' : 'slide_from_bottom',
            gestureEnabled: true,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="sleep-timer"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen
          name="find-song"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            sheetCornerRadius: 28,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(iconFonts);
  const ready = fontsLoaded || !!fontError || Object.keys(iconFonts).length === 0;

  useEffect(() => {
    connectPlayer();
  }, []);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    const { autoplay } = useSettings.getState();
    const last = useLibrary.getState().recents[0]?.station;
    if (autoplay && last && usePlayer.getState().state === 'idle') {
      usePlayer.getState().play(last);
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Navigator />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
