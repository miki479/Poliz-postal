import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, Field, Muted, Screen } from '@/components/ui';
import { Text } from 'react-native';
import { call } from '@/lib/api';
import type { ClubView } from '@shared/types.ts';
import { t } from '@/components/ui';

import { humanError } from '@/lib/errors';
export default function ClubEntra() {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<ClubView | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    setBusy(true);
    try {
      setPreview(await call<ClubView>('clubByCode', code.trim().toUpperCase()));
    } catch (e) {
      setPreview(null);
      Alert.alert('Codice non valido', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    try {
      const c = await call<ClubView>('joinClub', code.trim().toUpperCase());
      router.dismissTo({ pathname: '/club/[id]', params: { id: c.id } });
    } catch (e) {
      Alert.alert('Non riuscito', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Entra con un codice' }} />
      <Field label="Codice invito" value={code} onChangeText={(v) => { setCode(v); setPreview(null); }} autoCapitalize="characters" autoCorrect={false} />
      {!preview ? (
        <Button title="Cerca club" onPress={find} busy={busy} disabled={code.trim().length < 3} />
      ) : (
        <>
          <Card>
            <Text style={t.title}>{preview.name}</Text>
            <Muted>
              {preview.memberCount} membri{preview.area ? ` · ${preview.area}` : ''}
            </Muted>
            {preview.description ? <Text style={t.body}>{preview.description}</Text> : null}
          </Card>
          <Button title="Entra nel club" onPress={join} busy={busy} />
        </>
      )}
    </Screen>
  );
}
