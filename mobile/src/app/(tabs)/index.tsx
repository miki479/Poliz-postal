import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';

import { EventCard, GroupRunCard, paceNum } from '@/components/cards';
import { AwardMark } from '@/components/Results';
import { activityAwards, descending } from '@shared/records.ts';
import { Banner, Button, IconButton, Metric, PressableScale, Row, Section, Sheet, Skeleton, TabScreen, t, useLoad, Panel } from '@/components/ui';
import { color, HIT, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { dayAgo, deviceTimezone, fmtClock, fmtDuration, fmtKm, hoursUntil, kmParts, KIND_LABEL, startOfWeekIso, toISODate } from '@/lib/format';
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
    call<PlannedSession[]>('listSessions', { from: day, to: day }).catch(() => [] as PlannedSession[]),
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
  | { kind: 'recap'; log: WorkoutLog }
  | { kind: 'session'; s: PlannedSession }
  | { kind: 'paused'; state: PlanState }
  | { kind: 'findGroup' }
  | { kind: 'firstStep' };

/** Una sola sezione protagonista, scelta in base a ciò che conta adesso. */
function pickHero(d: HomeData): Hero {
  const mine = d.home.nextEvents.filter((e) => e.status === 'active' && !e.isPast);
  const soon = mine[0];
  // Recap già visto: niente più protagonista, resta tra i racconti.
  const recent = d.logs[0] && Date.now() - Date.parse(d.logs[0].startedAt) < 36 * 3_600_000 && !d.seen.has(`story:${d.logs[0].id}`) ? d.logs[0] : null;
  if (soon && hoursUntil(soon.startsAt) <= 12) return { kind: 'event', e: soon, label: hoursUntil(soon.startsAt) <= 2 ? 'Si parte tra poco' : 'La tua prossima corsa' };
  if (recent) return { kind: 'recap', log: recent };
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

function HeroRecap({ log, logs }: { log: WorkoutLog; logs: WorkoutLog[] }) {
  const awards = descending(activityAwards(log.id, logs));
  const top = awards[0] ?? null;
  return (
    <Panel tone="brand" style={{ padding: S.lg, gap: S.md }}>
      <PressableScale onPress={() => router.push({ pathname: '/allenamento/log/[id]', params: { id: log.id } })} accessibilityRole="button" accessibilityLabel={`Recap disponibile: ${log.title}. Apri il riepilogo`}>
        <Row>
          <View style={{ flex: 1, gap: S.xs }}>
            <Eyebrow text={`RECAP · ${dayAgo(log.startedAt).toUpperCase()}`} tint={color.brandText} />
            <Text style={t.title1} numberOfLines={2}>
              {log.title}
            </Text>
            <Text style={t.muted}>{[log.distanceKm ? fmtKm(log.distanceKm) : null, fmtClock(log.durationSec), log.paceSecPerKm ? `${paceNum(log.paceSecPerKm)}/km` : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </Row>
      </PressableScale>
      {top ? (
        <Row gap={S.md}>
          <AwardMark a={top} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[type.subhead, { color: color.text, fontWeight: '700' }]} numberOfLines={2}>{top.headline}</Text>
            <Text style={t.small}>{awards.length === 1 ? '1 riconoscimento' : `${awards.length} riconoscimenti`}</Text>
          </View>
        </Row>
      ) : null}
    </Panel>
  );
}

function HeroSession({ s }: { s: PlannedSession }) {
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Eyebrow text="OGGI NEL TUO PIANO" />
      <Text style={t.title1}>{s.title || KIND_LABEL[s.kind]}</Text>
      <Text style={t.muted}>{[KIND_LABEL[s.kind], fmtDuration(s.durationMin), s.distanceKm ? fmtKm(s.distanceKm) : null].filter(Boolean).join(' · ')}</Text>
      {s.description ? (
        <Text style={t.muted} numberOfLines={3}>
          {s.description}
        </Text>
      ) : null}
      <Button title="Inizia e registra" iconName="play" onPress={() => router.push({ pathname: '/registra', params: { session: s.id } })} style={{ marginTop: S.sm }} />
      <Button small title="Vedi i dettagli della sessione" onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } })} />
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
        <Text style={t.title}>{link.source === 'event' ? 'Hai corso con il gruppo' : link.source === 'strava' ? 'Nuova corsa da Strava' : 'Nuova corsa registrata'}. Vuoi associarla alla seduta “{m.session.title || KIND_LABEL[m.session.kind]}”?</Text>
        <Text style={t.small}>{m.reasons.join(' · ')}</Text>
        <Button variant="soft" title="Associa alla seduta" iconName="link-outline" busy={busy} onPress={async () => { setBusy(true); try { await call('linkActivityToSession', link.activityId, m.session.id); } catch { /* il suggerimento resta: si può riprovare */ } finally { setBusy(false); onChanged(); } }} />
        <Button small title="No, è un’uscita extra" onPress={async () => { await call('dismissActivityLink', link.activityId).catch(() => {}); onChanged(); }} />
      </Panel>
    );
  }
  const q = d.fame?.qualities[0];
  if (q && !d.seen.has(`fame:${q.category}`))
    return (
      <Banner tone="success" text={`Le persone con cui corri ti riconoscono come “${q.label}”. Lo trovi nel tuo profilo.`} action="Vedi la tua Fama" onAction={async () => { await markSeen(`fame:${q.category}`); router.push('/fama'); }} />
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
  { value: 'clubs', label: 'Dei miei club' },
  { value: 'public', label: 'Pubbliche' },
];
/** Due card grandi come nel mockup: le altre uscite scendono nelle righe compatte "I miei club" / "Uscite pubbliche". */
const BIG_CARDS = 2;
const ROWS = 3;

/** "+" dell'intestazione: le due cose che si creano dalla Home. Mai più di tre voci (limite degli avvisi Android). */
function createMenu() {
  const options = ['Organizza un’uscita', 'Registra un allenamento', 'Annulla'];
  const pick = (i: number) => {
    if (i === 0) router.push('/evento/form');
    if (i === 1) router.push('/registra');
  };
  if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, pick);
  else Alert.alert('Cosa vuoi fare?', undefined, [{ text: options[0], onPress: () => pick(0) }, { text: options[1], onPress: () => pick(1) }, { text: 'Annulla', style: 'cancel' }]);
}

/** Pulsante tondo pieno "+" (come nel mockup). */
function CreateButton() {
  return (
    <Pressable onPress={createMenu} accessibilityRole="button" accessibilityLabel="Crea: organizza un’uscita o registra un allenamento" hitSlop={4} style={({ pressed }) => ({ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={24} color={color.onAccent} />
      </View>
    </Pressable>
  );
}

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
  const state = useLoad(loadHome);
  const [, force] = useState(0);
  const [req, setReq] = useState<ChangeRequest | null>(null);
  const [applied, setApplied] = useState<PlanChange | null>(null);
  const [filter, setFilter] = useState<RunFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
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
  // Le righe compatte mostrano solo ciò che non è già una card grande.
  const clubRows = pool.filter((e) => fromMyClub(e) && !bigIds.has(e.id)).slice(0, ROWS);
  const publicRows = pool.filter((e) => e.visibility === 'public' && !fromMyClub(e) && !bigIds.has(e.id)).slice(0, ROWS);
  const week = d?.stats?.week;

  return (
    <TabScreen
      title="RUNNGO"
      onRefresh={state.reload}
      right={
        <>
          <IconButton name="search" label="Cerca uscite" onPress={() => router.navigate('/esplora')} />
          <IconButton name="notifications-outline" label="Notifiche" badge={unread} onPress={() => router.push('/notifiche')} />
          <CreateButton />
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
          {me && !me.profileCompleted ? <Banner text="Scegli nome e username: i compagni ti riconosceranno nelle uscite." action="Completa il profilo" onAction={() => router.push('/profilo-modifica')} /> : null}

          {hero?.kind === 'event' ? <HeroEvent e={hero.e} label={hero.label} clubImage={imageOf(hero.e, images)} onChange={() => void state.reload().then(() => force((x) => x + 1))} /> : null}
          {hero?.kind === 'discover' ? <HeroEvent e={hero.e} label="Potrebbe fare per te" clubImage={imageOf(hero.e, images)} onChange={() => void state.reload()} /> : null}
          {hero?.kind === 'recap' ? <HeroRecap log={hero.log} logs={d.logs} /> : null}
          {hero?.kind === 'session' ? <HeroSession s={hero.s} /> : null}
          {hero?.kind === 'paused' ? <HeroPaused state={hero.state} onResume={() => setReq({ action: 'resume', params: { date: todayIso() } })} /> : null}
          {applied ? <UndoBanner change={applied} onUndone={() => { setApplied(null); void state.reload(); }} onDismiss={() => setApplied(null)} /> : null}
          {hero?.kind === 'findGroup' ? <HeroInvite first={false} /> : null}
          {hero?.kind === 'firstStep' ? <HeroInvite first /> : null}

          <Suggestion d={d} onChanged={() => void state.reload()} />

          {pool.length ? (
            <View style={{ gap: S.md }}>
              <GroupHeader filter={filter} onOpen={() => setFilterOpen(true)} />
              {big.length ? (
                big.map((e, i) => <GroupRunCard key={e.id} e={e} index={i} clubImage={imageOf(e, images)} />)
              ) : (
                <Text style={t.muted}>Nessuna uscita in programma per questo filtro.</Text>
              )}
            </View>
          ) : null}

          {clubRows.length ? (
            <Section title="I miei club" action="Vedi tutte" onAction={() => router.navigate({ pathname: '/esplora', params: { scope: 'clubs', at: String(Date.now()) } })} gap={S.sm}>
              {clubRows.map((e, i) => (
                <EventCard key={e.id} e={e} index={i} clubImage={imageOf(e, images)} />
              ))}
            </Section>
          ) : null}

          {publicRows.length ? (
            <Section title="Uscite pubbliche" action="Vedi tutte" onAction={() => router.navigate({ pathname: '/esplora', params: { scope: 'all', at: String(Date.now()) } })} gap={S.sm}>
              {publicRows.map((e, i) => (
                <EventCard key={e.id} e={e} index={i} />
              ))}
            </Section>
          ) : null}

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
