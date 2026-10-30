import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, Text, View } from 'react-native';
import { Banner, Button, DateField, Panel, Screen, Section, t, useLoad } from '@/components/ui';
import { color, S, type } from '@/constants/theme';
import { humanError } from '@/lib/errors';
import { call } from '@/lib/api';
import { addDaysIso, fmtClock, toISODate } from '@/lib/format';
import { BEGINNER_SOURCE, beginnerRun } from '@shared/beginnerRunning.ts';
import type { WorkoutLog } from '@shared/types.ts';
const ALL = Array.from({ length: 27 }, (_, i) => beginnerRun(Math.floor(i / 3) + 1, (i % 3) + 1));
const SEG_COLOR: Record<string, string> = { run: color.accent, walk: '#F2B84B', warmup: color.controlBorder, cooldown: color.controlBorder };

/**
 * Programma guidato: si apre sul PROSSIMO allenamento non ancora svolto (calcolato dalle registrazioni reali), senza file di
 * pulsanti da scegliere. Le frecce scorrono tra i 27 allenamenti; la barra mostra le fasi corsa/camminata a colpo d'occhio.
 */
export default function Iniziare() {
  const logs = useLoad(() => call<WorkoutLog[]>('listWorkoutLogs', null));
  const done = new Set((logs.data ?? []).map((l) => l.guidedWorkoutId).filter(Boolean) as string[]);
  const firstUndone = Math.max(0, ALL.findIndex((g) => !done.has(g.id)));
  const [picked, setPicked] = useState<number | null>(null);
  const idx = picked ?? (logs.data ? (ALL.every((g) => done.has(g.id)) ? 26 : firstUndone) : 0);
  const session = ALL[idx];
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
  const history = (logs.data ?? []).filter((l) => l.guidedWorkoutId === session.id);
  const total = session.segments.reduce((n, x) => n + x.durationSec, 0);
  const step = (d: number) => setPicked(Math.min(26, Math.max(0, idx + d)));
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Inizia a correre' }} />
      <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700', letterSpacing: 0.6 }]}>{done.size ? `${done.size} DI 27 SVOLTI` : 'PROGRAMMA NHS COUCH TO 5K'}</Text>
      <Panel tone="brand" style={{ padding: S.lg, gap: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
          <Pressable onPress={() => step(-1)} disabled={idx === 0} accessibilityRole="button" accessibilityLabel="Allenamento precedente" hitSlop={10} style={{ opacity: idx === 0 ? 0.3 : 1 }}>
            <Ionicons name="chevron-back" size={24} color={color.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: color.brandText, fontWeight: '700' }]}>{done.has(session.id) ? 'GIÀ SVOLTO' : idx === firstUndone ? 'IL TUO PROSSIMO' : `ALLENAMENTO ${idx + 1} DI 27`}</Text>
            <Text style={t.h2}>Settimana {session.week} · Allenamento {session.run}</Text>
          </View>
          <Pressable onPress={() => step(1)} disabled={idx === 26} accessibilityRole="button" accessibilityLabel="Allenamento successivo" hitSlop={10} style={{ opacity: idx === 26 ? 0.3 : 1 }}>
            <Ionicons name="chevron-forward" size={24} color={color.text} />
          </Pressable>
        </View>
        <Text style={[type.display, { color: color.text }]}>{fmtClock(session.durationSec)}</Text>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }} accessibilityLabel="Fasi: corsa in turchese, camminata in ambra" accessible>
          {session.segments.map((x, i) => <View key={i} style={{ flex: x.durationSec / total, backgroundColor: SEG_COLOR[x.kind] ?? color.controlBorder }} />)}
        </View>
        <Text style={t.small}>Passo libero, senza obiettivo di distanza{history.length ? ` · ${history.length} ${history.length === 1 ? 'registrazione' : 'registrazioni'}` : ''}.</Text>
        <Button title="Inizia" iconName="play" onPress={() => router.push({ pathname: '/registra', params: { guided: session.id } })} />
      </Panel>
      <Section title="Le fasi">
        {session.segments.map((x, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SEG_COLOR[x.kind] ?? color.controlBorder }} />
            <Text style={[t.body, { flex: 1 }]}>{x.label}</Text>
            <Text style={t.muted}>{fmtClock(x.durationSec)}</Text>
          </View>
        ))}
      </Section>
      <Panel style={{ padding: S.lg, gap: S.md }}>
        <Text style={t.title}>Metti il programma nel tuo piano</Text>
        <Text style={t.small}>27 allenamenti di lunedì, mercoledì e venerdì in 9 settimane. Un piano già presente resta al suo posto.</Text>
        <DateField label="Lunedì di inizio" mode="date" value={start} onChange={setStart} />
        {error ? <Banner tone="error" text={error} /> : null}
        <Button variant="soft" title="Aggiungi il programma al piano" busy={busy} onPress={() => void schedule()} />
      </Panel>
      <Text style={t.small}>
        Corri a un passo comodo e fermati se compare dolore o malessere; con dubbi sulla salute chiedi al medico.{' '}
        <Text style={{ color: color.accent }} onPress={() => void Linking.openURL(BEGINNER_SOURCE.url)}>Programma NHS originale</Text>
      </Text>
    </Screen>
  );
}
