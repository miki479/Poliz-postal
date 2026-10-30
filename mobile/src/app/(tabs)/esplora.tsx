import { ExploreMap } from '@/components/ExploreMap';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { EventCard } from '@/components/cards';
import { PlacePicker, shortPlace } from '@/components/PlacePicker';
import { Async, Banner, Button, Chip, Divider, Empty, IconButton, LinkText, Pills, PressableScale, Row, SearchField, Segmented, Sheet, Skeleton, SwitchRow, TabScreen, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { contextualLocationPermission } from '@/lib/locationPermissionPolicy';
import { call, type GeoPlace } from '@/lib/api';
import { addDaysIso, deviceTimezone, fmtKm, LEVELS, SPORTS_ENABLED, utcToZoned, zonedToUtcIso } from '@/lib/format';
import { haversineKm } from '@shared/time.ts';
import type { ClubView, EventQuery, EventView, Level, RouteView, SportId } from '@shared/types.ts';

type DayKey = 'all' | 'today' | 'tomorrow' | 'week';
type LenKey = 'all' | 'short' | 'mid' | 'long';
const LEN: Record<LenKey, [number | null, number | null]> = { all: [null, null], short: [null, 5], mid: [5, 10], long: [10, null] };
const RADIUS_KM = 25;

function range(kind: DayKey): { from: string | null; to: string | null } {
  if (kind === 'all') return { from: null, to: null };
  const tz = deviceTimezone();
  const today = utcToZoned(new Date().toISOString(), tz).date;
  const at = (d: string) => zonedToUtcIso(d, '00:00', tz);
  if (kind === 'today') return { from: null, to: at(addDaysIso(today, 1)) };
  if (kind === 'tomorrow') return { from: at(addDaysIso(today, 1)), to: at(addDaysIso(today, 2)) };
  return { from: null, to: at(addDaysIso(today, 7)) };
}

interface RunFilters {
  day: DayKey;
  sport: SportId | 'any';
  level: Level | 'any';
  clubsOnly: boolean;
  len: LenKey;
}
const NO_RUN_FILTERS: RunFilters = { day: 'all', sport: 'any', level: 'any', clubsOnly: false, len: 'all' };
const countRun = (f: RunFilters) => [f.day !== 'all', f.sport !== 'any', f.level !== 'any', f.clubsOnly, f.len !== 'all'].filter(Boolean).length;

type Pos = { lat: number; lng: number } | null;

export default function Esplora() {
  const [mode, setMode] = useState<'runs' | 'routes'>('runs');
  const [mapView, setMapView] = useState(false);
  const [text, setText] = useState('');
  const [runF, setRunF] = useState<RunFilters>(NO_RUN_FILTERS);
  const [draft, setDraft] = useState<RunFilters>(NO_RUN_FILTERS);
  const [routeScope, setRouteScope] = useState<'explore' | 'mine' | 'saved'>('explore');
  const [routeLen, setRouteLen] = useState<LenKey>('all');
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<Pos>(null);
  const [geo, setGeo] = useState<'idle' | 'busy' | 'denied' | 'failed'>('idle');
  const [city, setCity] = useState<GeoPlace | null>(null);
  const [cityOpen, setCityOpen] = useState(false);

  // "Vedi tutte" dalla Home: le uscite dei miei club (scope=clubs) o tutte (scope=all). `at` rende ogni tocco un nuovo invito.
  const { scope, at, tab } = useLocalSearchParams<{ scope?: string; at?: string; tab?: string }>();
  useEffect(() => { if (tab === 'routes') setMode('routes'); }, [tab]);
  useEffect(() => {
    if (scope !== 'clubs' && scope !== 'all') return;
    const clubsOnly = scope === 'clubs';
    setMode('runs');
    setRunF((f) => ({ ...f, clubsOnly }));
    setDraft((f) => ({ ...f, clubsOnly }));
  }, [scope, at]);

  // Immagini reali dei miei club (solo quelli che ne hanno una): la riga di un'uscita del club mostra la stessa icona della Home.
  const [clubImages, setClubImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    call<ClubView[]>('listMyClubs').then(
      (list) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const c of list) if (c.imageDataUrl) m[c.id] = c.imageDataUrl;
        setClubImages(m);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);

  // La ricerca parte quando smetti di scrivere: niente richiesta al server a ogni lettera.
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const term = text.trim();
    if (!term) return setTyped('');
    const h = setTimeout(() => setTyped(term), 350);
    return () => clearTimeout(h);
  }, [text]);

  const query = useMemo<EventQuery>(() => ({ scope: runF.clubsOnly ? 'clubs' : 'all', ...range(runF.day), sport: runF.sport === 'any' ? null : runF.sport, level: runF.level === 'any' ? null : runF.level, minKm: LEN[runF.len][0], maxKm: LEN[runF.len][1], areaText: pos ? null : typed || null, nearby: pos ? { ...pos, radiusKm: RADIUS_KM } : null }), [runF, typed, pos]);
  const runs = useLoad(() => call<EventView[]>('listEvents', query), [JSON.stringify(query)]);
  const routes = useLoad(() => (mode === 'routes' ? call<RouteView[]>('listRoutes', { scope: routeScope, areaText: typed || null, minKm: LEN[routeLen][0], maxKm: LEN[routeLen][1] }) : Promise.resolve([] as RouteView[])), [mode, routeScope, routeLen, typed]);

  /** La posizione si chiede solo dopo un'azione esplicita; la ricerca manuale resta sempre disponibile. */
  async function nearMe() {
    if (pos) return (setPos(null), setCity(null));
    setGeo('busy');
    try {
      const p = await contextualLocationPermission('explore', Location);
      if (p.status !== 'granted') return setGeo('denied');
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
      const fix = last ?? (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]));
      if (!fix) return setGeo('failed');
      setPos({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setGeo('idle');
    } catch {
      setGeo('failed');
    }
  }

  const nearby = useMemo(() => {
    if (!runs.data || !pos) return null;
    const withPos = runs.data.filter((e) => e.lat !== null && e.lng !== null).map((e) => ({ e, km: haversineKm(pos, { lat: e.lat!, lng: e.lng! }) }));
    return { list: withPos };
  }, [runs.data, pos]);

  const active = mode === 'runs' ? countRun(runF) : (routeScope !== 'explore' ? 1 : 0) + (routeLen !== 'all' ? 1 : 0);
  const reset = () => (mode === 'runs' ? (setRunF(NO_RUN_FILTERS), setDraft(NO_RUN_FILTERS)) : (setRouteScope('explore'), setRouteLen('all')));

  return (
    <TabScreen title="Esplora" onRefresh={mode === 'runs' ? runs.reload : routes.reload} right={<IconButton name="add" label={mode === 'runs' ? 'Organizza un’uscita' : 'Salva un percorso'} onPress={() => router.push(mode === 'runs' ? '/evento/form' : '/percorsi/form')} />}>
      <View style={{ gap: S.md }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'runs', label: 'Uscite' }, { value: 'routes', label: 'Percorsi' }]} />
        <Row gap={S.sm}>
          <Pressable onPress={() => setMapView(!mapView)} accessibilityRole="button" accessibilityState={{ selected: mapView }} accessibilityLabel={mapView ? 'Mostra elenco' : 'Mostra mappa'} style={[chip, mapView && chipOn]}>
            <Ionicons name={mapView ? 'list' : 'map-outline'} size={15} color={mapView ? color.accent : color.textSecondary} />
            <Text style={[type.subhead, { color: mapView ? color.accent : color.textSecondary, fontWeight: '600' }]}>{mapView ? 'Elenco' : 'Mappa'}</Text>
          </Pressable>
          {mode === 'runs' ? (
            <Pressable onPress={() => setRunF((f) => ({ ...f, clubsOnly: !f.clubsOnly }))} accessibilityRole="button" accessibilityState={{ selected: runF.clubsOnly }} accessibilityLabel={runF.clubsOnly ? 'Mostra tutte le uscite' : 'Mostra solo i miei gruppi'} style={[chip, runF.clubsOnly && chipOn]}>
              <Ionicons name={runF.clubsOnly ? 'people' : 'people-outline'} size={15} color={runF.clubsOnly ? color.accent : color.textSecondary} />
              <Text style={[type.subhead, { color: runF.clubsOnly ? color.accent : color.textSecondary, fontWeight: '600' }]}>I miei gruppi</Text>
            </Pressable>
          ) : null}
        </Row>
        <SearchField value={text} onChangeText={(v) => { setText(v); if (v) setPos(null); }} placeholder={mode === 'runs' ? 'Città, zona o luogo di ritrovo' : 'Zona o nome del percorso'} />
        <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
          {mode === 'runs' ? (
            <Pressable onPress={() => void nearMe()} accessibilityRole="button" accessibilityState={{ selected: !!pos, busy: geo === 'busy' }} accessibilityLabel={pos ? `Vicino a me, entro ${RADIUS_KM} chilometri. Tocca per disattivare` : 'Mostra le uscite vicino a me'} style={[chip, pos && chipOn]}>
              <Ionicons name={pos ? 'navigate' : 'navigate-outline'} size={15} color={pos ? color.accent : color.textSecondary} />
              <Text style={[type.subhead, { color: pos ? color.accent : color.textSecondary, fontWeight: '600' }]}>{geo === 'busy' ? 'Cerco la posizione…' : pos ? (city ? `Entro ${RADIUS_KM} km da ${shortPlace(city.name).split(',')[0]}` : `Entro ${RADIUS_KM} km`) : 'Vicino a me'}</Text>
            </Pressable>
          ) : null}
          {mode === 'runs' && !pos ? (
            <Pressable onPress={() => setCityOpen(true)} accessibilityRole="button" accessibilityLabel="Scegli una città" style={chip}>
              <Ionicons name="business-outline" size={15} color={color.textSecondary} />
              <Text style={[type.subhead, { color: color.textSecondary, fontWeight: '600' }]}>Città</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => { setDraft(runF); setSheet(true); }} accessibilityRole="button" accessibilityLabel={active ? `Filtri, ${active} attivi` : 'Filtri'} style={[chip, active > 0 && chipOn]}>
            <Ionicons name="options-outline" size={15} color={active ? color.accent : color.textSecondary} />
            <Text style={[type.subhead, { color: active ? color.accent : color.textSecondary, fontWeight: '600' }]}>{active ? `Filtri · ${active}` : 'Filtri'}</Text>
          </Pressable>
          {active > 0 ? <LinkText title="Azzera" onPress={reset} /> : null}
        </Row>
        {geo === 'denied' ? <Banner tone="warn" text="Posizione non consentita. Puoi cercare per città qui sopra, oppure attivarla nelle impostazioni." action="Apri impostazioni" onAction={() => void Linking.openSettings()} /> : null}
        {geo === 'failed' ? <Banner tone="warn" text="Non riesco a trovare la tua posizione adesso. Cerca per città oppure riprova all’aperto." action="Riprova" onAction={() => void nearMe()} /> : null}
      </View>

      {mode === 'runs' ? (
        <Async state={runs} skeleton={<View style={{ gap: S.sm }}><Skeleton height={112} /><Skeleton height={112} /></View>}>
          {(list) => {
            const items = nearby ? nearby.list.map((x) => x.e) : list;
            return (
              <View style={{ gap: S.sm }}>
                <Text style={t.small} accessibilityLiveRegion="polite">
                  {items.length === 1 ? '1 uscita' : `${items.length} uscite`}
                </Text>
                {items.length ? (
                  mapView ? <ExploreMap events={items} /> : items.map((e, i) => <EventCard key={e.id} e={e} index={i} clubImage={e.club ? clubImages[e.club.id] ?? null : null} note={nearby ? `a ${fmtKm(nearby.list[i].km)}` : null} />)
                ) : (
                  <Empty iconName="search-outline" title="Nessuna uscita trovata" text={active || text || pos ? 'Prova a cambiare zona o filtri.' : 'Ancora nessuna uscita pubblica in programma.'} action={<Button title="Organizza tu la prossima" iconName="add" onPress={() => router.push('/evento/form')} />} />
                )}
              </View>
            );
          }}
        </Async>
      ) : (
        <Async state={routes} skeleton={<Skeleton height={84} />}>
          {(list) =>
            list.length ? (
              <View>
                <Text style={t.small}>{list.length} {list.length === 1 ? 'percorso' : 'percorsi'}</Text>
                {mapView ? <ExploreMap routes={list} /> : list.map((r, i) => (
                  <View key={r.id}>
                    {i ? <Divider /> : null}
                    <PressableScale onPress={() => router.push({ pathname: '/percorsi/[id]', params: { id: r.id, ...(r.visibility === 'link' && r.shareToken ? { token: r.shareToken } : {}) } })} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.distanceKm != null ? fmtKm(r.distanceKm) : 'distanza non indicata'}`} style={{ paddingVertical: S.md, gap: 3 }}>
                      <Text style={t.title}>{r.name}</Text>
                      <Text style={t.muted} numberOfLines={1}>
                        {r.startName}
                        {r.endName && r.endName !== r.startName ? ` → ${r.endName}` : ' · anello'}
                      </Text>
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        <Chip label={r.distanceKm != null ? fmtKm(r.distanceKm) : 'Distanza non indicata'} tone="accent" />
                        {r.geometry ? <Chip label="Tracciato su mappa" iconName="map-outline" /> : null}
                        {r.isFavorite ? <Chip label="Salvato" tone="success" iconName="bookmark" /> : null}
                      </Row>
                    </PressableScale>
                  </View>
                ))}
              </View>
            ) : (
              <Empty iconName="map-outline" title={routeScope === 'mine' ? 'Non hai ancora percorsi' : routeScope === 'saved' ? 'Nessun percorso salvato' : 'Nessun percorso pubblico qui'} text="Salva i tuoi giri con partenza, arrivo e distanza e collegali alle uscite." action={<Button title="Salva un percorso" iconName="add" onPress={() => router.push('/percorsi/form')} />} />
            )
          }
        </Async>
      )}

      <Sheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Scegli una città">
        <Text style={t.muted}>Vedi le uscite entro {RADIUS_KM} km dalla città scelta. Non serve la posizione del telefono.</Text>
        <PlacePicker label="Città" value={city} onChange={(p) => { setCity(p); if (p) { setPos({ lat: p.lat, lng: p.lng }); setText(''); setCityOpen(false); } }} />
      </Sheet>
      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Filtri"
        footer={
          <>
            <Button title="Mostra risultati" onPress={() => { if (mode === 'runs') setRunF(draft); setSheet(false); }} />
            <Button small title="Azzera filtri" onPress={() => { reset(); setSheet(false); }} />
          </>
        }>
        {mode === 'runs' ? (
          <>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Quando</Text>
              <Pills value={draft.day} onChange={(v: DayKey) => setDraft({ ...draft, day: v })} options={[{ value: 'all', label: 'Sempre' }, { value: 'today', label: 'Oggi' }, { value: 'tomorrow', label: 'Domani' }, { value: 'week', label: 'Prossimi 7 giorni' }]} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Tipo</Text>
              <Pills value={draft.sport} onChange={(v: SportId | 'any') => setDraft({ ...draft, sport: v })} options={[{ value: 'any' as SportId | 'any', label: 'Qualsiasi' }, ...SPORTS_ENABLED.map((s) => ({ value: s.id as SportId | 'any', label: s.label }))]} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Livello</Text>
              <Pills value={draft.level} onChange={(v: Level | 'any') => setDraft({ ...draft, level: v })} options={[{ value: 'any', label: 'Qualsiasi' }, ...LEVELS.map((l) => ({ value: l.id as Level | 'any', label: l.label }))]} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Distanza</Text>
              <Pills value={draft.len} onChange={(v: LenKey) => setDraft({ ...draft, len: v })} options={[{ value: 'all', label: 'Qualsiasi' }, { value: 'short', label: 'Fino a 5 km' }, { value: 'mid', label: '5–10 km' }, { value: 'long', label: 'Oltre 10 km' }]} />
            </View>
            <SwitchRow label="Solo dei miei club" value={draft.clubsOnly} onChange={(v) => setDraft({ ...draft, clubsOnly: v })} />
          </>
        ) : (
          <>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Quali percorsi</Text>
              <Pills value={routeScope} onChange={setRouteScope} options={[{ value: 'explore', label: 'Pubblici' }, { value: 'mine', label: 'I miei' }, { value: 'saved', label: 'Salvati' }]} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={t.title}>Lunghezza</Text>
              <Pills value={routeLen} onChange={setRouteLen} options={[{ value: 'all', label: 'Qualsiasi' }, { value: 'short', label: 'Fino a 5 km' }, { value: 'mid', label: '5–10 km' }, { value: 'long', label: 'Oltre 10 km' }]} />
            </View>
          </>
        )}
      </Sheet>
    </TabScreen>
  );
}

const chip = { minHeight: 44, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: color.controlBorder, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
const chipOn = { borderColor: color.accent, backgroundColor: color.accentTint };
