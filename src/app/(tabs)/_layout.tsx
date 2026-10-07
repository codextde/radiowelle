import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';

import { FloatingMiniPlayer, MiniPlayerContent } from '@/components/mini-player';
import { useT } from '@/i18n';
import { usePlayer } from '@/store/player';
import { useTheme } from '@/theme';

export const supportsAccessory = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniPlayerContent compact={placement === 'inline'} />;
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export default function TabsLayout() {
  const t = useT();
  const { colors } = useTheme();
  const hasStation = usePlayer((s) => !!s.station);
  const keyboard = useKeyboardVisible();

  return (
    <View style={styles.flex}>
      <NativeTabs
        tintColor={colors.accent}
        minimizeBehavior="onScrollDown"
        backgroundColor={Platform.OS === 'android' ? colors.surface : undefined}
        indicatorColor={Platform.OS === 'android' ? colors.accentSoft : undefined}
        iconColor={Platform.OS === 'android' ? { default: colors.textSecondary, selected: colors.accent } : undefined}
        labelStyle={Platform.OS === 'android' ? { default: { color: colors.textSecondary }, selected: { color: colors.text } } : undefined}
        rippleColor={Platform.OS === 'android' ? colors.accentSoft : undefined}
        labelVisibilityMode="labeled">
        {supportsAccessory && hasStation && (
          <NativeTabs.BottomAccessory>
            <Accessory />
          </NativeTabs.BottomAccessory>
        )}
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="dot.radiowaves.left.and.right" md="radio" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(library)">
          <NativeTabs.Trigger.Label>{t('tabs.library')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(more)">
          <NativeTabs.Trigger.Label>{t('tabs.more')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search">
          <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        </NativeTabs.Trigger>
      </NativeTabs>
      {!supportsAccessory && !keyboard && <FloatingMiniPlayer />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
