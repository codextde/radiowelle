import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tap() {
  if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {});
  else Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key).catch(() => {});
}

export function impact() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
