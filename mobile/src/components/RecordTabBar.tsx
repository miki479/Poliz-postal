import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Tabs } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, HIT, S } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const ICONS: Record<string, [IconName, IconName, string]> = {
  index: ['home-outline', 'home', 'Home'],
  esplora: ['map-outline', 'map', 'Esplora'],
  club: ['people-outline', 'people', 'Gruppi'],
  profilo: ['person-circle-outline', 'person-circle', 'Profilo'],
};
const ORDER_LEFT = ['index', 'esplora'];
const ORDER_RIGHT = ['club', 'profilo'];
const RECORD_SIZE = 64;

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function RecordButton() {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse, reduce]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.45 }] }));

  return (
    <View style={styles.recordSlot} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registra un'attività"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push('/registra');
        }}
        style={({ pressed }) => [styles.record, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <LinearGradient colors={[color.energyHot, color.energy]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recordFill}>
          <View style={styles.recordDot} />
        </LinearGradient>
      </Pressable>
      <Text style={[styles.label, { color: color.energyHot, fontWeight: '800' }]}>Registra</Text>
    </View>
  );
}

/** Barra inferiore con il tasto centrale "Registra" sporgente: è l'azione principale dell'app. */
export function RecordTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const renderTab = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    const meta = ICONS[name];
    if (!route || !meta) return null;
    const focused = activeName === name;
    return (
      <Pressable
        key={name}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta[2]}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}
      >
        <Ionicons name={focused ? meta[1] : meta[0]} size={24} color={focused ? color.accent : color.textSecondary} />
        <Text style={[styles.label, { color: focused ? color.accent : color.textSecondary }]}>{meta[2]}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, S.sm) }]}>
      {ORDER_LEFT.map(renderTab)}
      <RecordButton />
      {ORDER_RIGHT.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
    paddingTop: S.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: HIT, gap: 2 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  recordSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  record: {
    width: RECORD_SIZE,
    height: RECORD_SIZE,
    borderRadius: RECORD_SIZE / 2,
    marginTop: -RECORD_SIZE / 2,
    borderWidth: 4,
    borderColor: color.bg,
    shadowColor: color.energy,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  recordFill: { flex: 1, borderRadius: RECORD_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  recordDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.storyInk },
  halo: {
    position: 'absolute',
    top: -RECORD_SIZE / 2,
    width: RECORD_SIZE,
    height: RECORD_SIZE,
    borderRadius: RECORD_SIZE / 2,
    backgroundColor: color.energy,
  },
});
