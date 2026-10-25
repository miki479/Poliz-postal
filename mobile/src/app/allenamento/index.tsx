import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, View } from 'react-native';

import { CheckInSheet } from '@/components/CheckIn';
import { PlanChangeSheet, UndoBanner, type ChangeRequest } from '@/components/PlanChange';
import { BriefHero, BriefPanel, BriefRow } from '@/components/ToneBanner';
import { Banner, Button, Chip, Divider, IconButton, LinkText, Metric, Row, Screen, Section, Segmented, Skeleton, t, useLoad, type IconName } from '@/components/ui';
import { color, R, S, type } from '@/constants/theme';
import { call, ext } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { addDaysIso, deviceTimezone, fmtClock, fmtDuration, fmtKm, KIND_LABEL, startOfWeekIso, WEEKDAYS_SHORT } from '@/lib/format';
import { sessionOutcome, shortDate, todayIso } from '@/lib/plan';
import { ColorBar, DayDots } from '@/components/ActivityMark';
import { ACTIVITY_STYLES, resolveState, styleOfKind, styleOfSport, type ActivityStyle } from '@/constants/activityColors';
import { toISODate } from '@/lib/format';
import type { AdviceTone, PlanAdvice } from '@shared/adaptive.ts';
import type { AdjustAction, PlanChange, PlannedSession, PlanState, TrainingPlan, WorkoutLog } from '@shared/types.ts';

/**
 * Aspetto del consiglio del giorno (card in evidenza). Colori dalla palette centralizzata: dolore = limitazione fisica,
 * pausa o vacanza = piano in pausa, stanchezza o malessere = recupero, il resto = l'accento (corsa).
 */
function adviceLook(tone: AdviceTone, mode: PlanState['mode']): { icon: IconName; tint: string; badge?: string } {
  if (tone === 'urgent') return { icon: 'medkit', tint: ACTIVITY_STYLES.injury.solid, badge: 'Importante' };
  if (mode !== 'active') return { icon: mode === 'vacation' ? 'airplane' : 'pause', tint: ACTIVITY_STYLES.paused.solid };
  if (tone === 'care') return { icon: 'heart', tint: ACTIVITY_STYLES.recovery.solid, badge: 'Recupero' };
  return { icon: 'bulb', tint: color.accent, badge: 'Consigliato' };
}

/** Card delle scelte proposte: icona e colore per azione (seduta più leggera = recupero, salto = riposo, pausa = piano in pausa). */
const ACTION_LOOK: Record<AdjustAction, { icon: IconName; tint: string }> = {
  swap_easy: { icon: 'leaf-outline', tint: ACTIVITY_STYLES.recovery.solid },
  shorten: { icon: 'hourglass-outline', tint: ACTIVITY_STYLES.aerobic.solid },
  move: { icon: 'calendar-outline', tint: ACTIVITY_STYLES.long.solid },
  skip: { icon: 'remove-circle-outline', tint: ACTIVITY_STYLES.rest.solid },
  pause: { icon: 'pause-circle-outline', tint: ACTIVITY_STYLES.paused.solid },
  vacation: { icon: 'airplane-outline', tint: ACTIVITY_STYLES.paused.solid },
  resume: { icon: 'play-circle-outline', tint: ACTIVITY_STYLES.run.solid },
};

interface PlanData {
  state: PlanState;
  advice: PlanAdvice;
  sessions: PlannedSession[];
  plans: TrainingPlan[];
  logs: WorkoutLog[];
  sync: { connected: boolean; lastSyncAt: string | null };
}

async function loadPlan(): Promise<PlanData> {
  const today = todayIso();
  const [state, advice, sessions, plans, logs, strava] = await Promise.all([
    call<PlanState>('getPlanState'),
    call<PlanAdvice>('planAdvice', today),
    call<PlannedSession[]>('listSessions', { from: addDaysIso(today, -14), to: addDaysIso(today, 35) }),
    call<TrainingPlan[]>('listPlans'),
    call<WorkoutLog[]>('listWorkoutLogs', null).catch(() => [] as WorkoutLog[]),
    ext.strava.status().catch(() => null),
  ]);
  return { state, advice, sessions, plans, logs: [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), sync: { connected: !!strava?.connected && !strava.revoked, lastSyncAt: strava?.lastSyncAt ?? null } };
}

/** Colore di una seduta pianificata: pausa e infortunio sono stati del piano e hanno colori propri, non quelli delle attività. */
function plannedStyle(s: PlannedSession, mode: PlanState['mode'], injury: boolean): ActivityStyle {
  if (injury && s.status !== 'completed') return ACTIVITY_STYLES.injury;
  if (s.status === 'paused' || (mode !== 'active' && s.status !== 'completed')) return ACTIVITY_STYLES.paused;
  return styleOfKind(s.kind, s.title);
}

function SessionRow({ s, today, sync, mode, injury, done }: { s: PlannedSession; today: string; sync: PlanData['sync']; mode: PlanState['mode']; injury: boolean; done: WorkoutLog[] }) {
  const o = sessionOutcome(s, today, sync);
  const st = plannedStyle(s, mode, injury);
  return (
    <View>
      <Pressable onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } })} accessibilityRole="button" accessibilityLabel={`${shortDate(s.date)}: ${s.title || KIND_LABEL[s.kind]}, ${st.label}, ${fmtDuration(s.durationMin)}, ${o.label}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 60, paddingVertical: S.sm }, pressed && { opacity: 0.6 }]}>
        <ColorBar style={st} height={44} />
        <Text style={[t.small, { width: 60 }]}>{shortDate(s.date)}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[t.title, (s.status === 'skipped' || s.status === 'paused') && { color: color.textSecondary }]}>{s.title || KIND_LABEL[s.kind]}</Text>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Text style={[type.footnote, { color: st.solid, fontWeight: '700' }]}>{st.label}</Text>
            <Text style={t.small}>· {fmtDuration(s.durationMin)}</Text>
            <Chip label={o.label} tone={o.tone} iconName={o.icon} />
          </Row>
        </View>
        <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Pressable>
      {/* Attività realmente svolte lo stesso giorno: separate dalla seduta prevista, ognuna col proprio colore */}
      {done.map((l) => {
        const ls = styleOfSport(l.sport ?? 'running');
        return (
          <Pressable key={l.id} onPress={() => router.push({ pathname: '/allenamento/log/[id]', params: { id: l.id } })} accessibilityRole="button" accessibilityLabel={`Svolta: ${l.title}, ${ls.label}`} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 44, paddingLeft: S.lg, paddingBottom: S.sm }, pressed && { opacity: 0.6 }]}>
            <ColorBar style={ls} height={28} />
            <Text style={[type.footnote, { color: color.textSecondary }]}>Svolto</Text>
            <Text style={[type.subhead, { color: color.text, flex: 1 }]} numberOfLines={1}>
              {l.title}
            </Text>
            <Text style={[type.footnote, { color: ls.solid, fontWeight: '700' }]}>{ls.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Piano() {
  const state = useLoad(loadPlan);
  const [view, setView] = useState<'today' | 'week' | 'calendar'>('today');
  const [checkin, setCheckin] = useState(false);
  const [req, setReq] = useState<ChangeRequest | null>(null);
  const [applied, setApplied] = useState<PlanChange | null>(null);
  const [why, setWhy] = useState(false);
  const today = todayIso();
  const d = state.data;

  function menu() {
    const options = ['Sono in vacanza', 'Metti in pausa il piano', 'Crea un nuovo piano', 'Obiettivi e progressi', 'Chiudi'];
    const pick = (i: number) => {
      if (i === 0) setCheckin(true);
      if (i === 1) setReq({ action: 'pause', params: { from: today, until: null } });
      if (i === 2) router.push('/allenamento/piano');
      if (i === 3) router.push('/statistiche');
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 4 }, pick);
    else Alert.alert('Piano', undefined, options.slice(0, -1).map((o, i) => ({ text: o, onPress: () => pick(i) })));
  }

  const weekStart = startOfWeekIso(new Date(), deviceTimezone());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const injuryToday = !!d?.advice.flags.pain || !!d?.advice.flags.illness;
  const loggedOn = (day: string) => (d?.logs ?? []).filter((l) => toISODate(new Date(l.startedAt)) === day);
  const mode = d?.state.mode ?? 'active';
  const week = d?.sessions.filter((s) => s.date >= weekStart && s.date <= weekDays[6]) ?? [];
  const todays = d?.sessions.filter((s) => s.date === today) ?? [];
  const next = d?.sessions.find((s) => s.date > today && (s.status === 'planned' || s.status === 'rescheduled'));
  const done = week.filter((s) => s.status === 'completed');
  const hasPlan = !!d && (d.plans.some((p) => !p.archived) || d.sessions.length > 0);
  const active = d?.state.mode === 'active';

  return (
    <Screen onRefresh={state.reload}>
      <Stack.Screen
        options={{
          title: 'Piano',
          headerRight: () => (
            <Row gap={0}>
              <IconButton name="pulse-outline" label="Check-in: come ti senti, tempo, dolore, vacanza o pausa" color={color.accent} onPress={() => setCheckin(true)} />
              <IconButton name="add" label="Nuova seduta" color={color.accent} onPress={() => router.push({ pathname: '/allenamento/sessione-form', params: { date: today } })} />
              <IconButton name="ellipsis-horizontal" label="Altre azioni sul piano" color={color.accent} onPress={menu} />
            </Row>
          ),
        }}
      />
      {!d ? (
        state.loading ? <Skeleton height={180} /> : <Banner tone="error" text={state.error} action="Riprova" onAction={state.reload} />
      ) : (
        <>
          {applied ? <UndoBanner change={applied} onUndone={() => { setApplied(null); void state.reload(); }} onDismiss={() => setApplied(null)} /> : null}

          {/* Stato del piano o decisione utile, come briefing compatto (mockup): la card in evidenza con il consiglio,
              le scelte in card colorate più piccole con la freccia, il perché in "Dimmi di più". Un solo modulo alla volta. */}
          {d.advice.message ? (
            (() => {
              const look = adviceLook(d.advice.tone, d.state.mode);
              const talk = () => router.push({ pathname: '/coach', params: { preset: 'free', prompt: `${d.advice.message} ${d.advice.basis.join('. ')}` } });
              return (
                <View style={{ gap: S.sm }}>
                  <BriefHero icon={look.icon} tint={look.tint} badge={look.badge} title={active ? 'Una scelta per oggi' : d.state.mode === 'vacation' ? 'In vacanza' : 'Piano in pausa'} text={d.advice.message} alert={d.advice.tone === 'urgent'} onMore={d.advice.basis.length ? () => setWhy(true) : undefined} />
                  {d.advice.options.map((o, i) => {
                    const a = ACTION_LOOK[o.action];
                    return <BriefRow key={o.action + i} order={i} icon={a.icon} tint={a.tint} title={o.label} onPress={() => setReq({ action: o.action, params: o.params, basis: d.advice.basis })} accessibilityHint="Mostra cosa cambia prima di applicarlo" />;
                  })}
                  {d.advice.canTalk ? <BriefRow order={d.advice.options.length} icon="chatbubbles-outline" tint={color.brand} title="Parliamone" subtitle="Il Coach AI spiega, non modifica il piano" onPress={talk} /> : null}
                  <BriefPanel visible={why} onClose={() => setWhy(false)} icon={look.icon} tint={look.tint} badge={look.badge} title={active ? 'Una scelta per oggi' : d.state.mode === 'vacation' ? 'In vacanza' : 'Piano in pausa'} subtitle={d.advice.message}>
                    <Text style={[type.headline, { color: color.storyInk, textAlign: 'center' }]}>Su cosa si basa</Text>
                    {d.advice.basis.map((b) => (
                      <Row key={b} gap={S.sm} style={{ alignItems: 'flex-start' }}>
                        <Ionicons name="checkmark-circle" size={18} color={color.storyInk} style={{ marginTop: 1 }} />
                        <Text style={[type.body, { color: color.storyInk, flex: 1 }]}>{b}</Text>
                      </Row>
                    ))}
                    <Text style={[type.footnote, { color: color.storyInkSecondary, textAlign: 'center' }]}>Solo i tuoi dati e le regole del piano: nessuna diagnosi. Ogni scelta mostra cosa cambia prima di applicarla.</Text>
                  </BriefPanel>
                </View>
              );
            })()
          ) : null}

          {!hasPlan ? (
            <View style={{ gap: S.sm }}>
              <Text style={t.title1}>Corri con un obiettivo</Text>
              <Text style={t.muted}>Scegli un obiettivo semplice o crea un piano su misura: poi trovi qui la prossima seduta e la settimana.</Text>
              <Button title="Crea il tuo piano" iconName="sparkles-outline" onPress={() => router.push('/allenamento/piano')} />
              <LinkText title="Imposta solo un obiettivo" onPress={() => router.push('/statistiche')} />
            </View>
          ) : (
            <>
              <Segmented value={view} onChange={setView} options={[{ value: 'today', label: 'Oggi' }, { value: 'week', label: 'Settimana' }, { value: 'calendar', label: 'Calendario' }]} />

              {view === 'today' ? (
                todays.length ? (
                  todays.map((s) => {
                    const o = sessionOutcome(s, today, d.sync);
                    const pendingToday = (s.status === 'planned' || s.status === 'rescheduled') && active;
                    return (
                      <View key={s.id} style={{ gap: S.sm }}>
                        <Chip label={o.label} tone={o.tone} iconName={o.icon} />
                        <Text style={t.h1}>{s.title || KIND_LABEL[s.kind]}</Text>
                        <Text style={t.muted}>{[KIND_LABEL[s.kind], fmtDuration(s.durationMin), s.distanceKm ? fmtKm(s.distanceKm) : null].filter(Boolean).join(' · ')}</Text>
                        {s.adjustment ? <Text style={t.small}>Prima era: {s.adjustment.from.title} · {fmtDuration(s.adjustment.from.durationMin)}</Text> : null}
                        {s.description ? <Text style={t.body}>{s.description}</Text> : null}
                        {pendingToday ? <Button title="Inizia e registra" iconName="play" onPress={() => router.push({ pathname: '/registra', params: { session: s.id } })} /> : null}
                        <LinkText title="Dettagli della seduta" onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } })} />
                      </View>
                    );
                  })
                ) : (
                  <View style={{ gap: S.sm }}>
                    <Text style={t.title1}>Oggi riposo</Text>
                    <Text style={t.muted}>Il recupero fa parte del piano.{next ? ` La prossima seduta è ${shortDate(next.date)}: ${next.title || KIND_LABEL[next.kind]}.` : ''}</Text>
                    {next ? <LinkText title="Vedi la prossima seduta" onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: next.id } })} /> : null}
                  </View>
                )
              ) : null}

              {view === 'week' ? (
                <>
                  <Row gap={0}>
                    <Metric value={`${done.length}/${week.filter((s) => s.status !== 'paused').length}`} label="Sedute fatte" />
                    <Metric value={fmtDuration(done.reduce((a, s) => a + s.durationMin, 0))} label="Tempo previsto svolto" />
                  </Row>
                  <Row gap={4}>
                    {weekDays.map((day, i) => {
                      const ss = week.filter((s) => s.date === day);
                      const logged = loggedOn(day);
                      const injury = injuryToday && day === today;
                      const kindOfDay = resolveState([...(injury ? (['injury'] as const) : []), ...(mode !== 'active' ? (['paused'] as const) : []), ...(ss.length || logged.length ? (['activity'] as const) : [])]);
                      const dots: ActivityStyle[] = kindOfDay === 'injury' ? [ACTIVITY_STYLES.injury] : kindOfDay === 'paused' ? [ACTIVITY_STYLES.paused] : [...ss.map((x) => plannedStyle(x, mode, false)), ...logged.map((l) => styleOfSport(l.sport ?? 'running'))];
                      const label = kindOfDay === 'injury' ? ACTIVITY_STYLES.injury.label : kindOfDay === 'paused' ? ACTIVITY_STYLES.paused.label : dots.length ? dots.map((x) => x.label).join(' e ') : 'nessuna seduta';
                      return (
                        <View key={day} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: S.sm, borderRadius: R.control, backgroundColor: day === today ? color.accentTint : 'transparent' }} accessible accessibilityLabel={`${WEEKDAYS_SHORT[i]} ${day.slice(8)}: ${label}`}>
                          <Text style={[type.caption, { color: color.textSecondary }]}>{WEEKDAYS_SHORT[i]}</Text>
                          <Text style={[type.headline, { color: day === today ? color.accent : color.text }]}>{day.slice(8)}</Text>
                          <DayDots styles={dots} />
                        </View>
                      );
                    })}
                  </Row>
                  <View>
                    {week.map((s, i) => (
                      <View key={s.id}>
                        {i ? <Divider /> : null}
                        <SessionRow s={s} today={today} sync={d.sync} mode={mode} injury={injuryToday && s.date === today} done={loggedOn(s.date)} />
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {view === 'calendar' ? (
                <View>
                  {d.sessions.filter((s) => s.date >= weekStart).map((s, i) => (
                    <View key={s.id}>
                      {i ? <Divider /> : null}
                      <SessionRow s={s} today={today} sync={d.sync} mode={mode} injury={injuryToday && s.date === today} done={loggedOn(s.date)} />
                    </View>
                  ))}
                  <Text style={[t.small, { marginTop: S.md }]}>Le sedute passate non svolte non vengono recuperate in automatico.</Text>
                </View>
              ) : null}
            </>
          )}

          {d.logs.length ? (
            <Section title="Allenamenti svolti">
              <View>
                {d.logs.slice(0, 5).map((l, i) => (
                  <View key={l.id}>
                    {i ? <Divider /> : null}
                    <Pressable onPress={() => router.push({ pathname: '/allenamento/log/[id]', params: { id: l.id } })} accessibilityRole="button" style={({ pressed }) => [{ paddingVertical: S.md, gap: 2 }, pressed && { opacity: 0.6 }]}>
                      <Text style={t.title}>{l.title}</Text>
                      <Text style={t.muted}>{[new Date(l.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }), l.distanceKm ? fmtKm(l.distanceKm) : null, fmtClock(l.durationSec)].filter(Boolean).join(' · ')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {d.plans.filter((p) => !p.archived).length ? (
            <Section title="Piani attivi">
              {d.plans.filter((p) => !p.archived).map((p) => (
                <Row key={p.id} style={{ minHeight: 48 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={t.title}>{p.name}</Text>
                    <Text style={t.small}>{p.weeks} settimane dal {shortDate(p.startDate)}</Text>
                  </View>
                  <IconButton name="archive-outline" label={`Archivia ${p.name}`} color={color.textSecondary} onPress={() => call('archivePlan', p.id, true).then(state.reload, (e) => Alert.alert('Piano non archiviato', humanError(e, 'Riprova tra un momento.')))} />
                </Row>
              ))}
            </Section>
          ) : null}
        </>
      )}

      <CheckInSheet visible={checkin} onClose={() => setCheckin(false)} onSaved={() => { setCheckin(false); void state.reload(); }} onChange={(r) => setReq(r)} />
      <PlanChangeSheet req={req} onClose={() => setReq(null)} onApplied={(c) => { setReq(null); setApplied(c); void state.reload(); }} />
    </Screen>
  );
}
