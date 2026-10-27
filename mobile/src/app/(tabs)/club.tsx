import { router } from 'expo-router';
import { View } from 'react-native';

import { ClubCard } from '@/components/cards';
import { Async, Button, Divider, Empty, IconButton, Skeleton, TabScreen, useLoad } from '@/components/ui';
import { call } from '@/lib/api';
import type { ClubView } from '@shared/types.ts';

export default function Club() {
  const state = useLoad(() => call<ClubView[]>('listMyClubs'));
  return (
    <TabScreen
      title="Club"
      onRefresh={state.reload}
      right={
        <>
          <IconButton name="key-outline" label="Entra con un codice invito" onPress={() => router.push('/club/entra')} />
          <IconButton name="add" label="Crea un club" onPress={() => router.push('/club/form')} />
        </>
      }>
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
            <Empty iconName="people-outline" title="Il tuo gruppo di corsa" text="I club su Runngo sono su invito: chiedi il codice a chi organizza, oppure crea il tuo con il + in alto." action={<Button title="Entra con un codice" iconName="key-outline" onPress={() => router.push('/club/entra')} />} />
          )
        }
      </Async>
    </TabScreen>
  );
}
