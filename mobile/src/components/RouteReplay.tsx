import { useEffect, useMemo, useRef, useState, type ComponentType, type ComponentProps, type Ref } from 'react';
import { Animated, Easing, Modal, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, t, useReduceMotion } from '@/components/ui';
import { styleOfSport } from '@/constants/activityColors';
import { color, S } from '@/constants/theme';
import { trackKey } from '@/lib/routeGeometry';
import { displayTrack } from '@shared/routeDisplay.ts';
import { replayDrawing } from '@shared/replayDrawing.ts';
import { replayPosition, replayTimeline } from '@shared/replay.ts';
import type { TrackMark } from '@shared/trackMarks.ts';
import type { TrackPoint } from '@shared/types.ts';

type Props={track:TrackPoint[];style?:StyleProp<ViewStyle>;loop?:boolean;seconds?:number;paused?:boolean;marks?:TrackMark[];tint?:string;chrome?:boolean;insetTop?:number;onOpenMark?:(m:TrackMark)=>void};
const coord=(p:TrackPoint)=>({latitude:p.lat,longitude:p.lng});
type MarkerHandle={animateMarkerToCoordinate:(p:{latitude:number;longitude:number},duration:number)=>void};
const MovingMarker=Marker.Animated as unknown as ComponentType<Omit<ComponentProps<typeof Marker>,'coordinate'> & {coordinate:AnimatedRegion;ref?:Ref<MarkerHandle>}>;

/** Tutta la geometria è nativa: nessun livello SVG proiettato sopra la cartografia. */
export function RouteReplay(props:Props){return <NativeReplay key={trackKey(props.track)} {...props}/>;}
function NativeReplay({track,style,loop=false,seconds=10,paused=false,marks=[],tint=styleOfSport('running').solid,chrome=false,insetTop=0,onOpenMark}:Props){
 const reduce=useReduceMotion(); const insets=useSafeAreaInsets();
 const filtered=useMemo(()=>displayTrack(track),[track]);
 const [mapType,setMapType]=useState<'night'|'satellite'>('night');
 const [expanded,setExpanded]=useState(false); const [ready,setReady]=useState(false);
 const [elapsed,setElapsed]=useState(0); const [cycle,setCycle]=useState(0);
 const visible=filtered;
 const timeline=useMemo(()=>replayTimeline(visible.points),[visible.points]);
 const map=useRef<MapView>(null), head=useRef<MarkerHandle>(null);const clock=useRef(0);const previousIndex=useRef(0);
 const [position]=useState(()=>new AnimatedRegion({...coord(filtered.points[0]??{lat:0,lng:0,t:0}),latitudeDelta:0,longitudeDelta:0}));
 const rate=timeline.timed?Math.max(1,timeline.total/Math.max(1,seconds)):timeline.total/Math.max(1,seconds);
 const fit=()=>{if(map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:32,left:32,right:chrome?64:32},animated:false});};
 useEffect(()=>{clock.current=0;previousIndex.current=0;const first=visible.points[0];if(first)position.setValue({...coord(first),latitudeDelta:0,longitudeDelta:0});},[visible.points,position]);
 useEffect(()=>{
  if(!ready||reduce||paused||timeline.total<=0)return;
  let last=performance.now();let hold=0;
  const timer=setInterval(()=>{
   const now=performance.now();const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
   if(clock.current>=timeline.total){if(!loop){clearInterval(timer);return;}hold ||= now+1200;if(now<hold)return;clock.current=0;hold=0;setCycle(c=>c+1);}
   else clock.current=Math.min(timeline.total,clock.current+dt*rate);
   setElapsed(clock.current);
   const sample=replayPosition(timeline,clock.current);if(!sample)return;
   const target=coord(sample.point);
   const crossedGap=visible.points.slice(previousIndex.current+1,sample.index+1).some(p=>p.breakBefore);previousIndex.current=sample.index;
   const duration=sample.gap||crossedGap?0:33;
   if(Platform.OS==='android')head.current?.animateMarkerToCoordinate(target,duration);
   else position.timing({...target,latitudeDelta:0,longitudeDelta:0,toValue:0,duration,useNativeDriver:false}).start();
  },33);
  return()=>{clearInterval(timer);position.stopAnimation(()=>{});};
 },[ready,reduce,paused,timeline,rate,loop,position,visible.points]);
 useEffect(()=>{if(ready&&map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:32,left:32,right:chrome?64:32},animated:false});},[visible.points,ready,expanded,insetTop,insets.top,chrome]);
 const top=(expanded?insets.top:insetTop)+S.sm;
 const surface=()=> <View style={{flex:1,backgroundColor:color.surface}}>
  <MapView ref={map} style={{flex:1}} userInterfaceStyle="dark" mapType={mapType==='satellite'?'hybrid':Platform.OS==='ios'?'mutedStandard':'standard'} pitchEnabled={false} rotateEnabled scrollEnabled zoomEnabled moveOnMarkerPress={false}
   initialRegion={visible.points[0]?{...coord(visible.points[0]),latitudeDelta:.015,longitudeDelta:.015}:undefined} onMapReady={()=>{setReady(true);fit();}} onLayout={()=>{if(ready)fit();}} accessibilityLabel="Percorso GPS registrato. Trascina, ingrandisci o ruota la mappa">
   {replayDrawing(timeline,elapsed,reduce).map((segment,i)=><Polyline key={i} coordinates={segment.map(coord)} strokeColor={tint} strokeWidth={5} lineCap="round" lineJoin="round"/>)}
   {visible.points[0]?<Endpoint point={visible.points[0]} label="Partenza" tint={color.success} active={ready&&!paused} pulse={cycle} reduce={reduce}/>:null}
   {visible.points.length>1?<Endpoint point={visible.points[visible.points.length-1]} label="Arrivo" tint={color.danger} active={ready&&elapsed>=timeline.total&&timeline.total>0} pulse={cycle} reduce={reduce}/>:null}
   {!reduce&&visible.points.length>1?<MovingMarker ref={head} coordinate={position} anchor={{x:.5,y:.5}} tracksViewChanges={false} title="Direzione del percorso"><View style={{width:16,height:16,borderRadius:8,backgroundColor:tint,borderWidth:3,borderColor:color.text}}/></MovingMarker>:null}
   {marks.filter(m=>m.kind==='record').map(m=><Marker key={m.id} coordinate={{latitude:m.lat,longitude:m.lng}} title={m.title} description={m.detail} pinColor={color.warning} onCalloutPress={()=>onOpenMark?.(m)}/>)}
  </MapView>
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
 return <Marker coordinate={coord(point)} title={label} anchor={{x:.5,y:.75}} tracksViewChanges>
  <View style={{width:44,height:60,alignItems:'center',justifyContent:'flex-end',paddingBottom:12}}>
   <Animated.View style={{width:25,height:25,borderRadius:13,backgroundColor:tint,borderWidth:3,borderColor:color.text,transform:[{translateY:rise}],alignItems:'center',justifyContent:'center'}}>
    <Text style={{color:color.bg,fontSize:11,fontWeight:'900'}}>{label==='Partenza'?'P':'A'}</Text>
   </Animated.View>
  </View>
 </Marker>;
}
