import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { EventCard } from '@/components/cards';
import { FollowButton } from '@/components/FollowButton';
import { ProfileHeader } from '@/components/ProfileHeader';
import { Async, Banner, Button, Chip, Divider, Field, IconButton, Pills, Row, Screen, Section, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { call } from '@/lib/api';
import type { FameView } from '@shared/fame.ts';
import type { ProfileView } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
type FollowInfo = { followers: number; following: number; iFollow: boolean; followsMe: boolean };

/** Profilo pubblico di un'altra persona: solo ciò che ha scelto di mostrare. */
export default function Utente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(async () => {
    const [p, f, fame] = await Promise.all([call<ProfileView>('getProfile', id), call<FollowInfo>('followInfo', id).catch(() => null), call<FameView>('getFame', id).catch(() => null)]);
    return { p, f, fame };
  }, [id]);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState<'conduct' | 'harassment' | 'organization' | 'dispute' | 'other'>('conduct');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function send() {
    setBusy(true);
    try {
      await call('reportUser', { aboutId: id, reason, text });
      setDone('Segnalazione inviata. Resta privata: la persona non viene avvisata e la sua Fama non cambia.');
      setText('');
    } catch (e) {
      setDone(humanError(e, 'Non inviata.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={state.reload} glow="brand" style={{ paddingTop: 0 }}>
      <Stack.Screen options={{ title: '', headerTransparent: true, headerRight: () => <IconButton name="flag-outline" label="Segnala in privato" color={color.textSecondary} onPress={() => setReport(true)} /> }} />
      <Async state={state} skeleton={<Skeleton height={200} />}>
        {({ p, f, fame }) => (
          <>
            <ProfileHeader p={p} onBadges={p.badges ? () => router.push({ pathname: '/traguardi', params: { user: p.user.id } }) : undefined} />
            {f ? (
              <Row>
                <Text style={[t.muted, { flex: 1 }]}>
                  <Text style={{ color: color.text, fontWeight: '700' }}>{f.followers}</Text> follower · <Text style={{ color: color.text, fontWeight: '700' }}>{f.following}</Text> seguiti{f.followsMe ? ' · ti segue' : ''}
                </Text>
                <FollowButton userId={p.user.id} initial={f.iFollow} onChange={() => void state.reload()} />
              </Row>
            ) : null}
            {fame?.qualities.length ? (
              <Section title="Riconosciuto dal gruppo">
                <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
                  {fame.qualities.map((q) => (
                    <Chip key={q.category} label={q.label} tone="brand" iconName="sparkles" />
                  ))}
                </Row>
              </Section>
            ) : null}
            {p.upcoming?.length ? (
              <Section title="Prossime uscite">
                <View>
                  {p.upcoming.map((e, i) => (
                    <View key={e.id}>
                      {i ? <Divider inset={64} /> : null}
                      <EventCard e={e} />
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}
          </>
        )}
      </Async>

      <Sheet visible={report} onClose={() => { setReport(false); setDone(''); }} title="Segnala in privato" footer={done ? undefined : <Button title="Invia segnalazione" busy={busy} disabled={text.trim().length < 5} onPress={send} />}>
        {done ? (
          <Banner tone="success" text={done} />
        ) : (
          <>
            <Text style={t.muted}>Per comportamenti inappropriati, molestie o problemi organizzativi. Non è una recensione e non toglie punti a nessuno.</Text>
            <Pills value={reason} onChange={setReason} options={[{ value: 'conduct', label: 'Comportamento' }, { value: 'harassment', label: 'Molestie' }, { value: 'organization', label: 'Organizzazione' }, { value: 'dispute', label: 'Contestazione' }, { value: 'other', label: 'Altro' }]} />
            <Field label="Cosa è successo" value={text} onChangeText={setText} multiline maxLength={1000} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
