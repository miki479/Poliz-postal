import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { ClubMark } from '@/components/cards';
import { Async, Banner, Card, Empty, Screen, Section, t, useLoad } from '@/components/ui';
import { clubTint } from '@/constants/eventStyle';
import { color, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { relativeFromNow } from '@/lib/format';
import type { InviteView } from '@shared/invites.ts';
import type { Notification } from '@shared/types.ts';

/** Invito a un club: card completa con due icone, accetta e rifiuta. L'esito è sempre visibile. */
function InviteCard({ inv, onDone }: { inv: InviteView; onDone: () => void }) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState('');
  async function answer(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline');
    setError('');
    try {
      const r = await call<{ status: string; clubId: string }>('respondClubInvite', inv.id, accept);
      if (accept) router.push({ pathname: '/club/[id]', params: { id: r.clubId } });
      onDone();
    } catch (e) {
      setError(humanError(e, 'Non sono riuscito a rispondere. Riprova.'));
      setBusy(null);
    }
  }
  const tint = clubTint(inv.club.name);
  return (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: 20, backgroundColor: `${tint}1F`, borderWidth: 1, borderColor: `${tint}55` }}>
        {inv.club.imageDataUrl ? <Image source={{ uri: inv.club.imageDataUrl }} style={{ width: 52, height: 52, borderRadius: 16 }} accessibilityIgnoresInvertColors /> : <ClubMark name={inv.club.name} size={52} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={t.title} numberOfLines={1}>{inv.club.name}</Text>
          <Text style={t.small} numberOfLines={2}>{inv.from.displayName} ti invita · {inv.club.memberCount} {inv.club.memberCount === 1 ? 'membro' : 'membri'}{inv.club.area ? ` · ${inv.club.area}` : ''}</Text>
        </View>
        <Pressable disabled={!!busy} onPress={() => void answer(false)} accessibilityRole="button" accessibilityLabel={`Rifiuta l'invito a ${inv.club.name}`} hitSlop={6} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', opacity: busy ? 0.5 : 1 }}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Pressable disabled={!!busy} onPress={() => void answer(true)} accessibilityRole="button" accessibilityLabel={`Accetta l'invito a ${inv.club.name}`} hitSlop={6} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, opacity: busy ? 0.5 : 1 }}>
          <Ionicons name="checkmark" size={22} color={color.onAccent} />
        </Pressable>
      </View>
      {error ? <Banner tone="error" text={error} /> : null}
    </View>
  );
}

export default function Notifiche() {
  const state = useLoad(async () => ({ list: await call<Notification[]>('listNotifications'), invites: await call<InviteView[]>('myClubInvites').catch(() => [] as InviteView[]) }));
  useEffect(() => () => void call('markNotificationsRead').catch(() => {}), []);
  return (
    <Screen onRefresh={state.reload}>
      <Stack.Screen options={{ title: 'Notifiche' }} />
      <Async state={state}>
        {({ list, invites }) => (
          <View style={{ gap: S.xl }}>
            {invites.length ? (
              <Section title="Inviti ai club">
                <View style={{ gap: S.md }}>
                  {invites.map((inv) => (
                    <InviteCard key={inv.id} inv={inv} onDone={() => void state.reload()} />
                  ))}
                </View>
              </Section>
            ) : null}
            {list.length ? (
              <View style={{ gap: S.sm }}>
                {list.map((n) => (
                  <Card
                    key={n.id}
                    style={n.readAt ? undefined : { borderLeftWidth: 3, borderLeftColor: '#3cc8cd' }}
                    onPress={() => {
                      if (n.type === 'club_invite') return;
                      if (n.eventId) router.push({ pathname: '/evento/[id]', params: { id: n.eventId } });
                      else if (n.clubId) router.push({ pathname: '/club/[id]', params: { id: n.clubId } });
                      else if (n.challengeId) router.push({ pathname: '/sfide/[id]', params: { id: n.challengeId } });
                    }}>
                    <Text style={t.body}>{n.text}</Text>
                    <Text style={[type.caption, { color: color.textSecondary }]}>{relativeFromNow(n.createdAt)}</Text>
                  </Card>
                ))}
              </View>
            ) : !invites.length ? (
              <Empty title="Nessuna notifica" />
            ) : null}
          </View>
        )}
      </Async>
    </Screen>
  );
}
