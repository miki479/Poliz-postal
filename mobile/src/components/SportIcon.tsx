import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { ActivityStyle } from '@/constants/activityColors';
import { FIGURE_IMAGE } from '@/constants/figureImages';
import { figureGeometry, figureMotion, FIGURE_REST_PHASE, type FigureGeometry, type FigureGlyph } from '@/lib/activityFigure';
import { useReduceMotion } from '@/lib/useReduceMotion';

export type Glyph = FigureGlyph;
/** Compatibilita con le illustrazioni esistenti; le nuove animazioni usano una fase continua. */
export type Pose = 0 | 1;
/** Spessore unico del tratto: figure line-art sottili, con il solo pantaloncino pieno. */
const LINE = 1.0;
const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
type Part = Exclude<keyof FigureGeometry, 'head'>;

function StaticFigure({ run, phase, color }: { run: number; phase: number; color: string }) {
  const g = figureGeometry(run, phase);
  return <>
    <Path d={g.backArm} stroke={color} strokeOpacity={0.6} strokeWidth={LINE} />
    <Path d={g.backLeg} stroke={color} strokeOpacity={0.6} strokeWidth={LINE} />
    <Path d={g.torso} fill="none" stroke={color} strokeWidth={LINE} />
    <Path d={g.shorts} fill={color} fillOpacity={0.9} stroke="none" />
    <Circle cx={g.head.x} cy={g.head.y} r={1.72} fill="none" stroke={color} strokeWidth={LINE} />
    <Path d={g.frontLeg} stroke={color} strokeWidth={LINE} />
    <Path d={g.frontArm} stroke={color} strokeWidth={LINE} />
  </>;
}
function AnimatedPart({ geometry, part, color, width, opacity = 1, fill = false }: { geometry: SharedValue<FigureGeometry>; part: Part; color: string; width: number; opacity?: number; fill?: boolean }) {
  const props = useAnimatedProps(() => ({ d: geometry.get()[part] }));
  return <APath animatedProps={props} fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={width} strokeOpacity={opacity} fillOpacity={opacity} />;
}
function MovingFigure({ run, phase, intensity, color }: { run: SharedValue<number>; phase: SharedValue<number>; intensity: SharedValue<number>; color: string }) {
  const geometry = useDerivedValue(() => figureGeometry(run.get(), phase.get(), intensity.get()));
  const head = useAnimatedProps(() => ({ cx: geometry.get().head.x, cy: geometry.get().head.y }));
  return <>
    <AnimatedPart geometry={geometry} part="backArm" color={color} width={LINE} opacity={0.6} />
    <AnimatedPart geometry={geometry} part="backLeg" color={color} width={LINE} opacity={0.6} />
    <AnimatedPart geometry={geometry} part="torso" color={color} width={LINE} />
    <AnimatedPart geometry={geometry} part="shorts" color={color} width={0} fill opacity={0.9} />
    <ACircle animatedProps={head} r={1.72} fill="none" stroke={color} strokeWidth={LINE} />
    <AnimatedPart geometry={geometry} part="frontLeg" color={color} width={LINE} />
    <AnimatedPart geometry={geometry} part="frontArm" color={color} width={LINE} />
  </>;
}
function SingleAnimated({ glyph, color, pace, level, active }: { glyph: Glyph; color: string; pace?: number | null; level?: number; active: boolean }) {
  const reduce = useReduceMotion();
  const target = figureMotion(glyph, pace, level);
  const run = useSharedValue(target.run); const intensity = useSharedValue(target.intensity);
  const cadence = useSharedValue(target.stepsPerSecond); const phase = useSharedValue(FIGURE_REST_PHASE);
  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min(timeSincePreviousFrame ?? 0, 40) / 1000;
    phase.set((phase.get() + dt * cadence.get() * Math.PI) % (Math.PI * 2));
  }, false);
  useEffect(() => {
    if (reduce) { run.set(target.run); intensity.set(target.intensity); cadence.set(target.stepsPerSecond); }
    else {
      run.set(withTiming(target.run, { duration: 520, easing: Easing.inOut(Easing.cubic) }));
      intensity.set(withTiming(target.intensity, { duration: 360 }));
      cadence.set(withTiming(target.stepsPerSecond, { duration: 520, easing: Easing.inOut(Easing.cubic) }));
    }
  }, [reduce, target.run, target.intensity, target.stepsPerSecond, run, intensity, cadence]);
  useEffect(() => {
    frame.setActive(active && !reduce);
    return () => frame.setActive(false);
  }, [active, reduce, frame]);
  return <MovingFigure run={run} phase={phase} intensity={intensity} color={color} />;
}

export function SportGlyph({ glyph, size = 20, color, pose = 0 }: { glyph: Glyph; size?: number; color: string; pose?: Pose }) {
  const phase = FIGURE_REST_PHASE + pose * Math.PI;
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    {glyph === 'run_walk' ? <>
      <G transform="translate(-3 5) scale(.74)"><StaticFigure run={0} phase={phase} color={color} /></G>
      <G transform="translate(7 5) scale(.74)"><StaticFigure run={1} phase={phase + 0.7} color={color} /></G>
    </> : glyph === 'trail' ? <>
      <Path d="M2 22 L22 17" stroke={color} strokeWidth={1.3} />
      <G transform="translate(2 1) scale(.84)"><StaticFigure run={1} phase={phase} color={color} /></G>
    </> : <StaticFigure run={glyph === 'walk' ? 0 : 1} phase={phase} color={color} />}
  </Svg>;
}

const GLYPH_SPORT = { run: 'running', walk: 'walking', trail: 'trail', run_walk: 'run_walk' } as const;

/**
 * Figura a contorno (disegno, non omino) con un movimento morbido e continuo: un leggero rimbalzo del passo, un'inclinazione in avanti
 * che respira e una piccola oscillazione laterale. Il ritmo segue il livello (più impegno, passo più rapido). Ferma con "Riduci movimento".
 */
export function AnimatedActivityFigure({ glyph, size = 72, color, level = 2, active = true }: { glyph: Glyph; size?: number; color: string; pace?: number | null; level?: number; active?: boolean }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  const fig = FIGURE_IMAGE[GLYPH_SPORT[glyph]];
  const running = glyph === 'run' || glyph === 'run_walk';
  const period = Math.round((running ? 820 : 1250) * (1.18 - Math.min(4, Math.max(0, level)) * 0.07));
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(p); p.value = withTiming(0, { duration: 300 }); return; }
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: period, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, active, period, p]);
  const st = useAnimatedStyle(() => {
    const w = p.value * Math.PI * 2;
    const bounce = -Math.abs(Math.sin(w / 2)) * size * (running ? 0.045 : 0.025);
    return { transform: [{ translateY: bounce }, { translateX: Math.sin(w) * size * 0.012 }, { rotate: `${Math.sin(w) * (running ? 1.4 : 0.8)}deg` }] };
  });
  if (!fig) return <Svg width={size} height={size} viewBox="0 0 24 24" />;
  return (
    <Animated.View style={[{ width: size * fig.ratio, height: size }, st]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={fig.src} resizeMode="contain" tintColor={color} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

export function ActivityGlyph({ style, size = 20, color }: { style: ActivityStyle; size?: number; color: string }) {
  if (style.glyph) return <SportGlyph glyph={style.glyph} size={size} color={color} />;
  return <Ionicons name={style.icon} size={size} color={color} />;
}
