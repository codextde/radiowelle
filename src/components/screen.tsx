import { forwardRef, type ReactNode } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { useTheme } from '@/theme';

import { useBottomInset } from './use-bottom-inset';

type Props = ScrollViewProps & { children: ReactNode };

export const Screen = forwardRef<ScrollView, Props>(function Screen({ children, contentContainerStyle, ...rest }, ref) {
  const { colors } = useTheme();
  const bottom = useBottomInset();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[{ paddingBottom: bottom }, contentContainerStyle]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      {...rest}>
      {children}
    </ScrollView>
  );
});
