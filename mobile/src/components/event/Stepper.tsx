import { themedStyles , color, S, type } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/components/ui';


const DOT = 28;
const HALO = 38;
const LINE = 2;

type DotState = 'done' | 'current' | 'todo';

/** Un passo: cerchio (spunta se fatto, numero altrimenti) ed etichetta sotto. I passi già fatti si toccano per tornarci. */
function StepDot({ k, n, label, state, onPress }: { k: number; n: number; label: string; state: DotState; onPress?: () => void }) {
  const reduce = useReduceMotion();
  const pop = useSharedValue(1);
  const halo = useSharedValue(state === 'current' ? 1 : 0);
  const prev = useRef(state);

  useEffect(() => {
    halo.value = reduce ? (state === 'current' ? 1 : 0) : withTiming(state === 'current' ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
    const changed = prev.current !== state;
    prev.current = state;
    // Il passo appena raggiunto (o appena completato) "pulsa" una volta; all'apertura del modulo no (né con "Riduci movimento",
    // che arriva dopo il primo render).
    if (reduce || !changed || state === 'todo') return;
    pop.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 11, stiffness: 240 }));
  }, [state, reduce, pop, halo]);

  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value, transform: [{ scale: 0.7 + 0.3 * halo.value }] }));

  const filled = state !== 'todo';
  const said = `${label}, passo ${k + 1} di ${n}${state === 'done' ? ', completato' : state === 'current' ? ', in corso' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={st.item}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={said}
      accessibilityHint={onPress ? 'Torna a questo passo' : undefined}
      accessibilityState={{ selected: state === 'current', disabled: !onPress && state !== 'current' }}>
      <View style={st.dotBox}>
        <Animated.View style={[st.halo, haloStyle]} />
        <Animated.View style={[st.dot, filled ? st.dotOn : st.dotOff, dotStyle]}>
          {state === 'done' ? (
            <Ionicons name="checkmark" size={17} color={color.onAccent} />
          ) : (
            <Text style={[type.caption, { fontWeight: '800', color: filled ? color.onAccent : color.textSecondary }]} allowFontScaling={false}>
              {k + 1}
            </Text>
          )}
        </Animated.View>
      </View>
      <Text style={[type.caption, st.label, { color: state === 'current' ? color.accent : state === 'done' ? color.text : color.textTertiary, fontWeight: state === 'todo' ? '500' : '700' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Avanzamento a passi della creazione uscita: cerchi collegati da una linea che si riempie fino al passo in corso,
 * etichette sotto (Attività, Dettagli, Patto, Riepilogo). Le dimensioni non cambiano tra gli stati: nessun salto.
 */
export function Stepper({ labels, index, onPress }: { labels: readonly string[]; index: number; onPress?: (i: number) => void }) {
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const n = labels.length;
  const p = useSharedValue(index);
  useEffect(() => {
    p.value = reduce ? index : withTiming(index, { duration: 360, easing: Easing.out(Easing.cubic) });
  }, [index, reduce, p]);

  const seg = n > 0 ? w / n : 0;
  const track = Math.max(0, w - seg);
  const fill = useAnimatedStyle(() => ({ width: n > 1 ? (track * Math.max(0, Math.min(n - 1, p.value))) / (n - 1) : 0 }));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Passo ${index + 1} di ${n}: ${labels[index] ?? ''}`}>
      {w > 0 ? (
        <View pointerEvents="none" style={[st.track, { left: seg / 2, width: track }]}>
          <Animated.View style={[st.trackFill, fill]} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {labels.map((l, k) => (
          <StepDot key={l} k={k} n={n} label={l} state={k < index ? 'done' : k === index ? 'current' : 'todo'} onPress={onPress && k < index ? () => onPress(k) : undefined} />
        ))}
      </View>
    </View>
  );
}

const st = themedStyles({
  item: { flex: 1, alignItems: 'center', gap: S.xxs, minHeight: 56 },
  dotBox: { width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: color.accentTint },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: color.accent },
  dotOff: { backgroundColor: color.bg, borderWidth: 1.5, borderColor: color.controlBorder },
  label: { letterSpacing: 0.1 },
  track: { position: 'absolute', top: HALO / 2 - LINE / 2, height: LINE, borderRadius: LINE / 2, backgroundColor: color.separator, overflow: 'hidden' },
  trackFill: { height: LINE, backgroundColor: color.accent },
});
