import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/components/ui';
import { color, M, R, S, type } from '@/constants/theme';

/**
 * Pulsante principale largo in basso ("Avanti", "Pubblica l’uscita"): sfumatura dall'accento al viola del marchio,
 * testo scuro (≥ 4,5:1 su tutta la sfumatura). Alla pressione si stringe appena; occupato mostra la rotella e non riceve tocchi.
 */
export function GradientButton({ title, onPress, busy, disabled, accessibilityHint }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; accessibilityHint?: string }) {
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const off = !!busy || !!disabled;
  const press = (v: number) => {
    s.value = reduce ? 1 : withTiming(v, { duration: M.press, easing: Easing.out(Easing.quad) });
  };
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable onPress={onPress} disabled={off} onPressIn={() => press(0.97)} onPressOut={() => press(1)} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: off, busy: !!busy }}>
      <Animated.View style={[st.wrap, off && { opacity: 0.6 }, style]}>
        <LinearGradient colors={[color.accent, color.brand]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        {busy ? <ActivityIndicator color={color.onAccent} /> : null}
        <Text style={[type.headline, st.text]} numberOfLines={1}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { minHeight: 54, borderRadius: R.control + 2, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingHorizontal: S.xl },
  text: { color: color.onAccent, fontWeight: '700' },
});
