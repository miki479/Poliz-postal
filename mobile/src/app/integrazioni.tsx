import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ActivityGlyph } from '@/components/SportIcon';
import { Banner, Button, Chip, IconButton, Muted, Panel, PressableScale, Row, Screen, Sheet, Skeleton, t, useLoad, useReduceMotion, type IconName } from '@/components/ui';
import { ACTIVITY_STYLES, type ActivityStyle } from '@/constants/activityColors';
import { color, R, S, type } from '@/constants/theme';
import { ApiError, call, ext, type StravaStatus } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { fmtClock, fmtDate, fmtDateTimeShort, fmtKm, fmtPace, relativeFromNow } from '@/lib/format';
import { mix, styleOfLog } from '@/lib/storyPalette';
import { fileImportBatches, parseWorkoutFile, type ParseResult } from '@shared/importers.ts';
import type { WorkoutLog } from '@shared/types.ts';

const MAX_BYTES = 20_000_000;
/** Arancione del marchio Strava: solo per la scritta "STRAVA" dell'intestazione (logo, non testo informativo). */
const STRAVA_ORANGE = '#FC4C02';
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const TITLE = { ...type.display, fontSize: 28, lineHeight: 34, color: color.text } as const;

type Filter = 'all' | 'run' | 'trail' | 'other';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Tutti' },
  { value: 'run', label: 'Corsa' },
  { value: 'trail', label: 'Trail' },
  { value: 'other', label: 'Altro' },
];

/** Scheda di un racconto: trail (corsa su sentieri da Strava), corsa, oppure altro (camminata e il resto). */
function categoryOf(l: WorkoutLog): Exclude<Filter, 'all'> {
  if (l.trail) return 'trail';
  if (l.sport === 'walking') return 'other';
  if (l.sport === 'running' || l.kind.startsWith('run_')) return 'run';
  return 'other';
}
/** Colore e figura dalla palette centralizzata: il trail ha i suoi, il resto segue la regola dei racconti. */
const styleOf = (l: WorkoutLog): ActivityStyle => (l.trail ? ACTIVITY_STYLES.trail : styleOfLog(l));

/** Messaggi per l'utente: mai codici o motivi tecnici del server. */
function friendly(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'unavailable') return 'Strava non è disponibile in questo momento. Riprova più tardi.';
    if (e.code === 'rate_limited') return 'Hai sincronizzato da poco: riprova tra qualche minuto.';
    if (e.code === 'bad_request') return 'Strava non è collegato: collegalo per ricevere i racconti.';
  }
  return humanError(e, fallback);
}

/**
 * Stato della schermata, dai dati reali di /api/strava/status e dall'ultima sincronizzazione:
 * - syncing: sincronizzazione avviata da qui (o dopo il collegamento);
 * - unavailable: Strava non è attivo sul server;
 * - permission: accesso revocato o permessi senza lettura delle attività;
 * - disconnected: mai collegato (o scollegato);
 * - error: l'ultima sincronizzazione non è andata (Strava o rete), oppure i dati non si caricano.
 */
type Phase = 'loading' | 'syncing' | 'unavailable' | 'permission' | 'disconnected' | 'error' | 'ok';

/* ---------- pezzi grafici ---------- */

/** Pallino di stato accanto a "STRAVA": pulsa piano durante la sincronizzazione. */
function StatusDot({ tint, pulse }: { tint: string; pulse: boolean }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!pulse || reduce) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(p);
  }, [pulse, reduce, p]);
  const st = useAnimatedStyle(() => ({ opacity: 1 - p.value * 0.55, transform: [{ scale: 1 + p.value * 0.35 }] }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint }, st]} />;
}

/** Anello che gira (sincronizzazione in corso); fermo con "Riduci movimento". */
function SyncRing() {
  const reduce = useReduceMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    r.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [reduce, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));
  const c = Math.PI * 2 * 17;
  return (
    <Animated.View style={[{ width: 42, height: 42 }, st]}>
      <Svg width={42} height={42}>
        <Circle cx={21} cy={21} r={17} stroke={color.surfaceElevated} strokeWidth={3} fill="none" />
        <Circle cx={21} cy={21} r={17} stroke={color.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c}`} />
      </Svg>
    </Animated.View>
  );
}

type StateKind = 'syncing' | 'empty' | 'error' | 'permission' | 'unavailable';
const STATE: Record<StateKind, { icon: IconName; title: string; tint: string }> = {
  syncing: { icon: 'sync-outline', title: 'Sincronizzazione in corso', tint: color.accent },
  empty: { icon: 'document-text-outline', title: 'Nessun racconto disponibile', tint: color.text },
  error: { icon: 'warning-outline', title: 'Errore di sincronizzazione', tint: color.danger },
  permission: { icon: 'lock-closed-outline', title: 'Autorizzazioni insufficienti', tint: color.text },
  unavailable: { icon: 'cloud-offline-outline', title: 'Strava non disponibile', tint: color.text },
};

/**
 * Stato (mockup): icona, titolo e frase, al centro di un riquadro. Se c'è un passo utile (collegare, riprovare)
 * il riquadro intero si tocca: la freccia in basso lo segnala, lo screen reader lo annuncia come pulsante.
 */
function StateCard({ kind, text, title, onPress, hint }: { kind: StateKind; text: string; title?: string; onPress?: () => void; hint?: string }) {
  const reduce = useReduceMotion();
  const s = STATE[kind];
  const heading = title ?? s.title;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(240)}>
      <PressableScale onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'summary'} accessibilityLabel={`${heading}. ${text}`} accessibilityHint={hint} accessibilityLiveRegion="polite">
        <Panel style={{ alignItems: 'center', paddingVertical: S.xl, paddingHorizontal: S.xl, gap: S.sm }}>
          {kind === 'syncing' ? (
            <SyncRing />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: R.control, borderWidth: 1.5, borderColor: kind === 'error' ? color.danger : color.controlBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={s.icon} size={24} color={kind === 'error' ? color.danger : color.textSecondary} />
            </View>
          )}
          <Text style={[type.headline, { color: s.tint, textAlign: 'center', marginTop: S.xs }]}>{heading}</Text>
          <Text style={[type.subhead, { color: color.textSecondary, textAlign: 'center' }]}>{text}</Text>
          {onPress ? (
            <View style={{ marginTop: S.xs, width: 32, height: 32, borderRadius: 16, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-forward" size={16} color={color.accent} />
            </View>
          ) : null}
        </Panel>
      </PressableScale>
    </Animated.View>
  );
}

/** Schede Tutti / Corsa / Trail / Altro: lo sfondo della scheda scelta scorre da una all'altra. */
function Tabs({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const reduce = useReduceMotion();
  const [lay, setLay] = useState<Partial<Record<Filter, { x: number; w: number }>>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    const l = lay[value];
    if (!l) return;
    if (reduce || shown.value === 0) {
      x.value = l.x;
      w.value = l.w;
    } else {
      x.value = withTiming(l.x, { duration: 240, easing: Easing.out(Easing.cubic) });
      w.value = withTiming(l.w, { duration: 240, easing: Easing.out(Easing.cubic) });
    }
    shown.value = 1;
  }, [value, lay, reduce, x, w, shown]);
  const pill = useAnimatedStyle(() => ({ opacity: shown.value, width: w.value, transform: [{ translateX: x.value }] }));
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: S.xs }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: R.control, backgroundColor: color.surfaceElevated, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }, pill]} />
      {FILTERS.map((f) => {
        const on = value === f.value;
        return (
          <Pressable
            key={f.value}
            onLayout={(e) => {
              const { x: lx, width } = e.nativeEvent.layout;
              setLay((p) => (p[f.value]?.x === lx && p[f.value]?.w === width ? p : { ...p, [f.value]: { x: lx, w: width } }));
            }}
            onPress={() => onChange(f.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ minHeight: HIT_TAB, paddingHorizontal: S.lg, justifyContent: 'center' }}>
            <Text style={[type.subhead, { color: on ? color.text : color.textSecondary, fontWeight: on ? '700' : '500' }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const HIT_TAB = 40;

/**
 * Card di un racconto da Strava (mockup): in alto il riquadro "foto" — qui una sfumatura del colore dell'attività con
 * la sua figura, nessuna immagine inventata — con il tipo in sovrimpressione; sotto titolo, numeri reali e data.
 */
function StravaStory({ log, order }: { log: WorkoutLog; order: number }) {
  const reduce = useReduceMotion();
  const gid = `sg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const s = styleOf(log);
  const [a, b] = s.blend ?? [s.solid, mix(s.solid, '#FFFFFF', 0.2)];
  const title = log.title?.trim() || s.label;
  const stats = [log.distanceKm ? fmtKm(log.distanceKm) : null, log.durationSec ? fmtClock(log.durationSec) : null, log.paceSecPerKm ? fmtPace(log.paceSecPerKm) : null].filter(Boolean).join(' · ');
  const day = fmtDate(log.startedAt);
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(Math.min(order, 5) * 70).duration(320)}>
      <PressableScale onPress={() => router.push({ pathname: '/allenamento/storie/[id]', params: { id: log.id } })} accessibilityRole="button" accessibilityLabel={`Apri il racconto: ${title}, ${s.label}${stats ? `, ${stats}` : ''}, ${day}`}>
        <View style={{ borderRadius: R.card, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
          <View style={{ height: 148 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <LinearGradient colors={[mix(a, color.bg, 0.2), mix(b, color.bg, 0.5), mix(a, color.bg, 0.84)]} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={FILL} />
            {/* bagliore dietro la figura: profondità senza foto */}
            <Svg style={FILL} width="100%" height="100%">
              <Defs>
                <RadialGradient id={gid} cx="74%" cy="42%" r="46%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.26} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
            </Svg>
            <View style={{ position: 'absolute', right: S.xl, top: S.md, opacity: 0.95 }}>
              <ActivityGlyph style={s} size={108} color={color.storyInk} />
            </View>
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']} locations={[0.45, 1]} style={FILL} />
            <Row gap={S.xs} style={{ position: 'absolute', left: S.lg, bottom: S.md }}>
              <ActivityGlyph style={s} size={14} color={color.storyInk} />
              <Text style={[type.caption, { color: color.storyInk, fontWeight: '700' }]}>{s.label}</Text>
            </Row>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.headline, { color: color.text }]} numberOfLines={2}>
                {title}
              </Text>
              {stats ? <Text style={[type.subhead, { color: color.textSecondary, fontVariant: ['tabular-nums'] }]}>{stats}</Text> : null}
              <Text style={[type.footnote, { color: color.textTertiary }]}>{day}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/* ---------- importazione da file ---------- */

function FileImport() {
  const [parsed, setParsed] = useState<(ParseResult & { name: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function pick() {
    setMsg('');
    setParsed(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['*/*'], copyToCacheDirectory: true });
    if (r.canceled) return;
    const f = r.assets[0];
    if (f.size && f.size > MAX_BYTES) return setMsg('File troppo grande da telefono (massimo 20 MB). L’export completo di Apple Salute si importa dal sito.');
    setBusy(true);
    try {
      const text = await (await fetch(f.uri)).text();
      const res = parseWorkoutFile(text);
      if (!res.activities.length) setMsg(`Nessuna corsa o camminata importabile (${res.skipped} voci ignorate).`);
      else setParsed({ ...res, name: f.name });
    } catch (e) {
      setMsg(humanError(e, 'File non leggibile.'));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    try {
      let imported = 0, duplicates = 0;
      for (const batch of fileImportBatches(parsed.activities)) {
        const r = await call<{ imported: number; duplicates: number }>('importActivities', batch);
        imported += r.imported;
        duplicates += r.duplicates;
      }
      setParsed(null);
      setMsg(`Importate ${imported} attività (${duplicates} già presenti).`);
    } catch (e) {
      setMsg(humanError(e, 'Importazione non riuscita. Riprova.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: S.sm }}>
      <Text style={t.title}>Importa da file</Text>
      <Muted>GPX, TCX o export.xml di Apple Salute. Il file è letto sul telefono: al server arrivano solo data, distanza e durata. Le attività importate sono private.</Muted>
      <Button variant="soft" title="Scegli un file" onPress={pick} busy={busy && !parsed} />
      {parsed ? (
        <>
          <Muted>
            {parsed.name}: {parsed.activities.length} attività ({parsed.format}), {parsed.skipped} ignorate.
          </Muted>
          <Button title="Importa" onPress={run} busy={busy} />
        </>
      ) : null}
      {msg ? <Banner text={msg} /> : null}
      <Button small variant="danger" title="Cancella attività importate da file" onPress={() => Alert.alert('Cancellare le attività importate da file?', undefined, [{ text: 'Annulla', style: 'cancel' }, { text: 'Cancella', style: 'destructive', onPress: () => call<{ deleted: number }>('deleteImported', 'file').then((r) => setMsg(`Cancellate ${r.deleted} attività.`), (e) => setMsg(humanError(e, 'Cancellazione non riuscita. Riprova.'))) }])} />
    </View>
  );
}

/* ---------- schermata ---------- */

/** Racconti da Strava (mockup): intestazione con lo stato di Strava, schede per tipo, card dei racconti e stati. */
export default function Integrazioni() {
  const status = useLoad(() => ext.strava.status());
  const logs = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null));
  const [filter, setFilter] = useState<Filter>('all');
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [working, setWorking] = useState(false);
  const [manage, setManage] = useState(false);
  const [notice, setNotice] = useState('');
  const s = status.data;

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setNotice('');
    try {
      const r = await ext.strava.sync();
      status.setData(r.status);
      await logs.reload();
      if (r.summary.rateLimited || r.summary.error === 'budget') setNotice('Strava limita le richieste: il resto arriva con la prossima sincronizzazione.');
      else if (r.summary.partial) setNotice('Sincronizzazione parziale: il resto arriva con la prossima.');
    } catch (e) {
      setNotice(friendly(e, 'Sincronizzazione non riuscita. Riprova tra poco.'));
      void status.reload();
    } finally {
      setSyncing(false);
    }
  }

  async function connect() {
    setConnecting(true);
    setNotice('');
    try {
      await WebBrowser.openBrowserAsync(await ext.strava.connect());
    } catch (e) {
      setNotice(friendly(e, 'Non riesco ad aprire Strava. Riprova tra poco.'));
    } finally {
      setConnecting(false);
      void status.reload();
    }
  }

  async function disconnect(deleteData: boolean) {
    setWorking(true);
    try {
      await ext.strava.disconnect(deleteData);
    } catch (e) {
      Alert.alert('Non riuscito', friendly(e, 'Riprova tra un momento.'));
    } finally {
      setWorking(false);
      await Promise.all([status.reload(), logs.reload()]);
    }
  }

  // Tornando dal sito di Strava (o in primo piano) si rilegge lo stato; appena collegato si recuperano i racconti.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void status.reload());
    return () => sub.remove();
  }, [status.reload]);
  const linked = !!s?.connected && !s.revoked;
  const wasLinked = useRef<boolean | null>(null);
  useEffect(() => {
    if (!s) return;
    if (wasLinked.current === false && linked) void sync();
    wasLinked.current = linked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, linked]);

  const stories = useMemo(() => (logs.data ?? []).filter((l) => l.origin === 'strava').sort((x, y) => y.startedAt.localeCompare(x.startedAt)), [logs.data]);
  const list = filter === 'all' ? stories : stories.filter((l) => categoryOf(l) === filter);

  const granted = (s as (StravaStatus & { grantedScope?: string | null }) | null)?.grantedScope ?? null;
  const lastErr = s?.lastSync?.error ?? null;
  const phase: Phase = !s
    ? status.loading
      ? 'loading'
      : 'error'
    : syncing
      ? 'syncing'
      : !s.configured
        ? 'unavailable'
        : s.revoked || (s.connected && ((granted !== null && !/activity:read/.test(granted)) || lastErr === 'revoked'))
          ? 'permission'
          : !s.connected
            ? 'disconnected'
            : lastErr === 'strava_error' || lastErr === 'network'
              ? 'error'
              : 'ok';

  const dot = { loading: color.textTertiary, syncing: color.accent, unavailable: color.textTertiary, permission: color.danger, disconnected: color.textTertiary, error: color.danger, ok: color.success }[phase];
  const statusLabel = {
    loading: 'Controllo lo stato…',
    syncing: 'Sincronizzazione in corso',
    unavailable: 'Non disponibile',
    permission: 'Autorizzazioni insufficienti',
    disconnected: 'Non collegato',
    error: 'Errore di sincronizzazione',
    ok: s?.lastSyncAt ? `Sincronizzato · ${relativeFromNow(s.lastSyncAt)}` : 'Collegato',
  }[phase];

  // Il riquadro di stato: uno solo, il più utile adesso. Con racconti già presenti resta sopra la lista.
  const state = (() => {
    if (phase === 'loading') return null;
    if (phase === 'syncing') return stories.length ? null : <StateCard kind="syncing" text="Recupero attività e racconti…" />;
    if (phase === 'unavailable') return <StateCard kind="unavailable" text="Il collegamento con Strava non è attivo in questo momento. Riprova più tardi." />;
    if (phase === 'permission') return <StateCard kind="permission" text="Concedi l’accesso a Strava per vedere i tuoi racconti." onPress={() => void connect()} hint="Apre Strava per concedere l’accesso" />;
    if (phase === 'error') return !s ? <StateCard kind="error" title="Racconti non disponibili" text={status.error || 'Controlla la connessione e riprova.'} onPress={() => void Promise.all([status.reload(), logs.reload()])} hint="Riprova a caricare" /> : <StateCard kind="error" text="Riprova più tardi o verifica le autorizzazioni." onPress={() => void sync()} hint="Riprova la sincronizzazione" />;
    if (logs.error && !logs.data) return <StateCard kind="error" title="Racconti non disponibili" text={logs.error} onPress={() => void logs.reload()} hint="Riprova a caricare" />;
    if (stories.length) return null;
    if (phase === 'disconnected') return <StateCard kind="empty" text="Collega Strava e completa un’attività per vedere i tuoi racconti." onPress={() => void connect()} hint="Apre Strava per collegarlo" />;
    return <StateCard kind="empty" text="Completa su Strava un’attività con un percorso sulla mappa: il suo racconto arriva qui con la prossima sincronizzazione." onPress={() => void sync()} hint="Sincronizza adesso" />;
  })();

  const label = FILTERS.find((f) => f.value === filter)?.label.toLowerCase() ?? '';

  return (
    <Screen onRefresh={linked ? sync : () => Promise.all([status.reload(), logs.reload()]).then(() => undefined)} style={{ gap: S.lg }}>
      <Stack.Screen options={{ title: '', headerRight: () => <IconButton name="settings-outline" label="Gestisci Strava e importa da file" color={color.accent} onPress={() => setManage(true)} /> }} />

      {/* intestazione: titolo, marchio Strava e stato reale del collegamento */}
      <View style={{ gap: S.xs }}>
        <Text style={TITLE} accessibilityRole="header">
          Racconti da Strava
        </Text>
        <Pressable onPress={() => setManage(true)} accessibilityRole="button" accessibilityLabel={`Strava: ${statusLabel}`} accessibilityHint="Apre la gestione di Strava" style={({ pressed }) => [{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', gap: 2 }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: STRAVA_ORANGE, fontSize: 13, lineHeight: 16, fontWeight: '900', letterSpacing: 1.2 }} allowFontScaling={false}>
            STRAVA
          </Text>
          <Row gap={S.xs + 2}>
            <StatusDot tint={dot} pulse={phase === 'syncing'} />
            <Text style={[type.footnote, { color: color.textSecondary }]}>{statusLabel}</Text>
          </Row>
        </Pressable>
      </View>

      {notice ? <Banner tone="info" text={notice} /> : null}
      {linked && !s?.grantedScope?.split(',').includes('profile:read_all') ? (
        <View style={{ gap: S.sm }}>
          <Banner tone="info" text="Per leggere le zone cardiache del tuo profilo serve una nuova autorizzazione Strava. Le attività già importate restano disponibili." />
          <Button title="Ricollega per le zone cardiache" busy={connecting} onPress={() => void connect()} />
        </View>
      ) : null}

      {phase === 'loading' || (logs.loading && !logs.data) ? (
        <View style={{ gap: S.lg }}>
          <Skeleton height={236} />
          <Skeleton height={236} />
        </View>
      ) : (
        <>
          {state}
          {stories.length ? (
            <>
              <Tabs value={filter} onChange={setFilter} />
              {list.length ? (
                <View style={{ gap: S.lg }}>
                  {list.map((l, k) => (
                    <StravaStory key={l.id} log={l} order={k} />
                  ))}
                </View>
              ) : (
                <StateCard kind="empty" text={`Ancora nessun racconto in “${label}”.`} />
              )}
            </>
          ) : null}
        </>
      )}

      {/* Gestione: collegamento, sincronizzazione, scollegamento e importazione da file (le funzioni di prima) */}
      <Sheet visible={manage} onClose={() => setManage(false)} title="Strava e file">
        <View style={{ gap: S.sm }}>
          <Text style={t.title}>Strava</Text>
          {!s ? (
            <Muted>{status.loading ? 'Controllo lo stato…' : 'Stato non disponibile: riprova tra poco.'}</Muted>
          ) : !s.configured ? (
            <Muted>Il collegamento con Strava non è attivo in questo momento. Riprova più tardi.</Muted>
          ) : s.connected ? (
            <>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                <Chip label="Collegato" tone="success" />
                {s.lastSyncAt ? <Chip label={`Ultima sincronizzazione ${fmtDateTimeShort(s.lastSyncAt)}`} /> : null}
              </Row>
              {s.lastSync ? <Muted>Ultima sincronizzazione: {s.lastSync.imported} nuove, {s.lastSync.updated} aggiornate, {s.lastSync.duplicates} già presenti.</Muted> : null}
              <Muted>Le attività da Strava sono private. I percorsi di Strava non hanno i tempi, quindi il replay del racconto è solo grafico.</Muted>
              <Button
                title="Sincronizza ora"
                iconName="sync"
                busy={syncing}
                onPress={() => {
                  setManage(false);
                  void sync();
                }}
              />
              <Button variant="danger" small title="Scollega" disabled={working} onPress={() => Alert.alert('Scollegare Strava?', 'Vuoi anche cancellare le attività già importate?', [{ text: 'Annulla', style: 'cancel' }, { text: 'Solo scollega', onPress: () => void disconnect(false) }, { text: 'Scollega e cancella', style: 'destructive', onPress: () => void disconnect(true) }])} />
            </>
          ) : (
            <>
              {s.revoked ? <Chip label="Accesso revocato" tone="danger" /> : null}
              <Muted>Collega Strava per ricevere qui i racconti delle tue attività. Si apre il sito di Strava per l’autorizzazione.</Muted>
              <Button title="Collega Strava" busy={connecting} onPress={() => void connect()} />
            </>
          )}
        </View>
        <FileImport />
        <Muted>Apple Salute: puoi importare il suo file di esportazione. La lettura diretta richiede un’integrazione nativa non ancora presente.</Muted>
      </Sheet>
    </Screen>
  );
}
