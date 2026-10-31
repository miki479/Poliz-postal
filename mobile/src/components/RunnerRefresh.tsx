import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { SESSION_FIGURE } from '@/constants/figureImages';
import { color } from '@/constants/theme';
import { useReduceMotion } from '@/lib/useReduceMotion';

/**
 * Indicatore di aggiornamento: al posto del cerchietto, il corridore Runngo che corre sul posto dentro un anello di luce che gira.
 * Compare in alto mentre i dati si ricaricano; con "Riduci movimento" resta fermo.
 */
export function RunnerRefresh({ active, top }: { active: boolean; top: number }) {
  const reduce = useReduceMotion();
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  const show = useSharedValue(0);
  useEffect(() => {
    show.value = withTiming(active ? 1 : 0, { duration: 220 });
    if (!active || reduce) { cancelAnimation(spin); cancelAnimation(bob); return; }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 190, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 190, easing: Easing.in(Easing.quad) })), -1, false);
    return () => { cancelAnimation(spin); cancelAnimation(bob); };
  }, [active, reduce, spin, bob, show]);
  const wrap = useAnimatedStyle(() => ({ opacity: show.value, transform: [{ translateY: (1 - show.value) * -24 }, { scale: 0.8 + show.value * 0.2 }] }));
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const man = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 3 }, { rotate: `${(bob.value - 0.5) * 4}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, alignSelf: 'center', zIndex: 20, width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: 'rgba(20,26,40,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, wrap]}>
      <Animated.View style={[{ position: 'absolute', width: 50, height: 50, borderRadius: 25, borderWidth: 2.5, borderColor: 'transparent', borderTopColor: color.accent, borderRightColor: color.accent + '66' }, ring]} />
      <Animated.View style={man}>
        <Image source={SESSION_FIGURE.run.src} resizeMode="contain" tintColor={color.text} style={{ width: 30, height: 30 }} accessibilityIgnoresInvertColors />
      </Animated.View>
      <View accessible accessibilityLabel="Aggiornamento in corso" accessibilityLiveRegion="polite" style={{ position: 'absolute', width: 1, height: 1 }} />
    </Animated.View>
  );
}
