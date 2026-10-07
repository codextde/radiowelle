import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type Props = { color: string; size?: number; playing: boolean };

function Bar({ color, height, playing, delay, width }: { color: string; height: number; playing: boolean; delay: number; width: number }) {
  const value = useSharedValue(0.35);
  useEffect(() => {
    if (playing) {
      value.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 320 + delay, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.25, { duration: 280 + delay / 2, easing: Easing.inOut(Easing.quad) })
          ),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(value);
      value.value = withTiming(0.35, { duration: 200 });
    }
  }, [playing, delay, value]);
  const style = useAnimatedStyle(() => ({ height: height * value.value }));
  return <Animated.View style={[{ width, borderRadius: width / 2, backgroundColor: color }, style]} />;
}

export function Equalizer({ color, size = 14, playing }: Props) {
  const width = Math.max(2, Math.round(size / 6));
  return (
    <View style={[styles.row, { height: size, width: size, gap: width / 1.5 }]}>
      <Bar color={color} height={size} playing={playing} delay={0} width={width} />
      <Bar color={color} height={size} playing={playing} delay={140} width={width} />
      <Bar color={color} height={size} playing={playing} delay={70} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});
