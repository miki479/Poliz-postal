import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { AnimatedBar, AreaChart, ColumnChart } from '@/components/Motion';
import { Async, Banner, Button, Divider, Field, LinkText, Metric, Pills, Row, Screen, Section, Segmented, Skeleton, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { deviceTimezone, fmtClock, fmtDate, fmtDuration, fmtKm, fmtPace, kmParts } from '@/lib/format';
import type { GoalProgress, GoalSuggestion } from '@shared/goals.ts';
import type { Performance, PerformanceBook } from '@shared/performances.ts';
import type { PersonalStats, WorkoutLog } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
function perfValue(p: Performance): string {
  if (p.unit === 'km') return fmtKm(p.value);
  if (p.unit === 'sec') return fmtClock(p.value);
  return `${p.value} ${p.unit}`;
}

function PerfRow({ p }: { p: Performance }) {
  const [open, setOpen] = useState(false);
  const pace = p.method === 'segment' ? fmtPace(p.value / Number(p.id.split('_')[1])) : null;
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${p.label}: ${perfValue(p)}${p.date ? `, ${fmtDate(p.date)}` : ''}`} style={({ pressed }) => [{ paddingVertical: S.md, gap: 4 }, pressed && { opacity: 0.7 }]}>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={t.title}>{p.label}</Text>
          <Text style={t.small}>{[p.date ? fmtDate(p.date) : null, p.activityTitle].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.metricSmall, { color: color.coral }]}>{perfValue(p)}</Text>
          {pace ? <Text style={t.small}>{pace}</Text> : null}
        </View>
      </Row>
    </Pressable>
  );
}

function Goals() {
  const goals = useLoad(() => call<GoalProgress[]>('listGoals'));
  const sugg = useLoad(() => call<{ hasHistory: boolean; period: string; suggestions: GoalSuggestion[] }>('suggestGoals'));
  const [days, setDays] = useState<number | null>(null);
  const [mins, setMins] = useState('30');
  const [exp, setExp] = useState<'new' | 'some' | 'regular' | null>(null);
  const [fromAnswers, setFromAnswers] = useState<GoalSuggestion[] | null>(null);
  const [manual, setManual] = useState(false);
  const stats = useLoad(() => call<PersonalStats>('getStats', deviceTimezone()));
  const logs = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]));
  const [busy, setBusy] = useState(false);

  async function choose(s: GoalSuggestion) {
    setBusy(true);
    try {
      await call('setGoal', { type: s.type, target: s.target, basis: s.basis });
      setFromAnswers(null);
      await goals.reload();
    } catch (e) {
      Alert.alert('Non salvato', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  const list = goals.data ?? [];
  // Precompilazione dai dati: uscite a settimana (mediana delle ultime settimane con attività), minuti tipici e esperienza dal numero di corse.
  useEffect(() => {
    if (fromAnswers || manual || goals.data?.length || sugg.data?.suggestions?.length || !stats.data || !logs.data) return;
    const wk = stats.data.weekly.filter((w) => w.runs > 0).map((w) => w.runs).sort((a, b) => a - b);
    const d = wk.length ? Math.min(7, Math.max(1, wk[Math.floor(wk.length / 2)])) : 3;
    const dur = logs.data.map((l) => Math.round(l.durationSec / 60)).filter((m) => m >= 5).sort((a, b) => a - b);
    const m = dur.length ? Math.max(10, Math.round(dur[Math.floor(dur.length / 2)] / 5) * 5) : 30;
    const e = stats.data.totals.runs >= 30 ? 'regular' : stats.data.totals.runs >= 5 ? 'some' : 'new';
    setDays(d); setMins(String(m)); setExp(e);
    void call<GoalSuggestion[]>('suggestFromAnswers', { daysPerWeek: d, minutesPerSession: m, experience: e }).then(setFromAnswers, () => setManual(true));
  }, [goals.data, sugg.data, stats.data, logs.data, fromAnswers, manual]);
  const suggestions = fromAnswers ?? sugg.data?.suggestions ?? [];
  return (
    <Section title="Obiettivo">
      {list.map((g) => {
        const pct = Math.min(1, g.current / g.goal.target);
        return (
          <View key={g.goal.id} style={{ gap: S.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={t.title}>{g.label}</Text>
              <LinkText title="Cambia" onPress={() => call('archiveGoal', g.goal.id).then(goals.reload)} />
            </Row>
            <Text style={[type.metricSmall, { color: color.text }]}>
              {String(g.current).replace('.', ',')} <Text style={t.muted}>di {String(g.goal.target).replace('.', ',')} {g.unit} {g.period === 'week' ? 'questa settimana' : 'questo mese'}</Text>
            </Text>
            <AnimatedBar pct={pct} />
            {g.paused ? <Text style={t.small}>Il piano è in pausa: questo periodo non conta.</Text> : null}
          </View>
        );
      })}
      {!list.length ? (
        !sugg.data ? (
          <Skeleton height={80} />
        ) : suggestions.length ? (
          <View style={{ gap: S.md }}>
            {suggestions.map((s) => (
              <Pressable key={s.type} onPress={() => void choose(s)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Scegli l’obiettivo: ${s.what}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderRadius: R.card, backgroundColor: color.coralTint, borderWidth: 1, borderColor: color.coral + '55', opacity: pressed ? 0.7 : 1 })}>
                <Ionicons name="flag" size={20} color={color.coral} />
                <Text style={[type.headline, { color: color.text, flex: 1 }]}>{s.what}</Text>
                <Ionicons name="add-circle" size={24} color={color.coral} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ gap: S.md }}>
            <Text style={t.title}>Giorni a settimana</Text>
            <Pills value={days} onChange={setDays} options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} />
            <Field label="Minuti per uscita" value={mins} onChangeText={setMins} keyboardType="number-pad" />
            <Text style={t.title}>Esperienza</Text>
            <Pills value={exp} onChange={setExp} options={[{ value: 'new', label: 'Agli inizi' }, { value: 'some', label: 'Qualche corsa' }, { value: 'regular', label: 'Corro con regolarità' }]} />
            <Button variant="soft" title="Proponimi un obiettivo" disabled={!days || !exp} onPress={() => call<GoalSuggestion[]>('suggestFromAnswers', { daysPerWeek: days, minutesPerSession: Number(mins), experience: exp }).then(setFromAnswers, (e) => Alert.alert('Controlla i dati', String(e.message)))} />
          </View>
        )
      ) : null}
    </Section>
  );
}

const RPE_BANDS: Array<{ label: string; from: number; to: number; tint: string }> = [
  { label: 'Facile', from: 1, to: 3, tint: '#4CD58B' },
  { label: 'Moderata', from: 4, to: 6, tint: '#FFC53D' },
  { label: 'Impegnativa', from: 7, to: 8, tint: '#FF8A3D' },
  { label: 'Molto dura', from: 9, to: 10, tint: '#FF5C6C' },
];

/** Sforzo percepito delle ultime 4 settimane: compare solo se hai indicato la fatica almeno una volta. Nessuna spiegazione, solo i dati. */
function Zones({ logs }: { logs: WorkoutLog[] }) {
  const since = Date.now() - 28 * 86_400_000;
  const rated = logs.filter((l) => Date.parse(l.startedAt) >= since && l.rpe);
  if (!rated.length) return null;
  return (
    <Section title="Sforzo · ultime 4 settimane">
      {RPE_BANDS.map((b) => {
        const n = rated.filter((l) => l.rpe! >= b.from && l.rpe! <= b.to);
        if (!n.length) return null;
        const min = n.reduce((a, l) => a + l.durationSec / 60, 0);
        return (
          <Row key={b.label} accessible accessibilityLabel={`${b.label}: ${n.length} allenamenti, ${Math.round(min)} minuti`}>
            <Text style={[t.body, { width: 110, color: b.tint, fontWeight: '700' }]}>{b.label}</Text>
            <AnimatedBar style={{ flex: 1 }} height={10} tint={b.tint} pct={n.length / rated.length} />
            <Text style={[t.small, { width: 56, textAlign: 'right' }]}>{fmtDuration(Math.round(min))}</Text>
          </Row>
        );
      })}
    </Section>
  );
}

export default function Progressi() {
  const stats = useLoad(() => call<PersonalStats>('getStats', deviceTimezone()));
  const book = useLoad(() => call<PerformanceBook>('getPerformances'));
  const logs = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null));
  const [period, setPeriod] = useState<'recent' | 'all'>('recent');
  const [more, setMore] = useState(false);

  return (
    <Screen onRefresh={async () => { await Promise.all([stats.reload(), book.reload(), logs.reload()]); }}>
      <Stack.Screen options={{ title: 'Progressi' }} />
      <Async state={stats} skeleton={<Skeleton height={90} />}>
        {(s) =>
          !s.hasData ? null : (
            <Section title="Sintesi">
              <AreaChart values={s.weekly.map((w) => w.distanceKm)} label={`Chilometri delle ultime 8 settimane: ${s.weekly.map((w) => Math.round(w.distanceKm)).join(', ')}`} />
              <Row style={{ justifyContent: 'space-between', marginTop: -S.sm }}>
                <Text style={t.small}>8 settimane fa</Text>
                <Text style={t.small}>questa settimana</Text>
              </Row>
              <Row gap={0}>
                <Metric value={kmParts(s.week.distanceKm)[0]} unit="km" label="Questa settimana" />
                <Metric value={kmParts(s.month.distanceKm)[0]} unit="km" label="Questo mese" />
                <Metric value={String(s.month.runs)} label="Attività nel mese" />
              </Row>
              {s.monthDeltaKm != null ? <Text style={t.small}>Mese scorso: {fmtKm(s.prevMonth.distanceKm)}.</Text> : null}
            </Section>
          )
        }
      </Async>

      <Goals />

      <Async state={logs} skeleton={<Skeleton height={80} />}>
        {(l) => <Zones logs={l} />}
      </Async>

      <Section title="Migliori prestazioni">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'recent', label: 'Ultimi 90 giorni' }, { value: 'all', label: 'Di sempre' }]} />
        <Async state={book} skeleton={<Skeleton height={120} />}>
          {(b) => {
            const list = period === 'recent' ? b.recent : b.allTime;
            return (
              <View>
                {list.length ? (
                  list.map((p, i) => (
                    <View key={p.id + i}>
                      {i ? <Divider /> : null}
                      <PerfRow p={p} />
                    </View>
                  ))
                ) : (
                  <Text style={t.muted}>Nessuna prestazione in questo periodo.</Text>
                )}
                {b.consistency.length ? (
                  <>
                    <Text style={[t.h2, { marginTop: S.xl }]}>Costanza</Text>
                    {b.consistency.map((p) => (
                      <PerfRow key={p.id} p={p} />
                    ))}
                  </>
                ) : null}
                {b.group.length ? (
                  <>
                    <Text style={[t.h2, { marginTop: S.xl }]}>Con il gruppo</Text>
                    {b.group.map((p, i) => (
                      <View key={p.id}>
                        {i ? <Divider /> : null}
                        <PerfRow p={p} />
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            );
          }}
        </Async>
      </Section>

      <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[type.subhead, { color: color.accent, fontWeight: '600' }]}>{more ? 'Nascondi gli approfondimenti' : 'Approfondimenti: settimane e mesi'}</Text>
      </Pressable>
      {more && stats.data?.hasData ? (
        <>
          <Section title="Ultimi 6 mesi (km)">
            <ColumnChart values={stats.data.monthly.map((m) => m.distanceKm)} labels={stats.data.monthly.map((m) => m.label)} label={`Chilometri per mese: ${stats.data.monthly.map((m) => `${m.label} ${Math.round(m.distanceKm)}`).join(', ')}`} />
          </Section>
          <LinkText title="Registra un’attività a mano" onPress={() => router.push('/attivita-form')} />
        </>
      ) : null}
    </Screen>
  );
}
