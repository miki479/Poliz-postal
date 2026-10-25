import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AwardsSummary, LatestAwards, RecordRow, SectionHead } from '@/components/BadgeParts';
import { AnimatedBar } from '@/components/Motion';
import { Async, Divider, Row, Screen, Skeleton, t, useLoad } from '@/components/ui';
import { awardsOf, mainRecords } from '@/constants/achievements';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { nextTargets, SPORT_NAME, type AwardSport } from '@shared/records.ts';
import type { WorkoutLog } from '@shared/types.ts';

const SPORTS: AwardSport[] = ['running', 'walking', 'trail', 'strength'];

/**
 * Record e riconoscimenti: riquadro con i totali (e quanti nel mese), record principali, ultimi traguardi e prossimi
 * traguardi misurabili, con un filtro per sport (corsa, camminata, trail, forza). Tutto derivato dal tuo storico.
 */
export default function Record() {
  const state = useLoad(async () => {
    const logs = await call<WorkoutLog[]>('listWorkoutLogs', null);
    return { ...awardsOf(logs), next: nextTargets(logs) };
  });
  const [allRecords, setAllRecords] = useState(false);
  const [sport, setSport] = useState<AwardSport | null>(null);

  return (
    <Screen onRefresh={state.reload} glow="brand" style={{ gap: S.xl }}>
      <Stack.Screen options={{ title: 'Record e riconoscimenti' }} />
      <Async state={state} skeleton={<><Skeleton height={110} /><Skeleton height={220} /></>}>
        {({ records, awards, next }) => {
          if (!awards.length && !records.length) return <Text style={t.muted}>Registra o importa qualche attività: record e riconoscimenti appaiono quando c’è uno storico con cui confrontarsi. Nessun dato viene inventato.</Text>;
          const present = SPORTS.filter((s) => awards.some((a) => a.sport === s) || records.some((r) => r.sport === s));
          const active = sport && present.includes(sport) ? sport : null;
          const shownAwards = active ? awards.filter((a) => a.sport === active) : awards;
          const shownRecords = mainRecords(active ? records.filter((r) => r.sport === active) : records);
          const list = allRecords ? shownRecords : shownRecords.slice(0, 4);
          const targets = next.filter((n) => !active || n.sport === active);
          return (
            <>
              <AwardsSummary awards={shownAwards} records={shownRecords} onPress={() => router.push('/riconoscimenti')} />

              {present.length > 1 ? (
                <Row gap={S.sm} style={{ flexWrap: 'wrap' }} accessibilityLabel="Filtra per sport">
                  {[null, ...present].map((s) => {
                    const on = active === s;
                    return (
                      <Pressable key={s ?? 'all'} onPress={() => setSport(s)} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [{ paddingHorizontal: S.md, minHeight: 36, justifyContent: 'center', borderRadius: R.pill, backgroundColor: on ? color.accent : color.surface }, pressed && !on && { backgroundColor: color.surfacePressed }]}>
                        <Text style={[type.subhead, { color: on ? color.onAccent : color.textSecondary, fontWeight: '700' }]}>{s ? SPORT_NAME[s] : 'Tutti'}</Text>
                      </Pressable>
                    );
                  })}
                </Row>
              ) : null}

              {shownRecords.length ? (
                <View>
                  <SectionHead title="Record principali" action={shownRecords.length > 4 ? (allRecords ? 'Meno' : 'Vedi tutti') : undefined} onAction={() => setAllRecords(!allRecords)} />
                  {list.map((r, i) => (
                    <View key={r.code}>
                      {i ? <Divider inset={50} /> : null}
                      <RecordRow r={r} awards={awards} />
                    </View>
                  ))}
                </View>
              ) : null}

              {shownAwards.length ? (
                <View style={{ gap: S.sm }}>
                  <SectionHead title="Ultimi traguardi" action="Vedi tutti" onAction={() => router.push('/riconoscimenti')} />
                  <LatestAwards awards={shownAwards} />
                </View>
              ) : null}

              {targets.length ? (
                <View style={{ gap: S.md }}>
                  <SectionHead title="Verso il prossimo" />
                  {targets.map((n) => (
                    <View key={n.sport} style={{ gap: 6 }} accessible accessibilityLabel={`${n.label}: ${n.current} su ${n.target}`}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={t.body}>{n.label}</Text>
                        <Text style={[t.small, { fontVariant: ['tabular-nums'] }]}>
                          {n.current} / {n.target}
                        </Text>
                      </Row>
                      <AnimatedBar pct={n.current / n.target} tint={color.accent} />
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
