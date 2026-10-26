import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';
import { CheckInSheet } from '@/components/CheckIn';
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
  const [checkin, setCheckin] = useState(false);
  const [req, setReq] = useState<ChangeRequest | null>(null);
  const [applied, setApplied] = useState<PlanChange | null>(null);
  const today = todayIso();
  const d = state.data;
  function menu() {
    const options = ['Sono in vacanza', 'Metti in pausa il piano', 'Crea un nuovo piano', 'Obiettivi e progressi', 'Chiudi'];
    const pick = (i: number) => {
      if (i === 0) setCheckin(true);
      if (i === 1) setReq({ action: 'pause', params: { from: today, until: null } });
      if (i === 2) router.push('/allenamento/piano');
      if (i === 3) router.push('/statistiche');
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 4 }, pick);
    else
      Alert.alert(
        'Piano',
        undefined,
        options.slice(0, -1).map((o, i) => ({ text: o, onPress: () => pick(i) })),
      );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {d ? (
        <PlanDashboard
          data={d}
          onRefresh={state.reload}
          onManage={menu}
          onCheckIn={() => setCheckin(true)}
          onChange={setReq}
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
      <CheckInSheet
        visible={checkin}
        onClose={() => setCheckin(false)}
        onSaved={() => {
          setCheckin(false);
          void state.reload();
        }}
        onChange={setReq}
      />
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
