import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { color, themeMode, subscribeTheme } from '@/constants/theme';

/** iOS 26 native glass; an opaque capsule when transparency is reduced or unavailable. */
export function LiquidBar({children}:{children:ReactNode}) {
 const mode=useSyncExternalStore(subscribeTheme,themeMode,themeMode);
 const [opaque,setOpaque]=useState(true);
 useEffect(()=>{
  if(Platform.OS!=='ios')return;
  let live=true;
  void AccessibilityInfo.isReduceTransparencyEnabled().then(value=>{if(live)setOpaque(value);});
  const sub=AccessibilityInfo.addEventListener('reduceTransparencyChanged',setOpaque);
  return()=>{live=false;sub.remove();};
 },[]);
 const glass=Platform.OS==='ios'&&isLiquidGlassAvailable()&&!opaque;
 const style={flexDirection:'row' as const,alignItems:'center' as const,minHeight:68,padding:4,borderRadius:38,borderWidth:1,borderColor:color.separator,boxShadow:'0 8px 28px rgba(0,0,0,0.28)'};
 return glass?<GlassView glassEffectStyle="regular" colorScheme={mode} style={style}>{children}</GlassView>:<View style={[style,{backgroundColor:mode==='light'?'rgba(255,255,255,0.97)':'rgba(21,20,17,0.96)'}]}>{children}</View>;
}
