import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';

import { Async, Avatar, Banner, Button, Card, Chip, Field, Muted, Row, Screen, Section, t, useLoad } from '@/components/ui';
import { API_URL, call } from '@/lib/api';
import { fmtDate, fmtKm } from '@/lib/format';
import type { ChallengeView } from '@shared/types.ts';
import { CHALLENGE_PHASE_LABEL as PHASE_LABEL, CHALLENGE_TYPE_LABEL as TYPE_LABEL } from '@/lib/format';

import { humanError } from '@/lib/errors';
export default function SfidaDettaglio() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const state = useLoad(() => call<ChallengeView>('getChallenge', id, code ?? null), [id]);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, back = false) {
    setBusy(true);
    try {
      await fn();
      if (back) router.back();
      else await state.reload();
    } catch (e) {
      Alert.alert('Non riuscito', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={state.reload}>
      <Async state={state}>
        {(c) => {
          const unit = c.type === 'most_runs' ? 'uscite' : c.type === 'most_active_days' ? 'giorni' : 'km';
          const val = (n: number) => (unit === 'km' ? fmtKm(n) : `${n} ${unit}`);
          return (
            <>
              <Stack.Screen options={{ title: c.name }} />
              <View style={{ gap: 6 }}>
                <Text style={[t.h1, { fontSize: 22 }]}>{c.name}</Text>
                <Muted>
                  {TYPE_LABEL[c.type]} · {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                </Muted>
                <Row gap={6}>
                  <Chip label={PHASE_LABEL[c.phase]} tone={c.phase === 'running' ? 'success' : 'default'} />
                  <Chip label={`${c.participantCount} partecipanti`} />
                </Row>
                {c.description ? <Text style={t.body}>{c.description}</Text> : null}
              </View>

              {c.type === 'collective_distance' && c.goalKm ? (
                <Card>
                  <Text style={t.title}>
                    {fmtKm(c.totalKm)} su {fmtKm(c.goalKm)}
                  </Text>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: '#262c34', overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (c.totalKm / c.goalKm) * 100)}%`, height: 8, backgroundColor: '#3cc8cd' }} />
                  </View>
                </Card>
              ) : null}

              <Banner text={c.dataNote} />

              {c.viewer.canJoin ? (
                <Card>
                  {c.type === 'personal_goal' ? <Field label="Il tuo obiettivo (km)" value={goal} onChangeText={setGoal} keyboardType="decimal-pad" /> : null}
                  <Button title="Partecipa" busy={busy} disabled={c.type === 'personal_goal' && !goal.trim()} onPress={() => act(() => call('joinChallenge', c.id, code ?? c.inviteCode ?? null, goal.trim() ? Number(goal.replace(',', '.')) : null))} />
                </Card>
              ) : null}

              <Section title="Classifica">
                <Card>
                  {c.rows.length ? (
                    c.rows.map((r) => (
                      <Row key={r.userId} style={{ minHeight: 44 }}>
                        <Text style={{ width: 24, color: r.rank === 1 ? '#3cc8cd' : '#a7b1b8', fontWeight: '700' }}>{r.rank}</Text>
                        <Avatar name={r.user.displayName} hue={r.user.hue} size={30} />
                        <Text style={[t.body, { flex: 1, fontWeight: r.isMe ? '700' : '400' }]}>{r.user.displayName}</Text>
                        <Text style={t.title}>{r.pct != null ? `${Math.round(r.pct)}%` : val(r.value)}</Text>
                      </Row>
                    ))
                  ) : (
                    <Muted>Nessun partecipante ancora.</Muted>
                  )}
                </Card>
              </Section>

              {c.viewer.isParticipant || c.viewer.isCreator ? (
                <Card>
                  <Text style={t.title}>Codice invito</Text>
                  <Text style={{ color: '#7fe3e3', fontSize: 22, fontWeight: '800', letterSpacing: 3 }}>{c.inviteCode}</Text>
                  <Button small variant="soft" title="Condividi" style={{ alignSelf: 'flex-start' }} onPress={() => Share.share({ message: `Ti sfido: “${c.name}” su RUNNGO! ${API_URL}/sfida/${c.id}?c=${c.inviteCode}` })} />
                </Card>
              ) : null}

              {c.viewer.isCreator && c.phase !== 'ended' && c.phase !== 'cancelled' ? (
                <Button variant="danger" title="Annulla sfida" busy={busy} onPress={() => Alert.alert('Annullare la sfida?', undefined, [{ text: 'No', style: 'cancel' }, { text: 'Annulla sfida', style: 'destructive', onPress: () => act(() => call('cancelChallenge', c.id)) }])} />
              ) : c.viewer.isParticipant ? (
                <Button variant="ghost" title="Esci dalla sfida" busy={busy} onPress={() => act(() => call('leaveChallenge', c.id), true)} />
              ) : null}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
