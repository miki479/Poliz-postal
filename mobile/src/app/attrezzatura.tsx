import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Async, Banner, Button, Empty, Field, Panel, Pills, Row, Screen, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { S } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { fmtKm } from '@/lib/format';
import { GEAR_SPORT_LABEL, type GearInput, type GearSport, type GearView } from '@shared/gear.ts';

const SPORTS: Array<{ value: GearSport; label: string }> = [{ value: 'running', label: 'Corsa' }, { value: 'walking', label: 'Camminata' }, { value: 'trail', label: 'Trail' }];

export default function Attrezzatura() {
  const state = useLoad(() => call<GearView[]>('listGear'));
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sport, setSport] = useState<GearSport>('running');
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function edit(gear: GearView | null) {
    setId(gear?.id ?? null); setName(gear?.name ?? ''); setSport(gear?.sport ?? 'running');
    setKm(gear?.initialKm == null ? '' : String(gear.initialKm).replace('.', ',')); setError(''); setOpen(true);
  }
  async function save() {
    if (busy) return;
    const initialKm = km.trim() ? Number(km.trim().replace(',', '.')) : null;
    if (initialKm != null && (!Number.isFinite(initialKm) || initialKm < 0)) return setError('Scrivi i chilometri iniziali, oppure lascia il campo vuoto.');
    setBusy(true); setError('');
    try {
      const input: GearInput = { name, sport, initialKm };
      await call('saveGear', input, id);
      setOpen(false); await state.reload();
    } catch (e) { setError(humanError(e, 'Non riesco a salvare l’attrezzatura. Riprova.')); }
    finally { setBusy(false); }
  }
  async function retire(gear: GearView) {
    if (busy) return; setBusy(true);
    try { await call('setGearRetired', gear.id, !gear.retired); await state.reload(); }
    catch (e) { Alert.alert('Non modificata', humanError(e, 'Non riesco ad aggiornare l’attrezzatura. Riprova.')); }
    finally { setBusy(false); }
  }
  return <Screen onRefresh={state.reload} style={{ gap: S.lg }}>
    <Stack.Screen options={{ title: 'La tua attrezzatura' }} />
    <Text style={t.muted}>Aggiungi le tue scarpe o l’attrezzatura che usi. Associala alle attività registrate in Runngo dal dettaglio o prima di registrare.</Text>
    <Button title="Aggiungi attrezzatura" iconName="add" onPress={() => edit(null)} />
    <Async state={state} skeleton={<Skeleton height={180} />}>
      {(gears) => gears.length ? <View style={{ gap: S.md }}>{gears.map((gear) => <Panel key={gear.id} style={{ padding: S.lg, gap: S.md }}>
        <View style={{ gap: S.xs }}><Text style={t.h2}>{gear.name}</Text><Text style={t.small}>{GEAR_SPORT_LABEL[gear.sport]}{gear.retired ? ' · A riposo' : ''}</Text></View>
        <Text style={t.body}>{fmtKm(gear.usedKm)} registrati in Runngo · {gear.activities} {gear.activities === 1 ? 'attività associata' : 'attività associate'}</Text>
        {gear.totalKm != null ? <Text style={t.body}>Totale: {fmtKm(gear.totalKm)} <Text style={t.small}>(include {fmtKm(gear.initialKm!)} iniziali dichiarati)</Text></Text> : <Text style={t.small}>{gear.initialKm == null ? 'Chilometraggio iniziale non dichiarato: il totale precedente a Runngo resta sconosciuto.' : 'Il totale non è disponibile: alcune attività associate non hanno una distanza.'}</Text>}
        {gear.missingDistanceActivities > 0 ? <Text style={t.small}>{gear.missingDistanceActivities} {gear.missingDistanceActivities === 1 ? 'attività senza distanza non aggiunge' : 'attività senza distanza non aggiungono'} chilometri al conteggio disponibile.</Text> : null}
        <Row gap={S.sm}><Button title="Modifica" variant="soft" small onPress={() => edit(gear)} disabled={busy} style={{ flex: 1 }} /><Button title={gear.retired ? 'Riattiva' : 'Metti a riposo'} variant="soft" small onPress={() => void retire(gear)} disabled={busy} style={{ flex: 1 }} /></Row>
      </Panel>)}</View> : <Empty iconName="footsteps-outline" title="La tua attrezzatura" text="Non hai ancora aggiunto niente. Il chilometraggio viene dalle attività che scegli di associare." />}
    </Async>
    <Text style={t.small}>Runngo non stima usura, scadenze o soglie di sostituzione dalle scarpe.</Text>
    <Sheet avoidKeyboard title={id ? 'Modifica attrezzatura' : 'Aggiungi attrezzatura'} visible={open} onClose={() => { if (!busy) setOpen(false); }} footer={<Button title="Salva attrezzatura" onPress={() => void save()} busy={busy} />}>
      <Field label="Nome" value={name} onChangeText={setName} placeholder="Il nome delle tue scarpe" maxLength={80} />
      <View style={{ gap: S.sm }}><Text style={t.title}>Uso principale</Text><Pills options={SPORTS} value={sport} onChange={setSport} /></View>
      <Field label="Chilometri iniziali già percorsi" optional value={km} onChangeText={setKm} keyboardType="decimal-pad" hint="Solo se li conosci. Lascia vuoto per non attribuire un chilometraggio precedente." />
      {error ? <Banner tone="error" text={error} /> : null}
    </Sheet>
  </Screen>;
}
