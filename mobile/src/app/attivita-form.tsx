import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { Alert, Text, View } from 'react-native';

import { SportChips } from '@/components/SportChips';
import { Button, DateField, Field, Loading, Row, Screen, SwitchRow, t } from '@/components/ui';
import { call } from '@/lib/api';
import type { ActivityView, SportId } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export default function AttivitaForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(!id);
  const [title, setTitle] = useState('');
  const [sport, setSport] = useState<SportId>('running');
  const [date, setDate] = useState(new Date());
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [note, setNote] = useState('');
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const { me } = useSession();
  // Precompilato: lo sport principale del profilo (solo su una nuova attività).
  useEffect(() => { if (!id && me?.sports[0]) setSport(me.sports[0]); }, [id, me]);

  useEffect(() => {
    if (!id) return;
    call<ActivityView[]>('listActivities', null, 200).then((l) => {
      const a = l.find((x) => x.id === id);
      if (a) {
        setTitle(a.title);
        setSport(a.sport);
        setDate(new Date(a.date));
        setKm(a.distanceKm != null ? String(a.distanceKm) : '');
        setMin(a.durationMin != null ? String(a.durationMin) : '');
        setNote(a.note);
        setShared(a.visibility === 'shared');
      }
      setReady(true);
    });
  }, [id]);

  async function save() {
    const input = { title: title.trim(), date: date.toISOString(), dayOnly: false, sport, distanceKm: km.trim() ? Number(km.replace(',', '.')) : null, durationMin: min.trim() ? Number(min.replace(',', '.')) : null, note: note.trim() };
    setBusy(true);
    try {
      if (id) await call('updateActivity', id, { ...input, visibility: shared ? 'shared' : 'private' });
      else {
        const a = await call<{ id: string }>('logActivity', input);
        if (!shared) await call('setActivityVisibility', a.id, 'private');
      }
      router.back();
    } catch (e) {
      Alert.alert('Non salvata', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Modifica attività' : 'Nuova attività' }} />
      <Field label="Titolo" value={title} onChangeText={setTitle} optional placeholder="es. Giro del parco" />
      <SportChips label="Tipo di attività" value={sport} onChange={setSport} />
      <DateField label="Quando" value={date} onChange={setDate} />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Distanza (km)" value={km} onChangeText={setKm} keyboardType="decimal-pad" optional />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Durata (min)" value={min} onChangeText={setMin} keyboardType="decimal-pad" optional />
        </View>
      </Row>
      <Field label="Note" value={note} onChangeText={setNote} multiline optional />
      <SwitchRow label="Conta per sfide, classifiche e feed" hint="Se la disattivi resta solo tua." value={shared} onChange={setShared} />
      <Text style={t.small}>Distanza e durata sono dichiarate da te: l’app non le stima.</Text>
      <Button title="Salva" onPress={save} busy={busy} />
    </Screen>
  );
}
