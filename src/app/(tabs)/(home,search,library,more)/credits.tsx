import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { useT } from '@/i18n';
import { type, useTheme } from '@/theme';

export default function CreditsScreen() {
  const t = useT();
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: t('credits.title'), headerLargeTitle: false }} />
      <Screen>
        <View style={styles.body}>
          <Text style={[type.body, { color: colors.text }]}>{t('credits.body')}</Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync('https://www.radio-browser.info')}>
            <Text style={[type.bodyStrong, { color: colors.accent }]}>radio-browser.info</Text>
          </Pressable>
          <Text style={[type.body, { color: colors.textSecondary }]}>{t('credits.openSource')}</Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync('https://github.com/codextde/radiowelle')}>
            <Text style={[type.bodyStrong, { color: colors.accent }]}>github.com/codextde/radiowelle</Text>
          </Pressable>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
});
