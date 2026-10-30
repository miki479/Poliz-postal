import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { color, R, S, type } from '@/constants/theme';

/** Uscita ben visibile dal piano: torna alla Home dell'app (il piano ha la sua barra, quindi serve un ritorno chiaro). */
export function HomeExit() {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Torna alla Home di Runngo" hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, marginLeft: S.xs, borderRadius: R.pill, backgroundColor: color.accentTint, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name="chevron-back" size={18} color={color.accent} />
      <Text style={[type.subhead, { color: color.accent, fontWeight: '800' }]}>Runngo</Text>
    </Pressable>
  );
}
