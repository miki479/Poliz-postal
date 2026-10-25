import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AwardMark } from '@/components/Results';
import { TypeDot, TypeTile } from '@/components/TypeBadge';
import { Panel, PressableScale } from '@/components/ui';
import { awardTitle } from '@/constants/achievements';
import { color, R, S, type } from '@/constants/theme';
import { fmtClock, fmtDate, fmtKm } from '@/lib/format';
import { mix, styleOfLog } from '@/lib/storyPalette';
import { activityAwards, dedupe } from '@shared/records.ts';
import type { WorkoutLog } from '@shared/types.ts';

const INK = color.storyInk;
const INK2 = color.storyInkSecondary;

/** "12,4 km · 1:08:32" (la distanza solo se c'è davvero). */
const numbers = (l: WorkoutLog) => [l.distanceKm ? fmtKm(l.distanceKm) : '', l.durationSec ? fmtClock(l.durationSec) : ''].filter(Boolean).join(' · ');

const open = (l: WorkoutLog) => router.push({ pathname: '/allenamento/log/[id]', params: { id: l.id } });

/**
 * "Ultime novità" (mockup Home): l'attività più recente in evidenza, con il numero dei suoi riconoscimenti, il titolo del
 * principale e i badge; sotto, "Attività recenti". Solo dati reali: riconoscimenti calcolati dallo storico
 * (shared/records.ts), duplicati tra fonti contati una volta. Senza attività non mostra nulla (lo stato vuoto è della Home).
 *
 * Uso nella Home: `<LatestCard logs={logs} onOpenAll={() => …} />`, con `logs` = `call('listWorkoutLogs', null)`.
 * `onOpenAll` (facoltativo) rende toccabile l'intestazione con la freccia.
 */
export function LatestCard({ logs, onOpenAll, recent = 3 }: { logs: WorkoutLog[]; onOpenAll?: () => void; recent?: number }) {
  const data = useMemo(() => {
    const list = dedupe(logs).reverse();
    if (!list.length) return null;
    const latest = list[0];
    return { latest, awards: activityAwards(latest.id, logs), recent: list.slice(0, recent) };
  }, [logs, recent]);
  if (!data) return null;
  const { latest, awards } = data;
  const s = styleOfLog(latest);
  const [a] = s.blend ?? [s.solid];
  const shown = awards.slice(0, 4);
  const more = awards.length - shown.length;
  const featuredLabel = awards.length
    ? `${s.label}, ${fmtDate(latest.startedAt)}: ${awards.length === 1 ? 'un riconoscimento' : `${awards.length} riconoscimenti`}, il principale è ${awardTitle(awards[0])}. Apri l'attività`
    : `${s.label}, ${latest.title}, ${fmtDate(latest.startedAt)}, ${numbers(latest)}. Apri l'attività`;

  return (
    <Panel style={{ padding: S.lg, gap: S.lg }}>
      {onOpenAll ? (
        <Pressable onPress={onOpenAll} accessibilityRole="button" accessibilityLabel="Ultime novità: vedi tutte le attività" hitSlop={6} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }, pressed && { opacity: 0.6 }]}>
          <Text style={[type.title2, { color: color.text, flex: 1 }]} accessibilityRole="header">
            Ultime novità
          </Text>
          <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
        </Pressable>
      ) : (
        <Text style={[type.title2, { color: color.text }]} accessibilityRole="header">
          Ultime novità
        </Text>
      )}

      <PressableScale onPress={() => open(latest)} accessibilityRole="button" accessibilityLabel={featuredLabel}>
        <LinearGradient colors={[mix(color.brand, '#0B0F14', 0.25), mix(a, '#0B0F14', 0.45)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ borderRadius: R.card, padding: S.lg, gap: S.md, overflow: 'hidden' }}>
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.5 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
            <TypeDot style={s} size={32} light />
            <Text style={[type.headline, { color: INK, flex: 1 }]} numberOfLines={1}>
              {s.label}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={INK2} />
          </View>
          {awards.length ? (
            <>
              <View style={{ gap: 2 }}>
                <Text style={[type.title2, { color: INK }]}>{awards.length === 1 ? '1 riconoscimento' : `${awards.length} riconoscimenti`}</Text>
                <Text style={[type.subhead, { color: INK2 }]} numberOfLines={2}>
                  {awardTitle(awards[0])}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
                {shown.map((x) => (
                  <AwardMark key={x.id} a={x} size={44} />
                ))}
                {more > 0 ? <Text style={[type.subhead, { color: INK, fontWeight: '700', marginLeft: S.xs }]}>+{more}</Text> : null}
                <View style={{ flex: 1 }} />
                <Ionicons name="chevron-forward" size={18} color={INK2} />
              </View>
            </>
          ) : (
            <View style={{ gap: 2 }}>
              <Text style={[type.title2, { color: INK }]} numberOfLines={2}>
                {latest.title}
              </Text>
              <Text style={[type.subhead, { color: INK2, fontVariant: ['tabular-nums'] }]}>{[fmtDate(latest.startedAt), numbers(latest)].filter(Boolean).join(' · ')}</Text>
            </View>
          )}
        </LinearGradient>
      </PressableScale>

      <View style={{ gap: S.xs }}>
        <Text style={[type.headline, { color: color.text }]} accessibilityRole="header">
          Attività recenti
        </Text>
        {data.recent.map((l) => {
          const st = styleOfLog(l);
          return (
            <Pressable key={l.id} onPress={() => open(l)} accessibilityRole="button" accessibilityLabel={`${st.label}, ${fmtDate(l.startedAt)}, ${numbers(l)}. Apri l'attività`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64 }, pressed && { opacity: 0.6 }]}>
              <TypeTile style={st} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={1}>
                  <Text style={{ color: color.text, fontWeight: '700' }}>{st.label}</Text> · {fmtDate(l.startedAt)}
                </Text>
                <Text style={[type.headline, { color: color.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
                  {numbers(l) || l.title}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
            </Pressable>
          );
        })}
      </View>
    </Panel>
  );
}
