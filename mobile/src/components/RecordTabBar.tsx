import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidBar } from './LiquidBar';
import { color, S, type } from '@/constants/theme';

const ITEMS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; selected: keyof typeof Ionicons.glyphMap }> = {
  index: { label: 'Home', icon: 'home-outline', selected: 'home' },
  esplora: { label: 'Esplora', icon: 'map-outline', selected: 'map' },
  club: { label: 'Community', icon: 'people-outline', selected: 'people' },
};

function RecordButton() {
  return <Pressable onPress={()=>router.push('/registra')} accessibilityRole="button" accessibilityLabel="Registra una corsa o camminata" style={({pressed})=>({flex:1,minHeight:64,alignItems:'center',justifyContent:'flex-end',paddingBottom:S.xs,gap:S.xs,opacity:pressed?.7:1})}>
    <Ionicons name="radio-button-on-outline" size={25} color={color.textSecondary}/>
    <Text style={[type.caption,{fontSize:11,color:color.textSecondary,fontWeight:'500',textAlign:'center'}]}>Registra</Text>
  </Pressable>;
}

export function RecordTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return <View style={{ position:'absolute',left:0,right:0,bottom:0,paddingBottom:Math.max(insets.bottom,8),paddingHorizontal:16 }}>
    <LiquidBar>
      {state.routes.map((route, index) => {
        const item = ITEMS[route.name]; if (!item) return null;
        const selected = state.index === index;
        return <Fragment key={route.key}>
          {route.name === 'club' ? <RecordButton /> : null}
          <Pressable accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.label} style={({ pressed }) => [{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: S.xs, gap: S.xs, borderRadius:32, backgroundColor:selected?color.accentTint:'transparent' }, pressed && { opacity: 0.65 }]} onPress={() => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigateToTab(route.key);
          }} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}>
            <Ionicons name={selected ? item.selected : item.icon} size={25} color={selected ? color.accent : color.textSecondary} />
            <Text style={[type.caption, { fontSize: 11, color: selected ? color.accent : color.textSecondary, fontWeight: selected ? '700' : '500', textAlign: 'center' }]}>{item.label}</Text>
          </Pressable>
        </Fragment>;
      })}
    </LiquidBar>
  </View>;
}

