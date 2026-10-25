import { router, Stack } from 'expo-router';
import { Text } from 'react-native';

import { Async, Button, Card, Chip, Empty, Muted, Row, Screen, t, useLoad } from '@/components/ui';
import { call } from '@/lib/api';
import { CHALLENGE_PHASE_LABEL, CHALLENGE_TYPE_LABEL, fmtDate } from '@/lib/format';
import type { ChallengeView } from '@shared/types.ts';

export const TYPE_LABEL = CHALLENGE_TYPE_LABEL;
export const PHASE_LABEL = CHALLENGE_PHASE_LABEL;

export default function Sfide() {
  const state = useLoad(() => call<ChallengeView[]>('listChallenges'));
  return (
    <Screen onRefresh={state.reload}>
      <Stack.Screen options={{ title: 'Sfide' }} />
      <Row>
        <Button style={{ flex: 1 }} title="Nuova sfida" onPress={() => router.push('/sfide/form')} />
        <Button style={{ flex: 1 }} variant="soft" title="Ho un codice" onPress={() => router.push('/sfide/entra')} />
      </Row>
      <Async state={state}>
        {(list) =>
          list.length ? (
            list.map((c) => (
              <Card key={c.id} onPress={() => router.push({ pathname: '/sfide/[id]', params: { id: c.id } })}>
                <Text style={t.title}>{c.name}</Text>
                <Muted>
                  {TYPE_LABEL[c.type]} · {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                </Muted>
                <Row gap={6}>
                  <Chip label={PHASE_LABEL[c.phase]} tone={c.phase === 'running' ? 'success' : 'default'} />
                  <Chip label={`${c.participantCount} partecipanti`} />
                  {c.viewer.myRank ? <Chip label={`Sei ${c.viewer.myRank}°`} tone="accent" /> : null}
                </Row>
              </Card>
            ))
          ) : (
            <Empty title="Nessuna sfida" text="Lancia una sfida al tuo gruppo o entra con un codice." />
          )
        }
      </Async>
    </Screen>
  );
}
