import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Async, Banner, Button, Card, Field, Muted, Pills, Screen, SwitchRow, t, useLoad } from '@/components/ui';
import { ext, type AiAnswer } from '@/lib/api';

import { humanError } from '@/lib/errors';
const PRESETS = [
  { value: 'week_plan', label: 'Settimana di corsa' },
  { value: 'three_easy_runs', label: '3 uscite tranquille' },
  { value: 'event_description', label: 'Descrizione uscita' },
  { value: 'challenge_description', label: 'Descrizione sfida' },
  { value: 'collective_goal', label: 'Obiettivo collettivo' },
  { value: 'weekly_summary', label: 'Riepilogo settimana' },
  { value: 'free', label: 'Domanda libera' },
];

export default function Coach() {
  const status = useLoad(() => ext.ai.status());
  const [preset, setPreset] = useState('week_plan');
  const [prompt, setPrompt] = useState('');
  const [useData, setUseData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [err, setErr] = useState('');

  async function ask() {
    setBusy(true);
    setErr('');
    try {
      setAnswer(await ext.ai.chat({ prompt: prompt.trim(), preset, useData }));
      await status.reload();
    } catch (e) {
      setErr(humanError(e, 'Errore.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Coach AI' }} />
      <Async state={status}>
        {(s) =>
          !s.configured || !s.serviceAvailable ? (
            <Banner tone="warn" text={s.reason ?? 'Coach AI non disponibile al momento.'} />
          ) : (
            <>
              <Muted>Domande rimaste oggi: {s.remaining} su {s.dailyLimit}. Il coach risponde solo con testo e non modifica nulla.</Muted>
              <Pills scroll value={preset} onChange={setPreset} options={PRESETS} />
              <Field label={preset === 'free' ? 'La tua domanda' : 'Indicazioni'} optional={preset !== 'free'} value={prompt} onChangeText={setPrompt} multiline maxLength={500} />
              <SwitchRow label="Usa i miei dati di allenamento" hint="Invio un riassunto anonimo: mai nome, email o dati Strava." value={useData} onChange={setUseData} />
              <Button title="Chiedi al coach" onPress={ask} busy={busy} disabled={(preset === 'free' && !prompt.trim()) || s.remaining <= 0} />
              {err ? <Banner tone="error" text={err} /> : null}
              {answer ? (
                <Card>
                  {answer.simulated ? <Text style={[t.small, { color: '#ffc857' }]}>Risposta simulata</Text> : null}
                  <Text style={t.body}>{answer.text}</Text>
                  {answer.generic ? <Muted>Risposta generica, non basata sui tuoi dati.</Muted> : null}
                </Card>
              ) : null}
            </>
          )
        }
      </Async>
    </Screen>
  );
}
