import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FeedRow } from '@/components/cards';
import { FollowButton } from '@/components/FollowButton';
import { Async, Avatar, Button, Divider, Section, Skeleton, t, useLoad } from '@/components/ui';
import { color, R, S } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtPace } from '@/lib/format';
import type { SocialCounts } from '@shared/social.ts';
import type { FeedItem, UserPublic } from '@shared/types.ts';

type Suggestion = { user: UserPublic; paceSecPerKm: number | null; reason: string };

/** "Con chi correre": persone reali vicine per zona o club e con passo simile. */
export function RunnerSuggestions() {
  const s = useLoad(() => call<Suggestion[]>('suggestRunners'));
  const [hidden, setHidden] = useState<string[]>([]);
  const shown = (s.data ?? []).filter((x) => !hidden.includes(x.user.id));
  if (!shown.length) return null;
  return (
    <Section title="Trova compagni">
      <Text style={[t.small, { marginTop: -S.sm }]}>Stessa zona o club in comune, con un passo simile al tuo.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.md, paddingRight: S.xl }} style={{ marginHorizontal: -S.xl, paddingLeft: S.xl }}>
        {shown.map((x) => (
          <View key={x.user.id} style={{ width: 156, backgroundColor: color.surface, borderRadius: R.card, padding: S.md, gap: S.sm }}>
            <Pressable onPress={() => router.push({ pathname: '/utente/[id]', params: { id: x.user.id } })} accessibilityRole="button" accessibilityLabel={`Profilo di ${x.user.displayName}. ${x.reason}`} style={{ gap: S.sm }}>
              <Avatar name={x.user.displayName} hue={x.user.hue} uri={x.user.avatar} size={48} />
              <Text style={t.title} numberOfLines={2}>
                {x.user.displayName}
              </Text>
              <Text style={t.small} numberOfLines={2}>
                {x.paceSecPerKm ? `${fmtPace(x.paceSecPerKm)} · ` : ''}
                {x.reason}
              </Text>
            </Pressable>
            <FollowButton userId={x.user.id} initial={false} compact onChange={(on) => { if (on) setHidden((list) => [...list, x.user.id]); }} />
            <Pressable onPress={() => setHidden((list) => [...list, x.user.id])} accessibilityRole="button" accessibilityLabel={`Nascondi il suggerimento di ${x.user.displayName}`} style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={t.small}>Nascondi</Text></Pressable>
          </View>
        ))}
      </ScrollView>
    </Section>
  );
}

export function CommunityStream() {
  const feed = useLoad(() => call<Array<FeedItem & { social: SocialCounts }>>('getSocialFeed', 20));
  return <Section title="Dalla community"><Async state={feed} skeleton={<Skeleton height={80} />}>
    {(items) => items.length ? <View>{items.map((f, i) => <View key={f.id}>{i ? <Divider /> : null}<FeedRow item={f} /></View>)}</View> : <View style={{ gap: S.sm }}><Text style={t.muted}>Le attività condivise dai compagni e dai tuoi gruppi compariranno qui.</Text><Button small title="Trova compagni" onPress={() => router.navigate('/club')} /></View>}
  </Async></Section>;
}
