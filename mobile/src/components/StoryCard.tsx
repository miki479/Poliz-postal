import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useId, useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { ActivityGlyph } from '@/components/SportIcon';
import { PressableScale, useReduceMotion } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { dayAgo, fmtDate } from '@/lib/format';
import { alpha, mix, storyPalette, type StoryPalette } from '@/lib/storyPalette';
import type { WorkoutLog } from '@shared/types.ts';

const W = 138;
const H = 184;
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const INK = 'rgba(255,255,255,0.85)';

/** Durata dell'effetto periodico per variante. */
const CYCLE_MS = { trace: 2600, sweep: 2200, spark: 2400, wave: 2600 } as const;

/**
 * Card di un racconto (mockup "Racconti nel Profilo"): al posto della foto, la sfumatura dei colori REALI dell'attività
 * (o delle attività del giorno) con la sua figura grande e un alone; in basso tipo e data. Nessun numero prima dell'apertura.
 * Ogni tanto (intervalli irregolari, ma sempre gli stessi per quel racconto) compare un piccolo effetto diverso da racconto
 * a racconto: riflesso, particelle, onda cromatica o un passo della figura. Le pause non consumano frame; tutto si ferma
 * fuori schermata e con "Riduci movimento" (card statica).
 *
 * `width` (facoltativa): per le griglie; l'altezza segue le proporzioni del mockup. Senza, misura fissa 138 × 184.
 */
export function StoryCard({ log, all, seen, width }: { log: WorkoutLog; all: WorkoutLog[]; seen?: boolean; width?: number }) {
  const still = useReduceMotion();
  const focused = useIsFocused();
  const p = useMemo(() => storyPalette(log, all), [log, all]);
  const cyc = useSharedValue(0);
  const w = width ?? W;
  const h = width ? Math.round(width * 1.12) : H;
  const fig = Math.round(Math.min(w * 0.62, h * 0.5));

  // Effetto periodico: timer JS tra un ciclo e l'altro, animazione sul thread UI.
  const effect = p.variant;
  useEffect(() => {
    if (still || !focused) {
      cancelAnimation(cyc);
      cyc.set(0);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const dur = CYCLE_MS[effect];
    const cycle = (n: number) => {
      // pausa irregolare ma deterministica: 4–11 s
      const wait = 4000 + ((p.seed % 9973) * (n + 3) * 7919) % 7000;
      timer = setTimeout(() => {
        if (!alive) return;
        cyc.set(0);
        cyc.set(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.cubic) }));
        cycle(n + 1);
      }, wait + (n ? dur : 0));
    };
    cycle(0);
    return () => {
      alive = false;
      clearTimeout(timer);
      cancelAnimation(cyc);
    };
  }, [still, focused, effect, p.seed, cyc]);

  return (
    <PressableScale onPress={() => router.push({ pathname: '/allenamento/storie/[id]', params: { id: log.id } })} accessibilityRole="button" accessibilityLabel={`Apri il racconto: ${log.title}, ${p.label}, ${dayAgo(log.startedAt)}${seen ? '' : ', da vedere'}`} style={{ width: w, height: h }}>
      <View style={{ flex: 1, borderRadius: R.card, overflow: 'hidden', borderWidth: seen ? 1 : 2, borderColor: seen ? 'rgba(255,255,255,0.12)' : alpha(p.a, 0.85), backgroundColor: p.deep }}>
        <LinearGradient colors={[mix(p.a, p.deep, 0.08), mix(p.mid, p.deep, 0.42), p.deep]} locations={[0, 0.6, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={FILL} />
        {/* riflesso fisso in alto e velo in basso: profondità e leggibilità del testo */}
        <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.4 }} style={FILL} pointerEvents="none" />
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0.5, 1]} style={FILL} pointerEvents="none" />

        <Figure p={p} cyc={cyc} size={fig} top={Math.round(h * 0.1)} animate={!still && effect === 'trace'} />
        {!still && effect !== 'trace' ? <Ambient effect={effect} p={p} cyc={cyc} w={w} h={h} /> : null}

        <View style={{ flex: 1, padding: S.md, justifyContent: 'flex-end' }}>
          <Text style={[type.headline, { color: color.storyInk }]} numberOfLines={1}>
            {p.label}
          </Text>
          <Text style={[type.caption, { color: 'rgba(255,255,255,0.82)' }]} numberOfLines={1}>
            {fmtDate(log.startedAt)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

/* ---------- figura (al posto della foto) ---------- */

/** Alone sfumato e figura dell'attività; nella variante "trace" la figura fa un piccolo passo ogni tanto. */
function Figure({ p, cyc, size, top, animate }: { p: StoryPalette; cyc: SharedValue<number>; size: number; top: number; animate: boolean }) {
  const gid = `sc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const amp = animate ? 1 : 0;
  const step = useAnimatedStyle(() => {
    const k = Math.sin(cyc.get() * Math.PI) * amp;
    return { transform: [{ translateX: k * 6 }, { translateY: -k * 4 }] };
  });
  const halo = size * 1.5;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }}>
      <Svg width={halo} height={halo} style={{ position: 'absolute', top: (size - halo) / 2 }}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={mix(p.second, '#FFFFFF', 0.35)} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={p.second} stopOpacity={0.14} />
            <Stop offset="1" stopColor={p.second} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={halo / 2} cy={halo / 2} r={halo / 2} fill={`url(#${gid})`} />
      </Svg>
      <Animated.View style={[{ opacity: 0.9 }, step]}>
        <ActivityGlyph style={p.styles[0]} size={size} color={color.storyInk} />
      </Animated.View>
    </View>
  );
}

/* ---------- effetti periodici ---------- */

function Ambient({ effect, p, cyc, w, h }: { effect: 'sweep' | 'spark' | 'wave'; p: StoryPalette; cyc: SharedValue<number>; w: number; h: number }) {
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(cyc.get(), [0, 0.1, 0.8, 1], [0, 1, 1, 0]) }));
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[FILL, fade]}>
      {effect === 'sweep' ? <Sweep cyc={cyc} w={w} /> : null}
      {effect === 'spark' ? [0.2, 0.5, 0.78].map((x, i) => <Spark key={i} cyc={cyc} x={x} i={i} w={w} h={h} />) : null}
      {effect === 'wave' ? <Wave cyc={cyc} tint={p.second} h={h} /> : null}
    </Animated.View>
  );
}

function Sweep({ cyc, w }: { cyc: SharedValue<number>; w: number }) {
  const s = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(cyc.get(), [0, 1], [-60, w + 30]) }, { rotate: '16deg' }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: -20, bottom: -20, width: 46 }, s]}>
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.28)', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

function Spark({ cyc, x, i, w, h }: { cyc: SharedValue<number>; x: number; i: number; w: number; h: number }) {
  const size = 4 + (i % 2);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(cyc.get(), [0, 1], [0, -50 - i * 18]) }] }));
  return <Animated.View style={[{ position: 'absolute', left: w * x, top: h * 0.7, width: size, height: size, borderRadius: size / 2, backgroundColor: INK }, s]} />;
}

function Wave({ cyc, tint, h }: { cyc: SharedValue<number>; tint: string; h: number }) {
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(cyc.get(), [0, 1], [h, -70]) }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, height: 70 }, s]}>
      <LinearGradient colors={['transparent', alpha(tint, 0.42), 'transparent']} style={{ flex: 1 }} />
    </Animated.View>
  );
}
