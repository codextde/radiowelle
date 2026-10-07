import { NativeModule, requireNativeModule } from 'expo';

import type { PlayableStation, PlayerStatus, RadioPlayerEvents } from './RadioPlayer.types';

declare class RadioPlayerModule extends NativeModule<RadioPlayerEvents> {
  play(station: PlayableStation, queue?: PlayableStation[]): Promise<void>;
  setQueue(queue: PlayableStation[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  toggle(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setSleepTimer(seconds: number): Promise<void>;
  cancelSleepTimer(): Promise<void>;
  getStatus(): Promise<PlayerStatus>;
}

export default requireNativeModule<RadioPlayerModule>('RadioPlayer');
