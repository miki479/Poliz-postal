import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';

import { loadCatalog } from '@/components/PhysicalMedalBanner';
import { Async, Empty, Panel, Skeleton, t, TabScreen, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { SPORT_LABEL } from '@/lib/format';
import type { SportId } from '@shared/types.ts';

/** Le medaglie fisiche da indossare, vendute su un sito esterno. I traguardi digitali restano nel profilo. */
export default function Medaglie() {
  const state = useLoad(loadCatalog);
  return (
    <TabScreen title="Medaglie" subtitle="Da indossare, per ricordare le tue corse" onRefresh={state.reload}>
      <Async state={state} skeleton={<><Skeleton height={120} /><Skeleton height={120} /></>}>
        {(offers) =>
          offers.length ? (
            <View style={{ gap: S.md }}>
              {offers.map((o) => (
                <Pressable key={o.id} onPress={() => void Linking.openURL(o.url).catch(() => {})} accessibilityRole="link" accessibilityLabel={`${o.title}: apre il sito esterno del venditore`} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                  <Panel style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.lg, overflow: 'hidden' }}>
                    <LinearGradient colors={['#E8C37A', '#9C6B2E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="medal" size={32} color="#fff" />
                    </LinearGradient>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.headline, { color: color.text }]}>{o.title}</Text>
                      <Text style={t.small}>{SPORT_LABEL[(o.sport === 'strength' ? 'other' : o.sport) as SportId] ?? 'Allenamento'} · Sito esterno</Text>
                    </View>
                    <Ionicons name="open-outline" size={20} color={color.textSecondary} />
                  </Panel>
                </Pressable>
              ))}
            </View>
          ) : (
            <Empty iconName="medal-outline" title="Presto in arrivo" text="Qui troverai le medaglie fisiche da indossare, legate ai traguardi che raggiungi. L’acquisto è facoltativo e avviene su un sito esterno." />
          )
        }
      </Async>
      <Pressable onPress={() => router.push('/traguardi')} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, borderRadius: R.lg, opacity: pressed ? 0.6 : 1 })}>
        <Ionicons name="ribbon-outline" size={22} color={color.accent} />
        <Text style={[type.subhead, { flex: 1, color: color.accent, fontWeight: '700' }]}>I tuoi traguardi digitali</Text>
        <Ionicons name="chevron-forward" size={18} color={color.textSecondary} />
      </Pressable>
    </TabScreen>
  );
}
