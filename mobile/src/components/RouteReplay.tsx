import { useEffect, useMemo, useRef, useState, type ComponentType, type ComponentProps, type Ref } from 'react';
import { Modal, Platform, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Pills, Row, t, useReduceMotion } from '@/components/ui';
import { color, S, R, type } from '@/constants/theme';
import { lapEnds, trackKey } from '@/lib/routeGeometry';
import { displayTrack } from '@shared/routeDisplay.ts';
import { replayPosition, replayTimeline } from '@shared/replay.ts';
import type { TrackMark } from '@shared/trackMarks.ts';
import type { TrackPoint } from '@shared/types.ts';

type Props={track:TrackPoint[];style?:StyleProp<ViewStyle>;loop?:boolean;seconds?:number;paused?:boolean;marks?:TrackMark[];tint?:string;chrome?:boolean;insetTop?:number;onOpenMark?:(m:TrackMark)=>void};
const coord=(p:TrackPoint)=>({latitude:p.lat,longitude:p.lng});
type MarkerHandle={animateMarkerToCoordinate:(p:{latitude:number;longitude:number},duration:number)=>void};
const MovingMarker=Marker.Animated as unknown as ComponentType<Omit<ComponentProps<typeof Marker>,'coordinate'> & {coordinate:AnimatedRegion;ref?:Ref<MarkerHandle>}>;

/** Tutta la geometria è nativa: nessun livello SVG proiettato sopra la cartografia. */
export function RouteReplay(props:Props){return <NativeReplay key={trackKey(props.track)} {...props}/>;}
function NativeReplay({track,style,loop=false,seconds=10,paused=false,marks=[],tint=color.accent,chrome=false,insetTop=0,onOpenMark}:Props){
 const reduce=useReduceMotion(); const insets=useSafeAreaInsets();
 const filtered=useMemo(()=>displayTrack(track),[track]);
 const [lap,setLap]=useState(0); const [mapType,setMapType]=useState<'night'|'satellite'>('night');
 const [expanded,setExpanded]=useState(false); const [manualPause,setManualPause]=useState(false); const [ready,setReady]=useState(false);
 const ends=useMemo(()=>filtered.points.some(p=>p.breakBefore)?[]:lapEnds(filtered.points),[filtered.points]);
 const ranges=useMemo(()=>ends.length>1?[0,...ends]:[],[ends]);
 const visible=useMemo(()=>lap>0?displayTrack(filtered.points.slice(ranges[lap-1],(ranges[lap]??filtered.points.length-1)+1)):filtered,[filtered,lap,ranges]);
 const timeline=useMemo(()=>replayTimeline(visible.points),[visible.points]);
 const map=useRef<MapView>(null), head=useRef<MarkerHandle>(null);const clock=useRef(0);const previousIndex=useRef(0);
 const [position]=useState(()=>new AnimatedRegion({...coord(filtered.points[0]??{lat:0,lng:0,t:0}),latitudeDelta:0,longitudeDelta:0}));
 const rate=timeline.timed?Math.max(1,timeline.total/Math.max(1,seconds)):timeline.total/Math.max(1,seconds);
 const fit=()=>{if(map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:chrome?70:30,left:32,right:32},animated:false});};
 useEffect(()=>{clock.current=0;previousIndex.current=0;const first=visible.points[0];if(first)position.setValue({...coord(first),latitudeDelta:0,longitudeDelta:0});},[visible.points,position]);
 useEffect(()=>{
  if(!ready||reduce||paused||manualPause||timeline.total<=0)return;
  let last=performance.now();let hold=0;
  const timer=setInterval(()=>{
   const now=performance.now();const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
   if(clock.current>=timeline.total){if(!loop){clearInterval(timer);return;}hold ||= now+1200;if(now<hold)return;clock.current=0;hold=0;}
   else clock.current=Math.min(timeline.total,clock.current+dt*rate);
   const sample=replayPosition(timeline,clock.current);if(!sample)return;
   const target=coord(sample.point);
   const crossedGap=visible.points.slice(previousIndex.current+1,sample.index+1).some(p=>p.breakBefore);previousIndex.current=sample.index;
   const duration=sample.gap||crossedGap?0:100;
   if(Platform.OS==='android')head.current?.animateMarkerToCoordinate(target,duration);
   else position.timing({...target,latitudeDelta:0,longitudeDelta:0,toValue:0,duration,useNativeDriver:false}).start();
  },100);
  return()=>{clearInterval(timer);position.stopAnimation(()=>{});};
 },[ready,reduce,paused,manualPause,timeline,rate,loop,position,visible.points]);
 useEffect(()=>{if(ready&&map.current&&visible.points.length)map.current.fitToCoordinates(visible.points.map(coord),{edgePadding:{top:(expanded?insets.top+42:insetTop)+48,bottom:chrome?70:30,left:32,right:32},animated:false});},[visible.points,ready,expanded,insetTop,insets.top,chrome]);
 const top=(expanded?insets.top:insetTop)+S.sm;
 const surface=()=> <View style={{flex:1,backgroundColor:color.surface}}>
  <MapView ref={map} style={{flex:1}} userInterfaceStyle="dark" mapType={mapType==='satellite'?'hybrid':Platform.OS==='ios'?'mutedStandard':'standard'} pitchEnabled={false} rotateEnabled scrollEnabled zoomEnabled moveOnMarkerPress={false}
   initialRegion={visible.points[0]?{...coord(visible.points[0]),latitudeDelta:.015,longitudeDelta:.015}:undefined} onMapReady={()=>{setReady(true);fit();}} onLayout={()=>{if(ready)fit();}} accessibilityLabel="Percorso GPS registrato. Trascina, ingrandisci o ruota la mappa">
   {visible.segments.map((segment,i)=><Polyline key={i} coordinates={segment.map(coord)} strokeColor={tint} strokeWidth={5} lineCap="round" lineJoin="round"/>)}
   {visible.points[0]?<Marker coordinate={coord(visible.points[0])} title="Partenza registrata" pinColor={color.success}/>:null}
   {visible.points.length>1?<Marker coordinate={coord(visible.points[visible.points.length-1])} title="Arrivo registrato" pinColor={color.danger}/>:null}
   {!reduce&&visible.points.length>1?<MovingMarker ref={head} coordinate={position} anchor={{x:.5,y:.5}} tracksViewChanges={false} title="Direzione del percorso"><View style={{width:16,height:16,borderRadius:8,backgroundColor:tint,borderWidth:3,borderColor:color.text}}/></MovingMarker>:null}
   {marks.filter(m=>m.kind==='record').map(m=><Marker key={m.id} coordinate={{latitude:m.lat,longitude:m.lng}} title={m.title} description={m.detail} pinColor={color.warning} onCalloutPress={()=>onOpenMark?.(m)}/>)}
  </MapView>
  {chrome?<View style={{position:'absolute',top,right:S.sm,gap:S.xs}}>
   <IconButton name="scan-outline" label="Centra percorso" filled onPress={fit}/>
   <IconButton name="layers-outline" label="Cambia tipo di mappa" filled onPress={()=>setMapType(mapType==='night'?'satellite':'night')}/>
   <IconButton name={expanded?'contract-outline':'expand-outline'} label={expanded?'Chiudi schermo intero':'Apri mappa a schermo intero'} filled onPress={()=>{setReady(false);setExpanded(!expanded);}}/>
  </View>:null}
  {chrome&&ranges.length>2?<View style={{position:'absolute',top,left:S.sm,right:60}}><ScrollView horizontal showsHorizontalScrollIndicator={false}><Pills value={lap} onChange={setLap} options={[{value:0,label:'Tutto'},...ends.map((_,i)=>({value:i+1,label:`Giro ${i+1}`}))]}/></ScrollView></View>:null}
  <View style={{position:'absolute',left:S.sm,right:chrome?64:S.sm,bottom:S.sm,padding:S.sm,borderRadius:R.control,backgroundColor:color.overlay,gap:S.xs}}>
   <Row><Text style={[type.caption,{color:color.text,flex:1}]}>{reduce?'Percorso registrato':timeline.timed?`Replay · ×${Math.round(rate)}`:'Animazione · tempi GPS assenti'}{lap?` · Giro ${lap}`:''}</Text>{!reduce?<IconButton name={manualPause?'play':'pause'} label={manualPause?'Riprendi replay':'Pausa replay'} onPress={()=>setManualPause(!manualPause)}/>:null}</Row>
   {filtered.filtered||filtered.points.some(p=>p.breakBefore)?<Text style={t.small}>Alcuni tratti potrebbero essere meno precisi a causa del segnale GPS.</Text>:null}
  </View>
 </View>;
 if(!filtered.points.length)return <View style={[{padding:S.lg,backgroundColor:color.surface},style]}><Text style={t.muted}>Il percorso non è disponibile per questa attività.</Text></View>;
 return <View style={[{overflow:'hidden',backgroundColor:color.surface},style]}>{expanded?<Modal visible animationType="none" onRequestClose={()=>{setReady(false);setExpanded(false);}}>{surface()}</Modal>:surface()}</View>;
}
