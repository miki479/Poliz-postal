import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { color, HIT, S, type } from '@/constants/theme';

/**
 * Titolo di sezione della creazione uscita ("Distanza", "Ritmo", "Livello", "Patto di corsa (opzionale)"):
 * grassetto, con un'eventuale nota tenue accanto e un'azione a icona a destra. Altezza fissa: le icone che compaiono
 * o spariscono a destra non spostano nulla.
 */
export function SectionTitle({ title, note, right }: { title: string; note?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT, marginBottom: -S.xs }}>
      <Text style={[type.title2, { color: color.text, flex: 1 }]} accessibilityRole="header" numberOfLines={2}>
        {title}
        {note ? <Text style={[type.footnote, { color: color.textTertiary, fontWeight: '400' }]}>{`  ${note}`}</Text> : null}
      </Text>
      {right}
    </View>
  );
}
