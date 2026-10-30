import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { RunnerSuggestions } from '@/components/CommunityStream';
import { ClubCard, EventScene } from '@/components/cards';
import { Async, Avatar, Banner, Button, Divider, Empty, IconButton, Row, Section, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { SPORT_LABEL } from '@/lib/format';
import type { ClubSuggestion } from '@shared/clubDiscovery.ts';
import type { ClubView } from '@shared/types.ts';

const CARD_W = 248;

/** Gruppo suggerito: ben diverso da quelli di cui fai parte (immagine, regole, quante persone, "Nuovo"); per entrare lo apri e confermi. */
function SuggestionCard({ c, onOpen }: { c: ClubSuggestion; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${c.name}, ${c.memberCount} persone. Apri per i dettagli e unirti`} style={({ pressed }) => ({ width: CARD_W, borderRadius: R.card, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder, opacity: pressed ? 0.85 : 1 })}>
      <EventScene sport={c.sport} image={c.imageDataUrl} style={{ height: 112 }}>
        <View style={{ position: 'absolute', top: S.sm, left: S.sm, right: S.sm, flexDirection: 'row', justifyContent: 'space-between' }}>
          {c.isNew ? <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill, backgroundColor: color.accent }}><Text style={[type.caption, { color: color.onAccent, fontWeight: '800', letterSpacing: 0.5 }]}>NUOVO</Text></View> : <View />}
          <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill, backgroundColor: 'rgba(5,7,9,0.55)' }}><Text style={[type.caption, { color: '#fff', fontWeight: '700' }]}>{SPORT_LABEL[c.sport]}</Text></View>
        </View>
      </EventScene>
      <View style={{ padding: S.md, gap: 6 }}>
        <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>{c.name}</Text>
        <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={2}>{c.rules || c.description || 'Gruppo aperto a chi vuole unirsi.'}</Text>
        <Row gap={6}>
          <Ionicons name="people" size={14} color={color.textSecondary} />
          <Text style={[type.caption, { color: color.textSecondary, flex: 1 }]} numberOfLines={1}>{c.memberCount} {c.memberCount === 1 ? 'persona' : 'persone'}{c.area ? ` · ${c.area}` : ''}</Text>
        </Row>
        {c.reasons[0] ? <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill, backgroundColor: color.accentTint }}><Text style={[type.caption, { color: color.accent, fontWeight: '700' }]} numberOfLines={1}>{c.reasons[0]}</Text></View> : null}
      </View>
    </Pressable>
  );
}

function SuggestionSheet({ c, onClose, onJoined }: { c: ClubSuggestion | null; onClose: () => void; onJoined: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    if (!c) return;
    setBusy(true); setError('');
    try { await call('joinDiscoverableClub', c.id); onJoined(c.id); } catch (e) { setError(humanError(e, 'Non riesco a unirti al gruppo.')); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={!!c} onClose={onClose} title={c?.name ?? ''} footer={<><Button title="Unisciti al gruppo" iconName="add-circle-outline" busy={busy} onPress={() => void join()} />{error ? <Banner tone="error" text={error} /> : null}</>}>
      {c ? (
        <View style={{ gap: S.md }}>
          <Text style={t.muted}>{SPORT_LABEL[c.sport]}{c.area ? ` · ${c.area}` : ''} · {c.memberCount} {c.memberCount === 1 ? 'persona' : 'persone'}</Text>
          {c.description ? <Text style={t.body}>{c.description}</Text> : null}
          {c.rules ? <View style={{ gap: 4 }}><Text style={t.title}>Regole del gruppo</Text><Text style={t.body}>{c.rules}</Text></View> : null}
          {c.reasons.length ? <View style={{ gap: 4 }}><Text style={t.title}>Perché te lo suggeriamo</Text>{c.reasons.map((r) => <Row key={r} gap={6}><Ionicons name="checkmark-circle" size={16} color={color.accent} /><Text style={t.small}>{r}</Text></Row>)}</View> : null}
          {c.friends.length ? <Row gap={0}>{c.friends.map((u, i) => <View key={u.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar name={u.displayName} hue={u.hue} uri={u.avatar} size={30} frame="ring" ring={color.bg} /></View>)}</Row> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Persone e gruppi (ex scheda Community): i miei gruppi, quelli suggeriti, chi seguire. Vive in Esplora, dove si scoprono le cose nuove. */
export function GroupsPanel() {
  const mine = useLoad(() => call<ClubView[]>('listMyClubs'));
  const sugg = useLoad(() => call<ClubSuggestion[]>('suggestClubs', 12));
  const [open, setOpen] = useState<ClubSuggestion | null>(null);
  return (
    <View style={{ gap: S.xl }}>
      <Section title="I tuoi gruppi">
        <Row gap={8}>
          <IconButton name="key-outline" label="Entra con un codice invito" onPress={() => router.push('/club/entra')} />
          <IconButton name="add-circle-outline" label="Crea un gruppo" onPress={() => router.push('/club/form')} />
          <IconButton name="trophy-outline" label="Sfide del gruppo" onPress={() => router.push('/sfide')} />
        </Row>
        <Async state={mine} skeleton={<><Skeleton height={64} /><Skeleton height={64} /></>}>
          {(list) =>
            list.length ? (
              <View>
                {list.map((c, i) => (
                  <View key={c.id}>
                    {i ? <Divider inset={56} /> : null}
                    <ClubCard c={c} />
                  </View>
                ))}
              </View>
            ) : (
              <Empty iconName="people-outline" title="Ancora nessun gruppo" text="Scegline uno tra quelli suggeriti qui sotto, oppure entra con il codice che ti hanno dato." action={<Button title="Entra con un codice" iconName="key-outline" onPress={() => router.push('/club/entra')} />} />
            )
          }
        </Async>
      </Section>

      <Async state={sugg} skeleton={<Skeleton height={230} />}>
        {(list) =>
          list.length ? (
            <Section title="Gruppi per te">
              <Text style={t.small}>Scelti in base alla tua zona, al tuo sport e a chi segui. Tocca un gruppo per vedere le regole e unirti.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.xl }} contentContainerStyle={{ gap: S.md, paddingHorizontal: S.xl }}>
                {list.map((c) => <SuggestionCard key={c.id} c={c} onOpen={() => setOpen(c)} />)}
              </ScrollView>
            </Section>
          ) : null
        }
      </Async>
      <SuggestionSheet c={open} onClose={() => setOpen(null)} onJoined={(id) => { setOpen(null); void mine.reload(); void sugg.reload(); router.push({ pathname: '/club/[id]', params: { id } }); }} />

      <RunnerSuggestions />
    </View>
  );
}
