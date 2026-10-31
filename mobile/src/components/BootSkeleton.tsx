import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/ui';
import { color, GUTTER, S } from '@/constants/theme';

/** Schermata di avvio: le sagome della Home (titolo, storie, scheda, card) con il lampo che le attraversa, finché l'app non è pronta. */
export function BootSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, paddingTop: insets.top + S.lg, paddingHorizontal: GUTTER, gap: S.xl }} accessibilityLabel="Apro Runngo" accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton height={28} width={120} radius={4} />
        <View style={{ flexDirection: 'row', gap: S.md }}><Skeleton height={32} circle /><Skeleton height={32} circle /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: S.lg }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={60} circle />)}</View>
      <Skeleton height={150} />
      <Skeleton height={52} />
      <Skeleton height={20} width="45%" radius={4} />
      <View style={{ flexDirection: 'row', gap: S.md }}><Skeleton height={190} width={240} /><Skeleton height={190} width={240} /></View>
      <Skeleton height={110} />
    </View>
  );
}
