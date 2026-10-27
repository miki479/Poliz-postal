import { themedStyles , color, R, S, type } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha } from '@/components/event/colors';
import { ActivityGlyph } from '@/components/SportIcon';
import type { IconName } from '@/components/ui';
import type { ActivityStyle } from '@/constants/activityColors';


export interface Feature {
  key: string;
  /** Icona Ionicons, oppure la figura dell'attività (`glyph`). `tint` può essere esadecimale o hsl (colore di un club). */
  icon?: IconName;
  glyph?: ActivityStyle;
  tint: string;
  title: string;
  detail?: string;
  /** Valore scelto, nella "nuvoletta" scura a destra (come nella legenda dei mockup). */
  value?: string;
}

/** Riga come nella legenda "Icone delle caratteristiche": icona nel cerchio, titolo, spiegazione e valore a destra. */
function FeatureRow({ f }: { f: Feature }) {
  return (
    <View style={s.row} accessible accessibilityLabel={[f.title, f.value, f.detail].filter(Boolean).join(': ')}>
      <View style={[s.icon, { backgroundColor: f.tint.startsWith('#') ? alpha(f.tint, 0.16) : color.surfaceElevated }]}>
        {f.glyph ? <ActivityGlyph style={f.glyph} size={22} color={f.tint} /> : <Ionicons name={f.icon ?? 'ellipse-outline'} size={21} color={f.tint} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.headline, { color: color.text, fontWeight: '700' }]} numberOfLines={2}>
          {f.title}
        </Text>
        {f.detail ? (
          <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={3}>
            {f.detail}
          </Text>
        ) : null}
      </View>
      {f.value ? (
        <View style={s.pill}>
          <Text style={[type.caption, { color: color.storyInk, fontWeight: '700' }]} numberOfLines={2}>
            {f.value}
          </Text>
          {/* Punta del fumetto verso la riga, come nella legenda del mockup. */}
          <View style={s.nib} />
        </View>
      ) : null}
    </View>
  );
}

/** Elenco delle caratteristiche dell'uscita (riepilogo): solo dati scelti davvero, nessun valore di esempio. */
export function FeatureList({ items, footer, onEdit }: { items: Feature[]; footer?: ReactNode; onEdit?: (key: string) => void }) {
  return (
    <View style={s.card}>
      {items.map((f, i) => (
        <Fragment key={f.key}>
          {i ? <View style={s.sep} /> : null}
          {onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={`Modifica ${f.title}`} onPress={() => onEdit(f.key)}><FeatureRow f={f} /></Pressable> : <FeatureRow f={f} />}
        </Fragment>
      ))}
      {footer}
    </View>
  );
}

/** Fondo della nuvoletta: quasi nero, come i fumetti della legenda (testo bianco ben sopra il 4,5:1). */
const PILL = '#05070A';

const s = themedStyles({
  card: { backgroundColor: color.surface, borderRadius: R.card, paddingHorizontal: S.lg, paddingVertical: S.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, minHeight: 64 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pill: { maxWidth: '42%', backgroundColor: PILL, borderRadius: R.chip, paddingHorizontal: S.sm, paddingVertical: S.xs + 1, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  nib: { position: 'absolute', left: -4, top: 7, width: 8, height: 8, backgroundColor: PILL, transform: [{ rotate: '45deg' }] },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.separator, marginLeft: 44 + S.md },
});
