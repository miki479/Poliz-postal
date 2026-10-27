import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedBar } from '@/components/Motion';
import { Row, t } from '@/components/ui';
import { color, GUTTER, HIT, S, type } from '@/constants/theme';

/**
 * Cornice dei percorsi a passi: titolo grande della domanda, avanzamento sempre visibile e corretto,
 * indietro senza perdere dati (lo stato vive nel chiamante), un solo pulsante principale in basso.
 * Il numero di passi lo decide il chiamante: tanti quante sono le domande che servono davvero.
 */
export function WizardFrame({ index, total, title, hint, onBack, children, footer }: { index: number; total: number; title: string; hint?: string; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: GUTTER, gap: S.md }}>
        <Row>
          <Pressable onPress={() => (index > 0 && onBack ? onBack() : router.back())} accessibilityRole="button" accessibilityLabel={index > 0 ? 'Passo precedente' : 'Chiudi'} hitSlop={8} style={{ width: HIT, height: HIT, justifyContent: 'center' }}>
            <Ionicons name={index > 0 ? 'chevron-back' : 'close'} size={26} color={color.text} />
          </Pressable>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`Passo ${index + 1} di ${total}`}>
            <AnimatedBar key={index} height={6} pct={(index + 1) / total} />
          </View>
          <Text style={[t.small, { width: 44, textAlign: 'right' }]}>
            {index + 1}/{total}
          </Text>
        </Row>
        <Text style={t.h1} accessibilityRole="header">
          {title}
        </Text>
        {hint ? <Text style={[type.body, { color: color.textSecondary, marginTop: -S.xs }]}>{hint}</Text> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: S.lg, paddingBottom: 140 + insets.bottom }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {children}
      </ScrollView>
      {footer ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: insets.bottom + S.md, backgroundColor: color.bg, gap: S.sm }}>{footer}</View> : null}
    </View>
  );
}

/** Scelta grande da toccare (riga con icona, titolo e spiegazione). */
export function ChoiceRow({ title, hint, icon, on, onPress }: { title: string; hint?: string; icon?: keyof typeof Ionicons.glyphMap; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingHorizontal: S.lg, paddingVertical: S.md, borderRadius: 16, backgroundColor: on ? color.accentTint : color.surface, borderWidth: 1, borderColor: on ? color.accent : 'transparent' }, pressed && { opacity: 0.75 }]}>
      {icon ? <Ionicons name={icon} size={22} color={on ? color.accent : color.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[t.title, on && { color: color.accent }]}>{title}</Text>
        {hint ? <Text style={t.small}>{hint}</Text> : null}
      </View>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? color.accent : color.textTertiary} />
    </Pressable>
  );
}

/** Titolo di gruppo per raggruppare le opzioni per obiettivo e non in una griglia piatta. */
export function GroupLabel({ text }: { text: string }) {
  return <Text style={[type.caption, { color: color.textSecondary, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: S.sm }]}>{text}</Text>;
}
