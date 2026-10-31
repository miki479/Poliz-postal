import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Sheet } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import type { GoalType } from '@shared/types.ts';

const KINDS: Array<{ id: GoalType; icon: keyof typeof Ionicons.glyphMap; label: string; unit: string; step: number; min: number; max: number; def: number; tint: string }> = [
  { id: 'weekly_km', icon: 'navigate', label: 'Km a settimana', unit: 'km', step: 5, min: 5, max: 300, def: 20, tint: color.coral },
  { id: 'weekly_minutes', icon: 'time', label: 'Minuti a settimana', unit: 'min', step: 15, min: 15, max: 1500, def: 90, tint: color.warning },
  { id: 'consistency', icon: 'calendar', label: 'Allenamenti a settimana', unit: 'volte', step: 1, min: 1, max: 14, def: 3, tint: color.accent },
  { id: 'group', icon: 'people', label: 'Uscite di gruppo al mese', unit: 'uscite', step: 1, min: 1, max: 31, def: 2, tint: color.teal },
];

/** Obiettivo tutto tuo: scegli cosa misurare e il valore con − / +, parte già con un valore sensato. Un obiettivo per tipo. */
export function GoalCreator({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState(KINDS[2]);
  const [value, setValue] = useState(KINDS[2].def);
  const [busy, setBusy] = useState(false);
  const pick = (k: (typeof KINDS)[number]) => { setKind(k); setValue(k.def); };
  const save = async () => {
    setBusy(true);
    try { await call('setGoal', { type: kind.id, target: value, basis: 'Scelto da te' }); onSaved(); onClose(); } catch (e) { Alert.alert('Obiettivo non salvato', humanError(e, 'Riprova tra poco.')); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Il tuo obiettivo" footer={<Button title="Crea obiettivo" iconName="flag" busy={busy} onPress={() => void save()} />}>
      <View style={{ gap: S.sm }}>
        {KINDS.map((k) => {
          const on = k.id === kind.id;
          return (
            <Pressable key={k.id} onPress={() => pick(k)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.card, backgroundColor: on ? k.tint + '26' : 'transparent', borderWidth: 1, borderColor: on ? k.tint : color.separator }}>
              <Ionicons name={k.icon} size={20} color={k.tint} />
              <Text style={[type.headline, { color: color.text, flex: 1 }]}>{k.label}</Text>
              {on ? <Ionicons name="checkmark-circle" size={20} color={k.tint} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.xl, paddingVertical: S.lg }}>
        <Pressable onPress={() => setValue((v) => Math.max(kind.min, v - kind.step))} accessibilityRole="button" accessibilityLabel="Diminuisci" hitSlop={10}><Ionicons name="remove-circle-outline" size={40} color={kind.tint} /></Pressable>
        <View style={{ alignItems: 'center', minWidth: 110 }}>
          <Text style={[type.display, { color: kind.tint }]} accessibilityLiveRegion="polite">{value}</Text>
          <Text style={[type.subhead, { color: color.textSecondary }]}>{kind.unit}</Text>
        </View>
        <Pressable onPress={() => setValue((v) => Math.min(kind.max, v + kind.step))} accessibilityRole="button" accessibilityLabel="Aumenta" hitSlop={10}><Ionicons name="add-circle-outline" size={40} color={kind.tint} /></Pressable>
      </View>
    </Sheet>
  );
}
