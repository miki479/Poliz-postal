import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Async, Button, Panel, Skeleton, t, useLoad } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { ext } from '@/lib/api';

export function HeartZones() {
  const state = useLoad(() => ext.strava.zones());
  return <Panel style={{ padding: S.lg, gap: S.sm }}>
    <Text style={t.title}>Zone cardiache</Text>
    <Async state={state} skeleton={<Skeleton height={80} />}>
      {(r) => r.needsReconnect ? <>
        <Text style={t.muted}>Ricollega Strava per autorizzare la lettura delle tue zone cardiache.</Text>
        <Button title="Gestisci Strava" variant="soft" onPress={() => router.push('/integrazioni')} />
      </> : r.zones ? <>
        <Text style={t.small}>Soglie attuali del tuo profilo Strava{r.zones.custom ? ', personalizzate' : ''}. Non indicano il tempo trascorso nelle zone durante questa attività.</Text>
        {r.zones.zones.map((z, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: S.sm, paddingVertical: S.sm, borderBottomWidth: 1, borderColor: color.separator }}>
          <Text style={t.body}>Zona {i + 1}</Text><Text style={t.body}>{z.max === -1 ? `Da ${z.min}` : `${z.min}–${z.max}`} bpm</Text>
        </View>)}
      </> : <Text style={t.muted}>{r.unavailable ? 'Le zone non sono raggiungibili ora. Riprova tra poco.' : 'Strava non ha fornito zone cardiache.'}</Text>}
    </Async>
  </Panel>;
}
