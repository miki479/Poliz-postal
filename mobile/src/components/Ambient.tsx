import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/lib/useReduceMotion';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { color } from '@/constants/theme';

/**
 * Bagliore ambientale: macchie di colore viola e turchese che si dissolvono nel fondo, dietro la parte alta
 * della schermata. Deriva lentissima (ciclo di 24 s, solo spostamento: costa quasi nulla) e ferma con "Riduci movimento";
 * sempre sotto al testo, che resta sul fondo scuro con il suo contrasto.
 */
export function AmbientGlow({ height = 480, variant = 'default' }: { height?: number; variant?: 'default' | 'brand' | 'accent' }) {
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) { cancelAnimation(p); p.value = 0; return; }
    p.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, p]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: Math.sin(p.value * Math.PI * 2) * 26 }, { translateY: Math.cos(p.value * Math.PI * 2) * 16 }, { scale: 1.08 + Math.sin(p.value * Math.PI * 4) * 0.03 }] }));
  const a = variant === 'accent' ? color.accent : color.brand;
  const b = variant === 'brand' ? color.brandStrong : color.accent;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, height }, drift]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="ambA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={a} stopOpacity={0.38} />
            <Stop offset="0.55" stopColor={a} stopOpacity={0.12} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="ambB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={b} stopOpacity={0.24} />
            <Stop offset="0.6" stopColor={b} stopOpacity={0.07} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width * 0.1} cy={height * 0.08} rx={width * 0.75} ry={height * 0.55} fill="url(#ambA)" />
        <Ellipse cx={width * 0.95} cy={height * 0.32} rx={width * 0.6} ry={height * 0.45} fill="url(#ambB)" />
      </Svg>
    </Animated.View>
  );
}
