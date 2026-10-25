import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Field, Loading, Muted, Pills, Screen, t } from '@/components/ui';
import { call, ext, health, type GeoPlace } from '@/lib/api';
import type { LatLng, RouteInput, RouteView, RouteVisibility } from '@shared/types.ts';

import { humanError } from '@/lib/errors';
export default function PercorsoForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(!id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startName, setStartName] = useState('');
  const [endName, setEndName] = useState('');
  const [area, setArea] = useState('');
  const [km, setKm] = useState('');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<RouteVisibility>('private');
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);
  const [geometry, setGeometry] = useState<LatLng[] | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [source, setSource] = useState<'manual' | 'routing' | null>(null);
  const [geo, setGeo] = useState(false);
  const [routing, setRouting] = useState(false);
  const [hits, setHits] = useState<GeoPlace[]>([]);
  const [target, setTarget] = useState<'start' | 'end'>('start');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    health().then((h) => {
      setGeo(!!h?.features.geocoding);
      setRouting(!!h?.features.routing);
    });
    if (!id) return;
    call<RouteView>('getRoute', id, null).then((r) => {
      setName(r.name);
      setDescription(r.description);
      setStartName(r.startName);
      setEndName(r.endName);
      setArea(r.area);
      setKm(r.distanceKm != null ? String(r.distanceKm) : '');
      setNotes(r.notes);
      setVisibility(r.visibility);
      setStart(r.start);
      setEnd(r.end);
      setGeometry(r.geometry);
      setProvider(r.geometryProvider);
      setSource(r.distanceSource);
      setReady(true);
    });
  }, [id]);

  async function search(which: 'start' | 'end', q: string) {
    setTarget(which);
    (which === 'start' ? setStartName : setEndName)(q);
    if (!geo || q.trim().length < 3) return setHits([]);
    try {
      setHits((await ext.geo.search(q)).results);
    } catch {
      setHits([]);
    }
  }

  function pick(p: GeoPlace) {
    if (target === 'start') {
      setStart({ lat: p.lat, lng: p.lng });
      setStartName(p.name);
    } else {
      setEnd({ lat: p.lat, lng: p.lng });
      setEndName(p.name);
    }
    setHits([]);
  }

  async function trace() {
    if (!start || !end) return;
    setBusy(true);
    try {
      const r = await ext.geo.route([start, end]);
      setGeometry(r.geometry);
      setProvider(r.provider);
      setSource('routing');
      setKm(String(r.distanceKm));
    } catch (e) {
      Alert.alert('Tracciato non disponibile', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const input: RouteInput = {
      name: name.trim(),
      description: description.trim(),
      startName: startName.trim(),
      endName: endName.trim(),
      area: area.trim(),
      distanceKm: km.trim() ? Number(km.replace(',', '.')) : null,
      distanceSource: source === 'routing' ? 'routing' : km.trim() ? 'manual' : null,
      notes: notes.trim(),
      start,
      end,
      geometry,
      geometryProvider: provider,
      visibility,
    };
    setBusy(true);
    try {
      const r = id ? await call<RouteView>('updateRoute', id, input) : await call<RouteView>('createRoute', input);
      router.dismissTo({ pathname: '/percorsi/[id]', params: { id: r.id } });
    } catch (e) {
      Alert.alert('Non salvato', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Modifica percorso' : 'Nuovo percorso' }} />
      <Field label="Nome" value={name} onChangeText={setName} maxLength={80} />
      <Field label="Partenza" value={startName} onChangeText={(v) => search('start', v)} />
      <Field label="Arrivo" value={endName} onChangeText={(v) => search('end', v)} optional hint="Lascia vuoto per un anello." />
      {hits.map((h) => (
        <Button key={`${h.lat},${h.lng}`} small variant="soft" title={h.name} onPress={() => pick(h)} />
      ))}
      {geo && routing && start && end ? <Button variant="soft" title="Traccia il percorso sulla mappa" onPress={trace} busy={busy} /> : null}
      {!geo ? <Muted>La ricerca dei luoghi non è attiva sul server: partenza e arrivo restano testo libero.</Muted> : null}
      <Field label="Distanza (km)" value={km} onChangeText={(v) => { setKm(v); if (source === 'routing') setSource('manual'); }} keyboardType="decimal-pad" optional hint={source === 'routing' ? 'Calcolata dal servizio di percorsi.' : 'La inserisci tu: non viene stimata.'} />
      <Field label="Zona" value={area} onChangeText={setArea} optional />
      <Field label="Descrizione" value={description} onChangeText={setDescription} multiline optional />
      <Field label="Note" value={notes} onChangeText={setNotes} multiline optional />
      <Text style={t.title}>Chi può vederlo</Text>
      <Pills value={visibility} onChange={setVisibility} options={[{ value: 'private', label: 'Privato' }, { value: 'link', label: 'Con link' }, { value: 'public', label: 'Pubblico' }]} />
      <Button title={id ? 'Salva modifiche' : 'Salva percorso'} onPress={save} busy={busy} disabled={!name.trim() || !startName.trim()} />
    </Screen>
  );
}
