import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from '@/components/ui';
import { M } from '@/constants/theme';

/** One short entrance per screen/slide; no animation on text edits and no hidden reduced-motion state. */
export function ScreenEntrance({ children, changeKey, direction = 1, style }: { children: ReactNode; changeKey: string | number; direction?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(1));
  useLayoutEffect(() => {
    if (reduce) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: M.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [changeKey, reduce, progress]);
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [12 * direction, 0] }) }] }]}>{children}</Animated.View>;
}
