import { LinkWorkoutSheet } from '@/components/LinkWorkout';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Async, Banner, Button, Card, Chip, Field, Muted, Pills, Row, Screen, Section, SwitchRow, t, useLoad } from '@/components/ui';
import { call } from '@/lib/api';
import { deviceTimezone, fmtDate, fmtClock, fmtDuration, fmtPace, KIND_LABEL } from '@/lib/format';
import type { PlannedSession } from '@shared/types.ts';

import { SkipWorkoutSheet } from '@/components/SkipWorkout';
import { SKIP_REASONS } from '@shared/skipReasons.ts';
import { color } from '@/constants/theme';
import { styleOfKind } from '@/constants/activityColors';
import { LinearGradient } from 'expo-linear-gradient';
import { humanError } from '@/lib/errors';
const SEG: Record<string, string> = { warmup: 'Riscaldamento', run: 'Corsa', walk: 'Camminata', work: 'Lavoro', recovery: 'Recupero', cooldown: 'Defaticamento' };

function Complete({ s, onDone }: { s: PlannedSession; onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [sec, setSec] = useState(0);
  const startedAt = useRef<Date | null>(null);
  const [km, setKm] = useState('');
  const [min, setMin] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, [running]);

  function toggle() {
    if (running) {
      setRunning(false);
      setMin(String(Math.max(1, Math.round(sec / 60))));
    } else {
      startedAt.current ??= new Date();
      setRunning(true);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const durationSec = sec > 0 && !min ? sec : Math.round(Number(min.replace(',', '.')) * 60);
      await call('completeSession', s.id, {
        kind: s.kind,
        title: s.title,
        startedAt: (startedAt.current ?? new Date(Date.now() - durationSec * 1000)).toISOString(),
        durationSec,
        distanceKm: km.trim() ? Number(km.replace(',', '.')) : null,
        rpe,
        difficulties: '',
        notes: notes.trim(),
        sets: [],
        mode: sec > 0 ? 'timer' : 'manual',
        shared,
        timezone: deviceTimezone(),
      });
      onDone();
    } catch (e) {
      Alert.alert('Non salvato', humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={t.title}>Registra il risultato</Text>
      <Text style={{ color: color.text, fontSize: 32, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{fmtClock(sec)}</Text>
      <Button variant="soft" title={running ? 'Ferma' : sec ? 'Riprendi' : 'Avvia cronometro'} onPress={toggle} />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="Minuti" value={min} onChangeText={setMin} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Km" value={km} onChangeText={setKm} keyboardType="decimal-pad" optional />
        </View>
      </Row>
      <Text style={t.title}>Fatica percepita (1–10)</Text>
      <Pills scroll value={rpe} onChange={setRpe} options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
      <Field label="Note" value={notes} onChangeText={setNotes} multiline optional />
      <SwitchRow label="Condividi con i compagni di club" value={shared} onChange={setShared} />
      <Button title="Salva come fatta" onPress={save} busy={busy} disabled={!min.trim() && sec === 0} />
    </Card>
  );
}

export default function Sessione() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [link,setLink]=useState(false);
  const [skip,setSkip]=useState<PlannedSession|null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const state = useLoad(() => call<PlannedSession>('getSession', id), [id]);

  async function act(fn: () => Promise<unknown>, back = false) {
    try {
      await fn();
      if (back) router.back();
      else await state.reload();
    } catch (e) {
      Alert.alert('Non riuscito', humanError(e, 'Errore.'));
    }
  }

  return (
    <Screen onRefresh={state.reload} footer={state.data&&(state.data.status==='planned'||state.data.status==='rescheduled')?<Button title="Registra l’allenamento" onPress={()=>router.push({pathname:'/registra',params:{session:state.data!.id}})}/>:undefined}>
      <Async state={state}>
        {(s) => (
          <>
            <Stack.Screen options={{ title: 'Allenamento' }} />
            <LinearGradient colors={[styleOfKind(s.kind,s.title).tint,color.bg]} style={{padding:24,borderRadius:24,gap:16}}>
              <Text style={t.small}>{fmtDate(s.date+'T12:00:00Z').toUpperCase()}</Text><Text style={[t.h1, { fontSize: 28,lineHeight:34 }]}>{s.title || KIND_LABEL[s.kind]}</Text>
              <Muted>
                {KIND_LABEL[s.kind]}{s.time ? ` · ${s.time}` : ''}
              </Muted>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {s.durationMin ? <Chip label={fmtDuration(s.durationMin)} tone="accent" /> : null}
                {s.distanceKm ? <Chip label={`${s.distanceKm} km`} /> : null}
                {s.paceSecPerKm ? <Chip label={fmtPace(s.paceSecPerKm)} /> : null}
                {s.intensity ? <Chip label={{ low: 'Intensità bassa', moderate: 'Intensità media', high: 'Intensità alta' }[s.intensity]} /> : null}
                <Chip label={({ planned: 'Da fare', completed: 'Completato', skipped: 'Saltato', rescheduled: 'Spostato', paused: 'In pausa' } as const)[s.status]} tone={s.status === 'completed' ? 'success' : 'default'} />
              </Row>
              {s.description ? <Text style={t.body}>{s.description}</Text> : null}
              {s.skipReason?<Text style={t.muted}>{SKIP_REASONS[s.skipReason]}</Text>:null}
            </LinearGradient>

            {s.segments.length ? (
              <Section title="Struttura">
                <Card>
                  {s.segments.map((g, i) => (
                    <Text key={i} style={t.body}>
                      {g.reps > 1 ? `${g.reps} × ` : ''}
                      {g.label || SEG[g.kind]} · {fmtDuration(g.durationSec / 60)}
                    </Text>
                  ))}
                </Card>
              </Section>
            ) : null}

            {s.exercises.length ? (
              <Section title="Esercizi">
                <Card>
                  {s.exercises.map((x, i) => (
                    <Text key={i} style={t.body}>
                      {x.name} · {x.sets}×{x.reps}
                      {x.loadKg ? ` · ${x.loadKg} kg` : ''} · rec. {x.restSec}s
                    </Text>
                  ))}
                </Card>
              </Section>
            ) : null}

            {s.notes ? <Banner text={s.notes} /> : null}
            {s.manualDone ? <><Banner text="Segnata come fatta da te. Nessuna attività registrata: il briefing non può verificare come sia andata." /><Button variant="soft" title="Togli la spunta" onPress={() => act(() => call('markSessionDone', s.id, false))} /></> : null}
            {s.logId ? <Button variant="soft" title="Vedi attività collegata" onPress={() => router.push({ pathname: '/allenamento/log/[id]', params: { id: s.logId! } })} /> : null}

            {s.status === 'planned' || s.status === 'rescheduled' ? (
              <>
                <Button variant="soft" title="Collega attività" onPress={()=>setLink(true)}/>
                <Button variant="soft" title="Salta l’allenamento" onPress={() => setSkip(s)} />
                {showComplete ? <Complete s={s} onDone={() => router.back()} /> : null}
              </>
            ) : s.status === 'skipped' ? (
              <Button variant="soft" title="Rimetti in programma" onPress={() => act(() => call('skipSession', s.id, false))} />
            ) : null}
            <Button small title="Altre opzioni" onPress={() => setShowOptions(!showOptions)} />
            {showOptions ? <>
              <Button variant="soft" title="Modifica allenamento" onPress={()=>router.push({pathname:'/allenamento/sessione-form',params:{id:s.id}})}/>
              {s.status==='planned'||s.status==='rescheduled'?<Button variant="soft" title="Inserisci risultato manualmente" onPress={()=>{setShowComplete(true);setShowOptions(false);}}/>:null}
              <Button variant="danger" title="Elimina allenamento" onPress={() => Alert.alert('Eliminare l’allenamento?', undefined, [{ text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: () => act(() => call('deleteSession', s.id), true) }])} />
            </> : null}
            <LinkWorkoutSheet sessionId={link?s.id:null} onClose={()=>setLink(false)} onSaved={()=>void state.reload()}/>
            <SkipWorkoutSheet session={skip} onClose={()=>setSkip(null)} onSaved={()=>void state.reload()}/>
          </>
        )}
      </Async>
    </Screen>
  );
}
