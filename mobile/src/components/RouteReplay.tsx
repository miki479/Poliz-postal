import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useReduceMotion } from '@/components/ui';
import { ACTIVITY_STYLES } from '@/constants/activityColors';
import { BADGE_KINDS, toneOfAward } from '@/constants/achievements';
import { color, S, type } from '@/constants/theme';
import { lapEnds } from '@/lib/routeGeometry';
import { descending, type Award } from '@shared/records.ts';
import { replayPosition, replaySlice, replayTimeline } from '@shared/replay.ts';
import { countLaps, trackSegments } from '@shared/track.ts';
import type { TrackMark } from '@shared/trackMarks.ts';
import type { TrackPoint } from '@shared/types.ts';

const coordinate = (p: TrackPoint) => ({ latitude: p.lat, longitude: p.lng });
type Props = {
  track: TrackPoint[]; style?: StyleProp<ViewStyle>; loop?: boolean; seconds?: number;
  paused?: boolean; marks?: TrackMark[]; tint?: string; chrome?: boolean; insetTop?: number;
  group?: boolean; awards?: Award[]; onOpenMark?: (mark: TrackMark) => void;
};
/** Native polylines and markers share the map's projection. A remount resets the replay for a new activity. */
export function RouteReplay(props: Props) {
  const first = props.track[0], last = props.track[props.track.length - 1];
  return <Replay key={`${props.track.length}:${first?.lat}:${first?.lng}:${first?.t}:${last?.lat}:${last?.lng}:${last?.t}`} {...props} />;
}
function Replay({ track, style, marks = [], awards = [], group = false, tint = color.storyInk, chrome = false, insetTop = 0, onOpenMark, loop = false, seconds = 8, paused = false }: Props) {
  const reduce = useReduceMotion();
  const [elapsed, setElapsed] = useState(0);
  const [realTime, setRealTime] = useState(false);
  const map = useRef<MapView>(null);
  const ready = useRef(false), measured = useRef(false);
  const playhead = useRef(0);
  const [satellite, setSatellite] = useState(false);
  const timeline = useMemo(() => replayTimeline(track), [track]);
  const total = timeline.total;
  const rate = timeline.timed ? realTime ? 1 : Math.max(1, total / Math.max(1, seconds)) : total / Math.max(1, seconds);
  const finished = reduce || elapsed >= total;
  const sample = replayPosition(timeline, reduce ? total : elapsed);
  const coords = useMemo(() => track.map(coordinate), [track]);
  const visible = sample ? finished ? track : [...track.slice(0, sample.index + 1), sample.point] : [];
  const base = group ? ACTIVITY_STYLES.event.solid : tint;
  const mainAward = descending(awards)[0];
  // Non-localized achievements decorate the whole activity, never an invented GPS location.
  const halo = mainAward ? toneOfAward(mainAward).light : null;
  const records = marks.filter((m) => m.kind === 'record' && m.fromT !== undefined && m.toT !== undefined);
  const recordColor = BADGE_KINDS.new_peak.tone.light;
  const activeRecord = sample && records.some((m) => sample.point.t >= m.fromT! && sample.point.t <= m.toT!);
  const laps = useMemo(() => countLaps(track), [track]);
  const ends = useMemo(() => lapEnds(track), [track]);
  const lap = sample ? Math.min(laps, 1 + ends.filter((i) => i <= sample.index).length) : 1;
  const fit = () => {
    if (ready.current && measured.current && coords.length) map.current?.fitToCoordinates(coords, { edgePadding: { top: insetTop + 70, right: 35, bottom: 65, left: 35 }, animated: false });
  };
  useEffect(() => {
    if (paused || reduce || total <= 0 || (!loop && playhead.current >= total)) return;
    let last = performance.now();
    let holdUntil = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      // A delayed UI tick/background return must not jump through the recording.
      const delta = Math.min(0.5, Math.max(0, (now - last) / 1000));
      last = now;
      if (playhead.current >= total) {
        if (!loop) { clearInterval(timer); return; }
        holdUntil ||= now + 1200;
        if (now < holdUntil) return;
        playhead.current = 0; holdUntil = 0;
      } else playhead.current = Math.min(total, playhead.current + delta * rate);
      setElapsed(playhead.current);
    }, 100);
    return () => clearInterval(timer);
  }, [paused, reduce, total, rate, loop, realTime]);
  const speedLabel = !timeline.timed ? 'Animazione · tempi GPS assenti' : realTime ? 'Tempo reale · 1×' : `Replay · ×${Math.round(rate * 10) / 10}`;
  const first = coords[0];
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: color.surface }, style]}>
      <MapView ref={map} style={{ flex: 1 }} userInterfaceStyle="dark" mapType={satellite ? 'hybrid' : 'mutedStandard'}
        initialRegion={first ? { ...first, latitudeDelta: 0.012, longitudeDelta: 0.012 } : undefined}
        onMapReady={() => { ready.current = true; fit(); }} onLayout={() => { measured.current = true; fit(); }}
        pitchEnabled={false} rotateEnabled={false} scrollEnabled zoomEnabled moveOnMarkerPress={false}
        accessibilityLabel="Percorso GPS: trascina e pizzica per esplorare">
        {trackSegments(track).map((segment, i) => <Polyline key={`base${i}`} coordinates={segment.map(coordinate)} strokeColor="rgba(255,255,255,0.16)" strokeWidth={4} zIndex={0} />)}
        {trackSegments(visible).map((segment, i) => <Polyline key={`halo${i}`} coordinates={segment.map(coordinate)} strokeColor={halo ?? base} strokeWidth={halo ? 11 : 6} zIndex={1} />)}
        {trackSegments(visible).map((segment, i) => <Polyline key={`route${i}`} coordinates={segment.map(coordinate)} strokeColor={base} strokeWidth={5} lineCap="round" lineJoin="round" zIndex={2} />)}
        {records.flatMap((m) => {
          const endT = Math.min(m.toT!, sample?.point.t ?? 0);
          if (endT <= m.fromT!) return [];
          return trackSegments(replaySlice(timeline, m.fromT!, endT)).map((segment, i) => <Polyline key={`${m.id}:${i}`} coordinates={segment.map(coordinate)} strokeColor={recordColor} strokeWidth={6} lineCap="round" lineJoin="round" zIndex={3} />);
        })}
        {sample ? <Marker coordinate={coordinate(sample.point)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges title={sample.gap ? 'GPS interrotto: nessun tratto ricostruito' : 'Punto del tracciato'} zIndex={10}>
          <View style={{ width: 18, height: 18, borderRadius: 9, borderColor: color.storyInk, borderWidth: 3, backgroundColor: activeRecord ? recordColor : base }} />
        </Marker> : null}
        {marks.filter((m) => m.kind !== 'record' || finished || (sample && m.toT !== undefined && sample.point.t >= m.toT)).map((m) => <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.title} description={m.detail}
          pinColor={m.kind === 'record' ? recordColor : m.kind === 'start' ? '#4FD1A5' : m.kind === 'finish' ? '#FF5C6C' : base} onCalloutPress={() => onOpenMark?.(m)} />)}
      </MapView>
      {chrome ? <View style={{ position: 'absolute', top: insetTop + S.sm, right: S.md, gap: S.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Inquadra tutto il percorso" onPress={fit} style={control}><Ionicons name="scan-outline" size={22} color={color.storyInk} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambia tipo di mappa" onPress={() => setSatellite(!satellite)} style={control}><Ionicons name="layers-outline" size={22} color={color.storyInk} /></Pressable>
      </View> : null}
      <View style={{ position: 'absolute', left: S.md, top: insetTop + S.md, gap: S.xs, maxWidth: '72%' }}>
        <Pressable disabled={!chrome || !timeline.timed || reduce} accessibilityRole={chrome ? "button" : undefined} accessibilityLabel={chrome ? `${speedLabel}. Tocca per alternare tempo reale e replay accelerato` : speedLabel} onPress={() => {
          if (finished) { playhead.current = 0; setElapsed(0); }
          setRealTime(!realTime);
        }} style={control}><Text style={[type.caption, { color: color.storyInk }]}>{laps > 1 ? `Giro ${lap} di ${laps} · ` : ''}{speedLabel}</Text></Pressable>
        {sample?.gap ? <Text style={[type.caption, { color: color.storyInk, backgroundColor: color.overlay }]}>Segnale GPS interrotto</Text> : null}
      </View>
      {(group || mainAward || records.length > 0) ? <View pointerEvents="none" style={{ position: 'absolute', left: S.md, bottom: S.md, right: S.md, flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
        {group ? <Text style={[legend, { color: base }]}>● Gruppo</Text> : null}
        {records.length ? <Text style={[legend, { color: recordColor }]}>● Tratto record</Text> : null}
        {mainAward ? <Text style={[legend, { color: halo! }]}>● {mainAward.name} · attività</Text> : null}
      </View> : null}
    </View>
  );
}
const control = { padding: 10, borderRadius: 16, backgroundColor: 'rgba(14,18,22,0.9)' };
const legend = { ...type.caption, backgroundColor: 'rgba(14,18,22,0.9)', padding: 6, borderRadius: 8 };
