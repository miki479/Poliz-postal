import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useId, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { AwardsSummary, LatestAwards, RecordRow, SectionHead } from '@/components/BadgeParts';
import { ProfileHeader } from '@/components/ProfileHeader';
import { Rise } from '@/components/Results';
import { ActivityGlyph } from '@/components/SportIcon';
import { Async, Divider, IconButton, PressableScale, Screen, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { styleOfKind, styleOfSport } from '@/constants/activityColors';
import { awardsOf, BADGE_KINDS, kindOf, mainRecords } from '@/constants/achievements';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { call, ext, type StravaStatus } from '@/lib/api';
import { addDaysIso, fmtDate, fmtDuration, fmtKm, toISODate } from '@/lib/format';
import { seenSet } from '@/lib/seen';
import { storyPalette, styleOfLog } from '@/lib/storyPalette';
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
}

async function load(): Promise<ProfileData> {
  const today = toISODate(new Date());
  const [p, logs, sessions, fame, strava, seen] = await Promise.all([
    call<ProfileView>('getProfile', null),
    call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]),
    call<PlannedSession[]>('listSessions', { from: today }).catch(() => [] as PlannedSession[]),
    call<FameView>('getFame', null).catch(() => null),
    ext.strava.status().catch(() => null),
    seenSet(),
  ]);
  const { awards, records } = awardsOf(logs);
  const next = sessions.filter((s) => s.status === 'planned' || s.status === 'rescheduled').sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))[0] ?? null;
  return { p, logs: [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), awards, records, next, fame, strava, seen };
}

/** Cosa interessa della Fama, in una riga (i numeri sono privati: li vede solo la persona stessa). */
function fameHint(f: FameView | null): string {
  const tr = f?.tracks;
  if (!tr) return 'Come ti vedono i compagni di corsa';
  const parts = [tr.popularity.received ? `${tr.popularity.received} riconoscimenti da ${tr.popularity.people} ${tr.popularity.people === 1 ? 'persona' : 'persone'}` : null, tr.contribution.groupRuns ? `${tr.contribution.groupRuns} uscite di gruppo` : null, tr.sport.bestStreakWeeks ? `serie di ${tr.sport.bestStreakWeeks} settimane` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Ancora nessun riconoscimento: arrivano dopo le uscite di gruppo';
}

/** "Oggi", "Domani" o "gio 14 nov" per un giorno di calendario locale "YYYY-MM-DD". */
function dayLabel(date: string): string {
  const today = toISODate(new Date());
  if (date === today) return 'Oggi';
  if (date === addDaysIso(today, 1)) return 'Domani';
  return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function stravaLine(s: StravaStatus | null): string {
  if (!s) return 'Stato non disponibile';
  if (!s.configured) return 'Non disponibile';
  if (s.connected) return s.revoked ? 'Accesso revocato' : s.lastSyncAt ? 'Sincronizzato' : 'Collegato';
  return 'Non collegato';
}

/* ---------- prossimo allenamento ---------- */

const NEXT_FROM = BADGE_KINDS.beyond_limit.tone.solid;

function NextWorkout({ next }: { next: PlannedSession | null }) {
  const st = next ? styleOfKind(next.kind, next.title) : null;
  const line = next && st ? [st.label, next.durationMin ? fmtDuration(next.durationMin) : null, dayLabel(next.date)].filter(Boolean).join(' · ') : 'Nessuna sessione in programma';
  return (
    <PressableScale onPress={() => router.push(next ? { pathname: '/allenamento/sessione/[id]', params: { id: next.id } } : '/allenamento')} accessibilityRole="button" accessibilityLabel={`Il tuo prossimo allenamento: ${line}. Apri`}>
      <LinearGradient colors={[NEXT_FROM, color.brand]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: R.card, padding: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <View style={{ width: HIT, height: HIT, borderRadius: HIT / 2, backgroundColor: color.storyGlass, alignItems: 'center', justifyContent: 'center' }}>
          {st ? <ActivityGlyph style={st} size={22} color={color.storyInk} /> : <Ionicons name="calendar-outline" size={20} color={color.storyInk} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.footnote, { color: color.storyInkSecondary }]}>{next ? 'Il tuo prossimo allenamento' : 'Il tuo piano'}</Text>
          <Text style={[type.headline, { color: color.storyInk, fontWeight: '700' }]} numberOfLines={1}>
            {line}
          </Text>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.storyGlass, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={18} color={color.storyInk} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

/* ---------- collegamenti e voci ---------- */

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

function Links({ strava }: { strava: StravaStatus | null }) {
  const status = stravaLine(strava);
  const ok = !!strava?.connected && !strava.revoked;
  return (
    <View style={{ gap: S.sm }}>
      <SectionHead title="Collegamenti" />
      <Pressable onPress={() => router.push('/integrazioni')} accessibilityRole="button" accessibilityLabel={`Strava: ${status}. Apri`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 }, pressed && { opacity: 0.6 }]}>
        <View style={{ width: 44, height: 44, borderRadius: R.control, backgroundColor: BADGE_KINDS.precision.tone.solid, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sync" size={22} color={color.storyInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={t.title}>Strava</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {ok ? <Ionicons name="checkmark-circle" size={13} color={color.success} /> : null}
            <Text style={[type.footnote, { color: ok ? color.success : color.textSecondary }]}>{status}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Pressable>
    </View>
  );
}

/* ---------- schede ---------- */

type Tab = 'attivita' | 'racconti' | 'medaglie';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'attivita', label: 'Attività' },
  { value: 'racconti', label: 'Racconti' },
  { value: 'medaglie', label: 'Medaglie' },
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
  const byActivity = useMemo(() => new Map(logs.filter((l) => l.activityId).map((l) => [l.activityId!, l])), [logs]);
  const perLog = useMemo(() => {
    const m = new Map<string, Award[]>();
    for (const a of awards) m.set(a.logId, [...(m.get(a.logId) ?? []), a]);
    return m;
  }, [awards]);
  const types = [...new Set(activities.map((a) => styleOfSport(a.sport).label))];
  const shown = activities.filter((a) => !filter || styleOfSport(a.sport).label === filter).slice(0, 10);
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
          const measure = a.distanceKm ? fmtKm(a.distanceKm) : a.durationMin ? fmtDuration(a.durationMin) : null;
          return (
            <View key={a.id}>
              {i ? <Divider inset={56} /> : null}
              <Pressable disabled={!log && a.source !== 'file'} onPress={() => log ? router.push({ pathname: '/allenamento/log/[id]', params: { id: log.id } }) : a.source === 'file' && router.push({ pathname: '/allenamento/file/[id]', params: { id: a.id } })} accessibilityRole={log || a.source === 'file' ? 'button' : undefined} accessibilityLabel={`${a.title || st.label}, ${fmtDate(a.date)}${measure ? `, ${measure}` : ''}${got.length ? `, ${got.length} ${got.length === 1 ? 'riconoscimento' : 'riconoscimenti'}` : ''}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.sm }, pressed && { opacity: 0.6 }]}>
                <View style={{ width: 42, height: 42, borderRadius: R.control, backgroundColor: st.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityGlyph style={st} size={24} color={st.solid} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={t.title} numberOfLines={1}>
                    {a.title || log?.title || st.label}
                  </Text>
                  <Text style={t.small} numberOfLines={1}>
                    {[fmtDate(a.date), measure].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {got.length && tone ? (
                  <View style={{ minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: `${tone.solid}33`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type.caption, { color: tone.light, fontWeight: '800' }]}>{got.length}</Text>
                  </View>
                ) : null}
                {log || a.source === 'file' ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Sun({ tint, size }: { tint: string; size: number }) {
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} style={{ position: 'absolute', top: -size * 0.25, right: -size * 0.2 }} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.75} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Racconto in griglia: sfumatura dei colori reali dell'attività con la sua figura (nessuna foto), tipo e giorno. */
function StoryTile({ log, all, seen, width }: { log: WorkoutLog; all: WorkoutLog[]; seen: boolean; width: number }) {
  const p = useMemo(() => storyPalette(log, all), [log, all]);
  const st = styleOfLog(log);
  const h = Math.round(width * 1.12);
  return (
    <PressableScale onPress={() => router.push({ pathname: '/allenamento/storie/[id]', params: { id: log.id } })} accessibilityRole="button" accessibilityLabel={`Apri il racconto: ${log.title || p.label}, ${fmtDate(log.startedAt)}${seen ? '' : ', da vedere'}`} style={{ width, height: h }}>
      <LinearGradient colors={[p.a, p.second, p.deep]} locations={[0, 0.45, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, borderRadius: R.card, overflow: 'hidden', padding: S.md, justifyContent: 'flex-end' }}>
        <Sun tint={color.storyInk} size={width * 0.9} />
        <View style={{ position: 'absolute', top: h * 0.12, left: 0, right: 0, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ActivityGlyph style={st} size={width * 0.5} color="rgba(255,255,255,0.9)" />
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.45)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.45 }} />
        <Text style={[type.headline, { color: color.storyInk, fontWeight: '700' }]} numberOfLines={1}>
          {p.label}
        </Text>
        <Text style={[type.caption, { color: color.storyInkSecondary }]}>{fmtDate(log.startedAt)}</Text>
        {!seen ? <View style={{ position: 'absolute', top: S.sm, right: S.sm, width: 10, height: 10, borderRadius: 5, backgroundColor: color.storyInk }} /> : null}
      </LinearGradient>
    </PressableScale>
  );
}

function StoriesTab({ logs, seen }: { logs: WorkoutLog[]; seen: Set<string> }) {
  const { width } = useWindowDimensions();
  const w = Math.floor((Math.min(width, 640) - GUTTER * 2 - S.md) / 2);
  if (!logs.length) return <Text style={t.muted}>I racconti nascono dalle tue attività: registra una corsa o collega Strava.</Text>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md }}>
      {logs.slice(0, 6).map((l) => (
        <StoryTile key={l.id} log={l} all={logs} seen={seen.has(`story:${l.id}`)} width={w} />
      ))}
    </View>
  );
}

function MedalsTab({ d }: { d: ProfileData }) {
  const recs = mainRecords(d.records).slice(0, 3);
  return (
    <View style={{ gap: S.xl }}>
      <AwardsSummary awards={d.awards} records={d.records} onPress={() => router.push('/riconoscimenti')} />
      {recs.length ? (
        <View>
          <SectionHead title="Record principali" action="Vedi tutti" onAction={() => router.push('/record')} />
          {recs.map((r, i) => (
            <View key={r.code}>
              {i ? <Divider inset={50} /> : null}
              <RecordRow r={r} awards={d.awards} />
            </View>
          ))}
        </View>
      ) : null}
      {d.awards.length ? (
        <View style={{ gap: S.sm }}>
          <SectionHead title="Ultimi traguardi" action="Vedi tutti" onAction={() => router.push('/riconoscimenti')} />
          <LatestAwards awards={d.awards} />
        </View>
      ) : (
        <Text style={t.muted}>Registra o importa le tue attività: record e traguardi arrivano dal confronto con il tuo storico.</Text>
      )}
      <View>
        {d.p.badges ? <NavRow icon="shield-half-outline" title="Distintivi" hint={`${d.p.badges.earned} di ${d.p.badges.total} · uscite di gruppo, costanza e club`} onPress={() => router.push('/traguardi')} /> : null}
        {d.p.badges ? <Divider inset={34} /> : null}
        <NavRow icon="sparkles-outline" title="La tua Fama" hint={fameHint(d.fame)} onPress={() => router.push('/fama')} />
      </View>
    </View>
  );
}

/**
 * Profilo con la gerarchia dei mockup:
 *  1) "Profilo" e impostazioni; identità (avatar, nome, riga secondaria) e contatori Attività · Racconti · Club;
 *  2) il prossimo allenamento in un banner;
 *  3) Collegamenti (Strava) e le voci Obiettivi, Statistiche, Impostazioni;
 *  4) schede Attività / Racconti / Medaglie (in fondo, così cambiare scheda non sposta il resto).
 */
export default function Profilo() {
  const insets = useSafeAreaInsets();
  const state = useLoad(load);
  const [tab, setTab] = useState<Tab>('racconti');

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
            <ProfileHeader p={d.p} stories={d.logs.length} onIdentity={() => router.push('/profilo-modifica')} />
            <NextWorkout next={d.next} />
            <Links strava={d.strava} />
            <View style={{ marginTop: -S.md }}>
              <NavRow icon="shield-checkmark-outline" title="Obiettivi" onPress={() => router.push('/obiettivi')} />
              <Divider inset={34} />
              <NavRow icon="stats-chart-outline" title="Statistiche" onPress={() => router.push('/statistiche')} />
              <Divider inset={34} />
              <NavRow icon="settings-outline" title="Impostazioni" onPress={() => router.push('/impostazioni')} />
            </View>
            <View style={{ gap: S.lg }}>
              <Tabs value={tab} onChange={setTab} />
              <Rise key={tab} dy={6} duration={280}>
                {tab === 'attivita' ? <ActivitiesTab activities={d.p.activities ?? []} logs={d.logs} awards={d.awards} /> : tab === 'racconti' ? <StoriesTab logs={d.logs} seen={d.seen} /> : <MedalsTab d={d} />}
              </Rise>
            </View>
          </>
        )}
      </Async>
    </Screen>
  );
}
