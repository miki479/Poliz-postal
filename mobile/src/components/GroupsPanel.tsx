import { router } from 'expo-router';
import { View } from 'react-native';

import { RunnerSuggestions } from '@/components/CommunityStream';
import { ClubCard } from '@/components/cards';
import { Async, Button, Divider, Empty, Row, Section, Skeleton, useLoad } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { call } from '@/lib/api';
import type { ClubView } from '@shared/types.ts';

/** Persone e gruppi (ex scheda Community): i miei gruppi, chi seguire, sfide. Vive in Esplora, dove si scoprono le cose nuove. */
export function GroupsPanel() {
  const state = useLoad(() => call<ClubView[]>('listMyClubs'));
  return (
    <View style={{ gap: S_GAP }}>
      <Section title="I tuoi gruppi" action="Sfide" onAction={() => router.push('/sfide')}>
        <Row gap={8}>
          <IconButton name="key-outline" label="Entra con un codice invito" onPress={() => router.push('/club/entra')} />
          <IconButton name="add-circle-outline" label="Crea un gruppo" onPress={() => router.push('/club/form')} />
        </Row>
        <Async state={state} skeleton={<><Skeleton height={64} /><Skeleton height={64} /></>}>
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
              <Empty iconName="people-outline" title="Il tuo gruppo di corsa" text="I gruppi su Runngo sono su invito: chiedi il codice a chi organizza, oppure creane uno con il + qui sopra." action={<Button title="Entra con un codice" iconName="key-outline" onPress={() => router.push('/club/entra')} />} />
            )
          }
        </Async>
      </Section>
      <RunnerSuggestions />
    </View>
  );
}
const S_GAP = 20;
