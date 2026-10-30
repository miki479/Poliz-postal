import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { color, R, S, type } from '@/constants/theme';
import { beginnerRun, BEGINNER_SOURCE } from '@shared/beginnerRunning.ts';

/**
 * Allenamenti già pronti da provare: i guidati del programma pubblico NHS Couch to 5K (fonte dichiarata) più i primi tre della
 * prima settimana. Si sceglie con un tocco e Avvia parte con la guida a voce/segnali; nessun dato personale è coinvolto.
 */
export function ReadyWorkouts({ onPick }: { onPick: (guidedId: string) => void }) {
  const items = [1, 2, 3].map((run) => beginnerRun(1, run));
  return (
    <View style={{ gap: S.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.xs }}>
        <Ionicons name="flash" size={14} color={color.accent} />
        <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700' }]}>Allenamenti pronti da provare</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} accessibilityRole="menu">
        {items.map((g) => (
          <Pressable key={g.id} onPress={() => onPick(g.id)} accessibilityRole="menuitem" accessibilityLabel={`${g.title}, ${Math.round(g.durationSec / 60)} minuti. Programma ${BEGINNER_SOURCE.name}`} style={({ pressed }) => ({ width: 168, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.sm, borderRadius: R.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.separator, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accentTint }}>
              <Ionicons name="play" size={16} color={color.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { color: color.text, fontWeight: '700' }]} numberOfLines={1}>Allenamento {g.run}</Text>
              <Text style={[type.caption, { color: color.textSecondary }]} numberOfLines={1}>Corsa e camminata · {Math.round(g.durationSec / 60)} min</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
