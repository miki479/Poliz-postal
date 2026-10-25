import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ActivityStats, type ActivityStatsData } from '@/components/ActivityStats';
import { TypeTile } from '@/components/TypeBadge';
import { Async, Screen, Skeleton, t, useLoad } from '@/components/ui';
import { styleOfSport } from '@/constants/activityColors';
import { S } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import type { Activity } from '@shared/types.ts';

/** Dettaglio dei file senza un WorkoutLog: anche le misure prive di durata restano consultabili. */
export default function FileActivity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(() => call<Activity>('getFileActivity', id), [id]);
  return <Screen onRefresh={state.reload} style={{ gap: S.lg }}>
    <Stack.Screen options={{ title: 'Dettagli attività' }} />
    <Async state={state} skeleton={<Skeleton height={240} />}>
      {(activity) => {
        const style = styleOfSport(activity.sport);
        const durationSec = activity.fileData ? activity.fileData.durationSec : activity.durationMin != null ? activity.durationMin * 60 : null;
        const data: ActivityStatsData = { id: activity.id, startedAt: activity.date, durationSec, distanceKm: activity.distanceKm, paceSecPerKm: durationSec != null && activity.distanceKm ? Math.round(durationSec / activity.distanceKm) : null, origin: 'file', fileSamples: activity.fileData?.samples, fileSummary: activity.fileData?.summary };
        return <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <TypeTile style={style} size={48} />
            <View style={{ flex: 1, gap: S.xs }}><Text style={t.title}>{activity.title || style.label}</Text><Text style={t.small}>{style.label} · {fmtDate(activity.date)}</Text></View>
          </View>
          <Text style={t.small}>Misure importate dal file · Visibili solo a te</Text>
          <ActivityStats log={data} />
        </>;
      }}
    </Async>
  </Screen>;
}
