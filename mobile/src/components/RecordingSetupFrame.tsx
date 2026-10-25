import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { IconButton, Row, t } from '@/components/ui';
import { color, GUTTER, R, S, type } from '@/constants/theme';

/** Mappa flessibile, card apribile e azione nel flusso: la preparazione non scorre. */
export function RecordingSetupFrame({ map, summary, subtitle, onOptions, onClose, onStart, starting, disabled, resume = false, insets }: {
  map: ReactNode; summary: string; subtitle: string; onOptions(): void; onClose(): void; onStart(): void;
  starting: boolean; disabled: boolean; resume?: boolean; insets: { top: number; bottom: number };
}) {
  return <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.sm }}>
    <Row style={{ paddingHorizontal: GUTTER, paddingBottom: S.sm }}>
      <Text style={[t.h2, { flex: 1 }]} numberOfLines={1} accessibilityRole="header">Registra</Text>
      <IconButton name="close" label="Chiudi" filled onPress={onClose} />
    </Row>
    <View style={{ flex: 1, minHeight: 0, paddingHorizontal: S.md }}>{map}</View>
    <View style={{ flexShrink: 0, paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: insets.bottom + S.sm, gap: S.sm }}>
      <View>
        <View pointerEvents="none" style={{ position: 'absolute', top: -5, left: 10, right: 10, height: 28, borderRadius: R.card, backgroundColor: color.brandTint, borderWidth: 1, borderColor: color.separator }} />
        <Pressable onPress={onOptions} accessibilityRole="button" accessibilityLabel={`Apri opzioni registrazione. ${summary}. ${subtitle}`} accessibilityHint="Apre attività, gruppo, attrezzatura e condivisione" style={({ pressed }) => ({ minHeight: 76, borderRadius: R.card, backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder, paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.xs, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ alignSelf: 'center', width: 32, height: 3, borderRadius: 2, backgroundColor: color.controlBorder }} />
          <Row>
            <Ionicons name="options-outline" size={24} color={color.accent} />
            <View style={{ flex: 1, gap: S.xs }}><Text style={t.title} numberOfLines={1}>{summary}</Text><Text style={t.small} numberOfLines={1}>{subtitle}</Text></View>
            <Ionicons name="chevron-up" size={21} color={color.textSecondary} />
          </Row>
        </Pressable>
      </View>
      <View style={{ alignItems: 'center', gap: S.xs }}>
        <Pressable onPress={onStart} disabled={disabled} accessibilityRole="button" accessibilityLabel={starting ? 'Preparo la registrazione' : resume ? 'Recupera l’attività salvata' : 'Avvia la registrazione'} accessibilityState={{ busy: starting, disabled }} style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: color.accent, opacity: disabled || pressed ? 0.6 : 1 })}>
          <Ionicons name={resume ? 'refresh' : 'play'} size={34} color={color.onAccent} />
        </Pressable>
        <Text style={[type.caption, { color: color.textSecondary }]}>{starting ? 'Preparo…' : resume ? 'Recupera' : 'Avvia'}</Text>
      </View>
    </View>
  </View>;
}
