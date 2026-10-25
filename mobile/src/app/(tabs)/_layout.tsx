import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, R, S, type } from '@/constants/theme';
import { useReduceMotion } from '@/lib/useReduceMotion';

const ITEMS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; selected: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home-outline', selected: 'home' },
  esplora: { label: 'Esplora', icon: 'map-outline', selected: 'map' },
  club: { label: 'Club', icon: 'people-outline', selected: 'people' },
  social: { label: 'Social', icon: 'chatbubbles-outline', selected: 'chatbubbles' },
  profilo: { label: 'Profilo', icon: 'person-circle-outline', selected: 'person-circle' },
};

function RecordButton() {
  const reduce = useReduceMotion();
  const [glow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) { glow.stopAnimation(); glow.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]), { iterations: 2 });
    animation.start(); return () => animation.stop();
  }, [reduce, glow]);
  return <Pressable onPress={() => router.push('/registra')} accessibilityRole="button" accessibilityLabel="Registra una corsa o camminata" style={({ pressed }) => [{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'flex-end', gap: S.xs, opacity: pressed ? 0.8 : 1 }]}>
    <View style={{ width: 56, height: 56, marginTop: -22, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: color.accentTint, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }} />
      <LinearGradient colors={[color.accent, color.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color.surface }}><Ionicons name="radio-button-on" size={32} color={color.onAccent} /></LinearGradient>
    </View>
    <Text style={[type.caption, { color: color.accent, fontWeight: '800', fontSize: 10, textAlign: 'center' }]}>REGISTRA</Text>
  </Pressable>;
}

function NavigationBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return <View style={{ paddingTop: S.sm, paddingBottom: Math.max(insets.bottom, S.sm), paddingHorizontal: S.sm, backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.separator }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 64, borderRadius: R.card, backgroundColor: color.surface }}>
      {state.routes.map((route, index) => {
        const item = ITEMS[route.name]; if (!item) return null;
        const selected = state.index === index;
        return <Fragment key={route.key}>
          {index === 2 ? <RecordButton /> : null}
          <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label} style={({ pressed }) => [{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: S.xs, gap: S.xs }, pressed && { opacity: 0.65 }]} onPress={() => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigateToTab(route.key);
          }} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}>
            <Ionicons name={selected ? item.selected : item.icon} size={25} color={selected ? color.accent : color.textSecondary} />
            <Text style={[type.caption, { fontSize: 10, color: selected ? color.accent : color.textSecondary, fontWeight: selected ? '700' : '500', textAlign: 'center' }]}>{item.label}</Text>
          </Pressable>
        </Fragment>;
      })}
    </View>
  </View>;
}

/** Il comando centrale apre la registrazione a tutto schermo; tutte le sezioni esistenti restano raggiungibili. */
export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }} tabBar={(props) => <NavigationBar {...props} />}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="esplora" options={{ title: 'Esplora' }} />
    <Tabs.Screen name="club" options={{ title: 'Club' }} />
    <Tabs.Screen name="social" options={{ title: 'Social' }} />
    <Tabs.Screen name="profilo" options={{ title: 'Profilo' }} />
  </Tabs>;
}
