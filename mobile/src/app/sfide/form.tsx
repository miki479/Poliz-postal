import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Field, Screen, t } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { deviceTimezone } from '@/lib/format';
import type { ChallengeType, ChallengeView } from '@shared/types.ts';

/** Cinque modi di sfidarsi, spiegati in una riga: si sceglie toccando la riga, niente menu né pulsanti. */
const TYPES: Array<{ id: ChallengeType; icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = [
  { id: 'most_distance', icon: 'trending-up', title: 'Più chilometri', text: 'Vince chi corre più strada' },
  { id: 'most_runs', icon: 'repeat', title: 'Più uscite', text: 'Vince chi esce più volte' },
  { id: 'most_active_days', icon: 'calendar', title: 'Più giorni attivi', text: 'Conta i giorni in cui ti muovi' },
  { id: 'collective_distance', icon: 'people', title: 'Obiettivo di squadra', text: 'Tutti insieme verso un totale di km' },
  { id: 'personal_goal', icon: 'flag', title: 'Obiettivo personale', text: 'Ognuno il suo traguardo in km' },
];
const DAYS = [3, 7, 14, 30];

/** Creazione di una sfida in un colpo solo: tipo, durata e (se serve) obiettivo. Il nome si propone da solo. */
export default function SfidaForm() {
  const { clubId } = useLocalSearchParams<{ clubId?: string }>();
  const [kind, setKind] = useState<ChallengeType>('most_distance');
  const [days, setDays] = useState(7);
  const [goal, setGoal] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const needsGoal = kind === 'collective_distance' || kind === 'personal_goal';
  const meta = TYPES.find((x) => x.id === kind)!;
  const autoName = `${meta.title} · ${days} giorni`;

  async function save() {
    setBusy(true);
    try {
      const starts = new Date(); starts.setHours(0, 0, 0, 0);
      const ends = new Date(starts); ends.setDate(ends.getDate() + days - 1); ends.setHours(23, 59, 0, 0);
      const goalKm = needsGoal && goal.trim() ? Number(goal.replace(',', '.')) : null;
      const c = await call<ChallengeView>(
        'createChallenge',
        { name: (name.trim() || autoName).slice(0, 60), description: '', type: kind, sport: 'running', startsAt: starts.toISOString(), endsAt: ends.toISOString(), timezone: deviceTimezone(), goalKm: kind === 'collective_distance' ? goalKm : null, clubId: clubId ?? null },
        kind === 'personal_goal' ? goalKm : null,
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
      <Text style={[type.title1, { color: color.text }]}>Che sfida vuoi lanciare?</Text>

      <View accessibilityRole="radiogroup" style={{ gap: S.sm }}>
        {TYPES.map((x) => {
          const on = x.id === kind;
          return (
            <Pressable key={x.id} onPress={() => setKind(x.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${x.title}. ${x.text}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.card, backgroundColor: on ? color.accentTint : color.surface, borderWidth: 1.5, borderColor: on ? color.accent : 'transparent', opacity: pressed ? 0.8 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? color.accent : color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={x.icon} size={22} color={on ? color.onAccent : color.textSecondary} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={[type.headline, { color: color.text }]}>{x.title}</Text>
                <Text style={t.small}>{x.text}</Text>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={22} color={color.accent} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: S.sm }}>
        <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700', letterSpacing: 0.6 }]}>QUANTO DURA</Text>
        <View style={{ flexDirection: 'row', gap: S.xl }} accessibilityRole="tablist">
          {DAYS.map((d) => {
            const on = d === days;
            return (
              <Pressable key={d} onPress={() => setDays(d)} accessibilityRole="tab" accessibilityState={{ selected: on }} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[type.title2, { color: on ? color.text : color.textSecondary, fontWeight: on ? '800' : '500' }]}>{d} giorni</Text>
                <View style={{ height: 2, borderRadius: 1, marginTop: 4, backgroundColor: on ? color.accent : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
        <Text style={t.small}>Parte oggi e finisce {new Date(Date.now() + (days - 1) * 86_400_000).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}.</Text>
      </View>

      {needsGoal ? (
        <View style={{ gap: S.sm }}>
          <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700', letterSpacing: 0.6 }]}>{kind === 'personal_goal' ? 'IL TUO OBIETTIVO' : 'OBIETTIVO DEL GRUPPO'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: S.sm }}>
            <TextInput value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={color.textTertiary} accessibilityLabel="Obiettivo in chilometri" style={[type.display, { color: color.text, minWidth: 90, paddingVertical: 0 }]} />
            <Text style={[type.title2, { color: color.textSecondary }]}>km</Text>
          </View>
        </View>
      ) : null}

      <Field label="Nome (lo proponiamo noi)" value={name} onChangeText={setName} placeholder={autoName} maxLength={60} optional />
      <Button title="Lancia la sfida" iconName="flash" onPress={save} busy={busy} disabled={needsGoal && !goal.trim()} />
    </Screen>
  );
}
