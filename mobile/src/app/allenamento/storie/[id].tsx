import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, Pressable, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Rect, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { AwardDetailSheet } from '@/components/AwardConquest';
import { AwardFx, AwardMark, AwardPop, awardFxKey, CountText, fxVariantOf, Rise, Sheen } from '@/components/Results';
import { RouteReplay } from '@/components/RouteReplay';
import { ActivityGlyph } from '@/components/SportIcon';
import { TypeDot } from '@/components/TypeBadge';
import { Loading, Sheet, SwitchRow, useReduceMotion, useScreenReader } from '@/components/ui';
import { CATEGORY, toneOf } from '@/constants/achievements';
import { color, HIT, R, S, type } from '@/constants/theme';
import { briefFor, call, type WorkoutBriefResult } from '@/lib/api';
import { fmtClock, fmtDate, fmtKm } from '@/lib/format';
import { markSeen, seenSet } from '@/lib/seen';
import { alpha, mix, storyPalette, type StoryPalette } from '@/lib/storyPalette';
import { activityAwards, ascending, dedupe, type Award } from '@shared/records.ts';
import { haversineKm } from '@shared/time.ts';
import { countLaps, splits } from '@shared/track.ts';
import { buildMarks } from '@shared/trackMarks.ts';
import type { EventView, PlannedSession, TrackPoint, WorkoutLog } from '@shared/types.ts';

type Slide = 'cover' | 'numbers' | 'route' | 'results' | 'group' | 'brief';

interface StoryData {
  log: WorkoutLog;
  group: boolean;
  logs: WorkoutLog[];
  event: EventView | null;
  /** Dal meno al più importante. */
  awards: Award[];
  /** Riconoscimenti di cui non si è mai vista la festa su questo telefono. */
  fresh: string[];
}

async function load(id: string): Promise<StoryData> {
  const [log, logs, seen] = await Promise.all([call<WorkoutLog>('getWorkoutLog', id), call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]), seenSet()]);
  let eventId = log.eventId ?? null;
  if (!eventId && log.plannedSessionId) eventId = (await call<PlannedSession>('getSession', log.plannedSessionId).catch(() => null))?.eventId ?? null;
  const event = eventId ? await call<EventView>('getEvent', eventId, null).catch(() => null) : null;
  const awards = ascending(activityAwards(log.id, logs.some((l) => l.id === log.id) ? logs : [...logs, log]));
  const companions = await call<unknown[]>('runCompanions', log.id).catch(() => []);
  return { log, logs, event, group: !!log.eventId || companions.length > 0, awards, fresh: awards.filter((a) => !seen.has(awardFxKey(a.id))).map((a) => a.id) };
}

/* ---------- dati reali per le schede ---------- */

const DEEP = '#050709';
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Passo m:ss/km con l'arrotondamento corretto dei secondi (mai "4:60"). */
function paceText(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}/km`;
}

const isTimed = (t: TrackPoint[]) => t.length > 2 && t[t.length - 1].t > t[0].t && t.every((p, i) => i === 0 || p.t >= t[i - 1].t);

/** Settimana lunedì–domenica in UTC, come nel motore dei riconoscimenti. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/** Quante attività (senza duplicati tra fonti, almeno un minuto) nella settimana di `log`, fino a questa compresa. */
function weekCount(log: WorkoutLog, logs: WorkoutLog[]): number {
  const wk = weekKey(log.startedAt);
  const all = logs.some((l) => l.id === log.id) ? logs : [...logs, log];
  return dedupe(all).filter((l) => l.durationSec >= 60 && l.startedAt <= log.startedAt && weekKey(l.startedAt) === wk).length;
}

interface Num {
  key: string;
  label: string;
  text: string;
}

/** Numeri della scheda, nell'ordine che conta per il tipo: corsa → ritmo e distanza, camminata → durata. */
function numbersOf(log: WorkoutLog, focus: StoryPalette['focus']): Num[] {
  const dist: Num | null = log.distanceKm ? { key: 'dist', label: log.distanceSource === 'manual' ? 'Distanza (dichiarata)' : 'Distanza', text: fmtKm(log.distanceKm) } : null;
  const time: Num | null = log.durationSec ? { key: 'time', label: 'Tempo', text: fmtClock(log.durationSec) } : null;
  const pace: Num | null = log.paceSecPerKm ? { key: 'pace', label: 'Passo medio', text: paceText(log.paceSecPerKm) } : null;
  // trail: distanza e durata contano, il passo sui sentieri dipende dal dislivello (resta ultimo, come dato)
  const order = focus === 'run' ? [pace, dist, time] : focus === 'walk' ? [time, dist] : focus === 'trail' || focus === 'mixed' ? [dist, time, pace] : [time, dist, pace];
  return order.filter((n): n is Num => !!n);
}

const shortName = (a: Award) => a.name.replace(/^[^·]+· /, '');

function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------- sfondo cinematografico ---------- */

function bgOf(k: Slide, p: StoryPalette): [string, string, string] {
  switch (k) {
    case 'cover':
      return [mix(p.a, DEEP, 0.32), mix(p.mid, DEEP, 0.66), DEEP];
    case 'numbers':
      return [mix(p.second, DEEP, 0.5), mix(p.a, DEEP, 0.8), DEEP];
    case 'route':
      return [color.bg, color.bg, color.bg];
    case 'results':
      return [mix(p.a, DEEP, 0.42), mix(p.b, DEEP, 0.74), '#07060C'];
    case 'group':
      return ['#173B33', '#0C211C', '#050B09'];
    case 'brief':
      return [mix(p.b, DEEP, 0.52), mix(p.a, DEEP, 0.82), '#08070F'];
  }
}

/** Dove stanno le due luci di colore in ogni scheda (frazioni dello schermo): si spostano a ogni cambio. */
const ANCHORS: Record<Slide, [number, number, number, number]> = {
  cover: [0.15, 0.24, 0.9, 0.62],
  numbers: [0.88, 0.16, 0.08, 0.76],
  route: [0.5, 0.95, 0.5, 1.1],
  results: [0.5, 0.5, 0.18, 0.9],
  group: [0.2, 0.3, 0.86, 0.78],
  brief: [0.82, 0.3, 0.14, 0.62],
};

const MOTES = 12;

/**
 * Sfondo: gradiente della scheda (dissolvenza incrociata), due luci di colore sfumate che derivano lentamente e si
 * spostano a ogni scheda, particelle lente su tre piani di profondità e un riflesso che attraversa ogni tanto.
 * Un solo "orologio" sul thread UI guida tutto; con movimento ridotto è tutto fermo.
 */
function Backdrop({ kind, pal, still, active }: { kind: Slide; pal: StoryPalette; still: boolean; active: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const gid = `bd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const clock = useSharedValue(0);
  const sweep = useSharedValue(0);
  const [ax0, ay0, bx0, by0] = ANCHORS[kind];
  const ax = useSharedValue(ax0);
  const ay = useSharedValue(ay0);
  const bx = useSharedValue(bx0);
  const by = useSharedValue(by0);
  const vis = useSharedValue(kind === 'route' ? 0 : 1);
  // Sulla scheda del percorso luci e particelle sono nascoste: l'orologio si ferma (lavora solo il replay della mappa)
  // e riprende da dove era all'uscita, senza salti.
  const run = !still && active && kind !== 'route';
  // Ritmo per contenuto: la corsa ha particelle più vive e riflessi più frequenti, la camminata è calma e distesa.
  const lively = pal.focus === 'run' || pal.focus === 'trail';
  const tempo = lively ? 2 : 1;
  const sweepMs = lively ? 2000 : pal.focus === 'walk' ? 3200 : 2600;
  const sweepGap = lively ? 4200 : pal.focus === 'walk' ? 8600 : 6200;

  useEffect(() => {
    if (!run) {
      cancelAnimation(clock);
      cancelAnimation(sweep);
      sweep.set(0);
      return;
    }
    // Riprende da dove era (le frequenze sono intere: 1 equivale a 0), così tornando sulla schermata nulla salta.
    const from = Math.min(0.999, Math.max(0, clock.get()));
    const lap = { duration: 60_000, easing: Easing.linear };
    clock.set(withSequence(withTiming(1, { duration: (1 - from) * 60_000, easing: Easing.linear }), withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, lap)), -1, false)));
    sweep.set(0);
    sweep.set(withDelay(1400, withRepeat(withSequence(withTiming(1, { duration: sweepMs, easing: Easing.inOut(Easing.quad) }), withDelay(sweepGap, withTiming(0, { duration: 0 }))), -1, false)));
    return () => {
      cancelAnimation(clock);
      cancelAnimation(sweep);
    };
  }, [run, clock, sweep, sweepMs, sweepGap]);

  useEffect(() => {
    const [a1, a2, b1, b2] = ANCHORS[kind];
    const target = kind === 'route' ? 0 : 1;
    if (still) {
      ax.set(a1);
      ay.set(a2);
      bx.set(b1);
      by.set(b2);
      vis.set(target);
      return;
    }
    const cfg = { duration: 1600, easing: Easing.inOut(Easing.cubic) };
    ax.set(withTiming(a1, cfg));
    ay.set(withTiming(a2, cfg));
    bx.set(withTiming(b1, cfg));
    by.set(withTiming(b2, cfg));
    vis.set(withTiming(target, { duration: 500 }));
  }, [kind, still, ax, ay, bx, by, vis]);

  const RB = Math.round(W * 0.85);
  const blobA = useAnimatedStyle(() => {
    const c = clock.get() * Math.PI * 2;
    return { opacity: vis.get() * 0.9, transform: [{ translateX: ax.get() * W - RB + Math.sin(c * 2) * W * 0.05 }, { translateY: ay.get() * H - RB + Math.cos(c * 3) * H * 0.035 }, { scale: 1 + Math.sin(c * 4) * 0.06 }] };
  });
  const blobB = useAnimatedStyle(() => {
    const c = clock.get() * Math.PI * 2;
    return { opacity: vis.get() * 0.75, transform: [{ translateX: bx.get() * W - RB * 0.8 + Math.cos(c * 2) * W * 0.06 }, { translateY: by.get() * H - RB * 0.8 + Math.sin(c * 3) * H * 0.04 }, { scale: 1 + Math.cos(c * 3) * 0.07 }] };
  });
  const sweepStyle = useAnimatedStyle(() => {
    const x = sweep.get();
    return { opacity: x > 0 && x < 1 ? vis.get() : 0, transform: [{ translateX: -W * 0.55 + x * W * 1.9 }, { rotate: '18deg' }] };
  });
  const motes = useMemo(() => Array.from({ length: MOTES }, (_, i) => ({ x0: rnd(pal.seed, i), base: rnd(pal.seed, 50 + i), layer: i < 6 ? 0 : i < 10 ? 1 : 2, sway: 1 + (i % 3) })), [pal.seed]);
  const rb = RB * 0.8;

  return (
    <View pointerEvents="none" style={FILL} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View key={kind} entering={still ? undefined : FadeIn.duration(700)} exiting={still ? undefined : FadeOut.duration(700)} style={FILL}>
        <LinearGradient colors={bgOf(kind, pal)} locations={[0, 0.55, 1]} style={FILL} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: RB * 2, height: RB * 2 }, blobA]}>
        <Svg width={RB * 2} height={RB * 2}>
          <Defs>
            <RadialGradient id={`${gid}a`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={pal.a} stopOpacity={0.5} />
              <Stop offset="0.6" stopColor={pal.a} stopOpacity={0.14} />
              <Stop offset="1" stopColor={pal.a} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={RB} cy={RB} r={RB} fill={`url(#${gid}a)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: rb * 2, height: rb * 2 }, blobB]}>
        <Svg width={rb * 2} height={rb * 2}>
          <Defs>
            <RadialGradient id={`${gid}b`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={pal.second} stopOpacity={0.45} />
              <Stop offset="0.6" stopColor={pal.second} stopOpacity={0.12} />
              <Stop offset="1" stopColor={pal.second} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={rb} cy={rb} r={rb} fill={`url(#${gid}b)`} />
        </Svg>
      </Animated.View>
      {motes.map((m, i) => (
        <Mote key={i} clock={clock} vis={vis} W={W} H={H} tempo={tempo} {...m} />
      ))}
      {run ? (
        <Animated.View style={[{ position: 'absolute', top: -H * 0.25, height: H * 1.5, left: 0, width: W * 0.32 }, sweepStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const MOTE_SIZE = [2, 3, 5];
const MOTE_OPACITY = [0.22, 0.34, 0.5];
const MOTE_SWAY = [6, 10, 16];

/** Particella: i piani lontani sono piccoli, tenui e lenti; i vicini più grandi e un po' più rapidi. */
function Mote({ clock, vis, W, H, x0, base, layer, sway, tempo }: { clock: SharedValue<number>; vis: SharedValue<number>; W: number; H: number; x0: number; base: number; layer: number; sway: number; tempo: number }) {
  const size = MOTE_SIZE[layer];
  const op = MOTE_OPACITY[layer];
  const amp = MOTE_SWAY[layer];
  const k = (layer + 1) * tempo; // giri interi per ciclo dell'orologio: nessuno scatto quando l'orologio ricomincia
  const s = useAnimatedStyle(() => {
    const c = clock.get();
    const f = (base + c * k) % 1;
    const edge = Math.min(1, f * 6, (1 - f) * 6);
    return { opacity: vis.get() * op * edge, transform: [{ translateX: x0 * W + Math.sin((c * sway + base) * Math.PI * 2) * amp }, { translateY: H * (1.02 - f * 1.1) }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: color.storyInk }, s]} />;
}

/* ---------- transizione tra le schede ---------- */

const EXIT_EASE = Easing.in(Easing.quad);

/**
 * Uscita della scheda: scivola dalla parte opposta al cambio (avanti → a sinistra), arretra un poco e si dissolve,
 * mentre i contenuti della nuova entrano dal lato opposto (Rise). Il verso si legge al momento dell'uscita, sul thread UI:
 * cambiando direzione a metà racconto l'uscita è sempre coerente con il gesto.
 */
function slideExit(dir: SharedValue<number>) {
  return () => {
    'worklet';
    const d = dir.get();
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
      animations: {
        opacity: withTiming(0, { duration: 230, easing: EXIT_EASE }),
        transform: [{ translateX: withTiming(-56 * d, { duration: 280, easing: EXIT_EASE }) }, { scale: withTiming(0.96, { duration: 280, easing: EXIT_EASE }) }],
      },
    };
  };
}

/* ---------- schede ---------- */

const H1 = { color: color.storyInk, ...type.display, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 1 } } as const;
const P = { color: color.storyInkSecondary, ...type.body } as const;
const EYEBROW = { ...type.caption, color: color.storyInkSecondary, fontWeight: '800', letterSpacing: 0.8 } as const;

/* ---------- copertina (mockup "Racconto"): figura, titolo, tipo, distanza e durata, andamento, risultato ---------- */

interface Line {
  ys: number[];
  label: string;
}

const avg3 = (v: number[]) => v.map((_, i) => (v[Math.max(0, i - 1)] + v[i] + v[Math.min(v.length - 1, i + 1)]) / 3);

/**
 * Andamento REALE per la copertina: velocità lungo la distanza (traccia GPS dell'app con i tempi, senza interruzioni),
 * altrimenti il profilo dell'altitudine GPS. Nessuna serie inventata: senza dati utili non c'è la linea.
 */
function lineOf(log: WorkoutLog): Line | null {
  const tr = log.track;
  if (!tr || tr.length < 8) return null;
  if (isTimed(tr) && !log.gpsQuality?.gaps) {
    const cum = [0];
    for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + haversineKm(tr[i - 1], tr[i]));
    const total = cum[cum.length - 1];
    if (total >= 0.3) {
      const n = Math.min(48, Math.max(12, Math.floor(tr.length / 3)));
      const out: number[] = [];
      let i0 = 0;
      for (let k = 0; k < n; k++) {
        const a = (total * k) / n;
        const b = (total * (k + 1)) / n;
        while (i0 < cum.length - 1 && cum[i0 + 1] <= a) i0++;
        let i1 = i0;
        while (i1 < cum.length - 1 && cum[i1] < b) i1++;
        const dt = tr[i1].t - tr[i0].t;
        const dd = cum[i1] - cum[i0];
        if (dt > 0 && dd > 0) out.push(dd / dt);
      }
      if (out.length >= 8) return { ys: avg3(out), label: 'Andamento della velocità lungo il percorso registrato' };
    }
  }
  const alt = tr.map((p) => p.alt).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (alt.length >= 12) {
    const n = Math.min(48, alt.length);
    const ys = Array.from({ length: n }, (_, k) => {
      const a = Math.floor((k * alt.length) / n);
      const b = Math.max(a + 1, Math.floor(((k + 1) * alt.length) / n));
      let s = 0;
      for (let i = a; i < b; i++) s += alt[i];
      return s / (b - a);
    });
    return { ys: avg3(ys), label: 'Profilo dell’altitudine GPS lungo il percorso' };
  }
  return null;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const LINE_H = 84;

/** Linea sfumata nei colori del racconto, con alone e area tenue: si disegna da sinistra a destra una volta. */
function StoryLine({ line, pal, delay, still }: { line: Line; pal: StoryPalette; delay: number; still: boolean }) {
  const gid = `sl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [w, setW] = useState(0);
  const p = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!w) return;
    if (still) {
      cancelAnimation(p);
      p.set(1);
      return;
    }
    p.set(0);
    p.set(withDelay(delay, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) })));
    return () => cancelAnimation(p);
  }, [w, still, delay, p]);
  const clip = useAnimatedProps(() => ({ width: Math.max(0, p.get() * w) }));
  const d = useMemo(() => {
    if (!w) return null;
    const ys = line.ys;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of ys) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    const pad = 10;
    const pts = ys.map((v, i) => [(i / (ys.length - 1)) * w, pad + (1 - (v - lo) / span) * (LINE_H - pad * 2)]);
    let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      const my = (pts[i - 1][1] + pts[i][1]) / 2;
      path += ` Q${pts[i - 1][0].toFixed(1)},${pts[i - 1][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    path += ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
    return { line: path, area: `${path} L${w.toFixed(1)},${LINE_H} L0,${LINE_H} Z` };
  }, [w, line.ys]);
  const end = pal.blend ? pal.b : pal.second;
  return (
    <View accessible accessibilityLabel={line.label} style={{ height: LINE_H, borderRadius: R.card, backgroundColor: 'rgba(5,7,9,0.38)', borderWidth: 1, borderColor: color.storyGlass, overflow: 'hidden' }} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}>
      {d ? (
        <Svg width={w} height={LINE_H}>
          <Defs>
            <SvgGradient id={`${gid}s`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={mix(pal.a, '#FFFFFF', 0.15)} />
              <Stop offset="1" stopColor={mix(end, '#FFFFFF', 0.2)} />
            </SvgGradient>
            <SvgGradient id={`${gid}f`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={pal.a} stopOpacity={0.34} />
              <Stop offset="1" stopColor={pal.a} stopOpacity={0} />
            </SvgGradient>
            <ClipPath id={`${gid}c`}>
              <AnimatedRect x={0} y={0} height={LINE_H} animatedProps={clip} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${gid}c)`}>
            <Path d={d.area} fill={`url(#${gid}f)`} />
            <Path d={d.line} stroke={`url(#${gid}s)`} strokeOpacity={0.3} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d.line} stroke={`url(#${gid}s)`} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </G>
        </Svg>
      ) : null}
    </View>
  );
}

/** Al posto della foto: alone nel colore dell'attività e la sua figura grande (decorativi). */
function HeroFigure({ pal }: { pal: StoryPalette }) {
  const gid = `hf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const size = box ? Math.floor(Math.min(box.h * 0.95, box.w * 0.66, 300)) : 0;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (!box || Math.abs(box.w - width) > 1 || Math.abs(box.h - height) > 1) setBox({ w: width, h: height });
      }}>
      {size >= 72 ? (
        <Rise dy={14} delay={60} duration={700}>
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={FILL}>
              <Defs>
                <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={pal.a} stopOpacity={0.55} />
                  <Stop offset="0.6" stopColor={pal.mid} stopOpacity={0.16} />
                  <Stop offset="1" stopColor={pal.mid} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gid})`} />
            </Svg>
            <View style={{ opacity: 0.94 }}>
              <ActivityGlyph style={pal.styles[0]} size={Math.round(size * 0.66)} color={color.storyInk} />
            </View>
          </View>
        </Rise>
      ) : null}
    </View>
  );
}

function Cover({ log, event, pal, dir, awards, still, onOpen }: { log: WorkoutLog; event: EventView | null; pal: StoryPalette; dir: number; awards: Award[]; still: boolean; onOpen: (a: Award) => void }) {
  const line = useMemo(() => lineOf(log), [log]);
  const where = log.environment === 'treadmill' ? ' · tapis roulant' : '';
  const dist = log.distanceKm ? fmtKm(log.distanceKm) : null;
  const time = log.durationSec ? fmtClock(log.durationSec) : null;
  // dal più importante (i dati del racconto sono in ordine crescente)
  const best = [...awards].reverse();
  const shown = best.slice(0, 4);
  const more = best.length - shown.length;
  return (
    <>
      <HeroFigure pal={pal} />
      <View pointerEvents="none" style={{ gap: S.md }}>
        <Rise dy={20} delay={160} spring>
          <Text style={H1}>{log.title}</Text>
        </Rise>
        <Rise dx={24 * dir} dy={0} delay={260}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <TypeDot style={pal.styles[0]} size={26} />
            <Text style={[type.callout, { color: color.storyInk, fontWeight: '600', flexShrink: 1 }]} numberOfLines={1}>
              {pal.label}
              {where}
              <Text style={{ color: color.storyInkSecondary, fontWeight: '400' }}> · {fmtDate(log.startedAt)}</Text>
            </Text>
          </View>
          {event ? (
            <Text style={[EYEBROW, { marginTop: S.xs }]} numberOfLines={1}>
              CON {event.title.toUpperCase()}
            </Text>
          ) : null}
        </Rise>
        {dist || time ? (
          <Rise dy={10} delay={360}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              {dist ? (
                <View accessible accessibilityLabel={`Distanza: ${dist}`}>
                  <CountText text={dist} delay={420} duration={900} a11y={false} style={[type.title1, { color: color.storyInk, fontVariant: ['tabular-nums'] }]} />
                  <Text style={[type.caption, { color: color.storyInkSecondary }]}>{log.distanceSource === 'manual' ? 'Distanza dichiarata' : 'Distanza'}</Text>
                </View>
              ) : (
                <View />
              )}
              {time ? (
                <View accessible accessibilityLabel={`Durata: ${time}`} style={{ alignItems: 'flex-end' }}>
                  <CountText text={time} delay={480} duration={900} align="right" a11y={false} style={[type.title1, { color: color.storyInk, fontVariant: ['tabular-nums'] }]} />
                  <Text style={[type.caption, { color: color.storyInkSecondary }]}>Durata</Text>
                </View>
              ) : null}
            </View>
          </Rise>
        ) : null}
        {line ? (
          <Rise dy={10} delay={460}>
            <StoryLine line={line} pal={pal} delay={620} still={still} />
          </Rise>
        ) : null}
      </View>
      {shown.length ? (
        <Rise dy={10} delay={560}>
          <Text style={[type.footnote, { color: color.storyInkSecondary, fontWeight: '700', marginBottom: S.sm }]} accessibilityRole="header">
            Risultato
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            {shown.map((a) => (
              <Pressable key={a.id} onPress={() => onOpen(a)} accessibilityRole="button" accessibilityLabel={`${a.name}. ${a.value}. Tocca per i dettagli`} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <AwardMark a={a} size={46} />
              </Pressable>
            ))}
            {more > 0 ? <Text style={[type.subhead, { color: color.storyInk, fontWeight: '700' }]}>+{more}</Text> : null}
          </View>
        </Rise>
      ) : null}
    </>
  );
}

function Numbers({ log, logs, awards, pal, dir, track }: { log: WorkoutLog; logs: WorkoutLog[]; awards: Award[]; pal: StoryPalette; dir: number; track: TrackPoint[] | null }) {
  const nums = numbersOf(log, pal.focus);
  const eyebrow = pal.focus === 'run' ? 'IL TUO RITMO' : pal.focus === 'walk' ? 'IL TUO TEMPO' : pal.focus === 'trail' ? 'IL TUO TRAIL' : pal.focus === 'mixed' ? 'CORSA E CAMMINATA' : 'I NUMERI';
  const sp = pal.focus !== 'walk' && pal.focus !== 'trail' && track && !log.gpsQuality?.gaps ? splits(track) : [];
  const fastest = sp.length > 1 ? [...sp].sort((x, y) => x.paceSecPerKm - y.paceSecPerKm)[0] : null;
  const records = pal.focus === 'run' || pal.focus === 'trail' ? awards.filter((a) => a.record).length : 0;
  const week = pal.focus === 'walk' ? weekCount(log, logs) : 0;
  const after = 160 + nums.length * 170 + 260;
  return (
    <>
      <Rise dx={24 * dir} dy={0}>
        <Text style={EYEBROW}>{eyebrow}</Text>
      </Rise>
      {nums.map((n, k) => {
        const hero = k === 0;
        const d = 160 + k * 170;
        const bar = pal.blend ? (k % 2 ? pal.b : pal.a) : pal.a;
        return (
          <Rise key={n.key} dx={(k % 2 ? -1 : 1) * 64} dy={0} delay={d} spring>
            <View accessible accessibilityLabel={`${n.label}: ${n.text}`} style={[{ backgroundColor: 'rgba(5,7,9,0.42)', borderRadius: R.card, borderWidth: 1, borderColor: color.storyGlass, paddingVertical: hero ? S.lg : S.md, paddingRight: S.lg, paddingLeft: S.lg + S.xs, overflow: 'hidden' }, hero ? { gap: S.xxs } : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: S.sm }]}>
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: bar }} />
              <Text style={[type.callout, { color: color.storyInkSecondary }]}>{n.label}</Text>
              <CountText text={n.text} delay={d + 240} duration={hero ? 1100 : 850} align={hero ? 'left' : 'right'} a11y={false} style={[hero ? type.display : type.title1, { color: color.storyInk, fontVariant: ['tabular-nums'] }]} />
            </View>
          </Rise>
        );
      })}
      {fastest ? (
        <Rise dy={10} delay={after}>
          <Text style={P}>Il tratto più rapido è stato il {fastest.distKm < 1 ? 'finale' : `km ${fastest.km}`}, a {paceText(fastest.paceSecPerKm)}.</Text>
        </Rise>
      ) : null}
      {records ? (
        <Rise dy={10} delay={after + 140}>
          <Fact icon="trophy" text={records === 1 ? 'Con un nuovo record personale.' : `Con ${records} nuovi record personali.`} tint={pal.line} />
        </Rise>
      ) : null}
      {week > 0 ? (
        <Rise dy={10} delay={after}>
          <Fact icon="calendar" text={week === 1 ? 'La prima attività della settimana.' : `La ${week}ª attività della settimana: costanza.`} tint={pal.line} />
        </Rise>
      ) : null}
    </>
  );
}

function Fact({ icon, text, tint }: { icon: 'trophy' | 'calendar'; text: string; tint: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[P, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** Feste già mostrate in questa sessione dell'app (oltre alla memoria persistente in lib/seen). */
const spent = new Set<string>();

/**
 * Riconoscimenti: compaiono dal meno al più importante; il più importante è la scheda grande in fondo.
 * Prima visione: ogni conquista entra di lato con un piccolo scoppio; la principale ha la sequenza completa
 * (espansione organica, onda, particelle, medaglia che rimbalza, riflesso, numero che sale, nome e motivo).
 * Poi le altre si attenuano un poco: l'attenzione resta sulla principale. Visioni successive: comparsa semplice.
 */
function ResultsSlide({ awards, fresh, still, onOpen, dir }: { awards: Award[]; fresh: string[]; still: boolean; onOpen: (a: Award) => void; dir: number }) {
  const { width } = useWindowDimensions();
  // Fissato all'ingresso nella scheda: tornando indietro e avanti nello stesso racconto la festa non si ripete.
  const [live] = useState(() => fresh.filter((x) => !spent.has(x)));
  const hero = awards[awards.length - 1];
  const minors = awards.slice(0, -1);
  const isFresh = (a: Award) => !still && live.includes(a.id);
  const heroFresh = isFresh(hero);
  const anyFresh = awards.some(isFresh);
  const tone = toneOf(hero.tone);
  // Sempre dal meno al più importante; con una festa in corso il ritmo è disteso, nelle visioni successive è rapido.
  const first = anyFresh ? 220 : 100;
  const step = anyFresh ? 300 : 90;
  const T = first + minors.length * step + (anyFresh ? 160 : 60);
  const records = awards.filter((a) => a.record).length;
  const dim = useSharedValue(1);

  // Come AwardBanner: con movimento ridotto la festa non si vede, quindi non si segna come vista.
  useEffect(() => {
    if (still) return;
    for (const x of live) {
      spent.add(x);
      void markSeen(awardFxKey(x));
    }
  }, [live, still]);
  useEffect(() => {
    if (still || !minors.length) {
      dim.set(1);
      return;
    }
    dim.set(withDelay(T + (heroFresh ? 1300 : 450), withTiming(0.8, { duration: 600 })));
    return () => cancelAnimation(dim);
  }, [still, minors.length, T, heroFresh, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));

  return (
    <>
      <Rise dx={24 * dir} dy={0}>
        <Text style={EYEBROW}>{records ? (records === 1 ? 'NUOVO RECORD' : `${records} NUOVI RECORD`) : 'RICONOSCIMENTI'}</Text>
        <Text style={H1}>{awards.length === 1 ? 'Un riconoscimento' : `${awards.length} riconoscimenti`}</Text>
      </Rise>
      {minors.length ? (
        <Animated.View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md }, dimStyle]}>
          {minors.map((a, n) => {
            const f = isFresh(a);
            const d = first + n * step;
            return (
              <Rise key={a.id} dx={f ? 40 * dir : 0} dy={f ? 0 : 8} delay={d} spring={f}>
                <Pressable onPress={() => onOpen(a)} accessibilityRole="button" accessibilityLabel={`${a.name}. ${a.value}. Tocca per i dettagli`} hitSlop={6} style={({ pressed }) => ({ alignItems: 'center', gap: S.xs, width: 76, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 56, height: 56 }}>
                    {f ? <AwardFx tone={toneOf(a.tone)} variant="ripple" size={56} delay={d + 120} play halo={false} seedKey={a.id} /> : null}
                    <AwardPop play={f} delay={d + 60}>
                      <AwardMark a={a} size={56} countDelay={f ? d + 200 : undefined} />
                    </AwardPop>
                  </View>
                  <Text style={[type.caption, { color: color.storyInk, fontWeight: '600', textAlign: 'center' }]} numberOfLines={2}>
                    {shortName(a)}
                  </Text>
                </Pressable>
              </Rise>
            );
          })}
        </Animated.View>
      ) : null}
      <Rise dx={heroFresh ? 64 * dir : 0} dy={heroFresh ? 0 : 10} delay={T} spring={heroFresh}>
        <Pressable onPress={() => onOpen(hero)} accessibilityRole="button" accessibilityLabel={`${hero.record ? 'Nuovo record personale' : CATEGORY[hero.category].label}, il riconoscimento principale. ${hero.name}. ${hero.headline} ${hero.value}${hero.improvement ? `, ${hero.improvement}` : ''}. Tocca per i dettagli`} style={({ pressed }) => ({ borderRadius: R.sheet, opacity: pressed ? 0.85 : 1 })}>
          <View style={[FILL, { borderRadius: R.sheet, overflow: 'hidden', borderWidth: 1, borderColor: alpha(tone.solid, 0.55) }]}>
            <LinearGradient colors={[alpha(tone.solid, 0.34), alpha(tone.deep, 0.94)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={FILL} />
            <Sheen play={heroFresh} delay={T + 950} travel={width} band={90} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: S.lg }}>
            <View style={{ width: 92, height: 92 }}>
              <AwardFx tone={tone} variant={fxVariantOf(hero)} size={92} delay={T + 220} play={heroFresh} seedKey={hero.id} />
              <AwardPop play={heroFresh} delay={T + 160}>
                <AwardMark a={hero} size={92} countDelay={heroFresh ? T + 380 : undefined} />
              </AwardPop>
            </View>
            <View style={{ flex: 1, gap: S.xxs }}>
              <Rise play={heroFresh} delay={T + 560} dy={8}>
                <Text style={[type.caption, { color: mix(tone.solid, '#FFFFFF', 0.25), fontWeight: '800', letterSpacing: 0.6 }]}>{hero.record ? 'NUOVO RECORD' : CATEGORY[hero.category].label.toUpperCase()}</Text>
              </Rise>
              <Rise play={heroFresh} delay={T + 680} dy={8}>
                <Text style={[type.title2, { color: color.storyInk }]}>{hero.name}</Text>
              </Rise>
              <Rise play={heroFresh} delay={T + 800} dy={8}>
                <Text style={[type.subhead, { color: color.storyInkSecondary }]}>{hero.headline}</Text>
              </Rise>
              <Rise play={heroFresh} delay={T + 920} dy={8}>
                <Text style={[type.footnote, { color: color.storyInk, fontWeight: '700' }]}>
                  {hero.value}
                  {hero.previous ? ` · prima ${hero.previous}` : ''}
                  {hero.improvement ? ` · ${hero.improvement}` : ''}
                </Text>
              </Rise>
            </View>
          </View>
        </Pressable>
      </Rise>
    </>
  );
}

/* ---------- racconto ---------- */

/** Racconto della corsa: progressione discreta, avanzamento automatico disattivabile, controlli sempre visibili. */
export default function Storie() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const reduceSys = useReducedMotion();
  const still = useReduceMotion() || reduceSys;
  const sr = useScreenReader();
  const focused = useIsFocused();
  const [data, setData] = useState<StoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [brief, setBrief] = useState<WorkoutBriefResult | null>(null);
  const [briefFailed, setBriefFailed] = useState(false);
  const [nav, setNav] = useState({ i: 0, dir: 1 });
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(true);
  const [detail, setDetail] = useState<Award | null>(null);
  const [menu, setMenu] = useState(false);
  const i = nav.i;
  const enter = useSharedValue(still ? 1 : 0);
  const prog = useSharedValue(0);
  const shown = useRef(-1);
  // Verso dell'ultimo cambio di scheda, letto dalla transizione d'uscita sul thread UI al momento dell'uscita.
  const exitDir = useSharedValue(1);
  const exitFx = useMemo(() => slideExit(exitDir), [exitDir]);

  useEffect(() => {
    let alive = true;
    void markSeen(`story:${id}`);
    load(id).then(
      (d) => {
        if (!alive) return;
        setData(d);
        // Il server riusa il briefing salvato: nessuna nuova richiesta AI a ogni visione.
        briefFor(d.log.id).then(
          (b) => alive && setBrief(b),
          () => alive && setBriefFailed(true),
        );
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    if (still) {
      enter.set(1);
      return;
    }
    enter.set(withSpring(1, { damping: 18, stiffness: 120 }));
  }, [still, enter]);
  // Con lo screen reader l'avanzamento automatico parte spento: si legge con calma.
  useEffect(() => setAuto(!sr), [sr]);

  const slides = useMemo<Slide[]>(() => {
    if (!data) return [];
    const l = data.log;
    const track = l.track && l.track.length > 1;
    return ['cover', ...(l.distanceKm || l.durationSec ? (['numbers'] as Slide[]) : []), ...(track ? (['route'] as Slide[]) : []), ...(data.awards.length ? (['results'] as Slide[]) : []), ...(data.event && data.event.participantCount > 1 ? (['group'] as Slide[]) : []), 'brief'];
  }, [data]);
  const pal = useMemo(() => (data ? storyPalette(data.log, data.logs) : null), [data]);
  const kind: Slide = slides[i] ?? 'cover';
  const briefLen = brief?.brief.text.length ?? 0;
  const awards = data?.awards ?? [];
  const heroFresh = !still && !!data && awards.length > 0 && data.fresh.includes(awards[awards.length - 1].id);
  // tempo sufficiente per leggere (e, per i riconoscimenti, per vedere la sequenza completa)
  const duration = kind === 'brief' ? Math.min(20_000, 7000 + briefLen * 40) : kind === 'route' ? (pal?.focus === 'walk' ? 10_000 : 9000) : kind === 'results' ? Math.min(15_000, 5200 + awards.length * 700 + (heroFresh ? 1600 : 0)) : kind === 'numbers' ? 7000 : 6500;

  const go = (dlt: number) => {
    const n = i + dlt;
    if (n < 0) return setNav({ i: 0, dir: -1 });
    if (n >= slides.length) return router.back();
    exitDir.set(dlt >= 0 ? 1 : -1);
    setNav({ i: n, dir: dlt >= 0 ? 1 : -1 });
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const [pan] = useState(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 || g.dy > 40, onPanResponderRelease: (_, g) => (g.dy > 100 ? router.back() : g.dx < -50 ? goRef.current(1) : g.dx > 50 ? goRef.current(-1) : undefined) }));

  useEffect(() => {
    if (slides.length) AccessibilityInfo.announceForAccessibility(`Scheda ${i + 1} di ${slides.length}`);
  }, [i, slides.length]);

  // Avanzamento: la barra corre sul thread UI; alla fine passa alla scheda successiva. Pausa = si ferma dov'è.
  useEffect(() => {
    if (!slides.length) return;
    const fresh = shown.current !== i;
    if (fresh) {
      shown.current = i;
      cancelAnimation(prog);
      prog.set(0);
    }
    if (paused || !auto || detail || menu || !focused) {
      cancelAnimation(prog);
      return;
    }
    const from = fresh ? 0 : Math.min(0.999, prog.get());
    const advance = () => goRef.current(1);
    prog.set(
      withTiming(1, { duration: Math.max(60, duration * (1 - from)), easing: Easing.linear }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(advance);
      }),
    );
    return () => cancelAnimation(prog);
  }, [i, paused, auto, duration, slides.length, detail, menu, focused, prog]);

  const enterStyle = useAnimatedStyle(() => {
    const v = enter.get();
    return { opacity: Math.min(1, v * 1.4), transform: [{ scale: 0.94 + v * 0.06 }] };
  });

  if (failed)
    return (
      <View style={{ flex: 1, backgroundColor: DEEP, justifyContent: 'center', alignItems: 'center', padding: S.xl, gap: S.lg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="book-outline" size={32} color={color.storyInkSecondary} />
        <Text style={[type.title2, { color: color.storyInk, textAlign: 'center' }]}>Questo racconto non è disponibile ora</Text>
        <CtrlBtn name="close" label="Chiudi" onPress={() => router.back()} />
      </View>
    );
  if (!data || !pal)
    return (
      <View style={{ flex: 1, backgroundColor: DEEP, justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading />
      </View>
    );

  const { log, event } = data;
  const track = log.track && log.track.length > 1 ? log.track : null;
  const laps = track ? countLaps(track) : 1;
  const marks = track ? buildMarks({ id: log.id, track }, data.awards) : [];
  const dir = nav.dir;
  // Con lo screen reader restano anche i pulsanti avanti/indietro in basso; altrimenti si tocca a destra o a sinistra.
  const bottomSpace = insets.bottom + (sr ? 104 : S.xl);
  // Copertina (badge del risultato) e riconoscimenti hanno elementi toccabili sopra le zone di tocco.
  const interactive = kind === 'results' || kind === 'cover';

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: DEEP }, enterStyle]} {...pan.panHandlers}>
      <Stack.Screen options={{ headerShown: false }} />
      <Backdrop kind={kind} pal={pal} still={still} active={focused} />
      {kind === 'route' && track ? <RouteReplay track={track} marks={marks} awards={data.awards} group={data.group} paused={paused} tint={pal.line} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '30%' }} /> : null}
      {/* veli per la leggibilità: controlli in alto, testo in basso */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 130 }} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%' }} />

      {/* tocco: sinistra indietro, destra avanti; tenere premuto mette in pausa */}
      <Pressable style={{ position: 'absolute', top: insets.top + 72, bottom: bottomSpace, left: 0, width: '33%' }} onPress={() => go(-1)} onLongPress={() => setPaused(true)} onPressOut={() => paused && setPaused(false)} accessibilityElementsHidden importantForAccessibility="no" />
      <Pressable style={{ position: 'absolute', top: insets.top + 72, bottom: bottomSpace, right: 0, width: '67%' }} onPress={() => go(1)} onLongPress={() => setPaused(true)} onPressOut={() => paused && setPaused(false)} accessibilityElementsHidden importantForAccessibility="no" />

      <View pointerEvents={interactive ? 'box-none' : 'none'} style={{ flex: 1, paddingTop: insets.top + 84, paddingHorizontal: S.xl, paddingBottom: bottomSpace + S.lg }}>
        <Animated.View key={i} exiting={still ? undefined : exitFx} pointerEvents={interactive ? 'box-none' : 'none'} style={{ flex: 1, justifyContent: 'flex-end', gap: S.md }}>
          {kind === 'cover' ? <Cover log={log} event={event} pal={pal} dir={dir} awards={data.awards} still={still} onOpen={setDetail} /> : null}
          {kind === 'numbers' ? <Numbers log={log} logs={data.logs} awards={data.awards} pal={pal} dir={dir} track={track} /> : null}
          {kind === 'route' ? (
            <>
              <Rise dx={24 * dir} dy={0}>
                <Text style={H1}>{laps > 1 ? `${laps} giri` : 'Il tuo percorso'}</Text>
              </Rise>
              <Rise dy={10} delay={160}>
                <Text style={P}>{log.gpsQuality?.gaps ? 'La traccia ha delle interruzioni: alcuni tratti non sono stati registrati.' : track && isTimed(track) ? 'Il replay segue i tempi reali registrati, accelerati.' : 'Il percorso registrato, dalla partenza all’arrivo.'}</Text>
              </Rise>
            </>
          ) : null}
          {kind === 'results' ? <ResultsSlide awards={data.awards} fresh={data.fresh} still={still} onOpen={setDetail} dir={dir} /> : null}
          {kind === 'group' && event ? (
            <>
              <Rise dx={24 * dir} dy={0}>
                <Ionicons name="people" size={36} color={color.storyInk} />
              </Rise>
              <Rise dy={16} delay={120} spring>
                <Text style={H1}>{pal.focus === 'walk' ? 'Camminata insieme' : pal.focus === 'trail' ? 'Trail insieme' : pal.focus === 'other' ? 'Insieme' : 'Corsa insieme'}</Text>
              </Rise>
              <Rise dy={10} delay={260}>
                <Text style={P}>
                  {event.participantCount} persone iscritte a “{event.title}”, organizzata da {event.organizer.displayName}.
                </Text>
              </Rise>
            </>
          ) : null}
          {kind === 'brief' ? (
            <>
              <Rise dx={24 * dir} dy={0}>
                <Text style={EYEBROW}>{brief?.brief.ai ? 'INTERPRETAZIONE DEL COACH AI' : 'RIEPILOGO AUTOMATICO'}</Text>
              </Rise>
              <Rise dy={14} delay={120} spring>
                <Text style={[type.title1, { color: color.storyInk }]}>In sintesi</Text>
              </Rise>
              <Rise dy={10} delay={260}>
                <Text style={[P, { lineHeight: 24 }]}>{brief ? brief.brief.text : briefFailed ? 'Il riepilogo non è disponibile in questo momento.' : 'Sto preparando il riepilogo…'}</Text>
              </Rise>
            </>
          ) : null}
        </Animated.View>
      </View>

      {/* progressione e controlli sempre raggiungibili: indietro a sinistra, opzioni a destra */}
      <View style={{ position: 'absolute', top: insets.top + S.sm, left: S.lg, right: S.lg, gap: S.sm }}>
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((_, n) => (
            <View key={n} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              {n === i && auto ? <ActiveBar prog={prog} /> : <View style={{ height: 3, backgroundColor: color.storyInk, width: n <= i ? '100%' : '0%' }} />}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <CtrlBtn name="chevron-back" label="Chiudi il racconto" onPress={() => router.back()} />
          {paused && auto ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs, paddingHorizontal: S.md, paddingVertical: S.xs, borderRadius: R.pill, backgroundColor: 'rgba(0,0,0,0.35)' }} accessibilityLiveRegion="polite">
              <Ionicons name="pause" size={12} color={color.storyInk} />
              <Text style={[type.caption, { color: color.storyInk, fontWeight: '700' }]}>In pausa</Text>
            </View>
          ) : null}
          <CtrlBtn name="ellipsis-horizontal" label={`Opzioni del racconto. Scheda ${i + 1} di ${slides.length}`} onPress={() => setMenu(true)} />
        </View>
      </View>
      {sr ? (
        <View style={{ position: 'absolute', bottom: insets.bottom + S.xl, left: S.lg, right: S.lg, flexDirection: 'row', justifyContent: 'space-between' }}>
          <CtrlBtn name="chevron-back" label="Scheda precedente" onPress={() => go(-1)} disabled={i === 0} />
          <CtrlBtn name="chevron-forward" label={i === slides.length - 1 ? 'Chiudi' : 'Scheda successiva'} onPress={() => go(1)} />
        </View>
      ) : null}
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Racconto">
        <SwitchRow label="Avanzamento automatico" hint="Le schede scorrono da sole; tocca a destra o a sinistra per andare avanti o indietro." value={auto} onChange={setAuto} />
        {auto ? (
          <Pressable
            onPress={() => {
              setPaused(!paused);
              setMenu(false);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52 }, pressed && { opacity: 0.6 }]}>
            <Ionicons name={paused ? 'play' : 'pause'} size={20} color={color.text} />
            <Text style={[type.body, { color: color.text }]}>{paused ? 'Riprendi' : 'Metti in pausa'}</Text>
          </Pressable>
        ) : null}
        <Text style={[type.footnote, { color: color.textTertiary }]}>Tieni premuto sullo schermo per fermare il racconto finché non sollevi il dito. Scorri verso il basso per chiuderlo.</Text>
      </Sheet>
      <AwardDetailSheet award={detail} onClose={() => setDetail(null)} activity={`${pal.label} · ${fmtDate(log.startedAt)}`} />
    </Animated.View>
  );
}

function ActiveBar({ prog }: { prog: SharedValue<number> }) {
  const s = useAnimatedStyle(() => ({ width: `${Math.min(100, Math.max(0, prog.get() * 100))}%` }));
  return <Animated.View style={[{ height: 3, backgroundColor: color.storyInk }, s]} />;
}

function CtrlBtn({ name, label, onPress, disabled }: { name: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} hitSlop={6} style={({ pressed }) => ({ width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)', opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}>
      <Ionicons name={name} size={24} color={color.storyInk} />
    </Pressable>
  );
}
