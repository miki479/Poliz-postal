import { Connections } from '@/components/Connections';
import { RouteThumbnail } from '@/components/RouteThumbnail';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordRow, SectionHead } from '@/components/BadgeParts';
import { ProfileHeader } from '@/components/ProfileHeader';
import { Rise } from '@/components/Results';
import { StoryCard } from '@/components/StoryCard';
import { Async, Button, Divider, IconButton, Screen, Sheet, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { styleOfSport } from '@/constants/activityColors';
import { awardsOf, BADGE_KINDS, kindOf, mainRecords } from '@/constants/achievements';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { call, ext, type StravaStatus } from '@/lib/api';
import { fmtDate, fmtDuration, fmtKm, toISODate } from '@/lib/format';
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

type Tab = 'attivita' | 'progressi' | 'reputazione';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'attivita', label: 'Attività' },
  { value: 'progressi', label: 'Progressi' },
  { value: 'reputazione', label: 'Reputazione' },
];

function Tabs({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.separator }} accessibilityRole="tablist">
      {TABS.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type.subhead, { color: on ? color.text : color.textSecondary, fontWeight: on ? '700' : '500' }]}>{o.label}</Text>
            <View style={{ position: 'absolute', bottom: -1, height: 2, width: 56, borderRadius: 1, backgroundColor: on ? color.accent : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Attività recenti con il numero dei riconoscimenti conquistati e un filtro per tipo. */
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
      {types.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: S.sm }}>
          {[null, ...types].map((k) => {
            const on = filter === k;
            return (
              <Pressable key={k ?? 'all'} onPress={() => setFilter(k)} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [{ minHeight: 36, paddingHorizontal: S.md, borderRadius: R.pill, justifyContent: 'center', backgroundColor: on ? color.accent : color.surface }, pressed && !on && { backgroundColor: color.surfacePressed }]}>
                <Text style={[type.subhead, { color: on ? color.onAccent : color.textSecondary, fontWeight: '700' }]}>{k ?? 'Tutte'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
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

function ProgressTab({ d }: { d: ProfileData }) {
  const recs = mainRecords(d.records).slice(0, 3);
  const sport = d.fame?.tracks?.sport;
  return <View style={{ gap: S.lg }}>
    {sport ? <Text style={t.muted}>{sport.activities} attività · {fmtKm(sport.km)}{sport.bestStreakWeeks ? ` · ${sport.bestStreakWeeks} settimane consecutive` : ''}</Text> : null}
    {recs.length ? <View><SectionHead title="Record personali" action="Tutti" onAction={() => router.push('/record')} />{recs.map((r) => <RecordRow key={r.code} r={r} awards={d.awards} />)}</View> : <Text style={t.muted}>I record e i miglioramenti compariranno con le tue attività.</Text>}
    <NavRow icon="walk-outline" title="Inizia a correre: sedute guidate" hint="Programma pubblico NHS, 9 settimane" onPress={()=>router.push('/allenamento/iniziare')} />
    <NavRow icon="calendar-outline" title="Il tuo piano" onPress={() => router.push('/allenamento')} />
    <NavRow icon="stats-chart-outline" title="Volume e costanza" onPress={() => router.push('/statistiche')} />
    <NavRow icon="flag-outline" title="Obiettivi" onPress={() => router.push('/obiettivi')} />
  </View>;
}
function ReputationTab({ d }: { d: ProfileData }) {
  const contribution = d.fame?.tracks?.contribution;
  return <View style={{ gap: S.md }}>
    <Text style={t.muted}>{fameHint(d.fame)}</Text>
    {contribution ? <Text style={t.body}>{contribution.groupRuns} uscite di gruppo · {contribution.organizedHeld} organizzate e svolte</Text> : null}
    {d.fame?.qualities.map((q) => <View key={q.category}><Text style={t.title}>{q.label}</Text><Text style={t.small}>{q.description}</Text></View>)}
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
  const [tab, setTab] = useState<Tab>('attivita');

  return (
    <Screen onRefresh={state.reload} bottomPad={96} glow="brand" style={{ paddingTop: insets.top + S.sm, gap: S.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT }}>
        <Text style={[t.h2, { flex: 1 }]} accessibilityRole="header">
          Profilo
        </Text>
        <IconButton name="settings-outline" label="Impostazioni" onPress={() => router.push('/impostazioni')} />
      </View>
      <Async state={state} skeleton={<><Skeleton height={150} /><Skeleton height={64} /><Skeleton height={200} /></>}>
        {(d) => (
          <>
            <ProfileHeader p={d.p} onIdentity={() => router.push('/profilo-modifica')} />
            {d.follows ? <Connections followers={d.follows.followers} following={d.follows.following} onChanged={()=>void state.reload()} /> : null}
            <Button variant="soft" title="Modifica profilo" onPress={() => router.push('/profilo-modifica')} />
            <View style={{ gap: S.lg }}>
              <Tabs value={tab} onChange={setTab} />
              <Rise key={tab} dy={6} duration={280}>
                {tab === 'attivita' ? <ActivitiesTab activities={d.p.activities ?? []} logs={d.logs} awards={d.awards} /> : tab === 'progressi' ? <ProgressTab d={d} /> : <ReputationTab d={d} />}
              </Rise>
            </View>
            <NavRow icon="albums-outline" title="Racconti salvati" onPress={() => setArchive(true)} />
            <NavRow icon="ribbon-outline" title="Collezione di traguardi" onPress={() => router.push('/traguardi')} />
            <Sheet visible={archive} onClose={() => setArchive(false)} title="Racconti salvati"><StoriesTab logs={d.logs} seen={d.seen} /></Sheet>
          </>
        )}
      </Async>
    </Screen>
  );
}
