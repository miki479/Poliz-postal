import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { ActivityStyle } from '@/constants/activityColors';
import { Image as ExpoImage } from 'expo-image';
import { ANIMATED_FIGURE, SESSION_FIGURE } from '@/constants/figureImages';
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

export function SportGlyph({ glyph, size = 20, color }: { glyph: Glyph; size?: number; color: string; pose?: Pose }) {
  return <Image source={SESSION_FIGURE[GLYPH_ICON[glyph]].src} resizeMode="contain" tintColor={color} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

const GLYPH_ICON = { run: 'run', walk: 'walk', trail: 'trail', run_walk: 'fastwalk' } as const;

/** Figura articolata animata (braccia e gambe in movimento, ciclo continuo). Ferma, sul primo fotogramma, se non attiva o con "Riduci movimento". */
export function AnimatedActivityFigure({ glyph, size = 72, active = true }: { glyph: Glyph; size?: number; color?: string; pace?: number | null; level?: number; active?: boolean }) {
  const reduce = useReduceMotion();
  return <ExpoImage source={ANIMATED_FIGURE[GLYPH_ICON[glyph]]} contentFit="contain" autoplay={active && !reduce} style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

export function ActivityGlyph({ style, size = 20, color }: { style: ActivityStyle; size?: number; color: string }) {
  if (style.glyph) return <SportGlyph glyph={style.glyph} size={size} color={color} />;
  return <Ionicons name={style.icon} size={size} color={color} />;
}
