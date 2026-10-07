import { requireNativeView } from 'expo';
import type { ColorValue, ViewProps } from 'react-native';

type Props = ViewProps & { tint?: ColorValue; activeTint?: ColorValue };

const NativeView = requireNativeView<Props>('RadioPlayer');

export function RoutePickerView(props: Props) {
  return <NativeView {...props} />;
}
