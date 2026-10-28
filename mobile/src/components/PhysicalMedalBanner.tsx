import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { API_URL } from '@/lib/api';
import { color, R, S, type } from '@/constants/theme';
import { medalCatalog, physicalMedalOffer, type MedalOffer } from '@shared/medalShop.ts';
import type { Award } from '@shared/records.ts';
import { useLoad } from './ui';

async function loadCatalog():Promise<MedalOffer[]> {
  const response=await fetch(`${API_URL}/api/medals/catalog`,{credentials:'omit'});
  if(!response.ok)return [];
  const data=await response.json();
  return medalCatalog(data.offers);
}
/** No earned award or no real merchant URL means no banner. Never sends athlete data outside Runngo. */
export function PhysicalMedalBanner({awards}:{awards:Award[]}) {
 const state=useLoad(loadCatalog);
 const [error,setError]=useState(false),[busy,setBusy]=useState(false);
 const match=physicalMedalOffer(awards,state.data??[]);
 if(!match)return null;
 const {offer}=match;
 return <View style={{gap:S.xs}}>
  <Pressable accessibilityRole="link" accessibilityLabel={`${offer.title}: scopri la medaglia fisica sul sito esterno`} accessibilityHint="Apre il sito del venditore. Acquisto facoltativo." disabled={busy} onPress={async()=>{if(busy)return;setBusy(true);setError(false);try{await Linking.openURL(offer.url);}catch{setError(true);}finally{setBusy(false);}}} style={({pressed})=>({padding:S.lg,borderRadius:R.card,backgroundColor:color.surfaceElevated,borderWidth:1,borderColor:color.separator,flexDirection:'row',alignItems:'center',gap:S.md,opacity:pressed?.75:1})}>
   <Ionicons name="medal-outline" size={32} color={color.achievement}/>
   <View style={{flex:1,gap:S.xs}}><Text style={[type.headline,{color:color.text}]}>La tua conquista, anche da indossare</Text><Text style={[type.subhead,{color:color.textSecondary}]}>{offer.title}</Text><Text style={[type.footnote,{color:color.textSecondary}]}>Scopri la medaglia fisica · Sito esterno</Text></View>
   <Ionicons name="open-outline" size={20} color={color.textSecondary}/>
  </Pressable>
  {error?<Text accessibilityRole="alert" style={[type.footnote,{color:color.danger}]}>Non riesco ad aprire la pagina. Riprova tra poco.</Text>:null}
 </View>;
}
