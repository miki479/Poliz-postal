import { displayTrack } from '@shared/routeDisplay.ts';
import { StoryExportSheet } from '@/components/StoryExport';
import { WorkoutCompanions } from '@/components/WorkoutCompanions';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityStats } from '@/components/ActivityStats';
import { AwardDetailSheet, ConquestModal } from '@/components/AwardConquest';
import { ScrollProvider, useScrollEmitter } from '@/components/Motion';
import { AwardBanner, AwardMark, AwardRow, awardFxKey } from '@/components/Results';
import { ActivityRouteReplay as RouteReplay } from '@/components/ActivityRouteReplay';
import { SocialBar } from '@/components/SocialBar';
import { ActivityGlyph } from '@/components/SportIcon';
import { TypeHex } from '@/components/TypeBadge';
import { Banner, Button, Divider, Field, LinkText, Loading, Panel, Pills, Row, Section, Sheet, Skeleton, SwitchRow, t, useLoad } from '@/components/ui';
import type { ActivityStyle } from '@/constants/activityColors';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { briefFor, call, ext, type WorkoutBriefResult } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { fmtClock, fmtDate, fmtDuration, fmtKm, fmtPace, kmParts, KIND_LABEL } from '@/lib/format';
import { markSeen, seenSet } from '@/lib/seen';
import { mix, styleOfLog } from '@/lib/storyPalette';
import type { SessionMatch } from '@shared/adaptive.ts';
import { activityAwards, nextHint, type Award } from '@shared/records.ts';
import type { SocialCounts } from '@shared/social.ts';
import { countLaps } from '@shared/track.ts';
import { buildMarks, type TrackMark } from '@shared/trackMarks.ts';
import type { EventView, PlannedSession, UserPublic, WorkoutLog } from '@shared/types.ts';
import type { GearView } from '@shared/gear.ts';
import { hasMapConsent } from '@shared/mapConsent.ts';

const MAP_H = 300;
const timeOf = (iso: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/* ---------- blocchi esistenti (fatti, briefing, compagni, offerte) ---------- */

/** Fatti misurati, confronti calcolati e interpretazione AI restano separati. */
function Brief({ log }: { log: WorkoutLog }) {
  const [dismissed, setDismissed] = useState(false);
  const [r, setR] = useState<WorkoutBriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  // Una sola richiesta per riepilogo: il server riusa la sintesi salvata finché non si chiede di rigenerarla.
  useEffect(() => {
    briefFor(log.id).then(setR, (e) => setErr(humanError(e, 'Briefing non disponibile.'))).finally(() => setLoading(false));
  }, [log.id]);

  if (dismissed) return <LinkText title="Mostra briefing" onPress={() => setDismissed(false)} />;
  if (loading) return <View><Skeleton height={100} /><LinkText title="Salta briefing" onPress={() => setDismissed(true)} /></View>;
  if (!r) return <Banner tone="warn" text={err || 'Briefing non disponibile.'} />;
  const f = r.facts;
  const [first, ...rest] = r.brief.text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const evidences: string[] = [];
  if (f.vsPlan) evidences.push(f.vsPlan.asPlanned ? `In linea con l’allenamento previsto (${f.vsPlan.plannedMin}′)` : `${f.vsPlan.durationDeltaPct > 0 ? '+' : ''}${f.vsPlan.durationDeltaPct}% di durata rispetto ai ${f.vsPlan.plannedMin}′ previsti`);
  if (f.vsHistory?.paceDeltaSec != null) evidences.push(Math.abs(f.vsHistory.paceDeltaSec) < 5 ? `Passo stabile rispetto alle ultime ${f.vsHistory.count} uscite` : `${Math.abs(f.vsHistory.paceDeltaSec)} s/km ${f.vsHistory.paceDeltaSec < 0 ? 'più rapido' : 'più tranquillo'} rispetto alle attività recenti`);
  if (f.vsOthers) evidences.push(`Passo più rapido del ${f.vsOthers.fasterThanPct}% su ${f.vsOthers.runners} uscite simili condivise da altre persone`);
  return (
    <View style={{ gap: S.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={t.h2} accessibilityRole="header">
          Briefing
        </Text>
        <LinkText title="Salta" onPress={() => setDismissed(true)} />
        <Text style={t.small}>{r.brief.ai ? 'Interpretazione del Coach AI' : 'Riepilogo automatico'}</Text>
      </Row>
      <Text style={[type.title2, { color: color.text }]}>{first}</Text>
      {evidences.length ? (
        <View style={{ gap: S.xs }}>
          {evidences.slice(0, 1).map((e) => (
            <Row key={e} gap={S.sm} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="analytics-outline" size={16} color={color.accent} style={{ marginTop: 2 }} />
              <Text style={[t.body, { flex: 1 }]}>{e}</Text>
            </Row>
          ))}
        </View>
      ) : null}
      {rest.length ? <Text style={t.muted} numberOfLines={open ? undefined : 2}>{rest.join(' ')}</Text> : null}
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: HIT, justifyContent: 'center' }}>
        <Text style={[type.subhead, { color: color.accent, fontWeight: '600' }]}>{open ? 'Nascondi i dati usati' : 'Dati e periodo usati'}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: S.xs }}>
          <Text style={t.small}>{f.evidence === 'gps' ? 'Registrato con GPS' : f.evidence === 'imported' ? 'Importato' : 'Dichiarato'}: {f.distanceKm ? `${fmtKm(f.distanceKm)}, ` : ''}{f.durationMin} min{f.rpe ? `, fatica dichiarata ${f.rpe}/10` : ''}.</Text>
          <Text style={t.small}>Confronto personale: ultime 5 uscite dello stesso tipo nei 60 giorni precedenti{f.vsHistory ? ` (${f.vsHistory.count} trovate)` : ' (nessuna)'}.</Text>
          <Text style={t.small}>Altri runner: solo allenamenti condivisi negli ultimi 30 giorni, distanza ±50%, almeno 5 persone{f.vsOthers ? '' : ' (dati insufficienti)'}.</Text>
          <Text style={t.small}>Frequenza cardiaca non disponibile: nessuna zona o carico viene calcolato. Non è un consiglio medico.</Text>
          <LinkText
            title="Rigenera il briefing"
            onPress={() => {
              setLoading(true);
              briefFor(log.id, true)
                .then(setR, (e) => Alert.alert('Non rigenerato', humanError(e, 'Riprova tra poco.')))
                .finally(() => setLoading(false));
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Cosa era previsto, cosa è stato svolto, cosa dicono i dati (intento e risultato osservato restano distinti). */
function Trained({ log, session }: { log: WorkoutLog; session: PlannedSession | null }) {
  const [methodOpen, setMethodOpen] = useState(false);
  const kind = log.environment === 'treadmill' ? 'Tapis roulant' : styleOfLog(log).label;
  return (
    <Section title="Cosa hai allenato">
      <View style={{ gap: S.sm }}>
        <Row gap={S.sm} style={{ alignItems: 'flex-start' }}>
          <Text style={[t.small, { width: 76 }]}>Previsto</Text>
          <Text style={[t.body, { flex: 1 }]}>{session ? `${session.title || KIND_LABEL[session.kind]} · ${fmtDuration(session.durationMin)}` : 'Uscita fuori programma'}</Text>
        </Row>
        <Row gap={S.sm} style={{ alignItems: 'flex-start' }}>
          <Text style={[t.small, { width: 76 }]}>Svolto</Text>
          <Text style={[t.body, { flex: 1 }]}>
            {kind}: {fmtDuration(Math.round(log.durationSec / 60))}
            {log.distanceKm ? ` · ${fmtKm(log.distanceKm)}${log.distanceSource === 'manual' ? ' (dichiarati)' : log.distanceSource === 'gps' ? ' (GPS)' : ''}` : ''}
          </Text>
        </Row>
        <LinkText title={methodOpen ? 'Nascondi il metodo' : 'Come viene calcolato'} onPress={() => setMethodOpen(!methodOpen)} />
        {methodOpen ? <Row gap={S.sm} style={{ alignItems: 'flex-start' }}>
          <Text style={[t.small, { width: 76 }]}>Dai dati</Text>
          <Text style={[t.body, { flex: 1 }]}>
            {log.rpe ? `Hai indicato una fatica di ${log.rpe}/10. ` : ''}
            {log.metrics?.hrAvg ? 'La valutazione si basa su durata, distanza e sensazioni: indica lo stimolo probabile, non un adattamento certo.' : 'Senza frequenza cardiaca la valutazione si basa solo su durata, distanza e sensazioni: indica lo stimolo probabile, non un adattamento certo.'}
          </Text>
        </Row> : null}
      </View>
    </Section>
  );
}

/** "Con Mario Rossi": chi ha fatto lo stesso tragitto alla stessa ora (calcolato dal server). */
function Companions({ log }: { log: WorkoutLog }) {
  const [eventId, setEventId] = useState(log.eventId ?? null);
  const [event, setEvent] = useState<EventView | null>(null);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<EventView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; if (eventId) call<EventView>('getEvent', eventId, null).then((value) => { if (active) setEvent(value); }, () => {}); return () => { active = false; }; }, [eventId]);
  const choose = async () => { setOpen(true); setBusy(true); setError(''); try { const items = await call<EventView[]>('listEvents', { scope: 'mine', includePast: true }); setChoices(items.filter((e) => e.viewer.isParticipant && e.status === 'active' && Math.abs(Date.parse(e.startsAt) - Date.parse(log.startedAt)) <= 6 * 3_600_000)); } catch (e) { setError(humanError(e, 'Non riesco a caricare le uscite. Riprova.')); } finally { setBusy(false); } };
  const link = async (id: string | null) => { setBusy(true); setError(''); try { await call('linkWorkoutEvent', log.id, id); setEventId(id); if (!id) setEvent(null); setOpen(false); } catch (e) { setError(humanError(e, 'Collegamento non riuscito. Riprova.')); } finally { setBusy(false); } };
  return <View style={{ gap: S.sm }}><Text style={t.title}>Con chi hai corso</Text>
    <Text style={t.body}>{event ? `${event.club ? event.club.name + ' · ' : ''}${event.title}` : eventId ? 'Uscita di gruppo collegata' : log.origin === 'strava' ? 'Attività importata da Strava' : 'Nessuna uscita di gruppo collegata'}</Text>
    <Text style={t.small}>{event ? `${event.participantCount} iscritti · organizza ${event.organizer.displayName}${event.paceSecPerKm ? ` · Passo ${fmtPace(event.paceSecPerKm)}` : ''}` : 'Puoi collegare un’uscita e chiedere conferma ai compagni qui sotto.'}</Text>
    {event?.pact?.noDrop ? <Text style={t.small}>Patto: nessuno resta indietro.</Text> : null}
    {eventId ? <LinkText title="Apri gruppo e partecipanti" onPress={() => router.push({ pathname: '/evento/[id]', params: { id: eventId } })} /> : <LinkText title="Collega a un’uscita" onPress={() => void choose()} />}
    <WorkoutCompanions logId={log.id} />
    <Sheet visible={open} onClose={() => setOpen(false)} title="Collega all’uscita">
      <Text style={t.muted}>Solo uscite a cui sei iscritto, entro sei ore dall’attività. Il collegamento non conferma presenze e mantiene la privacy dell’allenamento.</Text>
      {busy ? <Loading /> : choices.length ? choices.map((e) => <Button key={e.id} variant="soft" title={e.title} onPress={() => void link(e.id)} />) : <Text style={t.muted}>Non risultano uscite compatibili. Puoi organizzare la prossima con i tuoi compagni.</Text>}
      {error ? <Banner tone="error" text={error} action="Riprova" onAction={() => void choose()} /> : null}
      <Button small title="Organizza la prossima uscita" onPress={() => { setOpen(false); router.push('/evento/form'); }} />
    </Sheet>
  </View>;
}

/** Scintille e commenti ricevuti sulla propria corsa condivisa. */
function OwnSocial({ log }: { log: WorkoutLog }) {
  const [c, setC] = useState<SocialCounts | null>(null);
  const itemId = `w_${log.id}`;
  useEffect(() => {
    if (!log.shared) return;
    call<Record<string, SocialCounts>>('socialFor', [itemId]).then((r) => setC(r[itemId] ?? null), () => setC(null));
  }, [log.shared, itemId]);
  if (!c) return null;
  return <SocialBar itemId={itemId} initial={c} own />;
}

/** Alla PRIMA registrazione: invito facoltativo a collegare Strava (una sola volta, poi non ricompare). */
function StravaOffer({ fresh }: { fresh: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!fresh) return;
    void (async () => {
      if ((await seenSet()).has('offer:strava')) return;
      const [logs, st] = await Promise.all([call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => []), ext.strava.status().catch(() => null)]);
      if (logs.length === 1 && st?.configured && !st.connected) setShow(true);
    })();
  }, [fresh]);
  if (!show) return null;
  const close = () => {
    void markSeen('offer:strava');
    setShow(false);
  };
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Text style={t.title}>Vuoi collegare Strava?</Text>
      <Text style={t.muted}>Facoltativo. Le tue corse di Strava arrivano da sole in Runngo, ogni volta che apri l’app, e restano private finché non decidi tu.</Text>
      <Button
        variant="soft"
        title="Collega Strava"
        iconName="sync-outline"
        onPress={() => {
          close();
          router.push('/integrazioni');
        }}
      />
      <LinkText title="Più tardi" onPress={close} />
    </Panel>
  );
}

function LinkSuggestion({ log, onLinked }: { log: WorkoutLog; onLinked: () => void }) {
  const [m, setM] = useState<SessionMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!log.activityId || log.plannedSessionId) return;
    call<SessionMatch[]>('sessionMatches', log.activityId).then(setM, () => setM([]));
  }, [log.activityId, log.plannedSessionId]);
  if (!m?.length) return null;
  const best = m[0];
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Text style={t.title}>Vuoi associarla all’allenamento “{best.session.title || KIND_LABEL[best.session.kind]}”?</Text>
      <Text style={t.small}>{best.reasons.join(' · ')}</Text>
      <Button
        variant="soft"
        title="Associa all’allenamento"
        iconName="link-outline"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await call('linkActivityToSession', log.activityId, best.session.id);
            onLinked();
          } catch (e) {
            Alert.alert('Non associata', humanError(e, 'Riprova tra poco.'));
          } finally {
            setBusy(false);
          }
        }}
      />
      <LinkText
        title="No, è un’uscita extra"
        onPress={() => {
          void call('dismissActivityLink', log.activityId);
          setM([]);
        }}
      />
    </Panel>
  );
}

/* ---------- nuova gerarchia del dettaglio (mockup "Dettagli attività") ---------- */

/** Esagono del tipo, titolo e data con l'ora. */
function Identity({ log, s }: { log: WorkoutLog; s: ActivityStyle }) {
  const sameAsType = log.title.trim().toLowerCase() === s.label.toLowerCase();
  const when = `${fmtDate(log.startedAt)} · ${timeOf(log.startedAt)}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
      <TypeHex style={s} size={56} />
      <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${log.title}${sameAsType ? '' : `, ${s.label}`}, ${when}`}>
        <Text style={[type.title1, { color: color.text }]} numberOfLines={2} accessibilityRole="header">
          {log.title}
        </Text>
        <Text style={[type.subhead, { color: color.textSecondary }]} numberOfLines={1}>
          {sameAsType ? when : `${s.label} · ${when}`}
        </Text>
        {log.origin === 'strava' || log.origin === 'file' ? <Text style={t.small}>{log.origin === 'strava' ? 'Importata da Strava · titolo originale' : 'Importata da file · titolo originale'}</Text> : null}
      </View>
    </View>
  );
}

function BigMetric({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <Text style={[type.title1, { color: color.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={[type.footnote, { color: color.textSecondary, fontWeight: '600' }]}> {unit}</Text> : null}
      </Text>
      <Text style={[type.caption, { color: color.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Riga di navigazione: icona facoltativa, titolo, contatore facoltativo e freccia. */
function NavRow({ title, icon, count, onPress, label }: { title: string; icon?: keyof typeof Ionicons.glyphMap; count?: number; onPress?: () => void; label?: string }) {
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={color.textSecondary} /> : null}
      <Text style={[type.headline, { color: color.text, flex: 1 }]}>{title}</Text>
      {count !== undefined ? (
        <View style={{ minWidth: 26, height: 24, borderRadius: R.chip, paddingHorizontal: S.sm, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[type.footnote, { color: color.text, fontWeight: '700' }]}>{count}</Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={color.textTertiary} /> : null}
    </>
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52, paddingHorizontal: S.lg } as const;
  if (!onPress) return <View style={row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title} style={({ pressed }) => [row, pressed && { backgroundColor: color.surfacePressed }]}>
      {body}
    </Pressable>
  );
}

/**
 * Traguardi dell'attività: intestazione con il numero, banner del principale (con la festa la prima volta, se non c'è la
 * finestra di conquista), fila dei badge degli altri e accesso all'elenco completo.
 */
function Traguardi({ awards, hint, celebrate, onOpen, onList }: { awards: Award[]; hint: string | null; celebrate: boolean; onOpen: (a: Award) => void; onList: () => void }) {
  const top = awards[0];
  const rest = awards.slice(1);
  const shown = rest.slice(0, 4);
  const more = rest.length - shown.length;
  return (
    <Panel style={{ overflow: 'hidden' }}>
      <NavRow title="Traguardi" count={awards.length} onPress={awards.length ? onList : undefined} label={`Traguardi: ${awards.length}. Apri l'elenco`} />
      {top ? (
        <View style={{ paddingHorizontal: S.md, paddingBottom: rest.length ? S.sm : S.md }}>
          <AwardBanner a={top} celebrate={celebrate} onPress={() => onOpen(top)} />
        </View>
      ) : (
        <Text style={[t.muted, { paddingHorizontal: S.lg, paddingBottom: S.md }]}>{hint ?? 'Nessun nuovo traguardo con questa attività.'}</Text>
      )}
      {rest.length ? (
        <Pressable onPress={onList} accessibilityRole="button" accessibilityLabel={`Altri ${rest.length} riconoscimenti: ${rest.map((a) => a.name).join(', ')}. Apri l'elenco`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md }, pressed && { backgroundColor: color.surfacePressed }]}>
          <View style={{ flex: 1, flexDirection: 'row', gap: S.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {shown.map((a) => (
              <AwardMark key={a.id} a={a} size={38} />
            ))}
          </View>
          {more > 0 ? <Text style={[type.subhead, { color: color.textSecondary, fontWeight: '700' }]}>+{more}</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
        </Pressable>
      ) : null}
      <Divider inset={S.lg} />
      <NavRow title="Tutti i riconoscimenti" onPress={() => router.push('/record')} />
    </Panel>
  );
}

/** Sfondo del dettaglio senza traccia: sfumatura del colore dell'attività con la figura grande (nessuna foto). */
function TypeHero({ s, top, children }: { s: ActivityStyle; top: number; children: ReactNode }) {
  const [a, b] = s.blend ?? [s.solid, s.solid];
  return (
    <LinearGradient colors={[mix(a, '#0A1430', 0.5), mix(b, color.bg, 0.82), color.bg]} locations={[0, 0.7, 1]} style={{ paddingTop: top + S.xxl, paddingHorizontal: GUTTER, paddingBottom: S.xxxl, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -24, top: top - 8, opacity: 0.16, transform: [{ rotate: '-6deg' }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ActivityGlyph style={s} size={190} color={color.storyInk} />
      </View>
      {children}
    </LinearGradient>
  );
}

/* ---------- schermata ---------- */

export default function LogDettaglio() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const insets = useSafeAreaInsets();
  const em = useScrollEmitter();
  const state = useLoad(async () => {
    const l = await call<WorkoutLog>('getWorkoutLog', id);
    const s = l.plannedSessionId ? await call<PlannedSession>('getSession', l.plannedSessionId).catch(() => null) : null;
    const all = await call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]);
    const awards = activityAwards(l.id, all.some((x) => x.id === l.id) ? all : [...all, l]);
    const companions = await call<UserPublic[]>('runCompanions', l.id).catch(() => []);
    return { l, s, awards, group: !!l.eventId || companions.length > 0, hint: awards.length ? null : nextHint(l, all) };
  }, [id]);
  const [refreshing, setRefreshing] = useState(false);
  const [share, setShare] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [exportOpen,setExportOpen]=useState(false);
  const [gpsReport, setGpsReport] = useState(false);
  const [gpsDescription, setGpsDescription] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [detail, setDetail] = useState<Award | null>(null);
  const [conquest, setConquest] = useState<Award | null>(null);
  /** null = sto leggendo cosa è già stato visto; poi l'id del riconoscimento festeggiato con la finestra (o ''). */
  const [conquestFor, setConquestFor] = useState<string | null>(null);
  const [withPace, setWithPace] = useState(true);
  const [edit, setEdit] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eKm, setEKm] = useState('');
  const [eSport, setESport] = useState<'running' | 'walking'>('running');
  const [eShared, setEShared] = useState(false);
  const [eTrace, setETrace] = useState(false);
  const [eMap, setEMap] = useState(false);
  const [eGear, setEGear] = useState<string | null>(null);
  const [gear, setGear] = useState<GearView[]>([]);
  const [busy, setBusy] = useState(false);

  const l = state.data?.l;
  const awards = useMemo(() => state.data?.awards ?? [], [state.data?.awards]);
  const awardsKey = awards.map((a) => a.id).join(',');
  const shareText = l ? `${l.title}: ${l.distanceKm ? `${fmtKm(l.distanceKm)} · ` : ''}${fmtClock(l.durationSec)}${withPace && l.paceSecPerKm ? ` · ${fmtPace(l.paceSecPerKm)}` : ''} con RUNNGO` : '';

  // Conquista: la prima volta che si vede un NUOVO RECORD principale compare la finestra grande (una sola volta su questo
  // telefono, chiave awardfx condivisa con banner e racconti). Gli altri traguardi festeggiano nel banner.
  useEffect(() => {
    if (!state.data) return;
    let alive = true;
    void seenSet().then((seen) => {
      if (!alive) return;
      const top = awards[0];
      const fresh = !!top && top.record && !seen.has(awardFxKey(top.id));
      setConquestFor(fresh ? top.id : '');
      if (fresh) {
        setConquest(top);
        void markSeen(awardFxKey(top.id));
      }
      awards.forEach((a) => void markSeen(`award:${a.id}`));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awardsKey, !!state.data]);

  const actions: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean; run: () => void }> = l
    ? [
        { label: 'Guarda il racconto', icon: 'play-circle-outline', run: () => router.push({ pathname: '/allenamento/storie/[id]', params: { id: l.id } }) },
        ...(hasMapConsent(l) ? [{ label: 'Rimuovi dalla mappa di calore', icon: 'eye-off-outline' as const, run: () => {
          call('setMapVisibility', l.id, false).then(() => state.reload(), (e) => Alert.alert('Non aggiornato', humanError(e, 'Riprova.')));
        } }] : []),
        { label: 'Condividi', icon: 'share-outline', run: () => setShare(true) },
        { label: 'Esporta Racconto MP4', icon: 'download-outline', run: () => setExportOpen(true) },
        { label: 'Segnala percorso errato', icon: 'flag-outline', run: () => setGpsReport(true) },
        {
          label: 'Modifica',
          icon: 'create-outline',
          run: () => {
            setETitle(l.title);
            setEKm(l.distanceKm ? String(l.distanceKm) : '');
            setESport(l.sport ?? 'running');
            setEShared(l.shared);
            setETrace(l.traceShared ?? false);
            setEMap(hasMapConsent(l));
            setEGear(l.gearId ?? null);
            void call<GearView[]>('listGear').then((items) => setGear(items.filter((g) => !g.retired || g.id === l.gearId)), () => setGear([]));
            setEdit(true);
          },
        },
        {
          label: 'Elimina',
          icon: 'trash-outline',
          danger: true,
          run: () =>
            Alert.alert('Eliminare l’allenamento?', 'Scompare dallo storico e dai conteggi. Non si può annullare.', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Elimina', style: 'destructive', onPress: () => call('deleteWorkoutLog', l.id).then(() => router.back(), (e) => Alert.alert('Non eliminato', humanError(e, 'Riprova tra poco.'))) },
            ]),
        },
      ]
    : [];

  function menu() {
    if (!l) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...actions.map((a) => a.label), 'Annulla'], cancelButtonIndex: actions.length, destructiveButtonIndex: actions.findIndex((a) => a.danger) }, (i) => actions[i]?.run());
      return;
    }
    setMenuOpen(true);
  }

  async function saveEdit() {
    if (!l || busy) return;
    setBusy(true);
    let updated = false;
    try {
      await call('updateWorkoutLog', l.id, { title: eTitle.trim(), distanceKm: eKm.trim() ? Number(eKm.replace(',', '.')) : null, sport: eSport, shared: eShared });
      updated = true;
      if ((!l.origin || l.origin === 'app') && l.track && l.track.length > 1) {
        if (eTrace !== (l.traceShared ?? false)) await call('setTrackVisibility', l.id, eTrace);
        if (eMap !== hasMapConsent(l)) await call('setMapVisibility', l.id, eMap);
      }
      if ((!l.origin || l.origin === 'app') && eGear !== (l.gearId ?? null)) await call('setWorkoutGear', l.id, eGear);
      setEdit(false);
      await state.reload();
    } catch (e) {
      Alert.alert(updated ? 'Attività aggiornata in parte' : 'Non salvato', updated ? 'Le modifiche all’attività sono salvate, ma alcune impostazioni non sono state aggiornate. Riprova per completare.' : humanError(e, 'Riprova tra poco.'));
    } finally {
      setBusy(false);
    }
  }

  const openMark = (m: TrackMark) => {
    const a = awards.find((x) => x.id === m.awardId);
    if (a) setDetail(a);
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen
        options={{
          title: 'Allenamento',
          headerTransparent: false,
          headerTintColor: color.storyInk,
          headerTitleStyle: { color: color.storyInk, fontSize: type.headline.fontSize, fontWeight: '600' },
          headerRight: () =>
            l ? (
              <Pressable onPress={menu} accessibilityRole="button" accessibilityLabel="Altre azioni: racconto, condividi, modifica, elimina" hitSlop={6} style={({ pressed }) => ({ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Ionicons name="ellipsis-vertical" size={22} color={color.storyInk} />
              </Pressable>
            ) : null,
        }}
      />
      {!state.data ? (
        <View style={{ paddingTop: S.lg, paddingHorizontal: GUTTER }}>{state.loading ? <Loading /> : <Banner tone="error" text={state.error} action="Riprova" onAction={state.reload} />}</View>
      ) : (
        (() => {
          const { l, s, hint } = state.data;
          const typeStyle = styleOfLog(l);
          const track = l.track && l.track.length > 1 ? l.track : null;
          const laps = track ? countLaps(track) : 1;
          const routeFiltered = track ? displayTrack(track).filtered : false;
          const marks = track ? buildMarks({ id: l.id, track }, awards) : [];
          const meta = [laps > 1 ? `${laps} giri` : '', l.environment === 'treadmill' ? 'Tapis roulant' : '', l.distanceSource === 'manual' ? 'Distanza dichiarata' : '', l.shared ? 'Visibile ai compagni' : 'Attività privata'].filter(Boolean).join(' · ');
          return (
            <ScrollView
              contentInsetAdjustmentBehavior="never"
              onScroll={em.emit}
              scrollEventThrottle={120}
              contentContainerStyle={{ paddingBottom: insets.bottom + S.xxxl }}
              refreshControl={
                <RefreshControl
                  tintColor={color.accent}
                  progressViewOffset={0}
                  refreshing={refreshing}
                  onRefresh={async () => {
                    setRefreshing(true);
                    await state.reload();
                    setRefreshing(false);
                  }}
                />
              }>
              <ScrollProvider value={em.value}>
                {track ? (
                  <View style={{ height: MAP_H }}>
                    <RouteReplay track={track} marks={marks} tint={typeStyle.solid} chrome insetTop={0} onOpenMark={openMark} style={{ flex: 1 }} />

                  </View>
                ) : (
                  <TypeHero s={typeStyle} top={0}>
                    <Identity log={l} s={typeStyle} />
                  </TypeHero>
                )}

                <View style={{ paddingHorizontal: GUTTER, paddingTop: track ? S.lg : 0, marginTop: track ? 0 : -S.lg, gap: S.lg }}>
                  {track ? <Identity log={l} s={typeStyle} /> : null}

                  <Panel style={{ flexDirection: 'row', paddingVertical: S.lg, paddingHorizontal: S.xs }}>
                    <BigMetric value={l.distanceKm ? kmParts(l.distanceKm)[0] : '—'} unit={l.distanceKm ? 'km' : undefined} label="Distanza" />
                    <BigMetric value={fmtClock(l.durationSec)} label="Durata" />
                    <BigMetric value={l.paceSecPerKm ? fmtPace(l.paceSecPerKm).replace('/km', '') : '—'} unit={l.paceSecPerKm ? '/km' : undefined} label="Ritmo medio" />
                  </Panel>

                  <View style={{ gap: S.sm }}>
                    <Text style={t.small}>{meta}</Text>
                    {routeFiltered?<Text style={t.small}>Alcuni tratti potrebbero essere meno precisi a causa del segnale GPS.</Text>:null}
                    <Companions log={l} />
                    <OwnSocial log={l} />
                  </View>
                  {l.gpsQuality?.gaps ? <Banner tone="warn" text={`Traccia incompleta (${l.gpsQuality.gaps} interruzioni, ${Math.round(l.gpsQuality.lostSec / 60)} min senza GPS): niente record sul percorso.`} /> : null}
                  {l.edited ? <Text style={t.small}>Dati corretti a mano dopo la registrazione: esclusi dai record calcolati sulla traccia.</Text> : null}

                  {conquestFor !== null ? <Traguardi awards={awards} hint={hint} celebrate={conquestFor !== awards[0]?.id} onOpen={setDetail} onList={() => setListOpen(true)} /> : <Skeleton height={120} />}

                  <Panel style={{ padding: S.lg, gap: S.sm }}><Text style={t.h2}>Rivivi la corsa</Text><Text style={t.muted}>Percorso animato, momenti principali e traguardi della tua attività.</Text><Button title="Guarda il Racconto" variant="soft" onPress={() => router.push({ pathname: '/allenamento/storie/[id]', params: { id: l.id } })} /></Panel>

                  {l.eventId ? <LinkText title="Riconosci chi ha reso speciale l’uscita" onPress={() => router.push({ pathname: '/evento/[id]', params: { id: l.eventId!, recognize: '1' } })} /> : null}
                  <StravaOffer fresh={!!fresh} />
                  <LinkSuggestion log={l} onLinked={() => void state.reload()} />
                  <View style={{ gap: S.xxl, marginTop: S.sm }}>
                    <Brief log={l} />
                    <Trained log={l} session={s} />
                    <LinkText title={s ? 'Apri l’allenamento del piano' : 'Il tuo prossimo allenamento'} onPress={() => s ? router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } }) : router.push('/allenamento')} />
                    <ActivityStats log={l} />
                    {l.notes ? (
                      <Section title="Note">
                        <Text style={t.body}>{l.notes}</Text>
                      </Section>
                    ) : null}
                  </View>
                </View>
              </ScrollProvider>
            </ScrollView>
          );
        })()
      )}

      {l ? <StoryExportSheet logId={l.id} strava={l.origin==='strava'} visible={exportOpen} onClose={()=>setExportOpen(false)} /> : null}
      <Sheet visible={gpsReport} onClose={() => setGpsReport(false)} title="Segnala percorso errato">
        <Text style={t.muted}>Indica in quale tratto la traccia non corrisponde al percorso seguito. La segnalazione resta privata e non modifica i dati GPS.</Text>
        <Field label="Cosa non corrisponde" value={gpsDescription} onChangeText={setGpsDescription} multiline />
        {reportError ? <Banner tone="error" text={reportError} /> : null}
        <Button title="Invia segnalazione" busy={reportBusy} disabled={gpsDescription.trim().length < 5} onPress={async () => { if (!l) return; setReportBusy(true); setReportError(''); try { await call('reportUser', { reason: 'other', text: `Percorso errato attività ${l.id}: ${gpsDescription}`.slice(0, 1000) }); setGpsReport(false); setGpsDescription(''); Alert.alert('Segnalazione inviata', 'Grazie, il problema è stato segnalato.'); } catch (e) { setReportError(humanError(e, 'Non riesco a inviare la segnalazione. Riprova.')); } finally { setReportBusy(false); } }} />
      </Sheet>

      <ConquestModal
        award={conquest}
        onClose={() => setConquest(null)}
        onDetails={(a) => {
          setConquest(null);
          // la finestra si chiude prima che si apra il dettaglio (due finestre insieme non si sovrappongono bene)
          setTimeout(() => setDetail(a), 350);
        }}
      />
      <AwardDetailSheet award={detail} onClose={() => setDetail(null)} activity={l ? `${styleOfLog(l).label} · ${fmtDate(l.startedAt)}` : undefined} />

      <Sheet visible={listOpen} onClose={() => setListOpen(false)} title={`Traguardi · ${awards.length}`}>
        {awards.map((a, i) => (
          <View key={a.id}>
            {i ? <Divider inset={60} /> : null}
            <AwardRow
              a={a}
              onPress={() => {
                setListOpen(false);
                setTimeout(() => setDetail(a), 350);
              }}
            />
          </View>
        ))}
      </Sheet>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title="Azioni">
        {actions.map((a, i) => (
          <View key={a.label}>
            {i ? <Divider inset={36} /> : null}
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                setTimeout(a.run, 300);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52 }, pressed && { opacity: 0.6 }]}>
              <Ionicons name={a.icon} size={22} color={a.danger ? color.danger : color.text} />
              <Text style={[type.body, { color: a.danger ? color.danger : color.text }]}>{a.label}</Text>
            </Pressable>
          </View>
        ))}
      </Sheet>

      <Sheet
        visible={share}
        onClose={() => setShare(false)}
        title="Condividi"
        footer={
          <Button
            title="Condividi"
            iconName="share-outline"
            onPress={() => {
              setShare(false);
              void Share.share({ message: shareText });
            }}
          />
        }>
        <Text style={t.muted}>Anteprima di ciò che verrà condiviso:</Text>
        <View style={{ backgroundColor: color.surfaceElevated, borderRadius: R.control, padding: S.md }}>
          <Text style={t.body}>{shareText}</Text>
        </View>
        <SwitchRow label="Includi il passo" value={withPace} onChange={setWithPace} />
        <Text style={t.small}>Non vengono condivisi il percorso, la fatica che hai indicato né altri dati personali.</Text>
      </Sheet>

      <Sheet avoidKeyboard visible={edit} onClose={() => { if (!busy) setEdit(false); }} title="Modifica allenamento" footer={<Button title="Salva" busy={busy} onPress={saveEdit} />}>
        <Field label="Titolo" value={eTitle} onChangeText={setETitle} />
        {!l?.plannedSessionId ? (
          <Pills
            value={eSport}
            onChange={setESport}
            options={[
              { value: 'running', label: l?.trail ? 'Trail' : 'Corsa' },
              { value: 'walking', label: 'Camminata' },
            ]}
          />
        ) : null}
        <Field label="Distanza (km)" value={eKm} onChangeText={setEKm} keyboardType="decimal-pad" optional hint={l?.track ? 'Se la correggi, la corsa resta nello storico ma non conta per i record sulla traccia.' : undefined} />
        {l?.origin !== 'strava' ? <SwitchRow label="Visibile ai compagni di club" value={eShared} onChange={setEShared} /> : <Text style={t.small}>Le attività Strava restano nel tuo spazio privato.</Text>}
        {l && (!l.origin || l.origin === 'app') ? <View style={{ gap: S.sm }}>
          <Text style={t.title}>Scarpe e attrezzatura</Text>
          {gear.length ? <Pills value={eGear ?? ''} onChange={(value) => setEGear(value || null)} options={[{ value: '', label: 'Nessuna' }, ...gear.map((g) => ({ value: g.id, label: g.name }))]} /> : <Text style={t.small}>Puoi registrare le tue scarpe e associarle alle uscite.</Text>}
          <LinkText title="Gestisci attrezzatura" onPress={() => { setEdit(false); router.push('/attrezzatura'); }} />
        </View> : null}
        {l && (!l.origin || l.origin === 'app') && l.track && l.track.length > 1 ? <>
          <SwitchRow label="Percorso nel feed dei compagni" value={eTrace} onChange={setETrace} />
          <Text style={t.small}>Quando l’attività è visibile ai compagni, mostra anche il percorso. I primi e gli ultimi 300 metri vengono esclusi; i percorsi troppo brevi non vengono mostrati.</Text>
          <SwitchRow label="Contribuisci alla mappa di calore" value={eMap} onChange={setEMap} />
          <Text style={t.small}>Condividi celle approssimate e anonime, visibili solo dove contribuiscono almeno tre atleti. Questa scelta è separata dal percorso nel feed.</Text>
        </> : null}
      </Sheet>
    </View>
  );
}
