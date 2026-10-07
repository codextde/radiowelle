import { Platform } from 'react-native';

import { usePlayer } from '@/store/player';

import { MINI_PLAYER_HEIGHT } from './mini-player';

const accessory = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

export function useBottomInset(extra = 24) {
  const hasStation = usePlayer((s) => !!s.station);
  if (!hasStation || accessory) return extra;
  return MINI_PLAYER_HEIGHT + 16 + extra;
}
