import { RunnerSuggestions } from '@/components/CommunityStream';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { FeedRow } from '@/components/cards';
import { Async, Button, Chip, Divider, Empty, IconButton, PressableScale, Row, Section, Segmented, Skeleton, TabScreen, t, useLoad } from '@/components/ui';
import { S } from '@/constants/theme';
import { call } from '@/lib/api';
import { CHALLENGE_PHASE_LABEL as PHASE_LABEL, CHALLENGE_TYPE_LABEL as TYPE_LABEL, fmtDate } from '@/lib/format';
import type { SocialCounts } from '@shared/social.ts';
import type { ChallengeView, FeedItem } from '@shared/types.ts';

export default function Social() {
  const [tab, setTab] = useState<'people' | 'challenges'>('people');
  const feed = useLoad(() => call<Array<FeedItem & { social: SocialCounts }>>('getSocialFeed', 40));
  const challenges = useLoad(() => call<ChallengeView[]>('listChallenges'));
  const hasChallenges = !!challenges.data?.length;

  return (
    <TabScreen
      title="Social"
      onRefresh={async () => { await Promise.all([feed.reload(), challenges.reload()]); }}
      right={tab === 'challenges' && hasChallenges ? <IconButton name="add" label="Nuova sfida" onPress={() => router.push('/sfide/form')} /> : undefined}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'people', label: 'Attività' }, { value: 'challenges', label: 'Sfide' }]} />

      {tab === 'people' ? (
        <>
          <RunnerSuggestions />
          <Section title="Attività dei compagni">
            <Async state={feed} skeleton={<><Skeleton height={80} /><Skeleton height={80} /></>}>
              {(items) =>
                items.length ? (
                  <View>
                    {items.map((f, i) => (
                      <View key={f.id}>
                        {i ? <Divider /> : null}
                        <FeedRow item={f} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Empty iconName="people-outline" title="Qui vedrai le persone con cui corri" text="Segui qualcuno o entra in un club: le loro corse condivise compaiono qui, con scintille e commenti." action={<Button title="Entra in un club" iconName="key-outline" onPress={() => router.push('/club/entra')} />} />
                )
              }
            </Async>
          </Section>
        </>
      ) : (
        <Async state={challenges} skeleton={<Skeleton height={72} />}>
          {(list) =>
            list.length ? (
              <View>
                {list.map((c, i) => (
                  <View key={c.id}>
                    {i ? <Divider /> : null}
                    <PressableScale onPress={() => router.push({ pathname: '/sfide/[id]', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`${c.name}, ${PHASE_LABEL[c.phase]}`} style={{ paddingVertical: S.md, gap: 4 }}>
                      <Text style={t.title}>{c.name}</Text>
                      <Text style={t.muted}>
                        {TYPE_LABEL[c.type]} · {fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}
                      </Text>
                      <Row gap={6}>
                        <Chip label={PHASE_LABEL[c.phase]} tone={c.phase === 'running' ? 'success' : 'default'} iconName={c.phase === 'running' ? 'play' : undefined} />
                        <Chip label={`${c.participantCount} ${c.participantCount === 1 ? 'partecipante' : 'partecipanti'}`} />
                      </Row>
                    </PressableScale>
                  </View>
                ))}
                <Button small title="Ho un link d’invito" onPress={() => router.push('/sfide/entra')} />
              </View>
            ) : (
              <Empty iconName="flag-outline" title="Nessuna sfida in corso" text="Una sfida di una settimana è un buon modo per correre di più insieme al gruppo." action={<Button title="Crea una sfida" iconName="add" onPress={() => router.push('/sfide/form')} />} />
            )
          }
        </Async>
      )}
    </TabScreen>
  );
}
