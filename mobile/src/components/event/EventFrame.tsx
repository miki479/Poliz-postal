import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stepper } from '@/components/event/Stepper';
import { color, GUTTER, HIT, S, type } from '@/constants/theme';

/** Larghezza uguale ai due lati dell'intestazione: il titolo resta davvero al centro. */
const SIDE = 76;

/**
 * Cornice della creazione uscita: freccia indietro, titolo al centro e "Annulla" a destra; sotto, l'avanzamento a passi.
 * Il contenuto scorre (e torna in cima a ogni cambio di passo); il pulsante principale resta fisso in basso.
 */
export function EventFrame({
  title,
  steps,
  index,
  onBack,
  onCancel,
  onStep,
  footer,
  scrollRef,
  children,
}: {
  title: string;
  steps: readonly string[];
  index: number;
  onBack: () => void;
  onCancel: () => void;
  onStep?: (i: number) => void;
  footer?: ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const own = useRef<ScrollViewInstance>(null);
  const ref = scrollRef ?? own;
  useEffect(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, [index, ref]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ paddingTop: insets.top + S.xs, paddingHorizontal: GUTTER, paddingBottom: S.sm, gap: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT }}>
          <View style={{ width: SIDE, alignItems: 'flex-start' }}>
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={index > 0 ? 'Passo precedente' : 'Chiudi'} hitSlop={8} style={({ pressed }) => [{ width: HIT, height: HIT, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <Ionicons name="arrow-back" size={24} color={color.text} />
            </Pressable>
          </View>
          <Text style={[type.headline, { flex: 1, textAlign: 'center', color: color.text, fontWeight: '700' }]} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <View style={{ width: SIDE, alignItems: 'flex-end' }}>
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Annulla" accessibilityHint="Esci senza salvare" hitSlop={8} style={({ pressed }) => [{ minHeight: HIT, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
              <Text style={[type.subhead, { color: color.accent, fontWeight: '600' }]}>Annulla</Text>
            </Pressable>
          </View>
        </View>
        <Stepper labels={steps} index={index} onPress={onStep} />
      </View>
      <ScrollView
        ref={ref}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: S.md, gap: S.lg, paddingBottom: S.xl }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
      {footer ? <View style={{ flexShrink: 0, paddingHorizontal: GUTTER, paddingTop: S.sm, paddingBottom: insets.bottom + S.md, backgroundColor: color.bg, gap: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator }}>{footer}</View> : null}
    </View>
  );
}
