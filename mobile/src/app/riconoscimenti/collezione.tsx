import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BadgeHex } from '@/components/BadgeHex';
import { HexCell, PillTabs, SectionHead, SportSquare } from '@/components/BadgeParts';
import { Rise } from '@/components/Results';
import { Async, Screen, Sheet, Skeleton, useLoad } from '@/components/ui';
import { awardsOf, BADGE_KINDS, CATEGORY_ORDER, COLLECTION_SPORTS, collectionCount, collectionOf, collectionOfKind, kindOf, type CollectionCell } from '@/constants/achievements';
import { color, GUTTER, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { SPORT_NAME, type AwardCategory, type AwardSport } from '@shared/records.ts';
import type { WorkoutLog } from '@shared/types.ts';

type Mode = 'sport' | 'kind';
const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'sport', label: 'Per sport' },
  { value: 'kind', label: 'Per categoria' },
];
/** Aspetti con almeno una casella reale nel catalogo (le distanze massime sono "Nuova vetta", vedi kindOf). */
const KINDS = CATEGORY_ORDER;

function Tile({ on, label, onPress, children }: { on: boolean; label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} style={({ pressed }) => [{ width: 80, alignItems: 'center', gap: S.xs, paddingVertical: S.sm, borderRadius: R.card, backgroundColor: on ? color.accentTint : 'transparent', borderWidth: 1, borderColor: on ? `${color.accent}66` : 'transparent' }, pressed && !on && { backgroundColor: color.surface }]}>
      {children}
      <Text style={[type.caption, { color: on ? color.accent : color.textSecondary, fontWeight: on ? '700' : '500', textAlign: 'center' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Grid({ cells, sportLine, onOpen }: { cells: CollectionCell[]; sportLine?: boolean; onOpen: (c: CollectionCell) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -S.xs }}>
      {cells.map((c, i) => (
        <Rise key={`${c.entry.sport}:${c.entry.key}`} delay={Math.min(i, 9) * 40} dy={8} style={{ width: '33.333%', paddingHorizontal: S.xs }}>
          <HexCell cell={c} size={68} sportLine={sportLine} onPress={() => onOpen(c)} />
        </Rise>
      ))}
    </View>
  );
}

/**
 * Collezione: per sport o per categoria, una griglia di badge esagonali. Le caselle sono il catalogo REALE di ciò che
 * il motore può assegnare (constants/achievements.ts → catalogFor): quelle non ancora conquistate sono grigie e,
 * toccate, spiegano come si ottengono. Le conquistate aprono il dettaglio dell'ultima conquista.
 */
export default function Collezione() {
  const params = useLocalSearchParams<{ sport?: string }>();
  const [mode, setMode] = useState<Mode>('sport');
  const [sport, setSport] = useState<AwardSport>(COLLECTION_SPORTS.includes(params.sport as AwardSport) ? (params.sport as AwardSport) : 'running');
  const [kind, setKind] = useState<AwardCategory>('new_peak');
  const [locked, setLocked] = useState<CollectionCell | null>(null);
  const state = useLoad(async () => awardsOf(await call<WorkoutLog[]>('listWorkoutLogs', null)));

  const open = (c: CollectionCell) => (c.latest ? router.push({ pathname: '/riconoscimenti/[id]', params: { id: c.latest.id } }) : setLocked(c));

  return (
    <Screen onRefresh={state.reload} style={{ gap: S.xl }}>
      <Stack.Screen options={{ title: 'Collezione' }} />
      <PillTabs options={MODES} value={mode} onChange={setMode} />
      {mode === 'sport' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="tablist">
          {COLLECTION_SPORTS.map((s) => (
            <Tile key={s} on={sport === s} label={SPORT_NAME[s]} onPress={() => setSport(s)}>
              <SportSquare sport={s} tint={sport === s ? color.accent : color.textSecondary} size={44} filled={sport === s} />
            </Tile>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: S.xs }} accessibilityRole="tablist">
          {KINDS.map((k) => (
            <Tile key={k} on={kind === k} label={BADGE_KINDS[k].label} onPress={() => setKind(k)}>
              <BadgeHex kind={k} size={44} />
            </Tile>
          ))}
        </ScrollView>
      )}

      <Async state={state} skeleton={<Skeleton height={320} />}>
        {({ awards }) => {
          const cells = mode === 'sport' ? collectionOf(sport, awards) : collectionOfKind(kind, awards);
          const [got, all] = collectionCount(cells);
          // conquistate prima, poi da conquistare (ordine del catalogo dentro ciascun gruppo)
          const sorted = [...cells.filter((c) => c.latest), ...cells.filter((c) => !c.latest)];
          return (
            <View style={{ gap: S.sm }}>
              <SectionHead title={mode === 'sport' ? SPORT_NAME[sport] : BADGE_KINDS[kind].label} right={<Text style={[type.headline, { color: color.textSecondary, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${got} conquistati su ${all}`}>{got}/{all}</Text>} />
              <Grid key={mode === 'sport' ? sport : kind} cells={sorted} sportLine={mode === 'kind'} onOpen={open} />
            </View>
          );
        }}
      </Async>

      <Sheet visible={!!locked} onClose={() => setLocked(null)} title="Da conquistare">
        {locked ? (
          <View style={{ alignItems: 'center', gap: S.md }}>
            <BadgeHex kind={kindOf(locked.entry)} size={104} locked />
            <Text style={[type.title2, { color: color.text, textAlign: 'center' }]}>{locked.entry.name}</Text>
            <Text style={[type.footnote, { color: color.textSecondary }]}>
              {SPORT_NAME[locked.entry.sport]} · {BADGE_KINDS[kindOf(locked.entry)].label}
            </Text>
            <Text style={[type.body, { color: color.textSecondary, textAlign: 'center' }]}>{locked.entry.hint}</Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
