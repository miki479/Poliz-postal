import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { alpha } from '@/components/event/colors';
import { useReduceMotion, type IconName } from '@/components/ui';
import { color, HIT, S, type } from '@/constants/theme';

/**
 * Pillola di scelta della creazione uscita (distanze rapide 5 · 8 · 10…, posti): selezionata si riempie del colore
 * e "pulsa" una volta. Con `grow` le pillole di una riga si dividono lo spazio in parti uguali.
 * Altezza fissa (44): la selezione non sposta nulla.
 */
export function OptionChip({
  label,
  icon,
  on,
  onPress,
  tint = color.accent,
  grow,
  role = 'radio',
  expanded,
  accessibilityLabel,
  accessibilityHint,
}: {
  label?: string;
  icon?: IconName;
  on: boolean;
  onPress: () => void;
  tint?: string;
  grow?: boolean;
  role?: 'radio' | 'button';
  expanded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce || !on) return;
    s.value = withSequence(withTiming(0.9, { duration: 80 }), withSpring(1, { damping: 9, stiffness: 260 }));
  }, [on, reduce, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View style={[grow && { flex: 1 }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole={role}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={role === 'radio' ? { selected: on } : { expanded: !!expanded }}
        style={({ pressed }) => [st.chip, { backgroundColor: on ? alpha(tint, 0.22) : color.surface, borderColor: on ? tint : 'transparent' }, pressed && { opacity: 0.7 }]}>
        {icon ? <Ionicons name={icon} size={20} color={on ? tint : color.textSecondary} /> : null}
        {label ? (
          <Text style={[type.subhead, st.text, { color: on ? tint : color.text }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  chip: { minHeight: HIT, minWidth: HIT, paddingHorizontal: S.md, borderRadius: HIT / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: S.xs },
  text: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
