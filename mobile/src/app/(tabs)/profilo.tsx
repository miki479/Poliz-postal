import { Connections } from '@/components/Connections';
import { RouteThumbnail } from '@/components/RouteThumbnail';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CountText } from '@/components/Results';
import { GoalsCard, Glow, GroupCompare, WeekLog } from '@/components/ProgressExtras';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow, SectionHead } from '@/components/BadgeParts';
import { ProfileHeader } from '@/components/ProfileHeader';
import { Rise } from '@/components/Results';
import { StoryCard } from '@/components/StoryCard';
import { AreaChart } from '@/components/Motion';
import { Async, Button, Divider, IconButton, Panel, Screen, Sheet, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { styleOfSport } from '@/constants/activityColors';
import { awardsOf, BADGE_KINDS, kindOf, mainRecords } from '@/constants/achievements';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { call, ext, type StravaStatus } from '@/lib/api';
import { fmtClock, fmtDate, fmtDuration, fmtKm, fmtPace, toISODate } from '@/lib/format';
import { seenSet } from '@/lib/seen';
import { styleOfLog } from '@/lib/storyPalette';
import type { FameView } from '@shared/fame.ts';
import type { Award, RecordEntry } from '@shared/records.ts';
import type { Activity, PlannedSession, ProfileView, WorkoutLog } from '@shared/types.ts';

interface ProfileData {
  p: ProfileView;
  logs: WorkoutLog[];
  awards: Award[];
  records: RecordEntry[];
  next: PlannedSession | null;
  fame: FameView | null;
  strava: StravaStatus | null;
  seen: Set<string>;
  follows: { followers: number; following: number } | null;
}

async function load(): Promise<ProfileData> {
  const today = toISODate(new Date());
  const [p, logs, sessions, fame, strava, seen, follows] = await Promise.all([
    call<ProfileView>('getProfile', null),
    call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]),
    call<PlannedSession[]>('listSessions', { from: today }).catch(() => [] as PlannedSession[]),
    call<FameView>('getFame', null).catch(() => null),
    ext.strava.status().catch(() => null),
    seenSet(),
    call<ProfileData['follows']>('followInfo', null).catch(() => null),
  ]);
  const { awards, records } = awardsOf(logs);
  const next = sessions.filter((s) => s.status === 'planned' || s.status === 'rescheduled').sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))[0] ?? null;
  return { p, logs: [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), awards, records, next, fame, strava, seen, follows };
}

/** Cosa interessa della Fama, in una riga (i numeri sono privati: li vede solo la persona stessa). */
function fameHint(f: FameView | null): string {
  const tr = f?.tracks;
  if (!tr) return 'Come ti vedono i compagni di corsa';
  const parts = [tr.popularity.received ? `${tr.popularity.received} riconoscimenti da ${tr.popularity.people} ${tr.popularity.people === 1 ? 'persona' : 'persone'}` : null, tr.contribution.groupRuns ? `${tr.contribution.groupRuns} uscite di gruppo` : null, tr.sport.bestStreakWeeks ? `serie di ${tr.sport.bestStreakWeeks} settimane` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Ancora nessun riconoscimento: arrivano dopo le uscite di gruppo';
}

/** Settimane consecutive (lunedì-domenica) con almeno un'attività, contate fino a questa settimana o all'ultima. */
function weekStreak(logs: WorkoutLog[]): number {
  const weeks = new Set(logs.map((l) => mondayOf(new Date(l.startedAt))));
  let w = mondayOf(new Date());
  if (!weeks.has(w)) w -= WEEK_MS;
  let n = 0;
  while (weeks.has(w)) { n++; w -= WEEK_MS; }
  return n;
}

/** "Oggi", "Domani" o "gio 14 nov" per un giorno di calendario locale "YYYY-MM-DD". */
function NavRow({ icon, title, hint, onPress }: { icon: IconName; title: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={hint ? `${title}. ${hint}` : title} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 54 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={22} color={color.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={t.body}>{title}</Text>
        {hint ? (
          <Text style={t.small} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
    </Pressable>
  );
}

/* ---------- schede ---------- */

type Tab = 'attivita' | 'progressi' | 'altro';
const TABS: Array<{ value: Tab; label: string; icon: IconName }> = [
  { value: 'progressi', label: 'Progressi', icon: 'stats-chart' },
  { value: 'attivita', label: 'Attività', icon: 'pulse' },
  { value: 'altro', label: 'Altro', icon: 'menu' },
];

function Tabs({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.separator }} accessibilityRole="tablist">
      {TABS.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ionicons name={on ? o.icon : (`${o.icon}-outline` as IconName)} size={26} color={on ? color.accent : color.textSecondary} />
            <Text style={[type.footnote, { color: on ? color.accent : color.textSecondary, fontWeight: on ? '800' : '500' }]}>{o.label}</Text>
            <View style={{ position: 'absolute', bottom: -1, height: 3, left: S.md, right: S.md, borderRadius: 2, backgroundColor: on ? color.accent : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Attività recenti con il numero dei riconoscimenti conquistati e un filtro per tipo. */
/** Filtri come tab di solo testo: la voce attiva è in grassetto con una sottile linea luminosa, niente capsule né sfondi. */
function TextTabs({ items, value, onChange, bleed = GUTTER }: { items: Array<string | null>; value: string | null; onChange: (v: string | null) => void; bleed?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -bleed }} contentContainerStyle={{ paddingHorizontal: bleed, gap: S.xl }} accessibilityRole="tablist">
      {items.map((k) => {
        const on = value === k;
        return (
          <Pressable key={k ?? 'all'} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[type.subhead, { color: on ? color.text : color.textSecondary, fontWeight: on ? '800' : '500' }]}>{k ?? 'Tutti'}</Text>
            <View style={{ height: 2, borderRadius: 1, marginTop: 4, backgroundColor: on ? color.accent : 'transparent' }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ActivitiesTab({ activities, logs, awards }: { activities: Activity[]; logs: WorkoutLog[]; awards: Award[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [limit,setLimit]=useState(20);
  const byActivity = useMemo(() => new Map(logs.filter((l) => l.activityId).map((l) => [l.activityId!, l])), [logs]);
  const perLog = useMemo(() => {
    const m = new Map<string, Award[]>();
    for (const a of awards) m.set(a.logId, [...(m.get(a.logId) ?? []), a]);
    return m;
  }, [awards]);
  const types = [...new Set(activities.map((a) => styleOfSport(a.sport).label))];
  const shown = activities.filter((a) => !filter || styleOfSport(a.sport).label === filter).slice(0, limit);
  if (!activities.length) return <Text style={t.muted}>Ancora nessuna attività: registra una corsa o collega Strava.</Text>;
  return (
    <View style={{ gap: S.md }}>
      {types.length > 1 ? <TextTabs items={[null, ...types]} value={filter} onChange={setFilter} /> : null}
      <View>
        {shown.map((a, i) => {
          const log = byActivity.get(a.id);
          const st = log ? styleOfLog(log) : styleOfSport(a.sport);
          const got = log ? perLog.get(log.id) ?? [] : [];
          const tone = got[0] ? BADGE_KINDS[kindOf(got[0])].tone : null;
          const measure = [a.distanceKm ? fmtKm(a.distanceKm) : null, a.durationMin ? fmtDuration(a.durationMin) : null].filter(Boolean).join(' · ');
          return (
            <View key={a.id}>
              {i ? <Divider inset={56} /> : null}
              <Pressable disabled={!log && a.source !== 'file' && !a.eventId} onPress={() => log ? router.push({ pathname: '/allenamento/log/[id]', params: { id: log.id } }) : a.source === 'file' ? router.push({ pathname: '/allenamento/file/[id]', params: { id: a.id } }) : a.eventId && router.push({pathname:'/evento/[id]',params:{id:a.eventId}})} accessibilityRole={log || a.source === 'file' || a.eventId ? 'button' : undefined} accessibilityLabel={`${a.title || st.label}, ${fmtDate(a.date)}${measure ? `, ${measure}` : ''}${got.length ? `, ${got.length} ${got.length === 1 ? 'riconoscimento' : 'riconoscimenti'}` : ''}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.sm }, pressed && { opacity: 0.6 }]}>
                <View style={{ width: 64, height: 56, overflow:'hidden', borderRadius: R.control, backgroundColor: st.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <RouteThumbnail track={log?.track} style={st}/>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={t.title} numberOfLines={1}>
                    {a.title || log?.title || st.label}
                  </Text>
                  <Text style={t.small} numberOfLines={1}>
                    {[fmtDate(a.date), measure].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={t.small}>{log?.eventId || a.eventId ? 'Uscita di gruppo' : 'Attività individuale'}{log ? ' · Racconto disponibile' : ''}
                  </Text>
                </View>
                {got.length && tone ? (
                  <View style={{ minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: `${tone.solid}33`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type.caption, { color: tone.light, fontWeight: '800' }]}>{got.length}</Text>
                  </View>
                ) : null}
                {log || a.source === 'file' || a.eventId ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null}
              </Pressable>
              {log && (log.paceSecPerKm || log.durationSec) ? (
                <View style={{ flexDirection: 'row', marginLeft: 64 + S.md, marginBottom: S.sm, paddingVertical: S.md, paddingHorizontal: S.md, borderRadius: R.lg, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: color.separator }}>
                  {[['Durata', fmtClock(log.durationSec)], log.paceSecPerKm ? ['Passo medio', fmtPace(log.paceSecPerKm)] : null, log.distanceKm ? ['Distanza', fmtKm(log.distanceKm)] : null].filter(Boolean).map((x) => (
                    <View key={(x as string[])[0]} style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.caption, { color: color.textSecondary, letterSpacing: 0.4 }]}>{(x as string[])[0].toUpperCase()}</Text>
                      <Text style={[type.headline, { color: color.text, fontWeight: '800', fontVariant: ['tabular-nums'] }]}>{(x as string[])[1]}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {activities.filter((a)=>!filter||styleOfSport(a.sport).label===filter).length>limit?<Button variant="soft" title="Mostra altre attività" onPress={()=>setLimit((n)=>n+20)}/>:null}
    </View>
  );
}

function StoriesTab({ logs, seen }: { logs: WorkoutLog[]; seen: Set<string> }) {
  const { width } = useWindowDimensions();
  const w = Math.floor((Math.min(width, 640) - GUTTER * 2 - S.md) / 2);
  if (!logs.length) return <Text style={t.muted}>I racconti nascono dalle tue attività: registra una corsa o collega Strava.</Text>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md }}>
      {logs.slice(0, 6).map((l) => (
        <StoryCard key={l.id} log={l} all={logs} seen={seen.has(`story:${l.id}`)} width={w} />
      ))}
    </View>
  );
}

const WEEK_MS = 7 * 86_400_000;
function mondayOf(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.getTime();
}

/** Progressi reali: filtro per tipo, riepilogo della settimana e distanza delle ultime 12 settimane (solo attività registrate). */
/** Numero che sale da 0 al valore finale (fermo con "Riduci movimento"). */
function CStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <CountText text={value} duration={900} a11y={false} style={[type.metricSmall, { color: color.text }]} />
      <Text style={t.small}>{label}</Text>
    </View>
  );
}

function ProgressTab({ d }: { d: ProfileData }) {
  const [sport, setSport] = useState<string | null>(null);
  const types = [...new Set(d.logs.map((l) => styleOfLog(l).label))];
  const logs = d.logs.filter((l) => !sport || styleOfLog(l).label === sport);
  const now = mondayOf(new Date());
  const weeks = Array.from({ length: 12 }, (_, i) => now - (11 - i) * WEEK_MS);
  const km = weeks.map((w) => logs.filter((l) => mondayOf(new Date(l.startedAt)) === w).reduce((n, l) => n + (l.distanceKm ?? 0), 0));
  const thisWeek = logs.filter((l) => mondayOf(new Date(l.startedAt)) === now);
  const sec = thisWeek.reduce((n, l) => n + l.durationSec, 0);
  const elev = thisWeek.reduce((n, l) => n + (l.metrics?.elevGainM ?? 0), 0);
  const recs = mainRecords(d.records).slice(0, 3);
  return (
    <View style={{ gap: S.lg }}>
      <Panel style={{ padding: S.lg, gap: S.lg, overflow: 'hidden' }}>
        <Glow />
        {types.length > 1 ? <TextTabs items={[null, ...types]} value={sport} onChange={setSport} bleed={S.lg} /> : null}
        <Text style={t.h2}>Questa settimana</Text>
        <View style={{ flexDirection: 'row', gap: S.xl }}>
          <CStat label="Distanza" value={`${(km[11] || 0).toFixed(km[11] >= 10 ? 0 : 1).replace('.', ',')} km`} />
          <CStat label="Tempo" value={sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`} />
          {elev > 0 ? <CStat label="Dislivello" value={`${Math.round(elev)} m`} /> : null}
        </View>
        <Pressable onPress={() => router.push('/statistiche')} accessibilityRole="button" accessibilityLabel="Apri le statistiche complete" style={{ gap: S.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={t.small}>Ultime 12 settimane</Text><Text style={[t.small, { color: color.accent, fontWeight: '700' }]}>Statistiche ›</Text></View>
          {km.some((v) => v > 0) ? <AreaChart values={km} height={150} tint={color.accent} label={`Distanza settimanale delle ultime 12 settimane, massimo ${Math.max(...km).toFixed(1).replace('.', ',')} chilometri`} /> : <Text style={t.muted}>Il grafico compare dopo la prima attività con distanza.</Text>}
        </Pressable>
      </Panel>
      <WeekLog logs={logs} />
      {recs.length ? <View><SectionHead title="Migliori prestazioni" action="Tutte" onAction={() => router.push('/record')} />{recs.map((r) => <RecordRow key={r.code} r={r} awards={d.awards} />)}</View> : null}
      <GoalsCard />
      <GroupCompare />
      <NavRow icon="walk-outline" title="Inizia a correre: allenamenti guidati" hint="Programma pubblico NHS, 9 settimane" onPress={() => router.push('/allenamento/iniziare')} />
      <NavRow icon="calendar-outline" title="Il tuo piano" onPress={() => router.push('/allenamento')} />
      <NavRow icon="flag-outline" title="Obiettivi" onPress={() => router.push('/obiettivi')} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: 2 }}><Text style={t.small}>{label}</Text><Text style={[type.title1, { color: color.text }]}>{value}</Text></View>;
}

/** Persone, gruppi, uscite e storie di esempio (tutto "demo", si toglie con un tocco) per vedere come appaiono le schede. */
function DemoPanel() {
  const [busy, setBusy] = useState<'load' | 'clear' | null>(null);
  const [msg, setMsg] = useState('');
  const run = async (what: 'load' | 'clear') => {
    setBusy(what); setMsg('');
    try {
      await call(what === 'load' ? 'loadDemoData' : 'clearDemoData');
      setMsg(what === 'load' ? 'Fatto: guarda le storie in cima alla Home, i gruppi in Community e le uscite in Esplora.' : 'Dati di esempio rimossi.');
    } catch { setMsg('Non riesco a completare l’operazione. Riprova.'); } finally { setBusy(null); }
  };
  return (
    <Panel style={{ padding: S.lg, gap: S.sm }}>
      <Text style={t.title}>Prova con dati di esempio</Text>
      <Text style={t.small}>Aggiunge persone, gruppi, uscite e storie finte (segnati “demo”) per capire come appaiono le schede. Non toccano i tuoi dati e si tolgono quando vuoi.</Text>
      <Button title="Carica i dati di esempio" iconName="sparkles-outline" busy={busy === 'load'} onPress={() => void run('load')} />
      <Button variant="soft" title="Rimuovi i dati di esempio" iconName="trash-outline" busy={busy === 'clear'} onPress={() => void run('clear')} />
      {msg ? <Text style={t.small} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </Panel>
  );
}

function OtherTab({ d }: { d: ProfileData }) {
  const contribution = d.fame?.tracks?.contribution;
  return <View style={{ gap: S.md }}>
    <Text style={t.muted}>{fameHint(d.fame)}</Text>
    {contribution ? <Text style={t.body}>{contribution.groupRuns} uscite di gruppo · {contribution.organizedHeld} organizzate e svolte</Text> : null}
    {d.fame?.qualities.map((q) => <View key={q.category}><Text style={t.title}>{q.label}</Text><Text style={t.small}>{q.description}</Text></View>)}
    <DemoPanel />
    <NavRow icon="people-outline" title="Presenza nella community" hint="Partecipazioni e riconoscimenti ricevuti dopo le uscite" onPress={() => router.push('/fama')} />
  </View>;
}

/**
 * Profilo con la gerarchia dei mockup:
 *  1) "Profilo" e impostazioni; identità (avatar, nome, riga secondaria) e contatori Attività · Racconti · Club;
 *  2) il prossimo allenamento in un banner;
 *  3) Collegamenti (Strava) e le voci Obiettivi, Statistiche, Impostazioni;
 *  4) schede Attività / Racconti / Medaglie (in fondo, così cambiare scheda non sposta il resto).
 */
export default function Profilo() {
  const [archive, setArchive] = useState(false);
  const insets = useSafeAreaInsets();
  const state = useLoad(load);
  const [tab, setTab] = useState<Tab>('progressi');

  return (
    <Screen onRefresh={state.reload} bottomPad={96} glow="brand" style={{ paddingTop: insets.top + S.sm, gap: S.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 56 }}>
        <IconButton name="add" label="Organizza un'uscita" filled onPress={() => router.push('/evento/form')} />
        <View style={{ flex: 1 }} />
        <IconButton name="share-outline" label="Condividi il tuo profilo" filled onPress={() => void Share.share({ message: 'Seguimi su RUNNGO' })} />
        <IconButton name="search" label="Trova persone" filled onPress={() => router.navigate('/esplora')} />
        <IconButton name="settings-outline" label="Impostazioni" filled onPress={() => router.push('/impostazioni')} />
      </View>
      <Async state={state} skeleton={<><Skeleton height={150} /><Skeleton height={64} /><Skeleton height={200} /></>}>
        {(d) => {
          const streak = weekStreak(d.logs);
          return (
          <>
            <ProfileHeader p={d.p} onIdentity={() => router.push('/profilo-modifica')} onGroups={() => router.navigate({ pathname: '/esplora', params: { tab: 'groups' } })} />
            {d.follows ? <Connections followers={d.follows.followers} following={d.follows.following} onChanged={()=>void state.reload()} /> : null}
            {streak > 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                <Ionicons name="flame" size={24} color={color.achievement} />
                <Text style={type.title2}><Text style={{ fontWeight: '800' }}>{streak}</Text> settimane di fila con un'attività</Text>
              </View>
            ) : null}
            <View style={{ gap: S.lg }}>
              <Tabs value={tab} onChange={setTab} />
              <Rise key={tab} dy={6} duration={280}>
                {tab === 'attivita' ? <ActivitiesTab activities={d.p.activities ?? []} logs={d.logs} awards={d.awards} /> : tab === 'progressi' ? <ProgressTab d={d} /> : <OtherTab d={d} />}
              </Rise>
            </View>
            <NavRow icon="albums-outline" title="Racconti salvati" onPress={() => setArchive(true)} />
            <NavRow icon="ribbon-outline" title="Collezione di traguardi" onPress={() => router.push('/traguardi')} />
            <Sheet visible={archive} onClose={() => setArchive(false)} title="Racconti salvati"><StoriesTab logs={d.logs} seen={d.seen} /></Sheet>
          </>
        );}}
      </Async>
    </Screen>
  );
}
