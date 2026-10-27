import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, DateField, Field, Loading, Pills, Row, Screen, t } from '@/components/ui';
import { call } from '@/lib/api';
import { formatPace, KIND_LABEL, parsePace, toISODate } from '@/lib/format';
import type { Intensity, PlannedSession, SessionInput, SessionKind } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
const KINDS: SessionKind[] = ['run_easy', 'run_continuous', 'run_intervals', 'run_long', 'run_walk', 'run_free', 'strength', 'aerobic', 'mobility', 'recovery_active', 'rest'];

export default function SessioneForm() {
  const { id, date: dateParam } = useLocalSearchParams<{ id?: string; date?: string }>();
  const [ready, setReady] = useState(!id);
  const [planId, setPlanId] = useState<string | null>(null);
  const [day, setDay] = useState(() => (dateParam ? new Date(dateParam + 'T12:00:00') : new Date()));
  const [kind, setKind] = useState<SessionKind>('run_easy');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [min, setMin] = useState('30');
  const [km, setKm] = useState('');
  const [pace, setPace] = useState('');
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<PlannedSession | null>(null);

  useEffect(() => {
    if (!id) return;
    call<PlannedSession>('getSession', id).then((s) => {
      setPrev(s);
      setPlanId(s.planId);
      setDay(new Date(s.date + 'T12:00:00'));
      setKind(s.kind);
      setTitle(s.title);
      setDescription(s.description);
      setMin(String(s.durationMin));
      setKm(s.distanceKm ? String(s.distanceKm) : '');
      setPace(s.paceSecPerKm ? formatPace(s.paceSecPerKm) : '');
      setIntensity(s.intensity);
      setNotes(s.notes);
      setReady(true);
    });
  }, [id]);

  async function save() {
    const input: SessionInput = {
      planId,
      date: toISODate(day),
      time: prev?.time ?? null,
      kind,
      title: title.trim(),
      description: description.trim(),
      durationMin: Number(min.replace(',', '.')) || 0,
      distanceKm: km.trim() ? Number(km.replace(',', '.')) : null,
      intensity,
      paceSecPerKm: pace.trim() ? parsePace(pace) : null,
      warmupMin: prev?.warmupMin ?? 0,
      cooldownMin: prev?.cooldownMin ?? 0,
      segments: prev?.segments ?? [],
      exercises: prev?.exercises ?? [],
      notes: notes.trim(),
    };
    setBusy(true);
    try {
      if (id) await call('updateSession', id, input);
      else await call('createSession', input);
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
      <Stack.Screen options={{ title: id ? 'Modifica sessione' : 'Nuova sessione' }} />
      <DateField label="Giorno" value={day} onChange={setDay} mode="date" />
      <Text style={t.title}>Tipo</Text>
      <Pills value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      <Field label="Titolo" value={title} onChangeText={setTitle} optional />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Durata (min)" value={min} onChangeText={setMin} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Km" value={km} onChangeText={setKm} keyboardType="decimal-pad" optional />
        </View>
      </Row>
      <Field label="Passo (min/km)" value={pace} onChangeText={setPace} placeholder="6:00" optional />
      <Text style={t.title}>Intensità</Text>
      <Pills value={intensity ?? 'none'} onChange={(v: string) => setIntensity(v === 'none' ? null : (v as Intensity))} options={[{ value: 'none', label: '—' }, { value: 'low', label: 'Bassa' }, { value: 'moderate', label: 'Media' }, { value: 'high', label: 'Alta' }]} />
      <Field label="Descrizione" value={description} onChangeText={setDescription} multiline optional />
      <Field label="Note" value={notes} onChangeText={setNotes} multiline optional />
      <Button title="Salva" onPress={save} busy={busy} />
    </Screen>
  );
}
