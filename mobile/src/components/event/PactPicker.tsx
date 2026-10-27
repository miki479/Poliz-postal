import { themedStyles , color, R, S, type } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { alpha } from '@/components/event/colors';
import { useReduceMotion } from '@/components/ui';
import { PACT_ICONS, PACT_MODES, PACT_TINT, pactBlocker, type PactMode } from '@/constants/eventStyle';


const BOX = 64;

/**
 * Una modalità del patto: icona in un riquadro e nome sotto, come nel mockup. Scelta: riquadro colorato con la spunta,
 * e una piccola pulsazione. Se un'altra modalità attiva non si combina, la tessera è spenta (ma toccarla spiega perché).
 */
function PactTile({ mode, on, blocker, onPress }: { mode: PactMode; on: boolean; blocker: PactMode | null; onPress: () => void }) {
  const reduce = useReduceMotion();
  const d = PACT_ICONS[mode];
  const lit = useSharedValue(on ? 1 : 0);
  const pop = useSharedValue(1);
  // Pulsa solo quando la modalità viene accesa, non al montaggio (tornando al passo, o prima che arrivi "Riduci movimento").
  const was = useRef(on);
  useEffect(() => {
    lit.value = reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
    const turnedOn = on && !was.current;
    was.current = on;
    if (reduce || !turnedOn) return;
    pop.value = withSequence(withTiming(0.9, { duration: 80 }), withSpring(1, { damping: 9, stiffness: 240 }));
  }, [on, reduce, lit, pop]);
  const boxStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fill = useAnimatedStyle(() => ({ opacity: lit.value }));
  const off = !!blocker;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={d.label}
      accessibilityHint={blocker ? `Non si combina con «${PACT_ICONS[blocker].label}».` : d.hint}
      accessibilityState={{ checked: on, disabled: off }}
      style={({ pressed }) => [s.tile, { opacity: off ? 0.45 : pressed ? 0.75 : 1 }]}>
      <Animated.View style={[s.box, { borderColor: on ? PACT_TINT : 'transparent' }, boxStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(PACT_TINT, 0.18) }, fill]} />
        <Ionicons name={d.icon} size={28} color={on ? PACT_TINT : color.textSecondary} />
        {on ? (
          <View style={s.badge}>
            <Ionicons name="checkmark-circle" size={18} color={PACT_TINT} />
          </View>
        ) : off ? (
          <View style={s.badge}>
            <Ionicons name="remove-circle" size={18} color={color.textTertiary} />
          </View>
        ) : null}
      </Animated.View>
      <Text style={[type.caption, s.label, { color: on ? PACT_TINT : color.textSecondary, fontWeight: on ? '700' : '500' }]} numberOfLines={2}>
        {d.label}
      </Text>
    </Pressable>
  );
}

/** Tre tessere per riga: le sei modalità restano tutte in vista (in una fila sola i nomi lunghi non ci starebbero). */
const PER_ROW = 3;
const ROWS: PactMode[][] = [];
for (let i = 0; i < PACT_MODES.length; i += PER_ROW) ROWS.push(PACT_MODES.slice(i, i + PER_ROW));

/**
 * Patto di corsa a tessere come nel mockup: ogni modalità con la sua icona nel riquadro e il nome sotto.
 * Sotto, il significato dell'ultima toccata (o il motivo per cui non si può scegliere): altezza fissa, niente salti.
 */
export function PactTiles({ on, onToggle }: { on: Record<PactMode, boolean>; onToggle: (m: PactMode) => void }) {
  const [focus, setFocus] = useState<PactMode | null>(null);
  const active = PACT_MODES.filter((m) => on[m]);
  const blockerOf = (m: PactMode) => (on[m] ? null : pactBlocker(m, active));
  const press = (m: PactMode) => {
    setFocus(m);
    if (!blockerOf(m)) onToggle(m);
  };
  let note = 'Tocca un impegno per sceglierlo: puoi sceglierne più di uno.';
  if (focus) {
    const b = blockerOf(focus);
    const d = PACT_ICONS[focus];
    note = b ? `«${d.label}» non si combina con «${PACT_ICONS[b].label}»: togli prima quella.` : `${d.label}: ${d.hint}`;
  }
  return (
    <View style={{ gap: S.sm }}>
      <View style={{ gap: S.sm }} accessibilityLabel="Modalità del patto di corsa">
        {ROWS.map((row) => (
          <View key={row.join('-')} style={{ flexDirection: 'row', gap: S.xs }}>
            {row.map((m) => (
              <PactTile key={m} mode={m} on={on[m]} blocker={blockerOf(m)} onPress={() => press(m)} />
            ))}
            {Array.from({ length: PER_ROW - row.length }, (_, k) => (
              <View key={`gap-${k}`} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
      <Text style={[type.footnote, { color: color.textSecondary, minHeight: type.footnote.lineHeight * 2 }]} accessibilityLiveRegion="polite">
        {note}
      </Text>
    </View>
  );
}

const s = themedStyles({
  tile: { flex: 1, alignItems: 'center', gap: S.xs + 2, paddingVertical: S.xxs },
  box: { width: BOX, height: BOX, borderRadius: R.card, borderWidth: 1.5, backgroundColor: color.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 3, right: 3 },
  label: { textAlign: 'center', minHeight: 32 },
});
