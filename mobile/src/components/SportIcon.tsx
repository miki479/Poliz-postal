import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useDerivedValue, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import type { ActivityStyle } from '@/constants/activityColors';
import { figureGeometry, figureMotion, FIGURE_REST_PHASE, type FigureGeometry, type FigureGlyph } from '@/lib/activityFigure';
import { useReduceMotion } from '@/lib/useReduceMotion';

export type Glyph = FigureGlyph;
/** Compatibilita con le illustrazioni esistenti; le nuove animazioni usano una fase continua. */
export type Pose = 0 | 1;
const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
type Part = Exclude<keyof FigureGeometry, 'head'>;

function StaticFigure({ run, phase, color }: { run: number; phase: number; color: string }) {
  const g = figureGeometry(run, phase);
  return <>
    <Path d={g.backArm} stroke={color} strokeOpacity={0.62} strokeWidth={1.65} />
    <Path d={g.backLeg} stroke={color} strokeOpacity={0.68} strokeWidth={2} />
    <Path d={g.torso} fill={color} stroke="none" />
    <Path d={g.shorts} fill={color} fillOpacity={0.75} stroke="none" />
    <Circle cx={g.head.x} cy={g.head.y} r={1.72} fill={color} stroke="none" />
    <Path d={g.frontLeg} stroke={color} strokeWidth={2.15} />
    <Path d={g.frontArm} stroke={color} strokeWidth={1.8} />
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
    <AnimatedPart geometry={geometry} part="backArm" color={color} width={1.65} opacity={0.62} />
    <AnimatedPart geometry={geometry} part="backLeg" color={color} width={2} opacity={0.68} />
    <AnimatedPart geometry={geometry} part="torso" color={color} width={0} fill />
    <AnimatedPart geometry={geometry} part="shorts" color={color} width={0} fill opacity={0.75} />
    <ACircle animatedProps={head} r={1.72} fill={color} stroke="none" />
    <AnimatedPart geometry={geometry} part="frontLeg" color={color} width={2.15} />
    <AnimatedPart geometry={geometry} part="frontArm" color={color} width={1.8} />
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

/** Movimento continuo sul thread UI: la fase resta stabile cambiando sport, ritmo o livello. */
export function AnimatedActivityFigure({ glyph, size = 72, color, pace, level = 2, active = true }: { glyph: Glyph; size?: number; color: string; pace?: number | null; level?: number; active?: boolean }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {glyph === 'run_walk' ? <>
      <G transform="translate(-3 5) scale(.74)"><SingleAnimated glyph="walk" color={color} pace={pace} level={level} active={active} /></G>
      <G transform="translate(7 5) scale(.74)"><SingleAnimated glyph="run" color={color} pace={pace} level={level} active={active} /></G>
    </> : <>
      {glyph === 'trail' ? <Path d="M2 22 L22 17" stroke={color} strokeWidth={1.3} /> : null}
      <G transform={glyph === 'trail' ? 'translate(2 1) scale(.84)' : undefined}><SingleAnimated glyph={glyph} color={color} pace={pace} level={level} active={active} /></G>
    </>}
  </Svg>;
}

export function ActivityGlyph({ style, size = 20, color }: { style: ActivityStyle; size?: number; color: string }) {
  if (style.glyph) return <SportGlyph glyph={style.glyph} size={size} color={color} />;
  return <Ionicons name={style.icon} size={size} color={color} />;
}
