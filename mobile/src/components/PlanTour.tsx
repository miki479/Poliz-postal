import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, R, S, type } from '@/constants/theme';

const STEPS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = [
  { icon: 'calendar', title: 'Questo è il tuo piano', text: 'Qui vedi gli allenamenti di ogni settimana. Tocca un giorno per aprirlo; il prossimo è già in evidenza.' },
  { icon: 'play-circle', title: 'Come iniziare', text: 'Premi “Registra l’allenamento” in basso: parte il GPS e l’allenamento si collega al piano da solo.' },
  { icon: 'arrow-undo', title: 'Come uscire dal piano', text: 'Tocca “‹ Runngo” in alto a sinistra: torni alla Home dell’app, con Esplora, Registra, Medaglie e Profilo.' },
];

/** Guida rapida flottante, mostrata una volta dopo la creazione del piano: tre passi, si chiude in qualsiasi momento. */
export function PlanTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const insets = useSafeAreaInsets();
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOutDown.duration(200)} style={{ position: 'absolute', left: S.lg, right: S.lg, bottom: insets.bottom + 108, zIndex: 30, padding: S.lg, gap: S.sm, borderRadius: R.card, backgroundColor: 'rgba(20,26,40,0.96)', borderWidth: 1, borderColor: color.accent + '88' }} accessibilityViewIsModal>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <Ionicons name={s.icon} size={22} color={color.accent} />
        <Text style={[type.headline, { color: '#fff', flex: 1 }]}>{s.title}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi la guida" hitSlop={10}><Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" /></Pressable>
      </View>
      <Text style={[type.subhead, { color: 'rgba(255,255,255,0.82)' }]}>{s.text}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>{STEPS.map((_, k) => <View key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? color.accent : 'rgba(255,255,255,0.3)' }} />)}</View>
        <Pressable onPress={() => (last ? onClose() : setI(i + 1))} accessibilityRole="button" accessibilityLabel={last ? 'Ho capito' : 'Avanti'} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[type.subhead, { color: color.accent, fontWeight: '800' }]}>{last ? 'Ho capito' : 'Avanti'}</Text>
          <Ionicons name={last ? 'checkmark' : 'chevron-forward'} size={16} color={color.accent} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
