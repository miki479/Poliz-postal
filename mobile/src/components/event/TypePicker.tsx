import { themedStyles , color, R, S, type } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { alpha, shade } from '@/components/event/colors';
import { ActivityGlyph, AnimatedActivityFigure } from '@/components/SportIcon';
import { useReduceMotion } from '@/components/ui';
import { EVENT_SPORTS, eventSportStyle } from '@/constants/eventStyle';

import { SPORT_LABEL } from '@/lib/format';
import type { SportId } from '@shared/types.ts';

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
    if (reduce) { cancelAnimation(pop); pop.value = 1; return; }
    if (!turnedOn) return;
    pop.value = withSequence(withTiming(0.94, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 220 }));
  }, [on, reduce, lit, pop]);
  return { lit, pop };
}

/** Onde astratte: nessun percorso inventato, animazione sul thread UI e ferma fuori schermata. */
function CardAmbient({ on, tint }: { on: boolean; tint: string }) {
  const reduce = useReduceMotion();
  const focused = useIsFocused();
  const drift = useSharedValue(0);
  const strength = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    strength.value = reduce ? Number(on) : withTiming(Number(on), { duration: 300 });
  }, [on, reduce, strength]);
  useEffect(() => {
    if (reduce || !focused) { cancelAnimation(drift); drift.value = 0; return; }
    drift.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduce, focused, drift]);
  const motion = useAnimatedStyle(() => ({ opacity: 0.1 + strength.value * 0.19, transform: [{ translateX: -8 + drift.value * 16 }, { translateY: drift.value * -7 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: strength.value * 0.28, transform: [{ scale: 0.9 + drift.value * 0.1 }] }));
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View style={[{ position: 'absolute', width: 132, height: 132, borderRadius: 66, left: -28, top: -52, backgroundColor: tint }, halo]} />
    <Animated.View style={[{ position: 'absolute', left: -24, right: -24, bottom: -16, height: 100 }, motion]}>
      <Svg width="100%" height="100%" viewBox="0 0 160 100" preserveAspectRatio="none">
        <Path d="M-10 40 C35 5 70 75 110 43 S175 25 185 48" stroke={color.storyInk} strokeWidth={1.3} fill="none" />
        <Path d="M-10 60 C35 25 70 95 110 63 S175 45 185 68" stroke={tint} strokeWidth={12} fill="none" />
        <Path d="M-10 78 C35 43 70 113 110 81 S175 63 185 86" stroke={color.storyInk} strokeWidth={0.8} fill="none" />
      </Svg>
    </Animated.View>
  </View>;
}


/** Particelle astratte (solo al tocco): forma e direzione dipendono dal tipo. Ferme con "Riduci movimento". */
const SHAPES: Record<string, { n: number; w: number; h: number; r: number; spread: number; up: number }> = {
  running: { n: 9, w: 14, h: 3, r: 2, spread: 1.7, up: 0 }, // scie orizzontali verso destra
  walking: { n: 8, w: 6, h: 6, r: 3, spread: 0.8, up: -1 }, // bolle lente che salgono
  trail: { n: 8, w: 7, h: 7, r: 1, spread: 1.1, up: -0.4 }, // schegge rotate (sassi)
  run_walk: { n: 9, w: 9, h: 4, r: 2, spread: 1.3, up: -0.5 },
  other: { n: 8, w: 5, h: 5, r: 3, spread: 1, up: 0 },
};
function Particle({ burst, i, n, shape, tint }: { burst: number; i: number; n: number; shape: (typeof SHAPES)[string]; tint: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!burst) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 700 + (i % 3) * 120, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(t);
  }, [burst, i, t]);
  const angle = (i / n) * Math.PI * 2 + (i % 2) * 0.35;
  const dist = (26 + (i % 4) * 9) * shape.spread;
  const st = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value * (shape.up === 0 && shape.spread > 1.5 ? 1.4 : 1) },
      { translateY: Math.sin(angle) * dist * t.value * 0.7 + shape.up * 22 * t.value },
      { rotate: `${shape.r === 1 ? t.value * 180 : Math.cos(angle) < 0 ? 180 : 0}deg` },
      { scale: 1 - t.value * 0.4 },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', left: '50%', top: '48%', width: shape.w, height: shape.h, borderRadius: shape.r, backgroundColor: tint }, st]} />;
}
function TapBurst({ sport, on }: { sport: SportId; on: boolean }) {
  const reduce = useReduceMotion();
  const [burst, setBurst] = useState(0);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current && !reduce) setBurst((b) => b + 1);
    was.current = on;
  }, [on, reduce]);
  if (!burst || reduce) return null;
  const shape = SHAPES[sport] ?? SHAPES.other;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {Array.from({ length: shape.n }, (_, i) => <Particle key={`${burst}-${i}`} burst={burst} i={i} n={shape.n} shape={shape} tint={i % 2 ? color.storyInk : alpha(color.storyInk, 0.6)} />)}
  </View>;
}

/**
 * Tessera grande del tipo di attività: sfumatura piena nei colori ufficiali dell'attività (corsa + camminata unisce i due),
 * figura e nome in bianco. Come nel mockup tutte le tessere restano a tutto colore: la scelta si riconosce dalla spunta,
 * dal bordo turchese e dalla sfumatura più luminosa (mai dal solo colore).
 * Il bianco resta leggibile: le sfumature sono scurite (≥ 0,4, vedi colors.ts).
 */
function TypeCard({ sport, on, onPress }: { sport: SportId; on: boolean; onPress: () => void }) {
  const focused = useIsFocused();
  const st = eventSportStyle(sport);
  const [c1, c2] = st.blend ?? [st.solid, st.solid];
  const { lit, pop } = useSelect(on);
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const bright = useAnimatedStyle(() => ({ opacity: lit.value }));
  const check = useAnimatedStyle(() => ({ opacity: lit.value, transform: [{ scale: 0.6 + 0.4 * lit.value }] }));
  const label = SPORT_LABEL[sport];
  return (
    <Animated.View style={[{ flex: 1 }, wrap]}>
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={({ pressed }) => [s.card, { borderColor: on ? color.accent : 'transparent' }, pressed && { opacity: 0.85 }]}>
        <LinearGradient colors={[shade(c1, 0.52), shade(c2, 0.68)]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, bright]}>
          <LinearGradient colors={[shade(c1, 0.4), shade(c2, 0.6)]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <CardAmbient on={on} tint={color.brandText} />
        <TapBurst sport={sport} on={on} />
        <Animated.View style={[s.check, check]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Ionicons name="checkmark-circle" size={22} color={color.storyInk} />
        </Animated.View>
        <View>
          {st.glyph ? <AnimatedActivityFigure glyph={st.glyph} size={46} color={color.storyInk} active={on && focused} /> : <ActivityGlyph style={st} size={46} color={color.storyInk} />}
        </View>
        <Text style={[type.headline, s.cardLabel, { color: color.storyInk }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const ITEM_W = 150;
const FIG = 112;

/** Disegni a contorno (bianco su trasparente, colorati dal tema): corsa con le linee di vento, camminata/trail con lo zaino. */
const FIGURE_IMAGE: Partial<Record<SportId, { src: number; w: number }>> = {
  running: { src: require('../../../assets/images/fig-run.png'), w: 144 },
  run_walk: { src: require('../../../assets/images/fig-run.png'), w: 144 },
  walking: { src: require('../../../assets/images/fig-hike.png'), w: 74 },
  trail: { src: require('../../../assets/images/fig-hike.png'), w: 74 },
};

/** Linee di vento tratteggiate e semitrasparenti dietro la figura: scorrono solo per lo sport al centro. */
function WindLines({ active, tint }: { active: boolean; tint: string }) {
  const reduce = useReduceMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(drift); drift.value = 0; return; }
    drift.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(drift);
  }, [active, reduce, drift]);
  const st = useAnimatedStyle(() => ({ opacity: active ? 0.55 - drift.value * 0.35 : 0.15, transform: [{ translateX: -drift.value * 22 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -34, top: FIG * 0.2, width: 70, height: FIG * 0.6 }, st]}>
      <Svg width="100%" height="100%" viewBox="0 0 70 60">
        <Path d="M4 12 H52" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="10 7" />
        <Path d="M0 30 H62" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="14 8" />
        <Path d="M8 48 H46" stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeDasharray="8 7" />
      </Svg>
    </Animated.View>
  );
}

function CarouselItem({ sport, index, x, selected, onPress }: { sport: SportId; index: number; x: SharedValue<number>; selected: boolean; onPress: () => void }) {
  const focused = useIsFocused();
  const st = eventSportStyle(sport);
  const label = SPORT_LABEL[sport];
  const motion = useAnimatedStyle(() => {
    const d = Math.min(1.6, Math.abs(x.value - index * ITEM_W) / ITEM_W);
    return { opacity: 1 - d * 0.62, transform: [{ scale: 1.12 - d * 0.42 }] };
  });
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} style={{ width: ITEM_W, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', gap: S.sm }, motion]}>
        <View style={{ width: ITEM_W, height: FIG, alignItems: 'center', justifyContent: 'center' }}>
          {FIGURE_IMAGE[sport] ? (
            <Image source={FIGURE_IMAGE[sport].src} resizeMode="contain" style={{ width: FIGURE_IMAGE[sport].w, height: FIG }} tintColor={color.text} accessibilityIgnoresInvertColors />
          ) : <ActivityGlyph style={st} size={FIG * 0.62} color={st.solid} />}
          <TapBurst sport={sport} on={selected} />
        </View>
        <Text style={[type.title2, { color: selected ? st.solid : color.textSecondary, fontWeight: '800', letterSpacing: 0.4 }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Carosello orizzontale degli sport: quello scelto sta al centro in primo piano, gli altri si intravedono ai lati più piccoli e
 * sbiaditi. Nessun riquadro: figure in tinta con il loro colore e linee di vento. Si scorre (con aggancio) o si tocca; la scelta
 * cambia quando lo scorrimento si ferma. Le frecce e i puntini mostrano dove si è.
 */
export function TypeCards({ value, onChange }: { value: SportId; onChange: (s: SportId) => void }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const idx = Math.max(0, EVENT_SPORTS.indexOf(value));
  const last = useRef(idx);
  const side = Math.max(0, (w - ITEM_W) / 2);
  const choose = (i: number) => {
    const next = EVENT_SPORTS[Math.max(0, Math.min(EVENT_SPORTS.length - 1, i))];
    if (next !== value) onChange(next);
  };
  const handler = useAnimatedScrollHandler({
    onScroll: (e) => { x.value = e.contentOffset.x; },
    onMomentumEnd: (e) => runOnJS(choose)(Math.round(e.contentOffset.x / ITEM_W)),
    onEndDrag: (e) => { if (Math.abs(e.velocity?.x ?? 0) < 0.05) runOnJS(choose)(Math.round(e.contentOffset.x / ITEM_W)); },
  });
  // Se la scelta cambia da fuori (o per un tocco) il carosello scorre fino allo sport scelto.
  useEffect(() => {
    if (!w) return;
    if (last.current !== idx || Math.abs(x.value - idx * ITEM_W) > 2) ref.current?.scrollTo({ x: idx * ITEM_W, animated: last.current !== idx || x.value > 0 });
    last.current = idx;
  }, [idx, w, ref, x]);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tipo di attività" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginHorizontal: -S.xl, gap: S.sm }}>
      <Animated.ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} snapToInterval={ITEM_W} decelerationRate="fast" scrollEventThrottle={16} onScroll={handler} contentContainerStyle={{ paddingHorizontal: side, paddingVertical: S.lg }} contentOffset={{ x: idx * ITEM_W, y: 0 }}>
        {EVENT_SPORTS.map((sp, i) => (
          <CarouselItem key={sp} sport={sp} index={i} x={x} selected={value === sp} onPress={() => choose(i)} />
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.md }}>
        <Ionicons name="chevron-back" size={18} color={idx === 0 ? color.separator : color.textSecondary} />
        {EVENT_SPORTS.map((sp, i) => (
          <View key={sp} style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 4, backgroundColor: i === idx ? color.accent : color.controlBorder }} />
        ))}
        <Ionicons name="chevron-forward" size={18} color={idx === EVENT_SPORTS.length - 1 ? color.separator : color.textSecondary} />
      </View>
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

const s = themedStyles({
  // L'altezza cresce con il testo; le tessere di ogni riga restano alte uguali.
  card: { flexGrow: 1, minHeight: 124, borderRadius: R.card, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: S.sm, paddingHorizontal: S.sm, paddingTop: S.lg, paddingBottom: S.lg },
  cardLabel: { textAlign: 'center', fontWeight: '700' },
  check: { position: 'absolute', top: S.sm, right: S.sm },
  tile: { flexGrow: 1, minHeight: 84,borderRadius: R.card - 2, borderWidth: 1.5, backgroundColor: color.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: S.xs + 2, paddingHorizontal: 1, paddingVertical: S.sm },
  tileLabel: { textAlign: 'center', fontSize: 11.5, lineHeight: 14, letterSpacing: -0.1 },
});
