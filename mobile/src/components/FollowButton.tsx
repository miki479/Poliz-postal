import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { color, HIT, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';

/** Segui / Segui già: stato chiaro con icona e testo, nessun doppio invio. */
export function FollowButton({ userId, initial, onChange, compact }: { userId: string; initial: boolean; onChange?: (v: boolean) => void; compact?: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  async function toggle() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    try {
      await call(on ? 'unfollow' : 'follow', userId);
      setOn(!on);
      onChange?.(!on);
      if (!on) void Haptics.selectionAsync();
    } catch {
      /* stato invariato */
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <Pressable onPress={toggle} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: on, busy }} accessibilityLabel={on ? 'Segui già. Tocca per smettere di seguire' : 'Segui'} style={({ pressed }) => [{ minHeight: compact ? 36 : HIT, paddingHorizontal: S.md, borderRadius: R.control, borderWidth: 1, borderColor: on ? color.controlBorder : color.accent, backgroundColor: on ? 'transparent' : color.accentTint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, pressed && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator size="small" color={color.accent} /> : <Ionicons name={on ? 'checkmark' : 'person-add-outline'} size={16} color={on ? color.textSecondary : color.accent} />}
      <Text style={[type.subhead, { color: on ? color.textSecondary : color.accent, fontWeight: '700' }]}>{on ? 'Segui già' : 'Segui'}</Text>
    </Pressable>
  );
}
