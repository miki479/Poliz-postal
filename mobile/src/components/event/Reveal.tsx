import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReduceMotion } from '@/components/ui';
import { M } from '@/constants/theme';

/**
 * Pannello che si apre e si chiude (la scala delle distanze, la scala del ritmo): l'altezza scorre sul thread
 * dell'interfaccia, così ciò che sta sotto scende e risale in modo fluido invece di saltare. Il contenuto resta montato
 * (niente stato perso) ed è misurato da solo; chiuso non riceve tocchi e non è letto dallo screen reader.
 * Il contenuto sta nel flusso (in React Native i figli non si restringono): dentro il contenitore ritagliato conserva la sua
 * altezza naturale, che `onLayout` misura. Prima della prima misura un pannello già aperto non ha vincoli di altezza:
 * compare subito alla sua altezza invece di partire da zero e saltare al fotogramma dopo.
 * Con "Riduci movimento" si apre e si chiude subito.
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReduceMotion();
  const h = useSharedValue(-1); // -1 = non ancora misurato
  const p = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    const to = open ? 1 : 0;
    p.value = reduce ? to : withTiming(to, { duration: M.local + 60, easing: Easing.out(Easing.cubic) });
  }, [open, reduce, p]);

  const style = useAnimatedStyle(() => {
    if (h.value >= 0) return { height: h.value * p.value, opacity: p.value };
    return p.value >= 1 ? {} : { height: 0, opacity: 0 };
  });

  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]} pointerEvents={open ? 'box-none' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      <View
        style={{ flexShrink: 0 }}
        onLayout={(e) => {
          h.value = e.nativeEvent.layout.height;
        }}>
        {children}
      </View>
    </Animated.View>
  );
}
