import { useStravaImportNotice } from '@/lib/stravaSync';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { EventCard, GroupRunCard } from '@/components/cards';
import { CommunityStream } from '@/components/CommunityStream';
import { FriendStories } from '@/components/FriendStories';
import { Banner, Button, IconButton, Metric, Row, Section, Sheet, Skeleton, TabScreen, t, useLoad, Panel } from '@/components/ui';
import { SESSION_FIGURE } from '@/constants/figureImages';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { deviceTimezone, fmtDuration, fmtKm, hoursUntil, kmParts, KIND_LABEL, startOfWeekIso, toISODate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useJoin } from '@/lib/useJoin';
import type { ClubView, EventView, HomeView, PersonalStats, PlannedSession, PlanState, WorkoutLog } from '@shared/types.ts';
import type { FameView } from '@shared/fame.ts';
import type { SessionMatch } from '@shared/adaptive.ts';
import { PlanChangeSheet, UndoBanner, type ChangeRequest } from '@/components/PlanChange';
import { markSeen, seenSet } from '@/lib/seen';
import { todayIso } from '@/lib/plan';
import type { PlanChange } from '@shared/types.ts';

interface HomeData {
  home: HomeView;
  stats: PersonalStats | null;
  logs: WorkoutLog[];
  today: PlannedSession[];
  plan: PlanState | null;
  links: Array<{ activityId: string; title: string; source: string; date: string; matches: SessionMatch[] }>;
  toRecognize: Array<{ eventId: string; eventTitle: string; deadline: string; peers: number }>;
  fame: FameView | null;
  seen: Set<string>;
  /** Immagini reali dei miei club (solo quelli che ne hanno una), per le card delle loro uscite. */
  clubImages: Record<string, string>;
}

async function loadHome(): Promise<HomeData> {
  const tz = deviceTimezone();
  const day = toISODate(new Date());
  const [home, stats, logs, today, plan, links, toRecognize, fame, seen, clubs] = await Promise.all([
    call<HomeView>('getHome', startOfWeekIso(new Date(), tz)),
    call<PersonalStats>('getStats', tz).catch(() => null),
    call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]),
    call<PlannedSession[]>('listSessions', { from: day }).catch(() => [] as PlannedSession[]),
    call<PlanState>('getPlanState').catch(() => null),
    call<HomeData['links']>('pendingActivityLinks').catch(() => []),
    call<HomeData['toRecognize']>('pendingRecognitionPrompts').catch(() => []),
    call<FameView>('getFame', null).catch(() => null),
    seenSet(),
    call<ClubView[]>('listMyClubs').catch(() => [] as ClubView[]),
  ]);
  const clubImages: Record<string, string> = {};
  for (const c of clubs) if (c.imageDataUrl) clubImages[c.id] = c.imageDataUrl;
  return { home, stats, logs: [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), today: today.filter((s) => s.status === 'planned' || s.status === 'rescheduled'), plan, links, toRecognize, fame, seen, clubImages };
}

type Hero =
  | { kind: 'event'; e: EventView; label: string }
  | { kind: 'discover'; e: EventView }
  | { kind: 'session'; s: PlannedSession }
  | { kind: 'paused'; state: PlanState }
  | { kind: 'findGroup' }
  | { kind: 'firstStep' };

/** Una sola sezione protagonista, scelta in base a ciò che conta adesso. */
function pickHero(d: HomeData): Hero {
  const mine = d.home.nextEvents.filter((e) => e.status === 'active' && !e.isPast);
  const soon = mine[0];
  // Recap già visto: niente più protagonista, resta tra i racconti.
  if (soon && hoursUntil(soon.startsAt) <= 12) return { kind: 'event', e: soon, label: hoursUntil(soon.startsAt) <= 2 ? 'Si parte tra poco' : 'La tua prossima corsa' };

  // Piano in pausa o in vacanza: stato chiaro, nessun sollecito di allenamento.
  if (d.plan && d.plan.mode !== 'active' && !soon) return { kind: 'paused', state: d.plan };
  if (d.today[0]) return { kind: 'session', s: d.today[0] };
  if (soon) return { kind: 'event', e: soon, label: 'La tua prossima corsa' };
  const candidate = [...d.home.clubEvents, ...d.home.nearbyPublic].find((e) => e.status === 'active' && !e.isPast && e.viewer.canJoin);
  if (candidate) return { kind: 'discover', e: candidate };
  const isNew = d.home.stats.completedRuns === 0 && d.home.clubs.length === 0 && d.logs.length === 0;
  return isNew ? { kind: 'firstStep' } : { kind: 'findGroup' };
}

function Eyebrow({ text, tint = color.accent }: { text: string; tint?: string }) {
  return <Text style={[type.caption, { color: tint, fontWeight: '700', letterSpacing: 0.4 }]}>{text}</Text>;
}

const imageOf = (e: EventView, images: Record<string, string>) => (e.club ? images[e.club.id] ?? null : null);

/** Uscita protagonista: la stessa card grande delle "Uscite di gruppo", con l'azione per iscriversi sotto. */
function HeroEvent({ e, label, clubImage, onChange }: { e: EventView; label: string; clubImage: string | null; onChange: () => void }) {
  const j = useJoin(() => onChange());
  return (
    <View style={{ gap: S.sm }}>
      <Eyebrow text={label.toUpperCase()} />
      <GroupRunCard e={e} clubImage={clubImage} />
      {e.viewer.canJoin && !e.viewer.isParticipant ? (
        <View style={{ gap: S.sm }}>
          <Button title="Partecipa" iconName="add-circle-outline" busy={j.busy} onPress={() => void j.join(e.id)} />
          {j.error ? <Banner tone="error" text={j.error} /> : null}
        </View>
      ) : j.done === 'joined' ? (
        <Banner tone="success" text="Ci sei! Trovi l’uscita tra le tue prossime corse." />
      ) : null}
    </View>
  );
}

const KIND_FIGURE: Record<string, string> = { run_easy: 'easy', run_free: 'run', run_continuous: 'tempo', run_progressive: 'tempo', run_intervals: 'intervals', run_long: 'long', run_walk: 'fastwalk', aerobic: 'training', strength: 'strength', mobility: 'stretch', recovery_active: 'stretch' };

/** Sette giorni della settimana: oggi evidenziato, un punto sui giorni in cui hai registrato un allenamento (solo dati veri). */
/** Disposizioni delle uscite di gruppo: lo stesso tasto le scorre in ordine e l'icona mostra quella attiva. */
const LAYOUTS = {
  cards: { icon: 'albums-outline', label: 'schede grandi', next: 'small' },
  small: { icon: 'grid-outline', label: 'schede piccole', next: 'list' },
  list: { icon: 'list-outline', label: 'elenco', next: 'cards' },
} as const;

/** La stessa card, identica ma rimpicciolita (scala 0,62) per vederne di più insieme. */
function SmallCard({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const S_ = 0.62;
  const h = Math.min(320, Math.max(252, Math.round((width - 2 * GUTTER) * 0.75)));
  return (
    <View style={{ width: 300 * S_, height: h * S_ }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: 300, height: h, transform: [{ translateX: -(300 * (1 - S_)) / 2 }, { translateY: -(h * (1 - S_)) / 2 }, { scale: S_ }] }}>{children}</View>
    </View>
  );
}

function WeekStrip({ logs, planned }: { logs: WorkoutLog[]; planned: Set<string> }) {
  const start = new Date(); start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const done = new Set(logs.map((l) => toISODate(new Date(l.startedAt))));
  const todayStr = toISODate(new Date());
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="list">
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const iso = toISODate(d);
        const isToday = iso === todayStr, has = done.has(iso), plan = planned.has(iso);
        return (
          <Pressable key={iso} onPress={() => router.push('/allenamento/piano')} accessibilityRole="button" accessibilityLabel={`${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' })}${has ? ', allenamento registrato' : plan ? ', allenamento in programma' : ''}. Apre il calendario del piano`} style={{ alignItems: 'center', gap: 6, width: 42 }}>
            <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700' }]}>{d.toLocaleDateString('it-IT', { weekday: 'short' }).slice(0, 3).toUpperCase()}</Text>
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? color.accent : has ? color.accentTint : color.surface, borderWidth: isToday ? 0 : 1, borderColor: color.controlBorder }}>
              <Text style={[type.subhead, { color: isToday ? color.onAccent : color.text, fontWeight: '800' }]}>{d.getDate()}</Text>
            </View>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: has ? color.accent : 'transparent', borderWidth: !has && plan ? 1.5 : 0, borderColor: color.accent }} />
          </Pressable>
        );
      })}
    </View>
  );
}

function HeroSession({ s }: { s: PlannedSession }) {
  const today = s.date === todayIso();
  const fig = SESSION_FIGURE[KIND_FIGURE[s.kind] ?? ''];
  return (
    <Panel style={{ padding: S.lg, gap: S.md, overflow: 'hidden' }}>
      <LinearGradient pointerEvents="none" colors={[color.accentTint, 'transparent']} start={{ x: 1, y: 1 }} end={{ x: 0.3, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Pressable onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={`Dettagli di ${s.title || KIND_LABEL[s.kind]}`} style={{ gap: S.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: S.md }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.sm, backgroundColor: color.accentTint }}>
              <Text style={[type.caption, { color: color.accent, fontWeight: '800', letterSpacing: 0.6 }]}>{today ? 'PROGRAMMA DI OGGI' : `PROGRAMMA · ${s.date.slice(8)}/${s.date.slice(5, 7)}`}</Text>
            </View>
            <Text style={[type.title1, { color: color.text, fontWeight: '900' }]}>{s.title || KIND_LABEL[s.kind]}</Text>
          </View>
          {fig ? <Image source={fig.src} resizeMode="contain" tintColor={color.text} style={{ width: Math.round(84 * fig.ratio), height: 84 }} accessibilityIgnoresInvertColors /> : null}
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder }}>
            <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700' }]}>{fmtDuration(s.durationMin)}</Text>
          </View>
        </View>
        <Text style={t.muted} numberOfLines={2}>{[KIND_LABEL[s.kind], s.distanceKm ? fmtKm(s.distanceKm) : null].filter(Boolean).join(' · ')}{s.notes ? ` · ${s.notes}` : ''}</Text>
      </Pressable>
      <Button title="INIZIA E REGISTRA SUBITO" iconName="play" onPress={() => router.push({ pathname: '/registra', params: { session: s.id } })} />
    </Panel>
  );
}

function HeroPaused({ state, onResume }: { state: PlanState; onResume: () => void }) {
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Eyebrow text={state.mode === 'vacation' ? 'IN VACANZA' : 'PIANO IN PAUSA'} tint={color.textSecondary} />
      <Text style={t.title1}>{state.mode === 'vacation' ? 'Goditi la vacanza' : 'Ti aspettiamo quando vuoi'}</Text>
      <Text style={t.muted}>{state.mode === 'vacation' && state.until ? `Rientro previsto il ${new Date(state.until + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}. ` : ''}Storico, progressi e traguardi restano dove sono. Puoi sempre correre con il gruppo.</Text>
      <Button variant="soft" title="Riprendi il piano" iconName="play-circle-outline" onPress={onResume} />
    </Panel>
  );
}

/** Un solo suggerimento temporaneo alla volta; sparisce quando è risolto. */
function Suggestion({ d, onChanged }: { d: HomeData; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const rec = d.toRecognize[0];
  if (rec)
    return (
      <Banner text={`Chi ha reso speciale “${rec.eventTitle}”? Puoi lasciare un riconoscimento fino al ${new Date(rec.deadline).toLocaleDateString('it-IT', { weekday: 'long' })}.`} action="Lascia un riconoscimento" onAction={() => router.push({ pathname: '/evento/[id]', params: { id: rec.eventId, recognize: '1' } })} />
    );
  const link = d.links[0];
  if (link) {
    const m = link.matches[0];
    return (
      <Panel style={{ padding: S.lg, gap: S.sm }}>
        <Text style={t.title}>{link.source === 'event' ? 'Hai corso con il gruppo' : link.source === 'strava' ? 'Nuova corsa da Strava' : 'Nuova corsa registrata'}. Vuoi associarla all’allenamento “{m.session.title || KIND_LABEL[m.session.kind]}”?</Text>
        <Text style={t.small}>{m.reasons.join(' · ')}</Text>
        <Button variant="soft" title="Associa all’allenamento" iconName="link-outline" busy={busy} onPress={async () => { setBusy(true); try { await call('linkActivityToSession', link.activityId, m.session.id); } catch { /* il suggerimento resta: si può riprovare */ } finally { setBusy(false); onChanged(); } }} />
        <Button small title="No, è un’uscita extra" onPress={async () => { await call('dismissActivityLink', link.activityId).catch(() => {}); onChanged(); }} />
      </Panel>
    );
  }
  const q = d.fame?.qualities[0];
  if (q && !d.seen.has(`fame:${q.category}`))
    return (
      <Banner tone="success" text={`Le persone con cui corri ti riconoscono come “${q.label}”. Lo trovi nel tuo profilo.`} action="Vedi la tua reputazione" onAction={async () => { await markSeen(`fame:${q.category}`); router.push('/fama'); }} />
    );
  return null;
}

function HeroInvite({ first }: { first: boolean }) {
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Eyebrow text={first ? 'PRIMO PASSO' : 'NESSUNA USCITA IN PROGRAMMA'} />
      <Text style={t.title1}>{first ? 'Trova qualcuno con cui correre' : 'Corri in compagnia questa settimana'}</Text>
      <Text style={t.muted}>{first ? 'Cerca un’uscita nella tua città o entra in un club con il codice che ti hanno dato.' : 'Guarda le uscite vicine o proponine una tu al tuo gruppo.'}</Text>
      <Button title="Trova un’uscita" iconName="search" onPress={() => router.navigate('/esplora')} style={{ marginTop: S.sm }} />
      <Button small title={first ? 'Ho un codice club' : 'Organizza un’uscita'} onPress={() => router.push(first ? '/club/entra' : '/evento/form')} />
    </Panel>
  );
}

/* ---------- uscite di gruppo ---------- */

type RunFilter = 'all' | 'mine' | 'clubs' | 'public';
const FILTERS: Array<{ value: RunFilter; label: string }> = [
  { value: 'all', label: 'Tutte' },
  { value: 'mine', label: 'Le mie' },
  { value: 'clubs', label: 'Dei miei gruppi' },
  { value: 'public', label: 'Pubbliche' },
];
/** Due card grandi come nel mockup: le altre uscite scendono nelle righe compatte "I miei club" / "Uscite pubbliche". */
const BIG_CARDS = 8;
const ROWS = 3;

/** Intestazione "Uscite di gruppo" con il filtro a tendina ("Tutte" ▾). */
function GroupHeader({ filter, onOpen }: { filter: RunFilter; onOpen: () => void }) {
  const label = FILTERS.find((f) => f.value === filter)?.label ?? 'Tutte';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: HIT }}>
      <Text style={t.h2} accessibilityRole="header">
        Uscite di gruppo
      </Text>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Filtro: ${label}. Cambia filtro`} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: color.controlBorder, backgroundColor: color.surface, opacity: pressed ? 0.7 : 1 })}>
        <Text style={[type.subhead, { color: color.text, fontWeight: '600' }]}>{label}</Text>
        <Ionicons name="chevron-down" size={15} color={color.textSecondary} />
      </Pressable>
    </View>
  );
}

export default function Home() {
  const { me } = useSession();
  const imports = useStravaImportNotice();
  const state = useLoad(loadHome);
  const [, force] = useState(0);
  const [req, setReq] = useState<ChangeRequest | null>(null);
  const [applied, setApplied] = useState<PlanChange | null>(null);
  const [filter, setFilter] = useState<RunFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [layout, setLayout] = useState<'cards' | 'small' | 'list'>('cards');
  const d = state.data;
  const hero = d ? pickHero(d) : null;
  const unread = d?.home.unreadNotifications ?? 0;
  const heroId = hero && 'e' in hero ? hero.e.id : null;
  const images = d?.clubImages ?? {};

  // Tutte le uscite future che la Home conosce (mie, dei miei club, pubbliche vicine), una volta sola e in ordine di data.
  const myClubs = new Set((d?.home.clubs ?? []).map((c) => c.id));
  const pool: EventView[] = [];
  if (d) {
    const seen = new Set<string>(heroId ? [heroId] : []);
    for (const e of [...d.home.nextEvents, ...d.home.clubEvents, ...d.home.nearbyPublic]) {
      if (seen.has(e.id) || e.isPast) continue;
      seen.add(e.id);
      pool.push(e);
    }
    pool.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  const fromMyClub = (e: EventView) => !!e.club && myClubs.has(e.club.id);
  const matches = (e: EventView, f: RunFilter) => f === 'all' || (f === 'mine' ? e.viewer.isParticipant || e.viewer.isOrganizer : f === 'clubs' ? fromMyClub(e) : e.visibility === 'public');
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, pool.filter((e) => matches(e, f.value)).length])) as Record<RunFilter, number>;
  const big = pool.filter((e) => matches(e, filter)).slice(0, BIG_CARDS);
  const bigIds = new Set(big.map((e) => e.id));
  const week = d?.stats?.week;

  return (
    <TabScreen
      title="RUNNGO"
      onRefresh={state.reload}
      right={
        <>
          <IconButton name="notifications-outline" label="Notifiche" badge={unread} onPress={() => router.push('/notifiche')} />

        </>
      }>
      {!d ? (
        state.loading ? (
          <>
            <Skeleton height={252} />
            <Skeleton height={96} />
          </>
        ) : (
          <Banner tone="error" text={state.error || 'Non riesco a caricare la Home.'} action="Riprova" onAction={state.reload} />
        )
      ) : (
        <>
          <WeekStrip logs={d.logs} planned={new Set(d.today.map((s) => s.date))} />
          <FriendStories meId={me?.id} />
          {me && !me.profileCompleted ? <Banner text="Scegli nome e username: i compagni ti riconosceranno nelle uscite." action="Completa il profilo" onAction={() => router.push('/profilo-modifica')} /> : null}

          {hero?.kind === 'event' ? <HeroEvent e={hero.e} label={hero.label} clubImage={imageOf(hero.e, images)} onChange={() => void state.reload().then(() => force((x) => x + 1))} /> : null}
          {hero?.kind === 'discover' ? <HeroEvent e={hero.e} label="Potrebbe fare per te" clubImage={imageOf(hero.e, images)} onChange={() => void state.reload()} /> : null}
          {hero?.kind === 'session' ? <HeroSession s={hero.s} /> : null}
          {hero?.kind === 'paused' ? <HeroPaused state={hero.state} onResume={() => setReq({ action: 'resume', params: { date: todayIso() } })} /> : null}
          {applied ? <UndoBanner change={applied} onUndone={() => { setApplied(null); void state.reload(); }} onDismiss={() => setApplied(null)} /> : null}
          {hero?.kind === 'findGroup' ? <HeroInvite first={false} /> : null}
          {hero?.kind === 'firstStep' ? <HeroInvite first /> : null}

          {imports.count > 0 ? (
            <Pressable onPress={() => { imports.dismiss(); router.push('/integrazioni'); }} accessibilityRole="button" accessibilityLabel="Controlla gli allenamenti importati da Strava" style={{ borderRadius: R.lg, borderWidth: 1, borderColor: 'rgba(252,76,2,0.35)', overflow: 'hidden' }}>
              <LinearGradient colors={['rgba(252,76,2,0.18)', 'rgba(142,117,255,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#FC4C02', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sync" size={20} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.caption, { color: '#FC7A3C', fontWeight: '800', letterSpacing: 0.4 }]}>{imports.count === 1 ? 'NUOVO ALLENAMENTO DA STRAVA' : `${imports.count} NUOVI ALLENAMENTI DA STRAVA`}</Text>
                  <Text style={[type.subhead, { color: color.text, fontWeight: '600' }]}>Salvati nel tuo archivio privato</Text>
                </View>
                <IconButton name="close" label="Chiudi avviso Strava" onPress={imports.dismiss} />
              </LinearGradient>
            </Pressable>
          ) : null}
          {unread > 0 ? <Banner text={`${unread} aggiornamenti da leggere: inviti, richieste e attività dei gruppi.`} action="Apri notifiche" onAction={() => router.push('/notifiche')} /> : null}
          <Suggestion d={d} onChanged={() => void state.reload()} />

          {pool.length ? (
            <View style={{ gap: S.md }}>
              <GroupHeader filter={filter} onOpen={() => setFilterOpen(true)} />
              <Row gap={S.sm}><IconButton name={LAYOUTS[layout].icon} label={`Disposizione: ${LAYOUTS[layout].label}. Tocca per cambiare`} onPress={() => setLayout(LAYOUTS[layout].next)} /><IconButton name="add-circle-outline" label="Organizza un’uscita" onPress={() => router.push('/evento/form')} /></Row>
              {big.length ? (
                layout === 'list' ? big.map((e, i) => <EventCard key={e.id} e={e} index={i} clubImage={imageOf(e, images)} />) : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.xl }} contentContainerStyle={{ gap: S.md, paddingHorizontal: S.xl }}>{big.map((e, i) => layout === 'small' ? <SmallCard key={e.id}><GroupRunCard e={e} index={i} clubImage={imageOf(e, images)} /></SmallCard> : <View key={e.id} style={{ width: 300 }}><GroupRunCard e={e} index={i} clubImage={imageOf(e, images)} /></View>)}</ScrollView>
              ) : (
                <Text style={t.muted}>Nessuna uscita in programma per questo filtro.</Text>
              )}
            </View>
          ) : null}

          <CommunityStream />
          <Button variant="soft" title="Inizia a correre: allenamenti guidati" onPress={()=>router.push('/allenamento/iniziare')} />

          {week ? (
            <Section title="Questa settimana" action="Statistiche" onAction={() => router.push('/statistiche')}>
              {week.runs || week.distanceKm ? (
                <Row gap={0}>
                  <Metric value={kmParts(week.distanceKm)[0]} unit="km" label="Distanza" />
                  <Metric value={String(week.runs)} label={week.runs === 1 ? 'Uscita' : 'Uscite'} />
                  <Metric value={week.durationMin ? fmtDuration(week.durationMin) : '—'} label="Tempo" />
                </Row>
              ) : (
                <Text style={t.muted}>Nessuna attività registrata ancora questa settimana. Quando corri, i numeri compaiono qui.</Text>
              )}
              {d.stats && d.stats.streakWeeks > 1 ? (
                <Row gap={6}>
                  <Ionicons name="flame-outline" size={16} color={color.success} />
                  <Text style={t.muted}>{d.stats.streakWeeks} settimane di fila con almeno un’uscita</Text>
                </Row>
              ) : null}
            </Section>
          ) : null}
        </>
      )}
      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Mostra">
        <View accessibilityRole="radiogroup">
          {FILTERS.map((f) => {
            const on = f.value === filter;
            const n = counts[f.value] ?? 0;
            return (
              <Pressable
                key={f.value}
                onPress={() => { setFilter(f.value); setFilterOpen(false); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.label}, ${n === 1 ? '1 uscita' : `${n} uscite`}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52, opacity: pressed ? 0.6 : 1 })}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? color.accent : color.textSecondary} />
                <Text style={[t.body, { flex: 1, fontWeight: on ? '700' : '400' }]}>{f.label}</Text>
                <Text style={t.small}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
      <PlanChangeSheet req={req} onClose={() => setReq(null)} onApplied={(c) => { setReq(null); setApplied(c); void state.reload(); }} />
    </TabScreen>
  );
}
