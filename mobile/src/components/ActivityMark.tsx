import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { activityStyle, gradientFor, type ActivityStyle, type ActivityTypeId } from '@/constants/activityColors';
import { ActivityGlyph } from '@/components/SportIcon';
import { color, type } from '@/constants/theme';

/** Segno di un'attività: tondo con icona; fusione dei due colori ufficiali se combinata. */
export function ActivityMark({ id, size = 36, style: st }: { id?: ActivityTypeId; size?: number; style?: ActivityStyle }) {
  const s = st ?? activityStyle(id ?? 'run');
  const radius = size * 0.32;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: s.tint }} accessibilityElementsHidden importantForAccessibility="no">
      {s.blend ? <LinearGradient colors={[`${s.blend[0]}55`, `${s.blend[1]}55`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
      <ActivityGlyph style={s} size={size * 0.6} color={s.blend ? color.text : s.solid} />
    </View>
  );
}

/** Barra verticale di colore a sinistra di una riga (sfumata se combinata). */
export function ColorBar({ style: s, height = 40 }: { style: ActivityStyle; height?: number }) {
  return <LinearGradient colors={s.blend ?? [s.solid, s.solid]} style={{ width: 4, height, borderRadius: 2 }} />;
}

/** Punti di giornata: ogni attività del giorno col suo colore (la corsa non viene sostituita dalla camminata). */
export function DayDots({ styles, max = 3 }: { styles: ActivityStyle[]; max?: number }) {
  if (!styles.length) return <View style={{ height: 8 }} />;
  return (
    <View style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      {styles.slice(0, max).map((s, i) => (
        <LinearGradient key={i} colors={s.blend ?? [s.solid, s.solid]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 8, height: 8, borderRadius: 4 }} />
      ))}
    </View>
  );
}

/** Indicatore aggregato (anello a due colori) per una cella di calendario. */
export function DayRing({ styles, size = 40, children }: { styles: ActivityStyle[]; size?: number; children?: React.ReactNode }) {
  const [a, b] = gradientFor(styles);
  return (
    <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.34, padding: 2 }}>
      <View style={{ flex: 1, borderRadius: size * 0.34 - 2, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </LinearGradient>
  );
}

export function TypeLabel({ style: s }: { style: ActivityStyle }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <ActivityGlyph style={s} size={14} color={s.solid} />
      <Text style={[type.caption, { color: s.solid, fontWeight: '700' }]}>{s.label}</Text>
    </View>
  );
}
