import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { BadgeHex } from '@/components/BadgeHex';
import { SectionHead } from '@/components/BadgeParts';
import { AnimatedBar } from '@/components/Motion';
import { Rise } from '@/components/Results';
import { Async, Panel, PressableScale, Screen, Skeleton, t, useLoad, useReduceMotion, type IconName } from '@/components/ui';
import { BADGE_KINDS } from '@/constants/achievements';
import { color, R, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import type { GoalProgress, GoalSuggestion } from '@shared/goals.ts';
import type { GoalType } from '@shared/types.ts';

const ACircle = Animated.createAnimatedComponent(Circle);

/** Come appare ogni tipo di obiettivo reale (shared/goals.ts) nell'elenco "Progressi". */
const ROW: Record<GoalType, { label: string; icon: IconName; tint: string }> = {
  weekly_km: { label: 'Distanza settimanale', icon: 'navigate', tint: color.success },
  weekly_minutes: { label: 'Tempo di attività', icon: 'time', tint: BADGE_KINDS.steady.tone.solid },
  consistency: { label: 'Allenamenti', icon: 'calendar', tint: color.brand },
  group: { label: 'Uscite di gruppo', icon: 'people', tint: color.accent },
};
/** Ordine dell'elenco (come nel mockup: distanza, tempo, allenamenti). */
const ORDER: GoalType[] = ['weekly_km', 'weekly_minutes', 'consistency', 'group'];

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const hm = (min: number) => { const total = Math.round(min); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

/** "23,4 / 50 km", "3:12 / 5:00 h", "3 / 4". */
function progressText(g: GoalProgress): string {
  const { type: k, target } = g.goal;
  if (k === 'weekly_km') return `${num(g.current)} / ${num(target)} km`;
  if (k === 'weekly_minutes') return `${hm(g.current)} / ${hm(target)} h`;
  return `${num(g.current)} / ${num(target)}`;
}

/** Quantità con la sua unità, al singolare quando serve ("1 allenamento", "3:12 h", "23,4 km"). */
function amount(k: GoalType, v: number): string {
  if (k === 'weekly_km') return `${num(v)} km`;
  if (k === 'weekly_minutes') return `${hm(v)} h`;
  if (k === 'group') return `${num(v)} ${v === 1 ? 'uscita di gruppo' : 'uscite di gruppo'}`;
  return `${num(v)} ${v === 1 ? 'allenamento' : 'allenamenti'}`;
}

const pctOf = (g: GoalProgress) => (g.goal.target > 0 ? g.current / g.goal.target : 0);

/** Anello di avanzamento che si riempie fino al valore reale (fermo con movimento ridotto). */
function Ring({ pct, size = 88, stroke = 9, tint, children }: { pct: number; size?: number; stroke?: number; tint: string; children: React.ReactNode }) {
  const still = useReduceMotion();
  const target = Math.max(0, Math.min(1, pct));
  const p = useSharedValue(still ? target : 0);
  useEffect(() => {
    if (still) {
      cancelAnimation(p);
      p.set(target);
      return;
    }
    p.set(withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(p);
  }, [target, still, p]);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const arc = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.get()) }));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.surfaceElevated} strokeWidth={stroke} fill="none" />
        {target > 0 ? <ACircle cx={size / 2} cy={size / 2} r={r} stroke={tint} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} animatedProps={arc} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

function ProgressRow({ g, delay }: { g: GoalProgress; delay: number }) {
  const row = ROW[g.goal.type];
  const p = pctOf(g);
  const pct = Math.round(Math.min(1, p) * 100);
  return (
    <View style={{ flexDirection: 'row', gap: S.md, paddingVertical: S.md }} accessible accessibilityLabel={`${row.label}: ${amount(g.goal.type, g.current)} su ${amount(g.goal.type, g.goal.target)}, ${pct}%${g.period === 'month' ? ', questo mese' : ', questa settimana'}`}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${row.tint}2E`, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        <Ionicons name={row.icon} size={13} color={row.tint} />
      </View>
      <View style={{ flex: 1, gap: S.xs }}>
        <Text style={[type.headline, { color: color.text }]}>{row.label}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[type.footnote, { color: color.textSecondary, fontVariant: ['tabular-nums'] }]}>
            {progressText(g)}
            {g.period === 'month' ? ' · questo mese' : ''}
          </Text>
          <Text style={[type.footnote, { color: color.success, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{pct}%</Text>
        </View>
        <AnimatedBar pct={Math.min(1, p)} tint={row.tint} height={7} delay={delay} />
      </View>
    </View>
  );
}

/** Messaggio in fondo: quanto manca all'obiettivo principale, dai valori reali. */
function nudge(g: GoalProgress): { title: string; text: string; done: boolean } {
  const left = Math.round((g.goal.target - g.current) * 10) / 10;
  const when = g.period === 'week' ? 'di questa settimana' : 'di questo mese';
  if (left <= 0) return { title: 'Obiettivo raggiunto!', text: `Hai raggiunto il tuo obiettivo ${when}.`, done: true };
  const one = left === 1 && (g.goal.type === 'consistency' || g.goal.type === 'group');
  const what = `${one ? 'Manca solo' : 'Mancano'} ${amount(g.goal.type, left)} per raggiungere il tuo obiettivo.`;
  return { title: g.current > 0 ? 'Continua così!' : 'Si parte!', text: what, done: false };
}

function EmptyGoals({ sugg, onChosen }: { sugg: { hasHistory: boolean; period: string; suggestions: GoalSuggestion[] } | null; onChosen: () => Promise<void> }) {
  const [busy, setBusy] = useState<GoalType | null>(null);
  async function choose(s: GoalSuggestion) {
    setBusy(s.type);
    try {
      await call('setGoal', { type: s.type, target: s.target, basis: s.basis });
      await onChosen();
    } catch (e) {
      Alert.alert('Obiettivo non salvato', humanError(e, 'Riprova tra poco.'));
    } finally {
      setBusy(null);
    }
  }
  const list = sugg?.suggestions ?? [];
  return (
    <View style={{ gap: S.lg }}>
      <Panel style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.lg }}>
        <BadgeHex kind="goal_reached" size={72} locked />
        <View style={{ flex: 1, gap: S.xs }}>
          <Text style={[type.title2, { color: color.text }]}>Nessun obiettivo attivo</Text>
          <Text style={t.muted}>Scegli un obiettivo: qui ne segui l’avanzamento con le tue attività reali.</Text>
        </View>
      </Panel>
      {list.length ? (
        <View style={{ gap: S.sm }}>
          <SectionHead title="Proposte per te" />
          <Text style={t.small}>Dalle tue attività ({sugg?.period}). Tocca per sceglierne una.</Text>
          {list.map((s) => (
            <PressableScale key={s.type} onPress={() => void choose(s)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`Scegli l’obiettivo: ${s.what}. ${s.basis}`}>
              <Panel style={{ padding: S.md, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${ROW[s.type].tint}2E`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ROW[s.type].icon} size={15} color={ROW[s.type].tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.headline, { color: color.text }]}>{s.what}</Text>
                  <Text style={t.small} numberOfLines={2}>
                    {s.why}
                  </Text>
                </View>
                {busy === s.type ? <ActivityIndicator color={color.accent} /> : <Ionicons name="add-circle-outline" size={22} color={color.accent} />}
              </Panel>
            </PressableScale>
          ))}
        </View>
      ) : (
        <Pressable onPress={() => router.push('/statistiche')} accessibilityRole="button" accessibilityLabel="Imposta il tuo obiettivo indicando la tua disponibilità" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingHorizontal: S.lg, borderRadius: R.card, backgroundColor: color.surface }, pressed && { backgroundColor: color.surfacePressed }]}>
          <Ionicons name="add-circle-outline" size={22} color={color.accent} />
          <Text style={[type.callout, { color: color.accent, fontWeight: '600', flex: 1 }]}>Imposta il tuo obiettivo</Text>
          <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Obiettivi: anello dell'obiettivo principale (le uscite della settimana, se impostato), avanzamento di tutti gli
 * obiettivi attivi e quanto manca. Solo gli obiettivi reali di shared/goals.ts, calcolati sulle attività registrate.
 * Senza obiettivi: stato vuoto con le proposte basate sullo storico, o il questionario sulla disponibilità.
 */
export default function Obiettivi() {
  const state = useLoad(async () => {
    const [goals, sugg] = await Promise.all([call<GoalProgress[]>('listGoals'), call<{ hasHistory: boolean; period: string; suggestions: GoalSuggestion[] }>('suggestGoals').catch(() => null)]);
    return { goals, sugg };
  });

  return (
    <Screen onRefresh={state.reload} style={{ gap: S.xl }}>
      <Stack.Screen options={{ title: 'Obiettivi' }} />
      <Async state={state} skeleton={<><Skeleton height={120} /><Skeleton height={220} /></>}>
        {({ goals, sugg }) => {
          if (!goals.length) return <EmptyGoals sugg={sugg} onChosen={state.reload} />;
          const sorted = [...goals].sort((a, b) => ORDER.indexOf(a.goal.type) - ORDER.indexOf(b.goal.type));
          const main = goals.find((g) => g.goal.type === 'consistency') ?? sorted[0];
          const n = nudge(main);
          const tint = ROW[main.goal.type].tint === color.brand ? color.success : ROW[main.goal.type].tint;
          return (
            <>
              <PressableScale onPress={() => router.push('/statistiche')} accessibilityRole="button" accessibilityLabel={`Obiettivo ${main.period === 'week' ? 'settimanale' : 'mensile'}: ${amount(main.goal.type, main.current)} su ${amount(main.goal.type, main.goal.target)}. Apri i progressi`}>
                <Panel style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.lg }}>
                  <Ring pct={pctOf(main)} tint={tint}>
                    <Text style={[type.title2, { color: color.text, fontVariant: ['tabular-nums'] }]} allowFontScaling={false}>
                      {main.goal.type === 'weekly_minutes' ? `${Math.floor(main.current / 60)}/${Math.round(main.goal.target / 60)}` : `${Math.floor(main.current)}/${num(main.goal.target)}`}
                    </Text>
                  </Ring>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.headline, { color: color.text, fontWeight: '700' }]}>Obiettivo {main.period === 'week' ? 'settimanale' : 'mensile'}</Text>
                    <Text style={[type.footnote, { color: color.textSecondary }]}>{amount(main.goal.type, main.current)}</Text>
                    <Text style={[type.caption, { color: color.textTertiary }]}>Prossimo traguardo: {amount(main.goal.type, main.goal.target)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
                </Panel>
              </PressableScale>
              {main.paused ? <Text style={t.small}>Il piano è in pausa: questo periodo non conta, nessun problema.</Text> : null}

              <View>
                <SectionHead title="Progressi" />
                {sorted.map((g, i) => (
                  <View key={g.goal.id} style={i ? { borderTopWidth: 1, borderTopColor: color.separator } : null}>
                    <ProgressRow g={g} delay={i * 120} />
                  </View>
                ))}
              </View>

              <Rise delay={240} dy={10}>
                <PressableScale onPress={() => router.push('/allenamento')} accessibilityRole="button" accessibilityLabel={`${n.title} ${n.text} Apri il tuo piano`}>
                  <Panel tone="accent" style={{ padding: S.lg, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                    <BadgeHex kind="goal_reached" size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.headline, { color: color.text, fontWeight: '700' }]}>{n.title}</Text>
                      <Text style={[type.footnote, { color: color.textSecondary }]}>{n.text}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={color.accent} />
                  </Panel>
                </PressableScale>
              </Rise>
            </>
          );
        }}
      </Async>
    </Screen>
  );
}
