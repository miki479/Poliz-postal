import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { SportChips } from '@/components/SportChips';
import { Button, Field, Screen, SwitchRow } from '@/components/ui';
import { call } from '@/lib/api';
import type { ClubView, SportId } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export default function ClubForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState('');
  const [sport, setSport] = useState<SportId>('running');
  const [rules, setRules] = useState('');
  const [discoverable, setDiscoverable] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const c = await call<ClubView>('createClub', { name: name.trim(), description: description.trim(), sport, area: area.trim(), imageDataUrl: null, rules: rules.trim(), discoverable });
      router.dismissTo({ pathname: '/club/[id]', params: { id: c.id } });
    } catch (e) {
      Alert.alert('Non creato', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Nuovo club' }} />
      <Field label="Nome del club" value={name} onChangeText={setName} maxLength={60} />
      <Field label="Descrizione" value={description} onChangeText={setDescription} multiline optional />
      <Field label="Zona" value={area} onChangeText={setArea} optional placeholder="es. Forlì" />
      <Field label="Regole del gruppo" value={rules} onChangeText={setRules} multiline optional placeholder="es. Passo 5:30, puntualità, nessuno resta indietro" maxLength={300} />
      <SwitchRow label="Visibile in Esplora: chi vuole può unirsi" value={discoverable} onChange={setDiscoverable} />
      <SportChips label="Sport" value={sport} onChange={setSport} />
      <Button title="Crea club" onPress={save} busy={busy} disabled={!name.trim()} />
    </Screen>
  );
}
