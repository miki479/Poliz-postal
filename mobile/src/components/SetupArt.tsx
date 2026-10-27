import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useReduceMotion, type IconName } from '@/components/ui';
import { color, M, R, S, type } from '@/constants/theme';

const Trace = Animated.createAnimatedComponent(Path);
export const SETUP_TINTS = [color.accent, color.accent, color.accent, color.accent, color.brandText, color.accent] as const;
const ICONS = ['sparkles-outline', 'person-outline', 'sync-outline', 'navigate-outline', 'people-outline', 'map-outline'] as const;
/** Conceptual illustrations, never a fake location, recorded activity or permission status. */
export function SetupArt({ step, selected = false, iconName, caption = 'COME FUNZIONA' }: { step: number; selected?: boolean; iconName?: IconName; caption?: string }) {
  const reduce = useReduceMotion();
  const phase = useSharedValue(0);
  const tint = SETUP_TINTS[step];
  useEffect(() => {
    if (reduce) { phase.set(1); return; }
    phase.set(0);
    phase.set(withRepeat(withTiming(1, { duration: M.reveal * 5, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(phase);
  }, [reduce, phase]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.2 + phase.get() * 0.18, transform: [{ scale: 0.96 + phase.get() * 0.04 }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: reduce ? 0 : -3 * phase.get() }] }));
  const trace = useAnimatedProps(() => ({ strokeDashoffset: reduce ? 0 : 320 * (1 - phase.get()) }));
  return <LinearGradient colors={[tint + '22', color.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    style={{ borderRadius: R.sheet, overflow: 'hidden', borderWidth: 1, borderColor: tint + '32', paddingVertical: S.lg, alignItems: 'center' }}>
    <View style={{ width: '100%', height: step === 1 ? 124 : 160 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', width: 136, height: 136, borderRadius: 68, backgroundColor: tint, alignSelf: 'center', top: S.sm }, glow]} />
      <Svg width="100%" height="100%" viewBox="0 0 280 160">
        <Path d="M0 120 Q55 85 100 120 T200 110 T300 110" stroke={tint + '25'} strokeWidth={1} fill="none" />
        <Path d="M0 140 Q70 110 135 135 T280 130" stroke={tint + '18'} strokeWidth={1} fill="none" />
        {step === 1 ? <><Rect x={74} y={18} width={132} height={124} rx={20} fill={color.surfaceElevated} stroke={tint + '70'} /><Path d="M99 109 H180 M99 123 H158" stroke={tint + '50'} strokeWidth={4} strokeLinecap="round" /></> : null}
        {step === 0 || step === 2 || step === 3 ? <>
          <Path d="M25 114 C65 114 60 48 104 58 S152 135 188 94 S225 38 256 48" stroke={tint + '30'} strokeWidth={3} fill="none" />
          <Trace d="M25 114 C65 114 60 48 104 58 S152 135 188 94 S225 38 256 48" stroke={tint} strokeWidth={3} strokeLinecap="round" fill="none" strokeDasharray={[320, 320]} animatedProps={trace} />
          <Circle cx={25} cy={114} r={6} fill={color.surface} stroke={tint} strokeWidth={3} /><Circle cx={256} cy={48} r={6} fill={tint} />
        </> : null}
        {step === 4 ? <><Path d="M56 110 Q140 28 224 110 M56 110 H224" stroke={tint + '70'} strokeWidth={2} strokeDasharray="4 6" fill="none" />{[56, 140, 224].map((x, i) => <Circle key={x} cx={x} cy={i === 1 ? 66 : 110} r={i === 1 ? 28 : 22} fill={color.surfaceElevated} stroke={tint} strokeWidth={2} />)}</> : null}
        {step === 5 ? <>
          <Path d="M35 15 V145 M95 15 V145 M185 15 V145 M245 15 V145 M15 45 H265 M15 115 H265" stroke={color.controlBorder + '25'} strokeWidth={2} />
          {[{ x: 95, y: 45 }, { x: 185, y: 115 }, { x: 245, y: 45 }].map((p) => <Circle key={p.x} cx={p.x} cy={p.y} r={24} fill={tint + '22'} stroke={tint + '66'} />)}
        </> : null}
      </Svg>
      <Animated.View style={[{ position: 'absolute', alignSelf: 'center', top: step === 1 ? S.md : S.xxxl, width: 72, height: 72, borderRadius: R.sheet, backgroundColor: color.surfaceElevated, borderWidth: 1, borderColor: tint + '80', justifyContent: 'center', alignItems: 'center' }, icon]}>
        <Ionicons name={selected ? 'checkmark' : iconName ?? ICONS[step]} size={36} color={tint} />
      </Animated.View>
    </View>
    <Text style={[type.caption, { color: color.textSecondary }]}>{caption}</Text>
  </LinearGradient>;
}
