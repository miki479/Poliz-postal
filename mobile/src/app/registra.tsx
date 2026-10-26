import { GuidedRunCue } from '@/components/GuidedRunCue';
import { guidedRunById } from '@shared/beginnerRunning.ts';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState, Linking, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Divider, Field, IconButton, LinkText, Pills, Row, Segmented, SwitchRow, Sheet, t, Panel } from '@/components/ui';
import { color, GUTTER, R, S, type } from '@/constants/theme';
import { call, ext } from '@/lib/api';
import { deviceTimezone, fmtClock, fmtPace, KIND_LABEL, whenLabel } from '@/lib/format';
import { activeSec, clearDraft, currentPace, loadDraft, saveDraft, type RecordingDraft } from '@/lib/recording';
import { useSession } from '@/lib/session';
import { todayIso } from '@/lib/plan';
import { haversineKm } from '@shared/time.ts';
import { downsample, trackSegments } from '@shared/track.ts';
import type { EventView, LatLng, PlannedSession, SessionKind, WorkoutLog } from '@shared/types.ts';

import { contextualLocationPermission } from '@/lib/locationPermissionPolicy';
import { resumeRecording } from '@/lib/recordingLifecycle';
import { humanError } from '@/lib/errors';
import { RecordingMap, WorkoutSuggestions } from '@/components/RecordingDiscovery';
import { RecordingSetupFrame } from '@/components/RecordingSetupFrame';
type Phase = 'setup' | 'live' | 'finish';
type Gps = 'off' | 'searching' | 'good' | 'weak' | 'lost' | 'denied';

const MAX_SPEED_MS = 12; // oltre ~43 km/h a piedi è un salto del GPS
const MAX_ACCURACY_M = 35;
const LOST_AFTER_S = 30;
const SECONDARY = ['clock', 'paused', 'splits'] as const;
type Secondary = (typeof SECONDARY)[number];

const GPS_LABEL: Record<Gps, string> = { off: 'GPS spento', searching: 'Cerco il GPS…', good: 'GPS buono', weak: 'GPS debole', lost: 'Segnale perso', denied: 'Posizione non consentita' };

export default function Registra() {
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const compactGps = viewport.height < 740 || viewport.fontScale > 1.25;
  const { me } = useSession();
  const { session: sessionParam, guided: guidedParam } = useLocalSearchParams<{ session?: string; guided?: string }>();
  const explicitGuide = guidedRunById(guidedParam);
  const [phase, setPhase] = useState<Phase>('setup');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [kind, setKind] = useState<'running' | 'walking' | 'treadmill'>('running');
  const [ctxKind, setCtxKind] = useState<'solo' | 'event' | 'session'>(sessionParam ? 'session' : 'solo');
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [events, setEvents] = useState<EventView[]>([]);
  const guided = explicitGuide ?? guidedRunById(sessions.find((s)=>s.id===sessionParam)?.guidedWorkoutId);
  const [sessionId, setSessionId] = useState<string | null>(sessionParam ?? null);
  const [eventId, setEventId] = useState<string | null>(null);
  const liveMap = useRef<MapView>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [heatmapConsent, setHeatmapConsent] = useState(me?.setup?.heatmapConsent ?? false);
  const [routePoints, setRoutePoints] = useState<LatLng[]>([]);
  const [suggested, setSuggested] = useState<LatLng[]>([]);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [locating, setLocating] = useState(false);
  const [positionAccuracy, setPositionAccuracy] = useState<number | null>(null);
  const [mapMessage, setMapMessage] = useState('Centra la mappa sulla tua posizione');
  const [shared, setShared] = useState(me?.setup?.groupMatching ?? false);
  const [gearId, setGearId] = useState<string | null>(null);
  const [perm, setPerm] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [battery, setBattery] = useState<number | null>(null);
  const [recovered, setRecovered] = useState<RecordingDraft | null>(null);

  // stato live
  const draft = useRef<RecordingDraft | null>(null);
  const [tick, setTick] = useState(0);
  const [gps, setGps] = useState<Gps>('off');
  const [locked, setLocked] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [secondary, setSecondary] = useState<Secondary>('clock');
  const [notice, setNotice] = useState('');
  const sub = useRef<Location.LocationSubscription | null>(null);
  const gpsEpoch = useRef(0);
  const mounted = useRef(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [mapEpoch, setMapEpoch] = useState(0);
  const lastFix = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const lastFixAt = useRef<number>(0);
  const bgAt = useRef<number | null>(null);
  const splits = useRef<number[]>([]);

  // fine
  const [title, setTitle] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [manualKm, setManualKm] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [starting, setStarting] = useState(false);
  const startPending = useRef(false);

  /* ---------- preparazione: nessun GPS acceso, solo lettura dello stato dei permessi ---------- */
  useEffect(() => {
    void loadDraft().then(setRecovered);
    void Location.getForegroundPermissionsAsync().then((p) => {
      setPerm(p.status === 'granted' ? 'granted' : p.status === 'denied' ? 'denied' : 'unknown');
      if (p.status === 'granted') void locate(false);
    }).catch(() => setMapMessage('Posizione non disponibile. Puoi usare la mappa manualmente.'));
    void Battery.getBatteryLevelAsync().then((b) => setBattery(b >= 0 ? b : null), () => setBattery(null));
    const today = todayIso();
    call<PlannedSession[]>('listSessions', { from: today, to: today }).then((l) => setSessions((current)=>[...new Map([...l.filter((s)=>s.status==='planned'||s.status==='rescheduled'),...current].map((s)=>[s.id,s])).values()]), () => {});
    call<EventView[]>('listEvents', { scope: 'mine', includePast: true }).then((l) => setEvents(l.filter((e) => e.status === 'active' && e.viewer.isParticipant && Math.abs(Date.parse(e.startsAt) - Date.now()) < 3 * 3_600_000)), () => {});
  }, []);

  useEffect(()=>{if(!sessionParam)return;let active=true;call<PlannedSession>('getSession',sessionParam).then((s)=>{if(active)setSessions((xs)=>xs.some((x)=>x.id===s.id)?xs:[s,...xs]);},()=>{});return()=>{active=false;};},[sessionParam]);

  async function locate(request = true) {
    setLocating(true);
    try {
      const permission = await contextualLocationPermission(request ? 'map' : 'read', Location);
      if (permission.status !== 'granted') { setPerm('denied'); setMapMessage('Consenti la posizione per vedere la tua zona.'); return; }
      setPerm('granted');
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const center = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setPosition(center);
      setPositionAccuracy(fix.coords.accuracy);
      setMapMessage('Tieni premuto sulla mappa per scegliere una destinazione.');
    } catch { setMapMessage('GPS non disponibile. Riprova all’aperto.'); }
    finally { setLocating(false); }
  }

  async function personalize(destination: LatLng) {
    if (!position || routeBusy) return;
    setRouteBusy(true); setRouteError(''); setSuggested([]);
    try {
      const result = await ext.geo.route([position, destination, position]);
      setSuggested(result.geometry);
      setRoutePoints([position, destination]);
    } catch (e) { setRouteError(humanError(e, 'Calcolo percorso non disponibile.')); }
    finally { setRouteBusy(false); }
  }

  const persist = useCallback(() => {
    if (draft.current) void saveDraft(draft.current);
  }, []);

  /* ---------- GPS: si accende solo con "Avvia" e si spegne in pausa ---------- */
  const startGps = useCallback(async (requestPermission = true) => {
    const epoch = ++gpsEpoch.current;
    if (!draft.current || draft.current.environment === 'treadmill') return setGps('off');
    const p = await contextualLocationPermission(requestPermission ? 'record' : 'resume', Location);
    if (!mounted.current || epoch !== gpsEpoch.current || AppState.currentState !== 'active') return;
    if (p.status !== 'granted') {
      setPerm('denied');
      setGps('denied');
      setNotice('Senza permesso di posizione registro solo il tempo. Puoi consentirla dalle impostazioni.');
      return;
    }
    setPerm('granted');
    setGps('searching');
    sub.current?.remove();
    const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 }, (loc) => {
      const d = draft.current;
      if (!mounted.current || epoch !== gpsEpoch.current || AppState.currentState !== 'active' || !d || d.status !== 'recording') return;
      const { latitude, longitude, accuracy } = loc.coords;
      const now = loc.timestamp;
      lastFixAt.current = Date.now();
      if (accuracy != null && accuracy > MAX_ACCURACY_M) return setGps('weak');
      setGps('good');
      const prev = lastFix.current;
      if (prev) {
        const dt = (now - prev.at) / 1000;
        if (dt <= 0) return;
        if (dt > LOST_AFTER_S) {
          // segnale perso a lungo: non collego i due punti con una linea inventata
          d.gaps += 1;
          d.lostSec += dt;
        } else {
          const km = haversineKm(prev, { lat: latitude, lng: longitude });
          if (dt > 0 && (km * 1000) / dt > MAX_SPEED_MS) return;
          if (km * 1000 < 2) return;
          d.km += km;
          const done = Math.floor(d.km);
          if (done > splits.current.length) {
            const at = activeSec(d);
            const prevAt = splits.current.reduce((a, b) => a + b, 0);
            splits.current.push(at - prevAt);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            AccessibilityInfo.announceForAccessibility(`Chilometro ${done}: ${fmtPace(at - prevAt)}`);
          }
        }
      }
      lastFix.current = { lat: latitude, lng: longitude, at: now };
      const breakBefore = d.track.length > 0 && (!prev || (now - prev.at) / 1000 > LOST_AFTER_S);
      const altitude = loc.coords.altitude;
      d.track.push(typeof altitude === 'number' && Number.isFinite(altitude) ? { lat: latitude, lng: longitude, t: activeSec(d), alt: altitude } : { lat: latitude, lng: longitude, t: activeSec(d) });
      if (breakBefore) d.track[d.track.length - 1].breakBefore = true;
    });
    // A pending native subscription can finish after pause, lock or unmount.
    if (!mounted.current || epoch !== gpsEpoch.current || AppState.currentState !== 'active' || draft.current?.status !== 'recording') subscription.remove();
    else sub.current = subscription;
  }, []);

  const stopGps = useCallback(() => {
    gpsEpoch.current += 1;
    sub.current?.remove();
    sub.current = null;
    lastFix.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { if (draft.current) void saveDraft(draft.current); mounted.current = false; stopGps(); void deactivateKeepAwake('workout').catch(() => {}); };
  }, [stopGps]);

  /* ---------- ciclo di aggiornamento: 1 s per i numeri, bozza ogni 10 s ---------- */
  useEffect(() => {
    if (phase !== 'live') return;
    let n = 0;
    const i = setInterval(() => {
      setTick((x) => x + 1);
      const d = draft.current;
      if (d?.status === 'recording' && d.environment === 'outdoor' && lastFixAt.current && Date.now() - lastFixAt.current > LOST_AFTER_S * 1000) setGps('lost');
      if (++n % 10 === 0) persist();
    }, 1000);
    return () => clearInterval(i);
  }, [phase, persist]);

  /* ---------- background, chiamate, ritorno nell'app ---------- */
  useEffect(() => {
    if (phase !== 'live') return;
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') {
        if (state === 'background' && bgAt.current === null) {
          bgAt.current = Date.now();
          stopGps();
          persist();
        }
        return;
      }
      const backgroundAt = bgAt.current;
      bgAt.current = null;
      const d = draft.current;
      if (!d) return;
      const lost = resumeRecording(d, backgroundAt, Date.now());
      lastFix.current = null;
      if (backgroundAt !== null) setMapEpoch((x) => x + 1);
      setTick((x) => x + 1);
      persist();
      if (lost) setNotice(`Schermo bloccato o app in background per ${Math.round(lost)} s: il tempo è conservato, quel tratto GPS non è stato registrato.`);
      if (d.status === 'recording' && (backgroundAt !== null || !sub.current)) void startGps(false).catch(() => {
        if (mounted.current) { setGps('lost'); setNotice('GPS non ripartito: il tempo e la bozza sono conservati. Premi pausa e riprendi per riprovare.'); }
      });
      void Battery.getBatteryLevelAsync().then((b) => { if (mounted.current && b >= 0) setBattery(b); }, () => {});
    });
    return () => subscription.remove();
  }, [phase, persist, startGps, stopGps]);

  useEffect(() => {
    if (phase !== 'live' || battery === null || battery > 0.1) return;
    persist();
  }, [battery, phase, persist]);

  async function start() {
    if (startPending.current) return;
    startPending.current = true;
    setStarting(true);
    const environment = kind === 'treadmill' ? 'treadmill' : 'outdoor';
    try {
    // Ask while setup is still visible: time spent deciding is not counted as a workout.
    if (environment === 'outdoor') await contextualLocationPermission('record', Location);
    if (!mounted.current) return;
    draft.current = { v: 1, startedAt: new Date().toISOString(), sport: kind === 'walking' ? 'walking' : 'running', environment, sessionId: ctxKind === 'session' ? sessionId : null, eventId: ctxKind === 'event' ? eventId : null, guidedWorkoutId: guided?.id ?? null, shared, heatmapConsent, gearId, track: [], km: 0, pausedMs: 0, pausedAt: null, gaps: 0, lostSec: 0, savedAt: Date.now(), status: 'recording', endedAt: null };
    splits.current = [];
    setNotice('');
    setShowMap(!guided);
    setPhase('live');
    persist();
    void activateKeepAwakeAsync('workout').catch(() => {});
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await startGps(false).catch(() => { setGps('lost'); setNotice('GPS non disponibile: registro il tempo. Riprova a riprendere il GPS con pausa e riprendi.'); });
    } catch { setMapMessage('Non riesco a verificare la posizione. Riprova: la registrazione non è ancora partita.'); }
    finally { startPending.current = false; if (mounted.current) setStarting(false); }
  }

  async function resumeDraft(d: RecordingDraft) {
    draft.current = { ...d, status: d.status === 'finished' ? 'finished' : 'paused', pausedAt: d.pausedAt ?? (d.status === 'recording' ? d.savedAt : null) };
    // Il tempo trascorso mentre l'app era chiusa viene trattato come pausa: nessun tratto inventato.
    setRecovered(null);
    if (d.status === 'finished') return openFinish();
    setShowMap(!d.guidedWorkoutId);
    setPhase('live');
    setNotice('Attività recuperata. Il tempo in cui l’app era chiusa è conteggiato come pausa.');
  }

  function pauseResume() {
    const d = draft.current;
    if (!d) return;
    if (d.status === 'recording') {
      d.status = 'paused';
      d.pausedAt = Date.now();
      stopGps(); // in pausa il GPS si spegne per risparmiare batteria
      setGps('off');
    } else {
      if (d.pausedAt) d.pausedMs += Date.now() - d.pausedAt;
      d.pausedAt = null;
      d.status = 'recording';
      void startGps().catch(() => { setGps('lost'); setNotice('GPS non disponibile: continuo a conservare il tempo.'); });
    }
    void Haptics.selectionAsync().catch(() => {});
    persist();
    setTick((x) => x + 1);
  }

  function openFinish() {
    const d = draft.current;
    if (!d) return;
    if (d.status === 'paused' && d.pausedAt) {
      d.pausedMs += Date.now() - d.pausedAt;
      d.pausedAt = null;
    }
    d.status = 'finished';
    d.endedAt = d.endedAt ?? Date.now();
    stopGps();
    void deactivateKeepAwake('workout').catch(() => {});
    persist();
    const s = sessions.find((x) => x.id === d.sessionId);
    const e = events.find((x) => x.id === d.eventId);
    setTitle(e?.title || s?.title || guidedRunById(d.guidedWorkoutId)?.title || `${d.environment === 'treadmill' ? 'Tapis roulant' : d.sport === 'walking' ? 'Camminata' : 'Corsa'} del ${new Date(d.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`);
    setPhase('finish');
  }

  async function save() {
    const d = draft.current;
    if (!d || busy) return;
    setBusy(true);
    setSaveErr('');
    try {
      const secs = activeSec(d);
      const gpsKm = d.environment === 'outdoor' && d.km >= 0.1 && d.track.length >= 2 ? Math.round(d.km * 100) / 100 : null;
      const typed = manualKm.trim() ? Number(manualKm.replace(',', '.')) : null;
      const distanceKm = gpsKm ?? typed;
      const s = sessions.find((x) => x.id === d.sessionId);
      const k: SessionKind = d.guidedWorkoutId ? 'run_walk' : s?.kind ?? (d.sport === 'walking' ? 'aerobic' : 'run_free');
      const input = {
        kind: k,
        guidedWorkoutId: d.guidedWorkoutId ?? null,
        title: title.trim() || KIND_LABEL[k],
        startedAt: d.startedAt,
        durationSec: secs,
        distanceKm,
        rpe,
        difficulties: '',
        notes: notes.trim(),
        sets: [],
        mode: 'timer' as const,
        shared: d.shared,
        heatmapConsent: d.heatmapConsent === true,
        timezone: deviceTimezone(),
        track: d.environment === 'outdoor' && d.track.length >= 2 ? downsample(d.track, 900) : null,
        sport: d.sport,
        environment: d.environment,
        distanceSource: gpsKm ? ('gps' as const) : typed ? ('manual' as const) : null,
        gpsQuality: d.gaps ? { gaps: d.gaps, lostSec: Math.round(d.lostSec) } : null,
        eventId: d.eventId,
      };
      const r = s ? await call<{ log: WorkoutLog }>('completeSession', s.id, input) : await call<{ log: WorkoutLog }>('logWorkout', input);
      if (d.gearId) {
        try { await call('setWorkoutGear', r.log.id, d.gearId); }
        catch { Alert.alert('Attività salvata', 'Puoi associare l’attrezzatura dal dettaglio dell’attività, in Modifica.'); }
      }
      await clearDraft();
      draft.current = null;
      router.replace({ pathname: '/allenamento/log/[id]', params: { id: r.log.id, fresh: '1' } });
    } catch (e) {
      // Nessun falso successo: la bozza resta sul telefono finché il server non conferma.
      setSaveErr(`${humanError(e, 'Non salvato.')} L’attività resta salvata sul telefono: puoi riprovare anche più tardi.`);
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    Alert.alert('Scartare l’attività?', 'Tempo e percorso registrati andranno persi.', [
      { text: 'No', style: 'cancel' },
      { text: 'Scarta', style: 'destructive', onPress: async () => { stopGps(); await clearDraft(); draft.current = null; router.back(); } },
    ]);
  }

  const d = draft.current;
  void tick;


  /* ---------- PREPARAZIONE ---------- */
  const chosen = ctxKind === 'session' ? sessions.find((x) => x.id === sessionId) ?? null : null;
  if (phase === 'setup') {
    const activityLabel = guided?.title ?? (kind === 'treadmill' ? 'Tapis roulant' : kind === 'walking' ? 'Camminata' : 'Corsa');
    const contextLabel = chosen?.title || (ctxKind === 'event' ? events.find((e) => e.id === eventId)?.title || 'Uscita di gruppo' : 'Da solo');
    return <>
      <RecordingSetupFrame insets={insets} summary={recovered ? 'Attività da recuperare' : activityLabel} subtitle={recovered ? 'Apri la card per vedere la bozza' : `${contextLabel} · ${shared ? 'Ai compagni' : 'Privata'} · ${chosen ? 'Piano' : 'Obiettivo libero'}`} onOptions={() => setOptionsOpen(true)} onClose={() => router.back()}
        starting={starting} disabled={starting || (!recovered && ctxKind === 'event' && !eventId)} resume={!!recovered} onStart={() => { if (recovered) void resumeDraft(recovered); else if (kind !== 'treadmill' && (!position || (positionAccuracy !== null && positionAccuracy > 40))) Alert.alert('GPS non ancora preciso', 'Puoi attendere una posizione migliore oppure iniziare: il tempo viene conservato, distanza e traccia dipendono dai punti GPS disponibili.', [{ text: 'Attendi GPS', onPress: () => void locate() }, { text: 'Avvia comunque', onPress: () => void start() }, { text: 'Annulla', style: 'cancel' }]); else void start(); }}
        map={<View style={{ flex: 1, minHeight: 0, gap: S.xs }}>
          {position ? <RecordingMap fill initialHeat="global" center={position} suggested={suggested} showLocation={perm === 'granted' && kind !== 'treadmill'} onDestination={(point) => void personalize(point)} /> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: S.md, gap: S.sm, borderRadius: R.card, backgroundColor: color.surface }}><Ionicons name="locate-outline" size={compactGps ? 24 : 36} color={color.textSecondary} /><Text style={t.title}>{locating ? 'Attendo GPS…' : 'Trova il punto di partenza'}</Text>{!compactGps ? <Text style={[t.muted, { textAlign: 'center' }]}>La mappa si apre sulla tua zona quando la posizione è disponibile.</Text> : null}<Button variant="soft" title="Usa la mia posizione" busy={locating} onPress={() => void locate()} /></View>}
          {!chosen ? <Pills value={kind} onChange={setKind} options={[{ value: 'running', label: 'Corsa' }, { value: 'walking', label: 'Camminata' }, { value: 'treadmill', label: 'Al chiuso' }]} /> : null}
          <Row><Text style={[t.small, { flex: 1 }]} numberOfLines={2}>{locating ? 'Attendo GPS…' : routeBusy ? 'Calcolo il percorso a piedi…' : position ? positionAccuracy !== null && positionAccuracy > 40 ? 'Precisione bassa: meglio attendere all’aperto' : `Pronto${positionAccuracy !== null ? ` · precisione circa ${Math.round(positionAccuracy)} m` : ''}` : mapMessage}</Text><IconButton name="locate-outline" label="Centra sulla mia posizione" onPress={() => { if (!locating) void locate(); }} /></Row>
          {routeError ? <Text style={[t.small, { color: color.warning }]} numberOfLines={2}>{routeError}</Text> : null}
        </View>} />
      <Sheet title="Opzioni registrazione" visible={optionsOpen} onClose={() => setOptionsOpen(false)} footer={<Button title="Fatto" onPress={() => setOptionsOpen(false)} />}>
          {recovered ? (
            <Panel style={{ padding: S.lg, gap: S.sm }}>
              <Text style={t.title}>Attività interrotta</Text>
              <Text style={t.muted}>
                {new Date(recovered.startedAt).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {fmtClock(activeSec({ ...recovered, endedAt: recovered.endedAt ?? recovered.savedAt }))}
                {recovered.km >= 0.1 ? ` · ${recovered.km.toFixed(2).replace('.', ',')} km` : ''}
              </Text>
              <Button title={recovered.status === 'finished' ? 'Completa il salvataggio' : 'Recupera l’attività'} iconName="refresh" onPress={() => void resumeDraft(recovered)} />
              <Button small variant="danger" title="Scarta" onPress={async () => { await clearDraft(); setRecovered(null); }} />
            </Panel>
          ) : null}

          <WorkoutSuggestions selectedGear={gearId} onGearChange={setGearId} onChoose={(session) => {
            setSessions((current) => current.some((s) => s.id === session.id) ? current : [...current, session]);
            setCtxKind('session'); setSessionId(session.id);
            setKind(session.kind === 'aerobic' ? 'walking' : 'running');
          }} />

          {chosen ? (
            // Seduta del piano scelta: il tipo di attività lo decide il piano, non l'utente.
            <View style={{ gap: S.xs }}>
              <Text style={t.h2}>{chosen.title || KIND_LABEL[chosen.kind]}</Text>
              <Text style={t.muted}>
                {chosen.kind === 'run_walk' ? 'Alternerai corsa leggera e camminata come previsto dal piano: ti guido io, tu pensa solo a muoverti.' : `${KIND_LABEL[chosen.kind]} · ${chosen.durationMin} minuti previsti.`}
              </Text>
              <LinkText title={kind === 'treadmill' ? 'Sono all’aperto' : 'Sono al chiuso (tapis roulant)'} onPress={() => setKind(kind === 'treadmill' ? 'running' : 'treadmill')} />
              {kind === 'treadmill' ? <Text style={t.small}>Al chiuso il GPS non serve: la distanza la inserisci tu alla fine.</Text> : null}
            </View>
          ) : (
            <View style={{ gap: S.sm }}>
              <Text style={t.h2}>Che cosa fai</Text>
              <Segmented value={kind} onChange={setKind} options={[{ value: 'running', label: 'Corsa' }, { value: 'walking', label: 'Camminata' }, { value: 'treadmill', label: 'Tapis roulant' }]} />
              {kind === 'treadmill' ? <Text style={t.small}>Al chiuso il GPS non serve: registro il tempo e la distanza la inserisci tu alla fine.</Text> : null}
            </View>
          )}

          <View style={{ gap: S.sm }}>
            <Text style={t.h2}>Con chi</Text>
            <View>
              <ContextRow on={ctxKind === 'solo'} icon="person-outline" title="Da solo" onPress={() => setCtxKind('solo')} />
              {events.map((e) => (
                <View key={e.id}>
                  <Divider inset={36} />
                  <ContextRow on={ctxKind === 'event' && eventId === e.id} icon="people-outline" title={`Con il gruppo: ${e.title}`} subtitle={`${whenLabel(e.startsAt, e.timezone)} · la corsa conferma la tua presenza`} onPress={() => { setCtxKind('event'); setEventId(e.id); }} />
                </View>
              ))}
              {sessions.map((s) => (
                <View key={s.id}>
                  <Divider inset={36} />
                  <ContextRow on={ctxKind === 'session' && sessionId === s.id} icon="calendar-outline" title={`Seduta del piano: ${s.title || KIND_LABEL[s.kind]}`} subtitle={`${s.durationMin} minuti previsti`} onPress={() => { setCtxKind('session'); setSessionId(s.id); }} />
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: S.xs }}>
            <SwitchRow label="Contribuisci alla mappa di calore" hint="Facoltativo: al salvataggio la traccia GPS contribuisce a zone aggregate con almeno 3 runner. Nessun nome o posizione in diretta; partenza e arrivo esclusi." value={heatmapConsent} onChange={setHeatmapConsent} />
            <SwitchRow label="Visibile ai compagni di club" hint="Se è spenta, l’attività la vedi solo tu. Il percorso non è mostrato agli altri. Con la condivisione attiva puoi comparire tra chi ha corso insieme, se anche le tue impostazioni privacy lo consentono." value={shared} onChange={setShared} />
          </View>

          <View style={{ gap: S.sm }}>
            {kind !== 'treadmill' ? (
              <Row gap={S.sm}>
                <Ionicons name={perm === 'granted' ? 'location' : 'location-outline'} size={18} color={perm === 'denied' ? color.danger : color.textSecondary} />
                <Text style={[t.muted, { flex: 1 }]}>{perm === 'granted' ? 'Posizione consentita. Il GPS si accende quando premi Avvia.' : perm === 'denied' ? 'Posizione non consentita: senza GPS registro solo il tempo.' : 'Ti chiederò la posizione quando premi Avvia.'}</Text>
              </Row>
            ) : null}
            {perm === 'denied' && kind !== 'treadmill' ? <LinkText title="Apri le impostazioni" onPress={() => void Linking.openSettings()} /> : null}
            {battery !== null && battery < 0.2 ? <Banner tone="warn" text={`Batteria al ${Math.round(battery * 100)}%: la registrazione con il GPS consuma. L’attività viene salvata sul telefono mentre corri.`} /> : null}
            <Text style={t.small}>Frequenza cardiaca: nessun sensore collegato. Runngo non la stima dal passo.</Text>
          </View>
          {routePoints.length ? <LinkText title="Rimuovi percorso suggerito" onPress={() => { setSuggested([]); setRoutePoints([]); }} /> : null}
      </Sheet>
    </>;
  }

  /* ---------- FINE ---------- */
  if (phase === 'finish' && d) {
    const secs = activeSec(d);
    const gpsKm = d.environment === 'outdoor' && d.km >= 0.1 ? d.km : null;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ paddingTop: insets.top + S.sm, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + S.xxxl, gap: S.xl }} keyboardShouldPersistTaps="handled">
        <Text style={t.h1} accessibilityRole="header">
          Fatto!
        </Text>
        <Row gap={0}>
          <Big label="Tempo" value={fmtClock(secs)} />
          <Big label={gpsKm ? 'Distanza GPS' : 'Distanza'} value={gpsKm ? gpsKm.toFixed(2).replace('.', ',') : '—'} unit={gpsKm ? 'km' : undefined} />
          <Big label="Passo medio" value={gpsKm ? fmtPace(secs / gpsKm).replace('/km', '') : '—'} unit={gpsKm ? '/km' : undefined} />
        </Row>
        {d.gaps ? <Banner tone="warn" text={`Traccia incompleta: ${d.gaps} ${d.gaps === 1 ? 'interruzione' : 'interruzioni'} (${Math.round(d.lostSec / 60)} min senza GPS). La distanza di quei tratti non è conteggiata e la corsa non genera record sul percorso.`} /> : null}
        {!gpsKm ? <Field label={d.environment === 'treadmill' ? 'Distanza del tapis roulant (km)' : 'Distanza (km)'} value={manualKm} onChangeText={setManualKm} keyboardType="decimal-pad" optional hint="La inserisci tu: verrà indicata come dichiarata, non misurata." /> : null}
        <Field label="Titolo" value={title} onChangeText={setTitle} />
        <View style={{ gap: S.sm }}>
          <Text style={t.title}>Quanto è stata faticosa? (1–10)</Text>
          <Pills scroll value={rpe} onChange={setRpe} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
          <Text style={t.small}>Facoltativo e privato. Aiuta il piano a capire come stai, non entra nella Fama.</Text>
        </View>
        <Field label="Note" value={notes} onChangeText={setNotes} multiline optional />
        {saveErr ? <Banner tone="error" text={saveErr} /> : null}
        <Button title="Salva l’attività" iconName="checkmark" busy={busy} onPress={save} disabled={secs < 60} />
        {secs < 60 ? <Text style={[t.small, { textAlign: 'center' }]}>Serve almeno un minuto per salvare.</Text> : null}
        <Button small variant="danger" title="Scarta" onPress={discard} style={{ alignSelf: 'center' }} />
      </ScrollView>
    );
  }

  /* ---------- LIVE ---------- */
  if (!d) return <View style={{ flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: GUTTER, gap: S.md }}>
    <Text style={t.title}>Apro il riepilogo…</Text>
    <Button title="Torna alle attività" variant="soft" onPress={() => router.replace('/allenamento')} />
  </View>;
  const secs = activeSec(d);
  const pace = d.km > 0.05 ? secs / d.km : null;
  const cur = currentPace(d.track, haversineKm);
  const paused = d.status === 'paused';
  const activeGuide = guidedRunById(d.guidedWorkoutId);
  const liveNotice = notice || (battery !== null && battery <= 0.1 ? 'Batteria quasi scarica: salva l’attività appena puoi. La bozza viene conservata sul telefono.' : '');
  const sec2 = secondary === 'clock' ? { label: 'Ora', value: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) } : secondary === 'paused' ? { label: 'In pausa', value: fmtClock(Math.floor((d.pausedMs + (d.pausedAt ? Date.now() - d.pausedAt : 0)) / 1000)) } : { label: 'Ultimo km', value: splits.current.length ? fmtPace(splits.current[splits.current.length - 1]).replace('/km', '') : '—' };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.sm, paddingBottom: insets.bottom + S.lg }}>
      <Row style={{ paddingHorizontal: GUTTER }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${GPS_LABEL[gps]}${battery !== null ? `, batteria ${Math.round(battery * 100)} per cento` : ''}`}>
          <Ionicons name={gps === 'good' ? 'navigate' : gps === 'off' ? 'navigate-outline' : 'warning-outline'} size={16} color={gps === 'good' ? color.success : gps === 'lost' || gps === 'denied' ? color.danger : color.warning} />
          <Text style={t.small}>{d.environment === 'treadmill' ? 'Al chiuso · senza GPS' : GPS_LABEL[gps]}</Text>
          {battery !== null ? <Text style={t.small}> · {Math.round(battery * 100)}%</Text> : null}
        </View>
        {d.environment === 'outdoor' ? <IconButton name={showMap ? 'map' : 'map-outline'} label={showMap ? activeGuide ? 'Mostra guida' : 'Nascondi mappa' : 'Mostra mappa'} onPress={() => setShowMap(!showMap)} /> : null}
        <IconButton name="lock-closed-outline" label="Blocca i comandi" onPress={() => setLocked(true)} />
      </Row>

      {showMap && foreground && d.environment === 'outdoor' ? (
        <MapView key={mapEpoch} ref={liveMap} style={{ height: activeGuide ? 130 : 180, marginHorizontal: GUTTER, borderRadius: R.card }} userInterfaceStyle="dark" mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'} showsUserLocation={perm === 'granted'} followsUserLocation={perm === 'granted'} pitchEnabled={false} onUserLocationChange={(e) => {
          const c = e.nativeEvent.coordinate;
          if (c) liveMap.current?.animateToRegion({ latitude: c.latitude, longitude: c.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
        }}>
          {trackSegments(d.track).map((segment, i) => <Polyline key={i} coordinates={segment.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={color.storyInk} strokeWidth={5} />)}
        </MapView>
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: GUTTER, gap: activeGuide ? S.md : S.xxl }}>
        {activeGuide && !showMap ? <GuidedRunCue segments={activeGuide.segments} elapsedSec={secs} paused={paused || !foreground} compact={compactGps} /> : null}
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Tempo ${fmtClock(secs)}${paused ? ', in pausa' : ''}`}>
          <Text style={{ color: paused ? color.warning : color.text, fontSize: activeGuide ? 44 : 72, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2 }} adjustsFontSizeToFit numberOfLines={1}>
            {fmtClock(secs)}
          </Text>
          <Text style={[t.muted, { fontWeight: '600' }]}>{paused ? 'IN PAUSA' : 'Tempo'}</Text>
        </View>
        <Row gap={0}>
          <Big label={d.environment === 'treadmill' ? 'Distanza' : 'Distanza GPS'} value={d.environment === 'treadmill' ? '—' : d.km.toFixed(2).replace('.', ',')} unit={d.environment === 'treadmill' ? undefined : 'km'} />
          <Big label="Passo attuale" value={cur && !paused ? fmtPace(cur).replace('/km', '') : '—'} unit={cur && !paused ? '/km' : undefined} />
        </Row>
        {!activeGuide || (!compactGps && !showMap) ? <Row gap={0}>
          <Big label="Passo medio" value={pace ? fmtPace(pace).replace('/km', '') : '—'} unit={pace ? '/km' : undefined} small />
          <Pressable style={{ flex: 1 }} onPress={() => setSecondary(SECONDARY[(SECONDARY.indexOf(secondary) + 1) % SECONDARY.length])} accessibilityRole="button" accessibilityLabel={`${sec2.label}: ${sec2.value}. Tocca per cambiare il dato`}>
            <Big label={`${sec2.label} ⇄`} value={sec2.value} small />
          </Pressable>
        </Row> : null}
        {liveNotice ? <Banner tone="warn" text={liveNotice} /> : null}
        {gps === 'denied' ? <LinkText title="Gestisci la posizione nelle impostazioni" onPress={() => void Linking.openSettings()} /> : null}
      </View>

      {locked ? <Pressable onLongPress={() => setLocked(false)} delayLongPress={800} accessibilityRole="button" accessibilityLabel="Comandi bloccati. Tieni premuto per sbloccare"
        accessibilityActions={[{ name: 'activate', label: 'Sblocca i comandi' }]} onAccessibilityAction={() => setLocked(false)}
        style={{ minHeight: 84, marginHorizontal: GUTTER, borderRadius: R.card, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center', gap: S.sm }}>
        <Ionicons name="lock-closed" size={24} color={color.accent} /><Text style={t.body}>Tieni premuto per sbloccare</Text>
      </Pressable> : <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: S.xxxl }}>
        <Pressable onPress={pauseResume} disabled={locked} accessibilityRole="button" accessibilityLabel={paused ? 'Riprendi' : 'Pausa'} style={({ pressed }) => [circle(84, paused ? color.accent : color.surfaceElevated), pressed && { opacity: 0.8 }]}>
          <Ionicons name={paused ? 'play' : 'pause'} size={36} color={paused ? color.onAccent : color.text} />
        </Pressable>
        <Pressable onLongPress={openFinish} delayLongPress={800} disabled={locked} accessibilityRole="button" accessibilityLabel="Termina: tieni premuto" accessibilityActions={[{ name: 'activate', label: 'Termina' }]} onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && openFinish()} style={({ pressed }) => [circle(84, color.danger), pressed && { opacity: 0.8 }]}>
          <Ionicons name="stop" size={34} color={color.onAccent} />
        </Pressable>
      </View>}
      {!locked ? <Text style={[t.small, { textAlign: 'center', marginTop: S.sm }]}>Tieni premuto ■ per terminare</Text> : null}


    </View>
  );
}

const circle = (size: number, bg: string) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center' as const, justifyContent: 'center' as const });

function ContextRow({ on, icon, title, subtitle, onPress }: { on: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={on ? color.accent : color.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={[t.body, on && { color: color.accent, fontWeight: '600' }]}>{title}</Text>
        {subtitle ? <Text style={t.small}>{subtitle}</Text> : null}
      </View>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? color.accent : color.textTertiary} />
    </Pressable>
  );
}

function Big({ label, value, unit, small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <Text style={{ color: color.text, fontSize: small ? 28 : 40, fontWeight: '700', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={[type.subhead, { color: color.textSecondary }]}> {unit}</Text> : null}
      </Text>
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

/** A JS render failure must leave a visible recovery action instead of an empty modal. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center', padding: GUTTER, gap: S.lg }}>
    <Text style={t.h1}>Riprendiamo da qui</Text>
    <Text style={t.body}>La schermata ha avuto un problema. Riaprila per recuperare l’ultima bozza salvata sul telefono.</Text>
    <Button title="Riapri la registrazione" onPress={() => void retry()} />
  </View>;
}
