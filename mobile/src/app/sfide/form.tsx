import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, DateField, Field, Pills, Screen, t } from '@/components/ui';
import { call } from '@/lib/api';
import { deviceTimezone } from '@/lib/format';
import type { ChallengeType, ChallengeView } from '@shared/types.ts';
import { CHALLENGE_TYPE_LABEL as TYPE_LABEL } from '@/lib/format';

import { humanError } from '@/lib/errors';
export default function SfidaForm() {
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ChallengeType>('most_distance');
  const [starts, setStarts] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [ends, setEnds] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 0, 0);
    return d;
  });
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const needsGoal = type === 'collective_distance' || type === 'personal_goal';

  async function save() {
    setBusy(true);
    try {
      const goalKm = needsGoal && goal.trim() ? Number(goal.replace(',', '.')) : null;
      const c = await call<ChallengeView>(
        'createChallenge',
        { name: name.trim(), description: description.trim(), type, sport: 'running', startsAt: starts.toISOString(), endsAt: ends.toISOString(), timezone: deviceTimezone(), goalKm: type === 'collective_distance' ? goalKm : null, clubId: clubId ?? null },
        type === 'personal_goal' ? goalKm : null,
      );
      router.dismissTo({ pathname: '/sfide/[id]', params: { id: c.id } });
    } catch (e) {
      Alert.alert('Non creata', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Nuova sfida' }} />
      <Field label="Nome" value={name} onChangeText={setName} maxLength={60} />
      <Field label="Descrizione" value={description} onChangeText={setDescription} multiline optional />
      <Text style={t.title}>Tipo</Text>
      <Pills value={type} onChange={setType} options={(Object.keys(TYPE_LABEL) as ChallengeType[]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
      {needsGoal ? <Field label={type === 'personal_goal' ? 'Il tuo obiettivo (km)' : 'Obiettivo del gruppo (km)'} value={goal} onChangeText={setGoal} keyboardType="decimal-pad" /> : null}
      <DateField label="Inizio" value={starts} onChange={setStarts} mode="date" />
      <DateField label="Fine" value={ends} onChange={setEnds} mode="date" />
      <Button title="Crea sfida" onPress={save} busy={busy} disabled={!name.trim() || (needsGoal && !goal.trim())} />
    </Screen>
  );
}
