import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import MapView, { Circle, Polyline, type MapType } from 'react-native-maps';

import { Button, IconButton, Panel, Pills, Row, Sheet, Skeleton, SwitchRow, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { RouteTrace } from '@/components/RouteTrace';
import { fmtDuration, fmtKm, KIND_LABEL } from '@/lib/format';
import type { MapInsights } from '@shared/mapInsights.ts';
import type { LatLng, PlannedSession, TrackPoint } from '@shared/types.ts';
import type { GearView } from '@shared/gear.ts';

type Base = 'night' | 'standard' | 'satellite' | 'hybrid';
type Heat = 'off' | 'global' | 'week';
const BASES: Array<{ value: Base; label: string }> = [{ value: 'night', label: 'Notturna' }, { value: 'standard', label: 'Standard' }, { value: 'satellite', label: 'Satellite' }, { value: 'hybrid', label: 'Ibrida' }];
const HEAT: Array<{ value: Heat; label: string }> = [{ value: 'off', label: 'Spenta' }, { value: 'global', label: 'Globale' }, { value: 'week', label: 'Ultimi 7 giorni' }];

/** Mappe native di Expo Go: gli strati di densità usano cerchi, disponibili anche con Apple Maps. */
export function RecordingMap({ track = [], height = 250, fill = false, initialHeat = 'off', showLocation = false, center, suggested = [], onDestination }: { track?: TrackPoint[]; height?: number; fill?: boolean; initialHeat?: Heat; showLocation?: boolean; center?: LatLng | null; suggested?: LatLng[]; onDestination?: (point: LatLng) => void }) {
  const [base, setBase] = useState<Base>('night');
  const [heat, setHeat] = useState<Heat>(initialHeat);
  const [popular, setPopular] = useState(false);
  const [layers, setLayers] = useState(false);
  const queryKey = `${heat}:${center?.lat ?? ''}:${center?.lng ?? ''}`;
  const [result, setResult] = useState<{ key: string; data: MapInsights | null; failed: boolean } | null>(null);
  const data = result?.key === queryKey ? result.data : null;
  const failed = result?.key === queryKey && result.failed;
  const map = useRef<MapView>(null);
  const ready = useRef(false);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void call<MapInsights>('mapInsights', { period: heat === 'week' ? 'week' : 'global', ...(center ? { nearby: { ...center, radiusKm: 5 } } : {}) }).then((value) => { if (active) setResult({ key: queryKey, data: value, failed: false }); }, () => { if (active) setResult({ key: queryKey, data: null, failed: true }); });
    return () => { active = false; };
  }, [heat, center, queryKey]);
  const first = track[0] ?? center ?? data?.routes[0]?.geometry[0] ?? data?.heat[0];
  const mapType: MapType = base === 'night' ? (Platform.OS === 'ios' ? 'mutedStandard' : 'standard') : base;
  const points = track.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const fit = useCallback(() => {
    const key = points.length ? 'recording' : suggested.length ? `suggested:${suggested.map((p) => `${p.lat},${p.lng}`).join(';')}` : center ? `center:${center.lat},${center.lng}` : heat !== 'off' ? `heat:${heat}` : 'routes';
    if (!ready.current || fitted.current === key) return;
    const coordinates = points.length ? points : suggested.length ? suggested.map((p) => ({ latitude: p.lat, longitude: p.lng })) : center ? [{ latitude: center.lat, longitude: center.lng }] : heat !== 'off' && data?.heat.length ? data.heat.map((p) => ({ latitude: p.lat, longitude: p.lng })) : data?.routes[0]?.geometry.map((p) => ({ latitude: p.lat, longitude: p.lng })) ?? [];
    if (coordinates.length > 1) { map.current?.fitToCoordinates(coordinates, { edgePadding: { top: 30, left: 30, right: 30, bottom: 30 }, animated: false }); fitted.current = key; }
    else if (coordinates.length === 1) { map.current?.animateToRegion({ ...coordinates[0], latitudeDelta: 0.025, longitudeDelta: 0.025 }, 0); fitted.current = key; }
  }, [data, heat, points, center, suggested]);
  useEffect(() => { fit(); }, [fit]);
  return <View style={{ gap: S.sm, ...(fill ? { flex: 1, minHeight: 0 } : {}) }}>
    <View style={{ ...(fill ? { flex: 1, minHeight: 0 } : { height }), borderRadius: R.card, overflow: 'hidden', backgroundColor: color.surface }}>
      <MapView ref={map} onLongPress={onDestination ? (e) => onDestination({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude }) : undefined} onMapReady={() => { ready.current = true; fit(); }} style={{ flex: 1 }} mapType={mapType} userInterfaceStyle="dark" showsUserLocation={showLocation} followsUserLocation={showLocation} pitchEnabled={false} initialRegion={first ? { latitude: first.lat, longitude: first.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 } : undefined}>
        {heat !== 'off' ? data?.heat.map((cell) => {
          const center = { latitude: cell.lat, longitude: cell.lng };
          return <Fragment key={`${cell.lat}:${cell.lng}`}>
            <Circle center={center} radius={230} strokeWidth={0} fillColor="rgba(130,104,245,0.10)" />
            <Circle center={center} radius={170} strokeWidth={0} fillColor="rgba(130,104,245,0.18)" />
            <Circle center={center} radius={110} strokeWidth={0} fillColor={cell.weight > 5 ? 'rgba(255,161,87,0.35)' : 'rgba(53,198,207,0.30)'} />
          </Fragment>;
        }) : null}
        {popular ? data?.routes.filter((r) => r.favoriteCount > 0).map((r) => <Polyline key={r.id} coordinates={r.geometry.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={color.brandText} strokeWidth={4} />) : null}
        {points.length > 1 ? <Polyline coordinates={points} strokeColor={color.accent} strokeWidth={5} /> : null}
        {suggested.length > 1 ? <Polyline coordinates={suggested.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={color.brand} strokeWidth={4} lineDashPattern={[8, 5]} /> : null}
      </MapView>
      <View style={{ position: 'absolute', top: S.sm, right: S.sm }}><IconButton name="layers-outline" label="Stile e livelli della mappa" filled onPress={() => setLayers(true)} /></View>
      <View pointerEvents="none" style={{ position: 'absolute', left: S.sm, bottom: S.sm, borderRadius: R.pill, backgroundColor: color.overlay, paddingHorizontal: S.md, paddingVertical: S.xs }}><Text style={[type.caption, { color: color.text }]}>{BASES.find((s) => s.value === base)?.label}{heat !== 'off' && data?.heat.length ? ' · Mappa di calore' : ''}</Text></View>
    </View>
    {failed ? <Text style={t.small}>I livelli aggiuntivi non sono raggiungibili ora. La registrazione resta disponibile.</Text> : null}
    {popular && data && !data.routes.some((r) => r.favoriteCount > 0) ? <Text style={t.small}>Nessun percorso con salvataggi disponibile al momento.</Text> : null}
    <Sheet title="Stile e livelli della mappa" visible={layers} onClose={() => setLayers(false)}>
      <View style={{ gap: S.sm }}><Text style={t.title}>Stile</Text><Pills value={base} onChange={setBase} options={BASES} /></View>
      <View style={{ gap: S.sm }}><Text style={t.title}>Mappa di calore Runngo</Text><Pills value={heat} onChange={setHeat} options={HEAT} /><Text style={t.small}>Solo percorsi registrati in Runngo condivisi con una scelta distinta. Celle approssimate di 300 m, visibili con almeno tre atleti: nessuna traccia personale o attività Strava viene pubblicata qui.</Text></View>
    {heat !== 'off' && data && !data.heat.length ? <Text style={t.small}>Non ci sono ancora abbastanza contributi condivisi per mostrare la mappa di calore in questo periodo.</Text> : null}
      <SwitchRow label="Percorsi più salvati" hint="Mostra i percorsi condivisi dalla comunità che qualcuno ha salvato." value={popular} onChange={setPopular} />
    </Sheet>
  </View>;
}

/** Proposte reali del piano e percorsi accessibili, ordinati dallo storico disponibile. */
export function WorkoutSuggestions({ onChoose, onGearChange, selectedGear: gearSelection }: { onChoose: (session: PlannedSession) => void; onGearChange?: (id: string | null) => void; selectedGear?: string | null }) {
  const gears = useLoad(() => call<GearView[]>('listGear', false));
  const [internalGear, setSelectedGear] = useState<string | null>(null);
  const selectedGear = gearSelection === undefined ? internalGear : gearSelection;
  const gearId = selectedGear && (!gears.data || gears.data.some((g) => g.id === selectedGear)) ? selectedGear : null;
  const [result, setResult] = useState<{ gearId: string | null; data: MapInsights | null; failed: boolean } | null>(null);
  const data = result?.gearId === gearId ? result.data : null;
  const failed = result?.gearId === gearId && result.failed;
  useEffect(() => {
    let active = true;
    void call<MapInsights>('mapInsights', { gearId }).then((value) => { if (active) setResult({ gearId, data: value, failed: false }); }, () => { if (active) setResult({ gearId, data: null, failed: true }); });
    return () => { active = false; };
  }, [gearId]);
  useEffect(() => {
    onGearChange?.(gearId);
  }, [gearId, onGearChange]);
  const chooseGear = (id: string | null) => { if (gearSelection === undefined) setSelectedGear(id); else onGearChange?.(id); };
  return <View style={{ gap: S.lg }}>
    <View style={{ gap: S.sm }}>
      <Text style={t.h2}>Con quale attrezzatura</Text>
      {gears.data?.length ? <Pills scroll value={gearId ?? ''} onChange={(id) => chooseGear(id || null)} options={[{ value: '', label: 'Nessuna' }, ...gears.data.map((g) => ({ value: g.id, label: g.name }))]} /> : <Text style={t.small}>{gears.error ? 'L’attrezzatura non è raggiungibile ora.' : 'Aggiungi le tue scarpe per associare le uscite e personalizzare i percorsi.'}</Text>}
      <Button small variant="soft" title="Gestisci attrezzatura" onPress={() => router.push('/attrezzatura')} />
      {data?.gear ? <Text style={t.small}>{fmtKm(data.gear.usedKm)} disponibili con {data.gear.name}{data.gear.totalKm != null ? ` · ${fmtKm(data.gear.totalKm)} totali, inclusi quelli iniziali dichiarati` : data.gear.initialKm == null ? ' · chilometraggio precedente non dichiarato' : ' · alcune attività non hanno una distanza'}</Text> : null}
    </View>
    {failed ? <Text style={t.small}>Le proposte non sono disponibili ora. Puoi registrare normalmente.</Text> : !data ? <Skeleton height={110} /> : <>
    {data.workouts.length ? <View style={{ gap: S.sm }}>
      <Text style={t.h2}>Prova un allenamento del tuo piano</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.md }}>
        {data.workouts.map((session) => <Pressable key={session.id} onPress={() => onChoose(session)} accessibilityRole="button" accessibilityLabel={`Seleziona ${session.title || KIND_LABEL[session.kind]}, ${fmtDuration(session.durationMin)}`}>
          <LinearGradient colors={[color.brandStrong, '#233D55']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 265, minHeight: 150, padding: S.lg, borderRadius: R.card, gap: S.sm }}>
            <Row><Ionicons name="fitness-outline" size={28} color={color.storyInk} /><Text style={[t.small, { color: color.storyInkSecondary, flex: 1, textAlign: 'right' }]}>{fmtDuration(session.durationMin)}</Text></Row>
            <Text style={[type.title2, { color: color.storyInk }]} numberOfLines={2}>{session.title || KIND_LABEL[session.kind]}</Text>
            {session.description ? <Text style={[type.footnote, { color: color.storyInkSecondary }]} numberOfLines={2}>{session.description}</Text> : null}
            <Text style={[type.footnote, { color: color.storyInk, fontWeight: '700' }]}>Seleziona allenamento →</Text>
          </LinearGradient>
        </Pressable>)}
      </ScrollView>
    </View> : <Panel style={{ padding: S.lg, gap: S.sm }}><Text style={t.title}>Un allenamento per te</Text><Text style={t.muted}>Crea il tuo piano: qui ritroverai le sedute realmente previste, pronte da selezionare.</Text><Button title="Crea il piano" variant="soft" onPress={() => router.push('/allenamento/piano')} /></Panel>}
    {data.routes.length ? <View style={{ gap: S.sm }}>
      <Text style={t.h2}>{data.basis ? 'Creato per te' : 'Percorsi da esplorare'}</Text>
      {data.basis ? <Text style={t.small}>{data.basis}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.md }}>
        {data.routes.map((route) => <Pressable key={route.id} onPress={() => router.push({ pathname: '/percorsi/[id]', params: { id: route.id } })} accessibilityRole="button" accessibilityLabel={`Apri il percorso ${route.name}`} style={{ width: 265, padding: S.lg, gap: S.sm, borderRadius: R.card, backgroundColor: color.surface }}>
          <View style={{ height: 115, borderRadius: R.control, backgroundColor: color.bg, overflow: 'hidden' }}><RouteTrace track={route.geometry.map((p) => ({ ...p, t: 0 }))} width={233} height={115} tint={[color.accent, color.brand]} dotEvery={null} /></View>
          <Text style={t.title} numberOfLines={2}>{route.name}</Text>
          {route.distanceKm != null ? <Text style={t.body}>{fmtKm(route.distanceKm)}</Text> : null}
          <Text style={t.small}>{route.reason}</Text>
          {route.favoriteCount > 0 ? <Text style={t.small}>{route.favoriteCount} {route.favoriteCount === 1 ? 'salvataggio' : 'salvataggi'}</Text> : null}
        </Pressable>)}
      </ScrollView>
    </View> : null}
    </>}
  </View>;
}
