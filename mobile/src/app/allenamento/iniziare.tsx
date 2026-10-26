import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Banner, Button, DateField, Panel, Pills, Screen, Section, t, useLoad } from '@/components/ui';
import { color, S } from '@/constants/theme';
import { humanError } from '@/lib/errors';
import { call } from '@/lib/api';
import { addDaysIso, fmtClock, toISODate } from '@/lib/format';
import { BEGINNER_SOURCE, beginnerRun } from '@shared/beginnerRunning.ts';
import type { WorkoutLog } from '@shared/types.ts';
export default function Iniziare() {
  const [week, setWeek] = useState(1);
  const [run, setRun] = useState(1);
  const [start, setStart] = useState(() => {
    const d = new Date();
    return new Date(addDaysIso(toISODate(d), (8 - d.getDay()) % 7) + 'T12:00:00');
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const schedule = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await call('createBeginnerPlan', toISODate(start));
      router.push('/allenamento');
    } catch (e) {
      setError(humanError(e, 'Non riesco ad aggiungere il programma. Riprova.'));
    } finally {
      setBusy(false);
    }
  };
  const logs = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null));
  const session = beginnerRun(week, run);
  const history = (logs.data ?? []).filter((l) => l.guidedWorkoutId === session.id);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Inizia a correre' }} />
      <Text style={t.h1}>Dalla camminata alla corsa</Text>
      <Text style={t.muted}>
        27 allenamenti in 9 settimane dal programma pubblico NHS Couch to 5K. Tre uscite a settimana con almeno un giorno di riposo fra gli
        allenamenti. Puoi ripetere una settimana: nessuna progressione obbligatoria.
      </Text>
      <Button small title="Leggi il programma NHS originale" onPress={() => void Linking.openURL(BEGINNER_SOURCE.url)} />
      <Pills
        scroll
        value={week}
        onChange={setWeek}
        options={Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: `Settimana ${i + 1}` }))}
      />
      <Pills value={run} onChange={setRun} options={[1, 2, 3].map((n) => ({ value: n, label: `Allenamento ${n}` }))} />
      <Panel style={{ padding: S.lg, gap: S.md }}>
        <Text style={[t.title, { color: color.brandText }]}>{session.title}</Text>
        <Text style={t.body}>{fmtClock(session.durationSec)} totali · passo libero, senza obiettivo di distanza</Text>
        <Text style={t.small}>Alla fine del programma la corsa continua prevista è di 30 minuti: non è una promessa di coprire 5 km.</Text>
        {history.length ? (
          <Text style={t.small}>
            {history.length} registrazioni associate a questo allenamento. Ultima: {fmtClock(history[0].durationSec)} di tempo registrato.
          </Text>
        ) : null}
        <Button title="Inizia l’allenamento guidato" onPress={() => router.push({ pathname: '/registra', params: { guided: session.id } })} />
      </Panel>
      <Panel style={{ padding: S.lg, gap: S.md }}>
        <Text style={t.title}>Metti le nove settimane nel tuo piano</Text>
        <Text style={t.small}>
          27 allenamenti di lunedì, mercoledì e venerdì. Un eventuale piano già presente resta al suo posto: controlla il recupero se li
          affianchi.
        </Text>
        <DateField label="Lunedì di inizio" mode="date" value={start} onChange={setStart} />
        {error ? <Banner tone="error" text={error} /> : null}
        <Button variant="soft" title="Aggiungi il programma al piano" busy={busy} onPress={() => void schedule()} />
      </Panel>
      <Section title="Le fasi">
        {session.segments.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: S.md }}>
            <Text style={[t.body, { flex: 1 }]}>
              {i + 1}. {s.label}
            </Text>
            <Text style={t.muted}>{fmtClock(s.durationSec)}</Text>
          </View>
        ))}
      </Section>
      <Banner text="Corri a un passo comodo. Se compare dolore o malessere, fermati. Se hai dubbi sulla tua salute, chiedi consiglio al medico prima di iniziare." />
    </Screen>
  );
}
