import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';

import { ClubMark } from '@/components/cards';
import { color, R, S, type } from '@/constants/theme';
import type { ClubView } from '@shared/types.ts';

/** Nel modulo serve scegliere il club, non rileggere una card editoriale a tutta altezza. */
export function ClubChoice({ club, selected, onSelect }: { club: ClubView; selected: boolean; onSelect: () => void }) {
  const details = [club.area, `${club.memberCount} ${club.memberCount === 1 ? 'membro' : 'membri'}`].filter(Boolean).join(' · ');
  return <Pressable onPress={onSelect} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${club.name}, ${details}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 76, padding: S.md, borderRadius: R.card, borderWidth: 1, borderColor: selected ? color.accent : color.separator, backgroundColor: selected ? color.accentTint : color.surfaceElevated, opacity: pressed ? 0.75 : 1 })}>
    <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', flexShrink: 0 }}>
      {club.imageDataUrl ? <Image source={{ uri: club.imageDataUrl }} style={{ width: 44, height: 44 }} resizeMode="cover" accessibilityIgnoresInvertColors /> : <ClubMark name={club.name} />}
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={[type.headline, { color: color.text }]}>{club.name}</Text>
      <Text style={[type.footnote, { color: color.textSecondary }]}>{details}</Text>
    </View>
    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? color.accent : color.textTertiary} />
  </Pressable>;
}
