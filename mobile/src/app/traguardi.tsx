import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { badgeA11y, BadgeCaption, BadgeEmblem } from '@/components/Badge';
import { Async, Row, Screen, Section, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { color, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import type { BadgeView } from '@shared/types.ts';

function Grid({ list, onOpen }: { list: BadgeView[]; onOpen: (b: BadgeView) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.lg }}>
      {list.map((b) => (
        <Pressable key={b.id} onPress={() => onOpen(b)} accessibilityRole="button" accessibilityLabel={badgeA11y(b)} style={({ pressed }) => [{ width: 96, alignItems: 'center', gap: S.sm }, pressed && { opacity: 0.6 }]}>
          <BadgeEmblem b={b} size={68} />
          <BadgeCaption b={b} />
        </Pressable>
      ))}
    </View>
  );
}

export default function Traguardi() {
  const { user } = useLocalSearchParams<{ user?: string }>();
  const state = useLoad(() => call<BadgeView[] | null>('listBadges', user ?? null), [user]);
  const [open, setOpen] = useState<BadgeView | null>(null);

  return (
    <Screen onRefresh={state.reload}>
      <Stack.Screen options={{ title: 'Traguardi' }} />
      <Async state={state} skeleton={<Skeleton height={200} />}>
        {(all) => {
          if (!all) return <Text style={t.muted}>Questa persona non mostra i propri traguardi.</Text>;
          const earned = all.filter((b) => b.earned).sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? ''));
          const next = all.filter((b) => !b.earned).sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1));
          return (
            <>
              <Text style={t.muted}>Si ottengono correndo in compagnia, organizzando, partecipando alla vita del club e con la costanza. Vengono calcolati dal server sui tuoi dati: una corsa importata da più fonti conta una volta sola.</Text>
              <Section title={`Ottenuti · ${earned.length}`}>{earned.length ? <Grid list={earned} onOpen={setOpen} /> : <Text style={t.muted}>Ancora nessuno: il primo arriva con la tua prima uscita di gruppo.</Text>}</Section>
              {next.length && !user ? (
                <Section title="Prossimi">
                  <Grid list={next} onOpen={setOpen} />
                </Section>
              ) : null}
            </>
          );
        }}
      </Async>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''}>
        {open ? (
          <>
            <Row gap={S.lg}>
              <BadgeEmblem b={open} size={88} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[type.headline, { color: open.earned ? color.success : color.textSecondary }]}>{open.earned ? `Ottenuto${open.earnedAt ? ` il ${fmtDate(open.earnedAt)}` : ''}` : 'Da ottenere'}</Text>
                {!open.earned && open.target && open.current !== null ? (
                  <Text style={t.muted}>
                    {open.current} di {open.target} {open.unit}
                  </Text>
                ) : null}
              </View>
            </Row>
            <View style={{ gap: S.xs }}>
              <Text style={t.title}>Come si ottiene</Text>
              <Text style={t.body}>{open.criterion}</Text>
            </View>
            <View style={{ gap: S.xs }}>
              <Text style={t.title}>Dati usati</Text>
              <Text style={t.muted}>{open.source}</Text>
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
