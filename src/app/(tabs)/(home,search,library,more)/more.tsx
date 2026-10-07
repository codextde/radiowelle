import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SettingsGroup, SettingsRow } from '@/components/settings';
import { countryName, languages, systemLanguage, useLanguage, useT } from '@/i18n';
import { links } from '@/lib/links';
import { useSettings } from '@/store/settings';
import { type, useTheme } from '@/theme';

function languageName(code: string) {
  return languages.find((l) => l.code === code)?.name ?? code;
}

export default function MoreScreen() {
  const t = useT();
  const language = useLanguage();
  const { colors } = useTheme();
  const settings = useSettings();

  const appearanceLabel =
    settings.appearance === 'light'
      ? t('more.appearanceLight')
      : settings.appearance === 'dark'
        ? t('more.appearanceDark')
        : t('more.appearanceSystem');

  const open = (url: string) =>
    WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.accent,
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    }).catch(() => Linking.openURL(url));

  const rate = async () => {
    if (await StoreReview.hasAction()) {
      StoreReview.requestReview().catch(() => {});
      return;
    }
    Linking.openURL(Platform.OS === 'ios' ? links.appStore : links.playStore).catch(() => {});
  };

  return (
    <Screen>
      <SettingsGroup title={t('more.general')}>
        <SettingsRow
          icon="language"
          iconColor="#2F7FD8"
          label={t('more.language')}
          value={settings.language === 'system' ? t('more.languageSystem', { language: languageName(systemLanguage()) }) : languageName(settings.language)}
          onPress={() => router.push({ pathname: '/choose', params: { kind: 'language' } })}
        />
        <SettingsRow
          icon="globe"
          iconColor="#2A9D8F"
          label={t('more.country')}
          value={countryName(settings.country, language)}
          onPress={() => router.push({ pathname: '/choose', params: { kind: 'country' } })}
        />
        <SettingsRow
          icon="location"
          iconColor="#E2A400"
          label={t('more.region')}
          value={settings.region ? t(`region.${settings.region}`) : t('more.regionNone')}
          onPress={() => router.push({ pathname: '/choose', params: { kind: 'region' } })}
        />
        <SettingsRow
          icon="paint"
          iconColor="#6C5CE7"
          label={t('more.appearance')}
          value={appearanceLabel}
          onPress={() => router.push({ pathname: '/choose', params: { kind: 'appearance' } })}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={t('more.playback')}>
        <SettingsRow
          icon="play"
          iconColor="#1F9D5C"
          label={t('more.autoplay')}
          hint={t('more.autoplayHint')}
          toggle={{ value: settings.autoplay, onChange: settings.setAutoplay }}
        />
        <SettingsRow
          icon="musicList"
          iconColor="#F2507B"
          label={t('more.songHistory')}
          hint={t('more.songHistoryHint')}
          toggle={{ value: settings.songHistory, onChange: settings.setSongHistory }}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={t('more.about')}>
        <SettingsRow icon="star" iconColor="#FF9F0A" label={t('more.rate')} onPress={rate} />
        <SettingsRow
          icon="share"
          iconColor="#2F7FD8"
          label={t('more.share')}
          onPress={() => Share.share({ message: `${t('more.shareText')} ${links.share}` }).catch(() => {})}
        />
        <SettingsRow icon="mail" iconColor="#5B6B7A" label={t('more.feedback')} onPress={() => Linking.openURL(links.feedback).catch(() => {})} />
        <SettingsRow icon="plus" iconColor="#4AA88F" label={t('more.suggest')} onPress={() => open(links.suggest)} />
        <SettingsRow icon="hand" iconColor="#3D5A80" label={t('more.privacy')} onPress={() => open(links.privacy)} />
        <SettingsRow icon="doc" iconColor="#8C6A4F" label={t('more.imprint')} onPress={() => open(links.imprint)} />
        <SettingsRow icon="heartText" iconColor="#C2412D" label={t('more.licenses')} onPress={() => router.push('/credits')} last />
      </SettingsGroup>

      <View style={styles.footer}>
        <Text style={[type.callout, { color: colors.text, textAlign: 'center' }]}>{t('more.promise')}</Text>
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center', fontWeight: '400' }]}>
          {t('more.version', { version: `${Application.nativeApplicationVersion ?? '1.0.0'} (${Application.nativeBuildVersion ?? '1'})` })}
        </Text>
        <Text style={[type.caption, { color: colors.textTertiary, textAlign: 'center', fontWeight: '400' }]}>{t('more.madeBy')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 6, paddingHorizontal: 32, paddingTop: 32 },
});
