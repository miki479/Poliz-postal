import { themeMode , color, S } from '@/constants/theme';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Animated, AppState, Easing, Modal, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, t, useReduceMotion } from '@/components/ui';
import { styleOfSport } from '@/constants/activityColors';

import { trackKey } from '@/lib/routeGeometry';
import { displayTrack } from '@shared/routeDisplay.ts';
import { chunkSpeedColors, nextReplayValue, PACE_GRADIENT, replayChunks, replayChunkPoints, replayEndpoints } from '@shared/replayChunks.ts';
import { LinearGradient } from 'expo-linear-gradient';
import { replayPosition, replayTimeline } from '@shared/replay.ts';
import type { TrackMark } from '@shared/trackMarks.ts';
import type { TrackPoint } from '@shared/types.ts';

type Props={track:TrackPoint[];style?:StyleProp<ViewStyle>;loop?:boolean;seconds?:number;paused?:boolean;marks?:TrackMark[];tint?:string;chrome?:boolean;insetTop?:number;onOpenMark?:(m:TrackMark)=>void};
const coord=(p:TrackPoint)=>({latitude:p.lat,longitude:p.lng});
const EMPTY_COORDS:{latitude:number;longitude:number}[]=[];
/** Tutta la geometria è nativa: nessun livello SVG proiettato sopra la cartografia. */
export function RouteReplay(props:Props){return <NativeReplay key={trackKey(props.track)} {...props}/>;}
function NativeReplay({track,style,loop=false,seconds=10,paused=false,marks=[],tint=styleOfSport('running').solid,chrome=false,insetTop=0,onOpenMark}:Props){
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 useEffect(()=>{const sub=AppState.addEventListener('change',value=>setForeground(value==='active'));return()=>sub.remove();},[]);
 const reduce=useReduceMotion(); const insets=useSafeAreaInsets();
 const filtered=useMemo(()=>displayTrack(track),[track]);
 const [mapType,setMapType]=useState<'night'|'satellite'>('night');
 const [expanded,setExpanded]=useState(false); const [ready,setReady]=useState(false);
 const [finished,setFinished]=useState(false); const [cycle,setCycle]=useState(0);
 const visible=filtered;
 const timeline=useMemo(()=>replayTimeline(visible.points),[visible.points]);
 const chunks=useMemo(()=>replayChunks(visible.points,24),[visible.points]);
 const speedColors=useMemo(()=>chunkSpeedColors(chunks),[chunks]);
 const [at,setAt]=useState(0); const lastPaint=useRef(0);
 const fullCoords=useMemo(()=>chunks.map(c=>c.points.map(coord)),[chunks]);
 const map=useRef<MapView>(null), head=useRef<ComponentRef<typeof Marker>>(null);const clock=useRef(0);
 const endpoints=replayEndpoints(visible.points,finished,reduce);
 const rate=timeline.timed?Math.max(1,timeline.total/Math.max(1,seconds)):timeline.total/Math.max(1,seconds);
 const fit=()=>{if(map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:32,left:32,right:chrome?64:32},animated:false});};
 useEffect(()=>{
  if(!ready)return;
  const draw=(at:number,still=false)=>{
   // La polilinea si aggiorna da React (non con setNativeProps, che sulla mappa non ridisegna): al massimo ~20 volte al secondo,
   // e solo il blocco in corso cambia; i blocchi completati hanno array stabili e non vengono rimandati alla mappa.
   const now=Date.now();
   if(still||at<=0||at>=timeline.total||now-lastPaint.current>=50){lastPaint.current=now;setAt(still?timeline.total:at);}
   const sample=replayPosition(timeline,at);
   if(sample)head.current?.setCoordinates(coord(sample.point));
  };
  draw(clock.current,reduce);
  if(reduce||paused||!foreground||timeline.total<=0)return;
  let frame=0,last:number|null=null,hold=clock.current===0?1100:0,ended=false;
  const tick=(now:number)=>{
   const dt=last===null?0:Math.max(0,now-last);last=now;
   if(hold>0)hold=Math.max(0,hold-dt);
   else if(ended){
    if(!loop)return;
    clock.current=0;ended=false;hold=1100;
    setFinished(false);setCycle(c=>c+1);draw(0);
   }else{
    clock.current=nextReplayValue(clock.current,dt,rate,timeline.total);
    draw(clock.current);
    if(clock.current>=timeline.total){setFinished(true);ended=true;hold=1300;}
   }
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(frame);
 },[ready,reduce,paused,foreground,timeline,rate,loop,chunks]);
 useEffect(()=>{if(ready&&map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:32,left:32,right:chrome?64:32},animated:false});},[visible.points,ready,expanded,insetTop,insets.top,chrome]);
 const top=(expanded?insets.top:insetTop)+S.sm;
 const surface=()=> <View style={{flex:1,backgroundColor:color.surface}}>
  <MapView ref={map} style={{flex:1}} userInterfaceStyle={themeMode()} mapType={mapType==='satellite'?'hybrid':Platform.OS==='ios'?'mutedStandard':'standard'} pitchEnabled={false} rotateEnabled scrollEnabled zoomEnabled moveOnMarkerPress={false}
   initialRegion={visible.points[0]?{...coord(visible.points[0]),latitudeDelta:.015,longitudeDelta:.015}:undefined} onMapReady={()=>{setReady(true);fit();}} onLayout={()=>{if(ready)fit();}} accessibilityLabel="Percorso GPS registrato. Trascina, ingrandisci o ruota la mappa">
   {chunks.map((chunk,i)=>{
    const done=reduce||finished||(at>0&&at>=timeline.axis[chunk.to]);
    const coords=done?fullCoords[i]:replayChunkPoints(chunk,timeline,at).map(coord);
    return coords.length>1?<Polyline key={i} coordinates={coords} strokeColor={speedColors?speedColors[i]:tint} strokeWidth={5} lineCap="round" lineJoin="round"/>:null;
   })}
   {endpoints.start&&visible.points[0]?<Endpoint point={visible.points[0]} label="Partenza" tint={color.success} active={ready&&!paused&&!finished} pulse={cycle} reduce={reduce}/>:null}
   {endpoints.finish&&visible.points.length>1?<Endpoint point={visible.points[visible.points.length-1]} label={endpoints.close&&reduce?'Partenza e arrivo':'Arrivo'} tint={color.danger} active={ready&&finished} pulse={cycle} reduce={reduce}/>:null}
   {!reduce&&!finished&&visible.points.length>1?<Marker ref={head} coordinate={coord(visible.points[0])} anchor={{x:.5,y:.5}} tracksViewChanges={false} title="Direzione del percorso"><View style={{width:16,height:16,borderRadius:8,backgroundColor:tint,borderWidth:3,borderColor:color.text}}/></Marker>:null}
   {marks.filter(m=>m.kind==='split').map(m=><Marker key={m.id} coordinate={{latitude:m.lat,longitude:m.lng}} anchor={{x:.5,y:.5}} tracksViewChanges={false} title={m.title} description={m.detail} onCalloutPress={()=>onOpenMark?.(m)}><View style={{width:22,height:22,borderRadius:11,backgroundColor:m.medal?['#F5C84C','#C4CCD6','#D08B54'][m.medal-1]:color.bg,borderWidth:2,borderColor:m.medal?'#fff':color.text,alignItems:'center',justifyContent:'center'}}><Text style={{color:m.medal?'#1a1a1a':color.text,fontSize:10,fontWeight:'800'}}>{m.label}</Text></View></Marker>)}
   {marks.filter(m=>m.kind==='record').map(m=><Marker key={m.id} coordinate={{latitude:m.lat,longitude:m.lng}} title={m.title} description={m.detail} pinColor={color.warning} onCalloutPress={()=>onOpenMark?.(m)}/>)}
  </MapView>
  {chrome&&speedColors?<View pointerEvents="none" style={{position:'absolute',left:S.md,bottom:S.lg,gap:3}}><LinearGradient colors={PACE_GRADIENT as unknown as [string,string,...string[]]} start={{x:0,y:0}} end={{x:1,y:0}} style={{width:110,height:5,borderRadius:3}}/><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:color.text,fontSize:10,fontWeight:'700'}}>Lento</Text><Text style={{color:color.text,fontSize:10,fontWeight:'700'}}>Veloce</Text></View></View>:null}
  {chrome?<View style={{position:'absolute',top,right:S.sm,gap:S.xs}}>
   <IconButton name="scan-outline" label="Centra percorso" filled onPress={fit}/>
   <IconButton name="layers-outline" label="Cambia tipo di mappa" filled onPress={()=>setMapType(mapType==='night'?'satellite':'night')}/>
   <IconButton name={expanded?'contract-outline':'expand-outline'} label={expanded?'Chiudi schermo intero':'Apri mappa a schermo intero'} filled onPress={()=>{setReady(false);setExpanded(!expanded);}}/>
  </View>:null}

 </View>;
 if(!filtered.points.length)return <View style={[{padding:S.lg,backgroundColor:color.surface},style]}><Text style={t.muted}>Il percorso non è disponibile per questa attività.</Text></View>;
 return <View style={[{overflow:'hidden',backgroundColor:color.surface},style]}>{expanded?<Modal visible animationType="none" onRequestClose={()=>{setReady(false);setExpanded(false);}}>{surface()}</Modal>:surface()}</View>;
}

function Endpoint({point,label,tint,active,pulse,reduce}:{point:TrackPoint;label:string;tint:string;active:boolean;pulse:number;reduce:boolean}) {
 const [rise]=useState(()=>new Animated.Value(0));
 useEffect(()=>{
  rise.stopAnimation();rise.setValue(0);
  if(!active||reduce)return;
  const bounce=Animated.sequence([0,1,2].flatMap((i)=>[
   Animated.timing(rise,{toValue:-(12-i*3),duration:180,easing:Easing.out(Easing.quad),useNativeDriver:true}),
   Animated.timing(rise,{toValue:0,duration:200,easing:Easing.in(Easing.quad),useNativeDriver:true}),
  ]));bounce.start();return()=>bounce.stop();
 },[active,pulse,reduce,rise]);
 return <Marker coordinate={coord(point)} title={label} anchor={{x:.5,y:.59}} tracksViewChanges>
  <View style={{width:44,height:60,alignItems:'center',justifyContent:'flex-end',paddingBottom:12}}>
   <Animated.View style={{width:25,height:25,borderRadius:13,backgroundColor:tint,borderWidth:3,borderColor:color.text,transform:[{translateY:rise}],alignItems:'center',justifyContent:'center'}}>
    <Text style={{color:color.bg,fontSize:11,fontWeight:'900'}}>{label==='Partenza'?'P':label==='Arrivo'?'A':'P/A'}</Text>
   </Animated.View>
  </View>
 </Marker>;
}
