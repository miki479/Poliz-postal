import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';
import { PlanDashboard } from '@/components/PlanDashboard';
import { PlanChangeSheet, UndoBanner, type ChangeRequest } from '@/components/PlanChange';
import { Banner, Screen, Skeleton, useLoad } from '@/components/ui';
import { color } from '@/constants/theme';
import { call, ext } from '@/lib/api';
import { todayIso } from '@/lib/plan';
import type { PlanAdvice } from '@shared/adaptive.ts';
import type { PlanChange, PlannedSession, PlanState, TrainingPlan, WorkoutLog } from '@shared/types.ts';
interface PlanData {
  state: PlanState;
  advice: PlanAdvice;
  sessions: PlannedSession[];
  plans: TrainingPlan[];
  logs: WorkoutLog[];
  sync: { connected: boolean; lastSyncAt: string | null };
}

async function loadPlan(): Promise<PlanData> {
  const today = todayIso();
  const [state, advice, sessions, plans, logs, strava] = await Promise.all([
    call<PlanState>('getPlanState'),
    call<PlanAdvice>('planAdvice', today),
    call<PlannedSession[]>('listSessions', {}),
    call<TrainingPlan[]>('listPlans'),
    call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]),
    ext.strava.status().catch(() => null),
  ]);
  return {
    state,
    advice,
    sessions,
    plans,
    logs: [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    sync: { connected: !!strava?.connected && !strava.revoked, lastSyncAt: strava?.lastSyncAt ?? null },
  };
}

export default function Piano() {
  const state = useLoad(loadPlan);
  const [req, setReq] = useState<ChangeRequest | null>(null);
  const [applied, setApplied] = useState<PlanChange | null>(null);
  const today = todayIso();
  const d = state.data;
  function menu() {
    const options = [d?.state.mode === 'active' ? 'Metti in pausa il piano' : 'Riprendi il piano', 'Crea un nuovo piano', 'Chiudi'];
    const pick = (i: number) => {
      if (i === 0) setReq(d?.state.mode === 'active' ? { action: 'pause', params: { from: today, until: null } } : { action: 'resume', params: {date:today} });
      if (i === 1) router.push('/allenamento/piano');
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, pick);
    else
      Alert.alert(
        'Piano',
        undefined,
        options.slice(0, -1).map((o, i) => ({ text: o, onPress: () => pick(i) })),
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen options={{ headerShown: true, title: 'Il tuo piano', headerTransparent: false, headerBackVisible: true, headerBackButtonDisplayMode: 'default' }} />
      {d ? (
        <PlanDashboard
          data={d}
          onRefresh={state.reload}
          onManage={menu}
          notice={
            applied ? (
              <UndoBanner
                change={applied}
                onUndone={() => {
                  setApplied(null);
                  void state.reload();
                }}
                onDismiss={() => setApplied(null)}
              />
            ) : null
          }
        />
      ) : (
        <Screen>
          {state.loading ? <Skeleton height={180} /> : <Banner tone="error" text={state.error} action="Riprova" onAction={state.reload} />}
        </Screen>
      )}
      <PlanChangeSheet
        req={req}
        onClose={() => setReq(null)}
        onApplied={(c) => {
          setReq(null);
          setApplied(c);
          void state.reload();
        }}
      />
    </View>
  );
}
