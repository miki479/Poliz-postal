import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Panel, t, useLoad } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { fmtPace, toISODate } from '@/lib/format';
import type { GoalProgress } from '@shared/goals.ts';
import type { GroupComparison } from '@shared/comparison.ts';
import type { WorkoutLog } from '@shared/types.ts';

const DAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Riflesso di colore dietro una sezione: porta l'occhio su ciò che conta. */
export function Glow({ tint = color.accent, size = 220 }: { tint?: string; size?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -size / 2, left: -size / 2, width: size * 1.6, height: size * 1.2 }}>
      <Svg width="100%" height="100%">
        <Defs><RadialGradient id="g" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={tint} stopOpacity={0.4} /><Stop offset="1" stopColor={tint} stopOpacity={0} /></RadialGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#g)" />
      </Svg>
    </View>
  );
}

/** Registro della settimana: una bolla per giorno, grande quanto i km fatti (solo dati veri). */
export function WeekLog({ logs }: { logs: WorkoutLog[] }) {
  const start = new Date(); start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    const km = logs.filter((l) => toISODate(new Date(l.startedAt)) === iso).reduce((n, l) => n + (l.distanceKm ?? 0), 0);
    return { iso, km, today: iso === toISODate(new Date()) };
  });
  const total = days.reduce((n, d) => n + d.km, 0);
  const max = Math.max(1, ...days.map((d) => d.km));
  return (
    <Pressable onPress={() => router.push('/statistiche')} accessibilityRole="button" accessibilityLabel={`Registro di questa settimana: ${total.toFixed(1)} chilometri. Apri le statistiche`} style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={t.h2}>Registro della settimana</Text>
        <Text style={[type.subhead, { color: color.accent, fontWeight: '700' }]}>{total.toFixed(1).replace('.', ',')} km ›</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 76 }}>
        {days.map((d, i) => {
          const s = d.km > 0 ? 14 + (d.km / max) * 40 : 6;
          return (
            <View key={d.iso} style={{ width: 42, alignItems: 'center', gap: 6 }}>
              <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: d.km > 0 ? color.accent : color.controlBorder, opacity: d.km > 0 ? 0.9 : 0.5 }} />
              <Text style={[type.caption, { color: d.today ? color.text : color.textSecondary, fontWeight: d.today ? '800' : '500' }]}>{DAYS[i]}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const sign = (s: number) => (s === 0 ? 'stesso passo' : s < 0 ? `${Math.abs(s)}″ più veloce` : `${s}″ più lento`);

/** "Tu e gli altri": come vai rispetto alle persone con cui hai corso nelle uscite di gruppo. */
export function GroupCompare() {
  const s = useLoad(() => call<GroupComparison>('groupComparison'));
  const g = s.data;
  if (!g || !g.groupRuns) return null;
  const faster = g.myPace !== null && g.othersPace !== null ? g.othersPace - g.myPace : null;
  return (
    <Panel style={{ padding: S.lg, gap: S.md, overflow: 'hidden' }}>
      <Glow tint="#5CE1E6" size={200} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={t.h2}>Tu e gli altri</Text>
        <Text style={t.small}>{g.groupRuns} {g.groupRuns === 1 ? 'corsa' : 'corse'} di gruppo</Text>
      </View>
      {g.myPace !== null && g.othersPace !== null ? (
        <View style={{ gap: S.sm }}>
          {[['Tu', g.myPace, color.accent], ['Gli altri', g.othersPace, color.textSecondary]].map(([l, v, c]) => {
            const lo = Math.min(g.myPace!, g.othersPace!) - 40;
            const w = 0.45 + 0.55 * ((Number(v) - lo) / Math.max(1, Math.max(g.myPace!, g.othersPace!) - lo));
            return (
              <View key={String(l)} style={{ gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.subhead, { color: color.text, fontWeight: '700' }]}>{String(l)}</Text>
                  <Text style={[type.subhead, { color: color.text, fontVariant: ['tabular-nums'] }]}>{fmtPace(Number(v))}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: color.controlBorder }}><View style={{ width: `${Math.round(w * 100)}%`, height: 6, borderRadius: 3, backgroundColor: String(c) }} /></View>
              </View>
            );
          })}
          <Text style={[type.footnote, { color: color.textSecondary }]}>
            {faster === null ? '' : faster > 3 ? `In media corri ${faster}″/km più veloce del gruppo` : faster < -3 ? `In media il gruppo è ${Math.abs(faster)}″/km più veloce di te` : 'Il tuo passo è in linea con quello del gruppo'}
            {g.avgRank ? ` · posizione media ${String(g.avgRank).replace('.', ',')}` : ''}
          </Text>
        </View>
      ) : null}
      {g.peers.length ? (
        <View>
          {g.peers.map((p) => (
            <Pressable key={p.user.id} onPress={() => router.push({ pathname: '/utente/[id]', params: { id: p.user.id } })} accessibilityRole="button" accessibilityLabel={`${p.user.displayName}: ${p.runsTogether} corse insieme${p.paceDiffSec !== null ? `, ${sign(p.paceDiffSec)}` : ''}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 50, opacity: pressed ? 0.6 : 1 })}>
              <Avatar name={p.user.displayName} hue={p.user.hue} uri={p.user.avatar} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: color.text, fontWeight: '600' }]} numberOfLines={1}>{p.user.displayName}</Text>
                <Text style={t.small}>{p.runsTogether} {p.runsTogether === 1 ? 'corsa' : 'corse'} insieme · {String(p.kmTogether).replace('.', ',')} km</Text>
              </View>
              {p.paceDiffSec !== null ? <Text style={[type.footnote, { color: p.paceDiffSec <= 0 ? color.success : color.textSecondary, fontWeight: '700' }]}>{sign(p.paceDiffSec)}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

/** Obiettivi settimanali/mensili con avanzamento reale. */
export function GoalsCard() {
  const s = useLoad(() => call<GoalProgress[]>('listGoals').catch(() => [] as GoalProgress[]));
  const list = (s.data ?? []).filter((g) => g.goal.status === 'active' && !g.paused).slice(0, 3);
  return (
    <Pressable onPress={() => router.push('/obiettivi')} accessibilityRole="button" accessibilityLabel="Obiettivi" style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={t.h2}>Obiettivi</Text>
        <Text style={[type.subhead, { color: color.accent, fontWeight: '700' }]}>{list.length ? 'Gestisci ›' : 'Scegli il primo ›'}</Text>
      </View>
      {list.map((g) => {
        const f = Math.min(1, g.current / Math.max(1, g.goal.target));
        return (
          <View key={g.goal.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type.subhead, { color: color.text }]}>{g.label}</Text>
              <Text style={[type.subhead, { color: color.textSecondary, fontVariant: ['tabular-nums'] }]}>{Math.round(g.current * 10) / 10}/{g.goal.target} {g.unit}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: color.controlBorder }}><View style={{ width: `${Math.round(f * 100)}%`, height: 6, borderRadius: R.pill, backgroundColor: f >= 1 ? color.success : color.accent }} /></View>
          </View>
        );
      })}
      {!list.length ? <Text style={t.muted}>Un traguardo a settimana, calcolato dal tuo storico.</Text> : null}
    </Pressable>
  );
}

export const ProgressIcon = Ionicons;
