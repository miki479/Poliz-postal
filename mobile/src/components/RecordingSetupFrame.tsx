import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { IconButton, Row, t, useReduceMotion } from '@/components/ui';
import { color, GUTTER, R, S, type } from '@/constants/theme';

/**
 * Alone dell'azione dominante (Avvia): pulsa piano, fermo con "Riduci movimento" e durante la preparazione.
 * Il pulsante resta inline nel frame: dice sempre cosa succede (Avvia, Preparo, Recupera).
 */
function StartGlow({ disabled, starting }: { disabled: boolean; starting: boolean }) {
  const reduce = useReduceMotion();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduce || disabled || starting) { cancelAnimation(glow); glow.value = 0; return; }
    glow.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [reduce, disabled, starting, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.18 + glow.value * 0.3, transform: [{ scale: 1 + glow.value * 0.045 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -6, bottom: -6, left: -6, right: -6, borderRadius: 38, backgroundColor: color.accent }, halo]} />;
}

/** Mappa flessibile, card apribile e azione nel flusso: la preparazione non scorre. */
export function RecordingSetupFrame({ map, summary, subtitle, onOptions, onClose, onStart, starting, disabled, resume = false, insets }: {
  map: ReactNode; summary: string; subtitle: string; onOptions(): void; onClose(): void; onStart(): void;
  starting: boolean; disabled: boolean; resume?: boolean; insets: { top: number; bottom: number };
}) {
  return <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.sm }}>
    <Row style={{ paddingHorizontal: GUTTER, paddingBottom: S.sm }}>
      <Text style={[t.h2, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">Registra</Text>
      <IconButton name="close" label="Chiudi" filled onPress={onClose} />
    </Row>
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: S.md }}>{map}</View>
    <View style={{ flexShrink: 0, paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: insets.bottom + S.sm, gap: S.sm }}>
      <View>
        <View pointerEvents="none" style={{ position: 'absolute', top: -5, left: 10, right: 10, height: 28, borderRadius: R.card, backgroundColor: color.brandTint, borderWidth: 1, borderColor: color.separator }} />
        <Pressable onPress={onOptions} accessibilityRole="button" accessibilityLabel={`Apri opzioni registrazione. ${summary}. ${subtitle}`} accessibilityHint="Apre attività, gruppo, attrezzatura e condivisione" style={({ pressed }) => ({ minHeight: 76, borderRadius: R.card, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder, paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.xs, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ alignSelf: 'center', width: 32, height: 3, borderRadius: 2, backgroundColor: color.controlBorder }} />
          <Row>
            <Ionicons name="options-outline" size={24} color={color.accent} />
            <View style={{ flex: 1, gap: S.xs }}><Text style={t.title} numberOfLines={1}>{summary}</Text><Text style={t.small}>{subtitle}</Text></View>
            <Ionicons name="chevron-up" size={21} color={color.textSecondary} />
          </Row>
        </Pressable>
      </View>
      <View>
        <StartGlow disabled={disabled} starting={starting} />
        <Pressable onPress={onStart} disabled={disabled} accessibilityRole="button" accessibilityLabel={starting ? 'Preparo la registrazione' : resume ? 'Recupera l’attività salvata' : 'Avvia la registrazione'} accessibilityState={{ busy: starting, disabled }} style={({ pressed }) => ({ minHeight: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, backgroundColor: color.accent, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
          <Ionicons name={resume ? 'refresh' : 'play'} size={28} color={color.onAccent} />
          <Text style={[type.title2, { color: color.onAccent, fontWeight: '800' }]}>{starting ? 'Preparo…' : resume ? 'Recupera l’attività' : 'Avvia'}</Text>
        </Pressable>
      </View>
    </View>
  </View>;
}
