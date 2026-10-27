import { useIsFocused } from 'expo-router';
import { useEffect, useId, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useReduceMotion } from '@/components/ui';
import { fitProjector, trackKey } from '@/lib/routeGeometry';
import type { TrackPoint } from '@shared/types.ts';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Campioni equidistanti (in lunghezza) per il punto luminoso: posizione in O(1) a ogni frame, sul thread UI. */
const SAMPLES = 96;
/** Punti più vicini di così (in pixel) non cambiano la forma visibile nella miniatura: si saltano nel disegno. */
const MIN_STEP = 0.6;
/** Sotto questa estensione reale (metri) la traccia è solo rumore del GPS sul posto: non la si presenta come percorso. */
const MIN_EXTENT_M = 25;

export interface TraceGeometry {
  d: string;
  /** Lunghezza del tracciato in pixel, calcolata dalle STESSE coordinate (arrotondate) del path. */
  len: number;
  /** Posizioni equidistanti lungo il tracciato (SAMPLES + 1 valori). */
  sx: number[];
  sy: number[];
  end: { x: number; y: number };
  /** Diagonale del riquadro geografico, in metri. */
  extentM: number;
}

const cache = new Map<string, TraceGeometry>();
const MAX_CACHE = 80;

/** Diagonale del riquadro geografico in metri (approssimazione equirettangolare: basta per distinguere il rumore). */
function extentOf(track: TrackPoint[]): number {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of track) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const dy = (maxLat - minLat) * 111_320;
  const dx = (maxLng - minLng) * 111_320 * k;
  const m = Math.hypot(dx, dy);
  return Number.isFinite(m) ? m : 0;
}

/**
 * Geometria della miniatura per un riquadro w×h: proiezione "adatta al riquadro" (proporzioni e forma reali, da
 * routeGeometry.fitProjector), path senza i punti sotto il pixel, campioni per il punto luminoso.
 * In cache per tracciato e dimensione: card, racconto e ritorni sulla schermata non la ricalcolano.
 */
export function traceGeometry(track: TrackPoint[], w: number, h: number, pad: number): TraceGeometry {
  const key = `${trackKey(track)}|${w}x${h}|${pad}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const project = fitProjector(track, w, h, pad);
  const xs: number[] = [];
  const ys: number[] = [];
  const cum: number[] = [];
  let len = 0;
  for (let i = 0; i < track.length; i++) {
    const q = project(track[i]);
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    // al decimo di pixel: il path e la lunghezza del tratteggio usano esattamente gli stessi valori
    const x = Math.round(q.x * 10) / 10;
    const y = Math.round(q.y * 10) / 10;
    const n = xs.length;
    if (n) {
      const dl = Math.hypot(x - xs[n - 1], y - ys[n - 1]);
      if (dl < MIN_STEP && i < track.length - 1) continue;
      len += dl;
    }
    xs.push(x);
    ys.push(y);
    cum.push(len);
  }
  let d = '';
  for (let i = 0; i < xs.length; i++) d += `${i ? 'L' : 'M'}${xs[i]} ${ys[i]}`;
  const sx: number[] = [];
  const sy: number[] = [];
  let j = 0;
  for (let k = 0; k <= SAMPLES; k++) {
    const target = (len * k) / SAMPLES;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = (cum[j + 1] ?? cum[j]) - cum[j];
    const t = seg > 0 ? Math.min(1, Math.max(0, (target - cum[j]) / seg)) : 0;
    sx.push(xs.length > 1 ? xs[j] + (xs[j + 1] - xs[j]) * t : (xs[0] ?? w / 2));
    sy.push(ys.length > 1 ? ys[j] + (ys[j + 1] - ys[j]) * t : (ys[0] ?? h / 2));
  }
  const g: TraceGeometry = { d, len, sx, sy, end: { x: xs[xs.length - 1] ?? w / 2, y: ys[ys.length - 1] ?? h / 2 }, extentM: extentOf(track) };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, g);
  return g;
}

/**
 * true se il tracciato è disegnabile come percorso: almeno 2 punti, che si spostano davvero nel riquadro e coprono
 * almeno qualche decina di metri reali (un GPS fermo sul posto, ingrandito, sembrerebbe un percorso inventato).
 */
export function isDrawableTrack(track: TrackPoint[] | null | undefined, w: number, h: number, pad = 8): track is TrackPoint[] {
  if (!track || track.length < 2) return false;
  const g = traceGeometry(track, w, h, pad);
  return g.len >= 6 && g.extentM >= MIN_EXTENT_M;
}

/**
 * Miniatura vettoriale del VERO percorso (log.track), adattata al riquadro mantenendo proporzioni e forma.
 * - Disegno progressivo una sola volta per tracciato (strokeDashoffset animato sul thread UI, Reanimated).
 * - Bagliore discreto sotto la linea; punto d'arrivo che compare a disegno finito.
 * - `dotEvery`: ogni tanto un punto luminoso percorre il tracciato (intervalli irregolari ma stabili per `seed`).
 *   Il punto è una vista nativa spostata con trasformazioni: non ridisegna il vettoriale a ogni frame.
 *   Le pause non consumano frame, e tutto si ferma se la schermata non è in primo piano.
 * - `tint`: un colore o due (attività combinate: sfumatura tra i due colori ufficiali).
 * Con "Riduci movimento" il percorso compare intero, senza punto in movimento.
 * Decorativa per i lettori di schermo: il contesto (titolo, tipo) lo dà il contenitore.
 */
export function RouteTrace({
  track,
  width,
  height,
  tint,
  strokeWidth = 2.5,
  pad,
  delay = 0,
  duration = 1400,
  dotEvery = 7000,
  seed = 0,
  glow = true,
  style,
}: {
  track: TrackPoint[];
  width: number;
  height: number;
  tint: string | [string, string];
  strokeWidth?: number;
  pad?: number;
  delay?: number;
  duration?: number;
  /** Millisecondi medi tra un passaggio e l'altro del punto luminoso; null = mai. */
  dotEvery?: number | null;
  seed?: number;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceSys = useReducedMotion();
  const still = useReduceMotion() || reduceSys;
  const focused = useIsFocused();
  const margin = pad ?? Math.max(6, strokeWidth * 3);
  const g = useMemo(() => (track.length > 1 ? traceGeometry(track, width, height, margin) : null), [track, width, height, margin]);
  const gid = `rt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [c1, c2] = Array.isArray(tint) ? tint : [tint, tint];
  const stroke = c1 === c2 ? c1 : `url(#${gid})`;

  // Tratteggio appena più lungo del tracciato: a disegno finito la linea è sempre completa fino all'ultimo punto.
  const dash = (g?.len ?? 1) + 1;
  const sx = g?.sx ?? [0, 0];
  const sy = g?.sy ?? [0, 0];
  const drawn = useSharedValue(still ? 1 : 0);
  const run = useSharedValue(0);
  const drawnFor = useRef<TraceGeometry | null>(null);

  // Disegno: una volta per geometria. Un nuovo array identico (stessa geometria in cache) non lo rilancia.
  useEffect(() => {
    if (!g) return;
    if (still) {
      cancelAnimation(drawn);
      drawn.set(1);
      drawnFor.current = g;
      return;
    }
    // Stessa geometria: riprende da dove era (cambio di dipendenze, smontaggio simulato) e non ricomincia mai da capo.
    const from = drawnFor.current === g ? Math.min(1, Math.max(0, drawn.get())) : 0;
    drawnFor.current = g;
    if (from >= 1) return;
    drawn.set(from);
    drawn.set(withDelay(from > 0 ? 0 : delay, withTiming(1, { duration: duration * (1 - from), easing: Easing.inOut(Easing.cubic) })));
    return () => cancelAnimation(drawn);
  }, [g, still, delay, duration, drawn]);

  // Punto luminoso: timer JS tra un passaggio e l'altro (nessun frame nelle pause), animazione sul thread UI.
  useEffect(() => {
    if (!g || still || !focused || !dotEvery) {
      cancelAnimation(run);
      run.set(0);
      return;
    }
    const travel = Math.max(1300, Math.min(3200, g.len * 10));
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = (wait: number) => {
      timer = setTimeout(() => {
        run.set(0);
        run.set(withTiming(1, { duration: travel, easing: Easing.inOut(Easing.sin) }));
        n++;
        // pausa irregolare ma deterministica: 70–130% di dotEvery
        next(travel + dotEvery * (0.7 + (((seed % 9973) + 11) * ((n % 97) + 3) * 7919) % 600 / 1000));
      }, wait);
    };
    next(delay + duration + 500 + ((seed % 9973) * 131) % 1200);
    return () => {
      clearTimeout(timer);
      cancelAnimation(run);
      run.set(0);
    };
  }, [g, still, focused, dotEvery, seed, delay, duration, run]);

  const lineProps = useAnimatedProps(() => {
    const p = drawn.get();
    return { strokeDashoffset: dash * (1 - p), opacity: p > 0.004 ? 1 : 0 };
  });
  const glowProps = useAnimatedProps(() => {
    const p = drawn.get();
    return { strokeDashoffset: dash * (1 - p), opacity: p > 0.004 ? 1 : 0 };
  });
  const endProps = useAnimatedProps(() => ({ opacity: Math.max(0, Math.min(1, (drawn.get() - 0.94) / 0.06)) }));

  const sw = strokeWidth;
  const core = Math.max(4, Math.round(sw * 2.1));
  const halo = Math.round(core * 2.4);
  const dotStyle = useAnimatedStyle(() => {
    const r = run.get();
    if (r <= 0 || r >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };
    const last = sx.length - 1;
    const f = r * last;
    const i = Math.min(last - 1, Math.floor(f));
    const t = f - i;
    return {
      opacity: Math.min(1, r * 10, (1 - r) * 10),
      transform: [{ translateX: sx[i] + (sx[i + 1] - sx[i]) * t - halo / 2 }, { translateY: sy[i] + (sy[i + 1] - sy[i]) * t - halo / 2 }],
    };
  });

  if (!g) return null;
  return (
    <View style={[{ width, height }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        {c1 !== c2 ? (
          <Defs>
            <LinearGradient id={gid} x1={0} y1={0} x2={width} y2={height} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c1} />
              <Stop offset="1" stopColor={c2} />
            </LinearGradient>
          </Defs>
        ) : null}
        {still ? (
          <>
            {glow ? <Path d={g.d} stroke={stroke} strokeOpacity={0.26} strokeWidth={sw * 3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
            <Path d={g.d} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Circle cx={g.end.x} cy={g.end.y} r={sw * 1.1} fill="#FFFFFF" />
          </>
        ) : (
          <>
            {glow ? <AnimatedPath d={g.d} stroke={stroke} strokeOpacity={0.26} strokeWidth={sw * 3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[dash, dash + 2]} animatedProps={glowProps} /> : null}
            <AnimatedPath d={g.d} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[dash, dash + 2]} animatedProps={lineProps} />
            <AnimatedCircle cx={g.end.x} cy={g.end.y} r={sw * 1.1} fill="#FFFFFF" animatedProps={endProps} />
          </>
        )}
      </Svg>
      {!still && dotEvery ? (
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: halo, height: halo, alignItems: 'center', justifyContent: 'center' }, dotStyle]}>
          <View style={{ position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <View style={{ position: 'absolute', width: core * 1.6, height: core * 1.6, borderRadius: core * 0.8, backgroundColor: c2 === c1 ? c1 : c2, opacity: 0.55 }} />
          <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: '#FFFFFF' }} />
        </Animated.View>
      ) : null}
    </View>
  );
}
