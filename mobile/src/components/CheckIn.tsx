import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Banner, Button, DateField, Field, Pills, Sheet, SwitchRow, t, type IconName } from '@/components/ui';
import { color, HIT, S } from '@/constants/theme';
import { call } from '@/lib/api';
import { toISODate } from '@/lib/format';
import { todayIso } from '@/lib/plan';
import type { ChangeRequest } from '@/components/PlanChange';
import type { CheckInInput } from '@shared/adaptive.ts';

import { humanError } from '@/lib/errors';
type Step = 'menu' | 'feeling' | 'time' | 'pain' | 'vacation';

const ENTRIES: Array<{ step: Step | 'illness' | 'pause'; icon: IconName; title: string; hint: string }> = [
  { step: 'feeling', icon: 'happy-outline', title: 'Come ti senti oggi?', hint: 'Energia e stanchezza percepita' },
  { step: 'time', icon: 'time-outline', title: 'Ho poco tempo', hint: 'Adatta l’allenamento ai minuti che hai' },
  { step: 'pain', icon: 'bandage-outline', title: 'Ho dolore', hint: 'Dove, quanto e da quando' },
  { step: 'illness', icon: 'thermometer-outline', title: 'Non sto bene', hint: 'Malessere o malattia' },
  { step: 'vacation', icon: 'airplane-outline', title: 'Sono in vacanza', hint: 'Pausa completa o calendario ridotto' },
  { step: 'pause', icon: 'pause-circle-outline', title: 'Metti in pausa il piano', hint: 'Lo riprendi quando vuoi' },
];

const ENERGY = [
  { value: 1, label: '1 · Esausto' },
  { value: 2, label: '2 · Stanco' },
  { value: 3, label: '3 · Normale' },
  { value: 4, label: '4 · Bene' },
  { value: 5, label: '5 · In forma' },
];

/**
 * Check-in facoltativo, in un unico punto stabile. Tempo, stanchezza, dolore e malessere sono domande distinte.
 * I dati restano privati: non arrivano al club, al feed né alla Fama.
 */
export function CheckInSheet({ visible, onClose, onSaved, onChange }: { visible: boolean; onClose: () => void; onSaved: () => void; onChange: (r: ChangeRequest) => void }) {
  const [step, setStep] = useState<Step>('menu');
  const [energy, setEnergy] = useState<number | null>(null);
  const [minutes, setMinutes] = useState('');
  const [area, setArea] = useState('');
  const [level, setLevel] = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [trend, setTrend] = useState<'new' | 'persistent' | 'worse'>('new');
  const [urgent, setUrgent] = useState(false);
  const [vFrom, setVFrom] = useState(new Date());
  const [vUntil, setVUntil] = useState(() => new Date(Date.now() + 7 * 86_400_000));
  const [vStyle, setVStyle] = useState<'pause' | 'reduced'>('pause');
  const [vMax, setVMax] = useState('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const close = () => {
    setStep('menu');
    setErr('');
    onClose();
  };

  async function save(input: CheckInInput) {
    setBusy(true);
    setErr('');
    try {
      await call('saveCheckIn', input);
      setStep('menu');
      onSaved();
    } catch (e) {
      setErr(humanError(e, 'Non salvato.'));
    } finally {
      setBusy(false);
    }
  }

  const today = todayIso();
  const titles: Record<Step, string> = { menu: 'Check-in', feeling: 'Come ti senti oggi?', time: 'Quanto tempo hai oggi?', pain: 'Ho dolore', vacation: 'Sono in vacanza' };
  const footer =
    step === 'feeling' ? <Button title="Salva" busy={busy} disabled={energy === null} onPress={() => void save({ date: today, kind: 'feeling', energy })} />
    : step === 'time' ? <Button title="Salva" busy={busy} disabled={!minutes.trim()} onPress={() => void save({ date: today, kind: 'time', minutes: Number(minutes) })} />
    : step === 'pain' ? <Button title="Salva" busy={busy} onPress={() => void save({ date: today, kind: 'pain', pain: { area: area.trim(), level, trend, urgent } })} />
    : step === 'vacation' ? <Button title="Vedi cosa cambia" busy={busy} onPress={() => { close(); onChange({ action: 'vacation', params: { from: toISODate(vFrom), until: toISODate(vUntil), style: vStyle, maxMinutes: vStyle === 'reduced' ? Number(vMax) || 30 : null } }); }} />
    : undefined;

  return (
    <Sheet visible={visible} onClose={close} title={titles[step]} footer={footer}>
      {step === 'menu' ? (
        <>
          <Text style={t.muted}>Facoltativo e privato: resta solo a te, non lo vede il club.</Text>
          <View>
            {ENTRIES.map((e) => (
              <Pressable
                key={e.step}
                onPress={() => {
                  if (e.step === 'illness') return void save({ date: today, kind: 'illness' });
                  if (e.step === 'pause') {
                    close();
                    return onChange({ action: 'pause', params: { from: today, until: null } });
                  }
                  setStep(e.step);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56 }, pressed && { opacity: 0.6 }]}>
                <View style={{ width: HIT, height: HIT, borderRadius: 12, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={e.icon} size={22} color={color.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={t.title}>{e.title}</Text>
                  <Text style={t.small}>{e.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'feeling' ? (
        <>
          <Text style={t.muted}>Pensa all’energia di oggi, non al dolore né alla voglia di allenarti.</Text>
          <Pills value={energy} onChange={setEnergy} options={ENERGY} />
        </>
      ) : null}

      {step === 'time' ? <Field label="Minuti disponibili oggi" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="es. 25" /> : null}

      {step === 'pain' ? (
        <>
          <Field label="Dove" value={area} onChangeText={setArea} optional placeholder="es. ginocchio destro" maxLength={40} />
          <Text style={t.title}>Quanto</Text>
          <Pills value={level} onChange={setLevel} options={[{ value: 'mild', label: 'Lieve' }, { value: 'moderate', label: 'Moderato' }, { value: 'severe', label: 'Forte' }]} />
          <Text style={t.title}>Da quando</Text>
          <Pills value={trend} onChange={setTrend} options={[{ value: 'new', label: 'È nuovo' }, { value: 'persistent', label: 'Persiste' }, { value: 'worse', label: 'Peggiora' }]} />
          <SwitchRow label="Dolore al petto, fiato corto, svenimento o un trauma" hint="Se sì, chiama il 112." value={urgent} onChange={setUrgent} />
          {urgent ? <Banner tone="error" text="Interrompi l’attività e chiama il 112 o chiedi aiuto a chi è vicino a te." /> : null}
          <Text style={t.small}>Runngo non fa diagnosi. Ti proporrà solo di fermare o mettere in pausa gli allenamenti.</Text>
        </>
      ) : null}

      {step === 'vacation' ? (
        <>
          <DateField label="Dal" value={vFrom} onChange={setVFrom} mode="date" />
          <DateField label="Rientro" value={vUntil} onChange={setVUntil} mode="date" />
          <Text style={t.title}>Come vuoi gestirla</Text>
          <Pills value={vStyle} onChange={setVStyle} options={[{ value: 'pause', label: 'Pausa completa' }, { value: 'reduced', label: 'Calendario ridotto' }]} />
          {vStyle === 'reduced' ? <Field label="Minuti massimi per uscita" value={vMax} onChangeText={setVMax} keyboardType="number-pad" /> : null}
          <Text style={t.small}>Non serve dire dove vai. Potrai cambiare la data di rientro.</Text>
        </>
      ) : null}

      {step !== 'menu' ? <Button small title="Indietro" onPress={() => setStep('menu')} /> : null}
      {err ? <Banner tone="error" text={err} /> : null}
    </Sheet>
  );
}
