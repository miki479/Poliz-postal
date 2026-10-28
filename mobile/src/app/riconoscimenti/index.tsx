import { PhysicalMedalBanner } from '@/components/PhysicalMedalBanner';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PillTabs, SectionHead } from '@/components/BadgeParts';
import { AwardRow, Rise } from '@/components/Results';
import { Async, Screen, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { awardsOf, BADGE_KINDS } from '@/constants/achievements';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import type { WorkoutLog } from '@shared/types.ts';

type Tab = 'all' | 'record' | 'goal';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'record', label: 'Record' },
  { value: 'goal', label: 'Traguardi' },
];
const GOLD = BADGE_KINDS.new_peak.tone.light;

function Counter({ icon, value, label, on }: { icon: IconName; value: number; label: string; on: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, opacity: on ? 1 : 0.72 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={GOLD} />
      <Text style={[type.title1, { color: color.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[type.caption, { color: color.textSecondary, textAlign: 'center' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Riconoscimenti: schede Tutti / Record / Traguardi con i loro conteggi, gli ultimi conquistati e l'accesso alla
 * collezione completa. Tutto derivato dallo storico reale (shared/records.ts).
 */
export default function Riconoscimenti() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'record' ? 'record' : params.tab === 'goal' ? 'goal' : 'all');
  const state = useLoad(async () => awardsOf(await call<WorkoutLog[]>('listWorkoutLogs', null)));

  return (
    <Screen onRefresh={state.reload} style={{ gap: S.xl }}>
      <Stack.Screen options={{ title: 'Riconoscimenti' }} />
      <PillTabs options={TABS} value={tab} onChange={setTab} />
      <Async state={state} skeleton={<><Skeleton height={80} /><Skeleton height={240} /></>}>
        {({ awards }) => {
          const records = awards.filter((a) => a.record);
          const goals = awards.filter((a) => !a.record);
          const shown = tab === 'record' ? records : tab === 'goal' ? goals : awards;
          return (
            <>
              <View style={{ flexDirection: 'row' }}>
                <Counter icon="medal" value={awards.length} label="Totale" on={tab === 'all'} />
                <Counter icon="star" value={records.length} label="Record personali" on={tab === 'record'} />
                <Counter icon="trophy" value={goals.length} label="Traguardi" on={tab === 'goal'} />
              </View>

              <PhysicalMedalBanner awards={awards}/>
              <View style={{ gap: S.md }}>
                <SectionHead title={tab === 'record' ? 'Ultimi record' : 'Ultimi traguardi'} />
                {shown.length ? (
                  shown.slice(0, 12).map((a, i) => (
                    <Rise key={`${tab}:${a.id}`} delay={Math.min(i, 6) * 60} dy={8}>
                      <AwardRow a={a} card date onPress={() => router.push({ pathname: '/riconoscimenti/[id]', params: { id: a.id } })} />
                    </Rise>
                  ))
                ) : (
                  <Text style={t.muted}>
                    {awards.length
                      ? tab === 'record'
                        ? 'Ancora nessun record personale: arriva quando migliori un tuo risultato precedente.'
                        : 'Ancora nessun traguardo: arrivano con la prima attività di ogni sport, la costanza e i conteggi.'
                      : 'Registra o importa le tue attività: i riconoscimenti arrivano dal confronto con il tuo storico.'}
                  </Text>
                )}
              </View>

              <Pressable onPress={() => router.push('/riconoscimenti/collezione')} accessibilityRole="button" accessibilityLabel="Tutti i riconoscimenti: apri la collezione" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: S.lg, borderRadius: R.card, backgroundColor: color.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }, pressed && { backgroundColor: color.surfacePressed }]}>
                <Text style={[type.callout, { color: color.accent, fontWeight: '600', flex: 1 }]}>Tutti i riconoscimenti</Text>
                <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
              </Pressable>
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
