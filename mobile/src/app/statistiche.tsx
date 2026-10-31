import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
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
          <Text style={[type.metricSmall, { color: color.text }]}>{perfValue(p)}</Text>
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
              <View key={s.type} style={{ backgroundColor: color.surface, borderRadius: R.card, padding: S.lg, gap: S.xs }}>
                <Text style={t.title}>{s.what}</Text>
                <Button variant="soft" title="Scegli questo obiettivo" busy={busy} onPress={() => void choose(s)} />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: S.md }}>
            <Text style={t.muted}>Non ho ancora abbastanza attività per proporti un obiettivo: dimmi la tua disponibilità.</Text>
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
          !s.hasData ? (
            <Banner text="Ancora nessuna attività: registra una corsa o importala da Strava per vedere i tuoi progressi." action="Registra" onAction={() => router.push('/registra')} />
          ) : (
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
                <View style={{ gap: 4, marginTop: S.lg }}>
                  {b.limits.map((x) => (
                    <Row key={x} gap={6} style={{ alignItems: 'flex-start' }}>
                      <Ionicons name="information-circle-outline" size={14} color={color.textTertiary} style={{ marginTop: 2 }} />
                      <Text style={[t.small, { flex: 1 }]}>{x}</Text>
                    </Row>
                  ))}
                  {b.excluded.length ? <Text style={t.small}>Escluse dai record sulla traccia: {b.excluded.map((e) => `${e.title} (${e.reason})`).join('; ')}.</Text> : null}
                </View>
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
          <Text style={t.small}>
            Origine dei dati: {stats.data.byOrigin.selfDeclared} registrate o dichiarate, {stats.data.byOrigin.imported} importate. Le attività arrivate da più fonti contano una volta sola.
          </Text>
          <LinkText title="Registra un’attività a mano" onPress={() => router.push('/attivita-form')} />
        </>
      ) : null}
    </Screen>
  );
}
