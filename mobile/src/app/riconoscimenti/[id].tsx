import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useId } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { BadgeHex } from '@/components/BadgeHex';
import { SportSquare } from '@/components/BadgeParts';
import { AwardMark, AwardPop, Rise } from '@/components/Results';
import { Async, Empty, Panel, Screen, Skeleton, useLoad, type IconName } from '@/components/ui';
import { awardSentence, awardShareText, awardsOf, awardTitle, BADGE_KINDS, fmtPct, improvementPct, kindOf } from '@/constants/achievements';
import { color, HIT, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { SPORT_NAME } from '@shared/records.ts';
import type { WorkoutLog } from '@shared/types.ts';

const BIG = 128;
const GLOW = 260;

function Glow({ tint }: { tint: string }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={GLOW} height={GLOW} style={{ position: 'absolute' }} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tint} stopOpacity={0.42} />
          <Stop offset="0.5" stopColor={tint} stopOpacity={0.12} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

function InfoRow({ icon, label, value, tint }: { icon: IconName; label: string; value: string; tint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 40 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={color.textSecondary} />
      <Text style={[type.subhead, { color: color.textSecondary, flex: 1 }]}>{label}</Text>
      <Text style={[type.headline, { color: tint ?? color.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Dettaglio di un riconoscimento: badge grande, nome e frase; categoria; valore raggiunto, record precedente e
 * miglioramento in % (calcolato dai due valori reali del motore); data e attività di conquista; "Condividi".
 * Mostra solo i campi che il motore fornisce davvero.
 */
export default function DettaglioRiconoscimento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(async () => {
    const logs = await call<WorkoutLog[]>('listWorkoutLogs', null);
    const a = awardsOf(logs).awards.find((x) => x.id === id) ?? null;
    return { a, log: a ? logs.find((l) => l.id === a.logId) ?? null : null };
  }, [id]);

  return (
    <Screen onRefresh={state.reload} style={{ gap: S.lg }}>
      <Stack.Screen options={{ title: 'Dettaglio riconoscimento' }} />
      <Async state={state} skeleton={<><Skeleton height={220} /><Skeleton height={160} /></>}>
        {({ a, log }) => {
          if (!a) return <Empty iconName="ribbon-outline" title="Riconoscimento non disponibile" text="L’attività che lo aveva conquistato è stata modificata o cancellata." />;
          const kind = kindOf(a);
          const tone = BADGE_KINDS[kind].tone;
          const pct = improvementPct(a);
          const gain = pct !== null ? fmtPct(pct) : a.improvement;
          return (
            <>
              <View style={{ alignItems: 'center', gap: S.sm }}>
                <View style={{ width: '100%', height: BIG + 48, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute', width: GLOW, height: GLOW, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Glow tint={tone.solid} />
                  </View>
                  <AwardPop play delay={80} from={0.6}>
                    <AwardMark a={a} size={BIG} />
                  </AwardPop>
                </View>
                <Rise delay={160} dy={10}>
                  <Text style={[type.title1, { color: color.text, textAlign: 'center' }]} accessibilityRole="header">
                    {awardTitle(a)}
                  </Text>
                </Rise>
                <Rise delay={240} dy={10}>
                  <Text style={[type.subhead, { color: color.textSecondary, textAlign: 'center', paddingHorizontal: S.lg }]}>{awardSentence(a)}</Text>
                </Rise>
              </View>

              <Panel style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md }}>
                <View accessible accessibilityLabel={`Categoria: ${a.record ? 'Record personale' : BADGE_KINDS[kind].label}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                  <BadgeHex kind={kind} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.caption, { color: color.textSecondary }]}>Categoria</Text>
                    <Text style={[type.headline, { color: tone.light }]}>{a.record ? 'Record personale' : BADGE_KINDS[kind].label}</Text>
                  </View>
                </View>
              </Panel>

              <Panel style={{ paddingHorizontal: S.lg, paddingVertical: S.sm }}>
                <InfoRow icon="flag-outline" label="Valore raggiunto" value={a.value} />
                {a.previous ? <InfoRow icon="time-outline" label="Precedente record" value={a.previous} /> : null}
                {a.previous && gain ? <InfoRow icon="trending-up" label="Miglioramento" value={gain} tint={color.success} /> : null}
              </Panel>

              <Panel style={{ paddingHorizontal: S.lg, paddingVertical: S.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52 }} accessible accessibilityLabel={`Data di conquista: ${fmtDate(a.date)}, ore ${timeOf(a.date)}`}>
                  <Ionicons name="time-outline" size={20} color={color.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.caption, { color: color.textSecondary }]}>Data di conquista</Text>
                    <Text style={[type.callout, { color: color.text }]}>
                      {fmtDate(a.date)} · {timeOf(a.date)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  disabled={!log}
                  onPress={() => router.push({ pathname: '/allenamento/log/[id]', params: { id: a.logId } })}
                  accessibilityRole={log ? 'button' : undefined}
                  accessibilityLabel={`Attività: ${log?.title || SPORT_NAME[a.sport]}${log ? '. Apri l’attività' : ''}`}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52, borderTopWidth: 1, borderTopColor: color.separator }, pressed && { opacity: 0.6 }]}
                >
                  <SportSquare sport={a.sport} tint={tone.solid} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.caption, { color: color.textSecondary }]}>Attività</Text>
                    <Text style={[type.callout, { color: color.text }]} numberOfLines={1}>
                      {log?.title || SPORT_NAME[a.sport]}
                    </Text>
                  </View>
                  {log ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null}
                </Pressable>
              </Panel>

              <Text style={[type.footnote, { color: color.textTertiary }]}>{a.description}</Text>

              <Pressable onPress={() => void Share.share({ message: awardShareText(a) })} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 52, borderRadius: R.pill, backgroundColor: pressed ? color.surfacePressed : color.surfaceElevated, flexDirection: 'row', gap: S.sm, alignItems: 'center', justifyContent: 'center', minWidth: HIT })}>
                <Ionicons name="share-social-outline" size={18} color={color.text} />
                <Text style={[type.headline, { color: color.text }]}>Condividi</Text>
              </Pressable>
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
