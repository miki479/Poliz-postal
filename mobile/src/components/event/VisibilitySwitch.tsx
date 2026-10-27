import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { color, R, S, type } from '@/constants/theme';
import type { Visibility } from '@shared/types.ts';
const OPTIONS=[{value:'public',label:'Pubblica',icon:'earth-outline'},{value:'club',label:'Gruppo',icon:'people-outline'},{value:'private',label:'Solo link',icon:'link-outline'}] as const;
const HINT:Record<Visibility,string>={public:'Compare in Esplora: può unirsi chiunque.',club:'Riservata ai membri del gruppo scelto.',private:'Non compare in Esplora: la condividi con il link.'};
export function VisibilitySwitch({value,onChange}:{value:Visibility;onChange(v:Visibility):void}) {
 const {width,fontScale}=useWindowDimensions();
 return <View style={{gap:S.sm}}><View accessibilityRole="radiogroup" accessibilityLabel="Visibilità" style={{flexDirection:width<350||fontScale>1.4?'column':'row',padding:4,gap:4,borderRadius:R.control+4,backgroundColor:color.surfaceElevated}}>
  {OPTIONS.map(option=><Pressable key={option.value} accessibilityRole="radio" accessibilityState={{selected:value===option.value}} accessibilityLabel={option.label} onPress={()=>onChange(option.value)} style={{flex:1,minHeight:48,paddingHorizontal:S.sm,borderRadius:R.control,backgroundColor:value===option.value?color.accent:'transparent',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}>
   <Ionicons name={option.icon} size={17} color={value===option.value?color.onAccent:color.textSecondary}/><Text style={[type.subhead,{fontWeight:'700',flexShrink:1,color:value===option.value?color.onAccent:color.textSecondary}]}>{option.label}</Text>
  </Pressable>)}
 </View><Text style={[type.footnote,{color:color.textSecondary}]}>{HINT[value]}</Text></View>;
}
