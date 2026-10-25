import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { alpha, shade } from '@/components/event/colors';
import { ActivityGlyph } from '@/components/SportIcon';
import { useReduceMotion } from '@/components/ui';
import { EVENT_SPORTS, eventSportStyle } from '@/constants/eventStyle';
import { color, R, S, type } from '@/constants/theme';
import { SPORT_LABEL } from '@/lib/format';
import type { SportId } from '@shared/types.ts';

/** Tre tessere per riga, come nel mockup "Tipo di attività". */
const PER_ROW = 3;
const ROWS: SportId[][] = [];
for (let i = 0; i < EVENT_SPORTS.length; i += PER_ROW) ROWS.push(EVENT_SPORTS.slice(i, i + PER_ROW));

/**
 * Selezione animata comune: la tessera scelta si accende (dissolvenza) e "pulsa" una volta.
 * Pulsa solo quando la scelta cambia davvero, non al montaggio: tornando al passo la tessera già scelta resta ferma,
 * e con "Riduci movimento" non c'è il colpo iniziale (la preferenza arriva dopo il primo render).
 */
function useSelect(on: boolean) {
  const reduce = useReduceMotion();
  const lit = useSharedValue(on ? 1 : 0);
  const pop = useSharedValue(1);
  const was = useRef(on);
  useEffect(() => {
    lit.value = reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) });
    const turnedOn = on && !was.current;
    was.current = on;
    if (reduce || !turnedOn) return;
    pop.value = withSequence(withTiming(0.94, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 220 }));
  }, [on, reduce, lit, pop]);
  return { lit, pop };
}

/**
 * Tessera grande del tipo di attività: sfumatura piena nei colori ufficiali dell'attività (corsa + camminata unisce i due),
 * figura e nome in bianco. Come nel mockup tutte le tessere restano a tutto colore: la scelta si riconosce dalla spunta,
 * dal bordo bianco e dalla sfumatura più luminosa (mai dal solo colore).
 * Il bianco resta leggibile: le sfumature sono scurite (≥ 0,4, vedi colors.ts).
 */
function TypeCard({ sport, on, onPress }: { sport: SportId; on: boolean; onPress: () => void }) {
  const st = eventSportStyle(sport);
  const [c1, c2] = st.blend ?? [st.solid, st.solid];
  const { lit, pop } = useSelect(on);
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const bright = useAnimatedStyle(() => ({ opacity: lit.value }));
  const check = useAnimatedStyle(() => ({ opacity: lit.value, transform: [{ scale: 0.6 + 0.4 * lit.value }] }));
  const label = SPORT_LABEL[sport];
  return (
    <Animated.View style={[{ flex: 1 }, wrap]}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={({ pressed }) => [s.card, { borderColor: on ? color.text : 'transparent' }, pressed && { opacity: 0.85 }]}>
        <LinearGradient colors={[shade(c1, 0.52), shade(c2, 0.68)]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, bright]}>
          <LinearGradient colors={[shade(c1, 0.4), shade(c2, 0.6)]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[s.check, check]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Ionicons name="checkmark-circle" size={22} color={color.storyInk} />
        </Animated.View>
        <View>
          <ActivityGlyph style={st} size={48} color={color.storyInk} />
        </View>
        <Text style={[type.headline, s.cardLabel, { color: color.storyInk }]} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Scelta del tipo come nel mockup "Creazione uscita": tessere verticali a tutto colore, tre per riga. */
export function TypeCards({ value, onChange }: { value: SportId; onChange: (s: SportId) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tipo di attività" style={{ gap: S.sm }}>
      {ROWS.map((row) => (
        <View key={row.join('-')} style={{ flexDirection: 'row', gap: S.sm }}>
          {row.map((sp) => (
            <TypeCard key={sp} sport={sp} on={value === sp} onPress={() => onChange(sp)} />
          ))}
          {/* Le tessere dell'ultima riga restano larghe come le altre. */}
          {Array.from({ length: PER_ROW - row.length }, (_, k) => (
            <View key={`gap-${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Tessera piccola ("Cosa vuoi fare?"): figura e nome, la scelta si colora dell'attività. */
function TypeTile({ sport, on, onPress }: { sport: SportId; on: boolean; onPress: () => void }) {
  const st = eventSportStyle(sport);
  const { lit, pop } = useSelect(on);
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const glow = useAnimatedStyle(() => ({ opacity: lit.value }));
  const label = SPORT_LABEL[sport];
  return (
    <Animated.View style={[{ flex: 1 }, wrap]}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={({ pressed }) => [s.tile, { borderColor: on ? st.solid : 'transparent' }, pressed && { opacity: 0.75 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(st.solid, 0.16) }, glow]} />
        <View>
          <ActivityGlyph style={st} size={26} color={on ? st.solid : color.textSecondary} />
        </View>
        <Text style={[type.caption, s.tileLabel, { color: on ? st.solid : color.textSecondary, fontWeight: on ? '700' : '500' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Riga compatta dei tipi ("Cosa vuoi fare?"), nello stesso ordine della scelta grande. */
export function TypeTiles({ value, onChange }: { value: SportId; onChange: (s: SportId) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Cosa vuoi fare?" style={{ flexDirection: 'row', gap: S.xs + 2 }}>
      {EVENT_SPORTS.map((sp) => (
        <TypeTile key={sp} sport={sp} on={value === sp} onPress={() => onChange(sp)} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // Tessera verticale come nel mockup: figura e nome nella parte alta, sotto la sfumatura libera.
  // Più alta che larga (circa 2:1, come nel mockup 27-8); flexGrow: le tessere di una riga restano alte uguali anche con testo grande.
  card: { flexGrow: 1, minHeight: 200, borderRadius: R.card, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-start', gap: S.md, paddingHorizontal: S.sm, paddingTop: S.xxl + S.xs, paddingBottom: S.lg },
  cardLabel: { textAlign: 'center', fontWeight: '700' },
  check: { position: 'absolute', top: S.sm, right: S.sm },
  tile: { flexGrow: 1, minHeight: 84,borderRadius: R.card - 2, borderWidth: 1.5, backgroundColor: color.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: S.xs + 2, paddingHorizontal: 1, paddingVertical: S.sm },
  tileLabel: { textAlign: 'center', fontSize: 11.5, lineHeight: 14, letterSpacing: -0.1 },
});
