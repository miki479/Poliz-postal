import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Button, useReduceMotion } from '@/components/ui';
import { SESSION_FIGURE } from '@/constants/figureImages';
import { color, R, S, type } from '@/constants/theme';

export interface BuildStep { label: string; state: 'wait' | 'run' | 'done' | 'skip' }

/**
 * Schermata di creazione del piano: il corridore corre dentro un anello di luce e sotto scorrono i passaggi veri,
 * man mano che il server e il coach li completano. A fine lavoro compare "Visualizza il tuo piano".
 */
export function PlanBuilding({ steps, done, intro, error, onOpen, onRetry }: { steps: BuildStep[]; done: boolean; intro: string | null; error: string; onOpen: () => void; onRetry: () => void }) {
  const reduce = useReduceMotion();
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (reduce || done || error) { cancelAnimation(spin); cancelAnimation(bob); return; }
    spin.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 200 })), -1, false);
    return () => { cancelAnimation(spin); cancelAnimation(bob); };
  }, [reduce, done, error, spin, bob]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const man = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 4 }] }));
  const current = steps.find((s) => s.state === 'run');
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingHorizontal: S.xl, justifyContent: 'center', gap: S.xxl }}>
      <View style={{ alignItems: 'center', gap: S.lg }}>
        <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 4, borderColor: 'transparent', borderTopColor: error ? color.danger : done ? color.success : color.accent, borderRightColor: (done ? color.success : color.accent) + '55' }, ring]} />
          <Animated.View style={man}>
            {done ? <Ionicons name="checkmark" size={56} color={color.success} /> : <Image source={SESSION_FIGURE.run.src} resizeMode="contain" tintColor={color.text} style={{ width: 70, height: 70 }} />}
          </Animated.View>
        </View>
        <Text style={[type.title1, { color: color.text, textAlign: 'center' }]}>{error ? 'Qualcosa non è andato' : done ? 'Il tuo piano è pronto' : 'Costruisco il tuo piano'}</Text>
        {!done && !error && current ? <Text style={[type.subhead, { color: color.accent, fontWeight: '700' }]} accessibilityLiveRegion="polite">{current.label}…</Text> : null}
      </View>

      <View style={{ gap: S.md }}>
        {steps.map((s, i) => (
          <Animated.View key={s.label} entering={reduce ? undefined : FadeInDown.delay(i * 90).duration(260)} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, opacity: s.state === 'wait' ? 0.4 : 1 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: s.state === 'done' ? color.success : s.state === 'run' ? color.accentTint : color.surface, borderWidth: s.state === 'skip' ? 1 : 0, borderColor: color.controlBorder }}>
              {s.state === 'done' ? <Ionicons name="checkmark" size={15} color="#05140D" /> : s.state === 'run' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} /> : s.state === 'skip' ? <Ionicons name="remove" size={14} color={color.textSecondary} /> : null}
            </View>
            <Text style={[type.subhead, { color: s.state === 'run' ? color.text : color.textSecondary, fontWeight: s.state === 'run' ? '700' : '500', flex: 1 }]}>{s.label}</Text>
          </Animated.View>
        ))}
      </View>

      {done && intro ? <Text style={[type.subhead, { color: color.textSecondary, borderLeftWidth: 3, borderLeftColor: color.accent, paddingLeft: S.md, borderRadius: R.sm }]}>{intro}</Text> : null}
      {error ? <Text style={[type.subhead, { color: color.danger, textAlign: 'center' }]}>{error}</Text> : null}
      {done ? <Button title="Visualizza il tuo piano" iconName="arrow-forward" onPress={onOpen} /> : error ? <Button title="Riprova" onPress={onRetry} /> : null}
    </View>
  );
}
