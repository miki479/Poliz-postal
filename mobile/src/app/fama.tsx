import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { AnimatedBar } from '@/components/Motion';
import { Async, Banner, Divider, LinkText, Metric, Row, Screen, Section, Skeleton, t, useLoad } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { call } from '@/lib/api';
import type { FameView } from '@shared/fame.ts';

/** Fama Runngo: tre binari separati e privati. Agli altri arrivano solo le qualità consolidate. */
export default function Fama() {
  const state = useLoad(() => call<FameView>('getFame', null));
  return (
    <Screen onRefresh={state.reload} glow="brand">
      <Stack.Screen options={{ title: 'La tua Fama' }} />
      <Async state={state} skeleton={<Skeleton height={200} />}>
        {(f) => (
          <>
            <Text style={t.muted}>La Fama racconta cosa rendi possibile quando corri con gli altri. Non scende se ti fermi, in vacanza o in pausa, e non usa dati di salute.</Text>

            <Section title="Come ti vedono gli altri">
              {f.qualities.length ? (
                f.qualities.map((q) => (
                  <Row key={q.category} style={{ alignItems: 'flex-start' }}>
                    <Ionicons name="sparkles" size={20} color={color.brandText} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={t.title}>{q.label}</Text>
                      <Text style={t.muted}>{q.description}</Text>
                    </View>
                  </Row>
                ))
              ) : (
                <Text style={t.muted}>Una qualità compare sul profilo quando te la riconoscono almeno 3 persone diverse in almeno 2 uscite.</Text>
              )}
              {f.hidden ? <Banner text="Hai scelto di non mostrare le qualità sul profilo." /> : null}
              <LinkText title={f.hidden ? 'Mostrale sul profilo' : 'Nascondile dal profilo'} onPress={() => router.push('/profilo-modifica')} />
            </Section>

            {f.tracks ? (
              <>
                <Section title="Popolarità · solo per te">
                  <Row gap={0}>
                    <Metric value={String(f.tracks.popularity.received)} label="Riconoscimenti" />
                    <Metric value={String(f.tracks.popularity.people)} label="Persone diverse" />
                  </Row>
                  {f.tracks.popularity.byCategory.map((c, i) => (
                    <View key={c.category} style={{ gap: 4 }}>
                      {i ? <Divider /> : null}
                      <Row style={{ justifyContent: 'space-between', marginTop: S.sm }}>
                        <Text style={t.body}>{c.label}</Text>
                        <Text style={t.small}>
                          {c.count} da {c.people} {c.people === 1 ? 'persona' : 'persone'}
                        </Text>
                      </Row>
                      <AnimatedBar pct={Math.min(1, c.people / 3)} tint={color.brand} delay={i * 80} />
                    </View>
                  ))}
                </Section>
                <Section title="Contributo">
                  <Row gap={0}>
                    <Metric value={String(f.tracks.contribution.organizedHeld)} label="Uscite organizzate" />
                    <Metric value={String(f.tracks.contribution.groupRuns)} label="Uscite di gruppo" />
                    <Metric value={String(f.tracks.contribution.clubs)} label="Club" />
                  </Row>
                </Section>
                <Section title="Sport">
                  <Row gap={0}>
                    <Metric value={String(f.tracks.sport.activities)} label="Attività" />
                    <Metric value={String(f.tracks.sport.km).replace('.', ',')} unit="km" label="Distanza" />
                    <Metric value={String(f.tracks.sport.bestStreakWeeks)} label="Settimane di fila" />
                  </Row>
                </Section>
                <Text style={t.small}>I tre binari restano separati: essere forti in uno non fa salire gli altri. Nessuna classifica globale delle persone.</Text>
              </>
            ) : null}
          </>
        )}
      </Async>
    </Screen>
  );
}
