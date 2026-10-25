import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View, type AlertButton } from 'react-native';

import { ClubHeroCard, EventCard, PersonRow } from '@/components/cards';
import { InviteSheet } from '@/components/InviteSheet';
import { AnimatedBar } from '@/components/Motion';
import { Async, Avatar, Banner, Button, Divider, IconButton, Panel, Row, Screen, Section, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtDate, fmtKm } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { ChallengeView, ClubView, Leaderboard } from '@shared/types.ts';

import { humanError } from '@/lib/errors';

const MEMBERS_SHOWN = 5;
type Member = NonNullable<ClubView['members']>[number];
/** Chi ha fondato il club per primo, poi tu, poi gli altri nell'ordine ricevuto. */
const ordered = (list: Member[], meId?: string) => [...list].sort((a, b) => rank(a, meId) - rank(b, meId));
const rank = (m: Member, meId?: string) => (m.role === 'owner' ? 0 : m.id === meId ? 1 : 2);
/** Partecipazione degli ultimi 30 giorni: conta le uscite, senza medaglie né "chi ha dato di più". */
function Participation({ clubId, meId }: { clubId: string; meId?: string }) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const state = useLoad(() => call<Leaderboard>('clubLeaderboard', clubId, 'runs', since), [clubId]);
  return (
    <Section title="Partecipazione · ultimi 30 giorni">
      <Async state={state} skeleton={<Skeleton height={48} />}>
        {(b) =>
          b.rows.filter((r) => r.value > 0).length ? (
            <View>
              {b.rows
                .filter((r) => r.value > 0)
                .map((r, i) => (
                  <View key={r.user.id}>
                    {i ? <Divider inset={44} /> : null}
                    <Row style={{ minHeight: 48 }} accessible accessibilityLabel={`${r.user.id === meId ? `Tu, ${r.user.displayName}` : r.user.displayName}: ${r.value} ${r.value === 1 ? 'uscita' : 'uscite'}`}>
                      <Avatar name={r.user.displayName} hue={r.user.hue} uri={r.user.avatar} size={32} />
                      <Text style={[t.body, { flex: 1, fontWeight: r.user.id === meId ? '700' : '400' }]}>
                        {r.user.displayName}
                        {r.user.id === meId ? ' (tu)' : ''}
                      </Text>
                      <Text style={t.muted}>
                        {r.value} {r.value === 1 ? 'uscita' : 'uscite'}
                      </Text>
                    </Row>
                  </View>
                ))}
              <Text style={[t.small, { marginTop: S.sm }]}>Uscite condivise dai membri negli ultimi 30 giorni. Chi tiene private le proprie attività non compare.</Text>
            </View>
          ) : (
            <Text style={t.muted}>Ancora nessuna attività condivisa dal gruppo in questo periodo.</Text>
          )
        }
      </Async>
    </Section>
  );
}

function CollectiveGoal({ clubId }: { clubId: string }) {
  const state = useLoad(() => call<ChallengeView[]>('listChallenges'), [clubId]);
  const goal = state.data?.find((c) => c.clubId === clubId && c.type === 'collective_distance' && (c.phase === 'running' || c.phase === 'closing') && c.goalKm);
  if (!goal || !goal.goalKm) return null;
  const pct = Math.min(1, goal.totalKm / goal.goalKm);
  return (
    <Section title="Obiettivo del club">
      <Pressable onPress={() => router.push({ pathname: '/sfide/[id]', params: { id: goal.id } })} accessibilityRole="button" accessibilityLabel={`${goal.name}: ${fmtKm(goal.totalKm)} su ${fmtKm(goal.goalKm)}, ${Math.round(pct * 100)} per cento`} style={({ pressed }) => [{ backgroundColor: color.surface, borderRadius: R.card, padding: S.lg, gap: S.sm }, pressed && { opacity: 0.7 }]}>
        <Text style={t.title}>{goal.name}</Text>
        <Text style={[type.metricSmall, { color: color.text }]}>
          {fmtKm(goal.totalKm)} <Text style={t.muted}>di {fmtKm(goal.goalKm)}</Text>
        </Text>
        <AnimatedBar pct={pct} tint={color.brand} />
        <Text style={t.small}>
          {goal.participantCount} {goal.participantCount === 1 ? 'persona contribuisce' : 'persone contribuiscono'} · fino al {fmtDate(goal.endsAt)}
        </Text>
      </Pressable>
    </Section>
  );
}

export default function ClubDettaglio() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const { me } = useSession();
  const state = useLoad(() => call<ClubView>('getClub', id, code ?? null), [id]);
  const [busy, setBusy] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [err, setErr] = useState('');

  async function join(c: ClubView) {
    setBusy(true);
    setErr('');
    try {
      await call('joinClub', code ?? c.inviteCode);
      await state.reload();
    } catch (e) {
      setErr(humanError(e, 'Non riuscito.'));
    } finally {
      setBusy(false);
    }
  }

  function menu(c: ClubView) {
    const options = ['Sfida il club', ...(c.isMember && !c.isOwner ? ['Lascia il club'] : []), 'Chiudi'];
    const pick = (i: number) => {
      if (options[i] === 'Sfida il club') router.push({ pathname: '/sfide/form', params: { clubId: c.id } });
      if (options[i] === 'Lascia il club')
        Alert.alert('Lasciare il club?', 'Non vedrai più le uscite riservate al club. Potrai rientrare con il codice invito.', [
          { text: 'Resto', style: 'cancel' },
          { text: 'Lascia', style: 'destructive', onPress: () => call('leaveClub', c.id).then(() => router.back(), (e) => Alert.alert('Non riuscito', humanError(e, 'Riprova tra poco.'))) },
        ]);
    };
    const leave = options.indexOf('Lascia il club');
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: leave >= 0 ? leave : undefined }, pick);
    else {
      // Su Android l'avviso non si chiude toccando fuori: serve sempre "Chiudi" (al massimo tre voci).
      const buttons: AlertButton[] = options.slice(0, -1).map((o, i) => ({ text: o, style: o === 'Lascia il club' ? 'destructive' : 'default', onPress: () => pick(i) }));
      Alert.alert(c.name, undefined, [...buttons, { text: 'Chiudi', style: 'cancel' }], { cancelable: true });
    }
  }

  const c = state.data;
  return (
    <Screen onRefresh={state.reload} footer={c && !c.isMember ? <><Button title="Entra nel club" iconName="enter-outline" busy={busy} onPress={() => void join(c)} />{err ? <Banner tone="error" text={err} /> : null}</> : undefined}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            c?.isMember ? (
              <Row gap={0}>
                <IconButton name="person-add-outline" label="Invita nel club" color={color.accent} onPress={() => setInviteOpen(true)} />
                <IconButton name="ellipsis-horizontal" label="Altre azioni" color={color.accent} onPress={() => menu(c)} />
              </Row>
            ) : null,
        }}
      />
      {c?.isMember ? <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} clubId={c.id} clubName={c.name} inviteCode={c.inviteCode} /> : null}
      <Async state={state} skeleton={<Skeleton height={120} />}>
        {(c) => {
          const shown = c.upcomingEvents.slice(0, 4);
          return (
            <>
              <ClubHeroCard c={c} />

              <Section title={shown.length > 1 ? 'Prossime uscite' : 'Prossima uscita'} gap={S.sm}>
                {shown.length ? (
                  shown.map((e, i) => <EventCard key={e.id} e={e} index={i} clubImage={c.imageDataUrl} />)
                ) : (
                  <Text style={t.muted}>Nessuna uscita in programma.</Text>
                )}
                {c.isMember ? <Button variant="soft" title="Organizza un’uscita del club" iconName="add-circle-outline" onPress={() => router.push({ pathname: '/evento/form', params: { clubId: c.id } })} /> : null}
              </Section>

              {c.isMember ? <CollectiveGoal clubId={c.id} /> : null}
              {c.isMember ? <Participation clubId={c.id} meId={me?.id} /> : null}

              {c.members ? (
                <Section title={`Membri · ${c.members.length}`} action={c.members.length > MEMBERS_SHOWN ? 'Vedi tutti' : undefined} onAction={() => setMembersOpen(true)} gap={S.sm}>
                  <Panel style={{ overflow: 'hidden', paddingVertical: S.xs }}>
                    {ordered(c.members, me?.id)
                      .slice(0, MEMBERS_SHOWN)
                      .map((m, i) => (
                        <View key={m.id}>
                          {i ? <Divider inset={S.lg + 40 + S.md} /> : null}
                          <PersonRow p={m} isMe={m.id === me?.id} status={m.role === 'owner' ? 'Fondatore' : 'Membro'} tint={m.role === 'owner' ? color.warning : color.textSecondary} onPress={() => router.push({ pathname: '/utente/[id]', params: { id: m.id } })} />
                        </View>
                      ))}
                  </Panel>
                  <Sheet visible={membersOpen} onClose={() => setMembersOpen(false)} title={`Membri · ${c.members.length}`}>
                    <View>
                      {ordered(c.members, me?.id).map((m, i) => (
                        <View key={m.id}>
                          {i ? <Divider inset={40 + S.md} /> : null}
                          <PersonRow
                            flush
                            p={m}
                            isMe={m.id === me?.id}
                            status={m.role === 'owner' ? 'Fondatore' : 'Membro'}
                            tint={m.role === 'owner' ? color.warning : color.textSecondary}
                            onPress={() => {
                              setMembersOpen(false);
                              router.push({ pathname: '/utente/[id]', params: { id: m.id } });
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  </Sheet>
                </Section>
              ) : null}

              {c.isMember ? (
                <Section title="Codice invito">
                  <Text style={[type.title1, { color: color.accent, letterSpacing: 3 }]} selectable>
                    {c.inviteCode}
                  </Text>
                  <Text style={t.small}>Condividilo solo con chi vuoi nel gruppo.</Text>
                </Section>
              ) : null}
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
