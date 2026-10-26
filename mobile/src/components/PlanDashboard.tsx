import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { PlanCalendar } from '@/components/PlanCalendar';
import { Avatar, Banner, Button, Divider, IconButton, Panel, Row, Screen, Sheet, t } from '@/components/ui';
import { styleOfKind } from '@/constants/activityColors';
import { color, S, type } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { addDaysIso, fmtDuration, fmtDate, KIND_LABEL, WEEKDAYS_SHORT } from '@/lib/format';
import { todayIso, sessionOutcome } from '@/lib/plan';
import { useSession } from '@/lib/session';
import { planPresentation } from '@shared/planPresentation.ts';
import type { PlanAdvice } from '@shared/adaptive.ts';
import type { PlannedSession, PlanState, TrainingPlan, WorkoutLog } from '@shared/types.ts';
import type { ChangeRequest } from '@/components/PlanChange';
type Tab = 'today' | 'plan' | 'calendar' | 'progress' | 'support';
const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'today', label: 'Oggi', icon: 'sunny-outline' },
  { id: 'plan', label: 'Piano', icon: 'clipboard-outline' },
  { id: 'calendar', label: 'Calendario', icon: 'calendar-outline' },
  { id: 'progress', label: 'Progressi', icon: 'stats-chart-outline' },
  { id: 'support', label: 'Supporto', icon: 'book-outline' },
];
export interface PlanDashboardData {
  state: PlanState;
  advice: PlanAdvice;
  sessions: PlannedSession[];
  plans: TrainingPlan[];
  logs: WorkoutLog[];
  sync: { connected: boolean; lastSyncAt: string | null };
}
function Ring({ done, total, size = 42 }: { done: number; total: number; size?: number }) {
  const r = (size - 8) / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel={`${done} su ${total}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color.separator} strokeWidth={5} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color.brandText}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * r}`}
        strokeDashoffset={2 * Math.PI * r * (1 - Math.min(1, total ? done / total : 0))}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}
function Tile({
  session,
  sync,
  onChanged,
  today,
  paused,
}: {
  session: PlannedSession;
  sync: PlanDashboardData['sync'];
  onChanged(): void;
  today: string;
  paused: boolean;
}) {
  const st = styleOfKind(session.kind, session.title),
    outcome = sessionOutcome(session, today, sync);
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await call('markSessionDone', session.id, session.status !== 'completed');
      onChanged();
    } catch (e) {
      Alert.alert('Allenamento non aggiornato', humanError(e, 'Riprova.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ borderRadius: 22, backgroundColor: st.tint, overflow: 'hidden', borderWidth: 1, borderColor: color.separator }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 12, backgroundColor: st.solid }} />
      <View style={{ padding: S.xxl, paddingLeft: S.xxxl, gap: S.md }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: session.id } })}
            style={{ flex: 1, gap: S.xs }}
          >
            <Text style={[type.title2, { color: color.text, fontWeight: '800' }]}>{session.title || KIND_LABEL[session.kind]}</Text>
            <Text style={t.muted}>
              {fmtDate(session.date + 'T12:00:00Z')} · {fmtDuration(session.durationMin)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: session.status === 'completed',
              disabled: busy || session.date > today || !!session.logId || !!session.linkedActivityId,
            }}
            accessibilityLabel="Segna allenamento come fatto: dichiarazione manuale"
            onPress={() => void mark()}
            disabled={busy || session.date > today || !!session.logId || !!session.linkedActivityId}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: session.status === 'completed' ? color.success : color.controlBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {session.status === 'completed' ? <Ionicons name="checkmark" size={24} color={color.success} /> : null}
          </Pressable>
        </Row>
        <Text style={t.body}>{st.label}</Text>
        {session.status !== 'planned' || paused ? (
          <Text style={t.small}>
            {outcome.label}
            {session.manualDone ? ' · dichiarata manualmente' : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
export function PlanDashboard({
  data,
  onRefresh,
  onManage,
  onCheckIn,
  onChange,
  notice,
}: {
  data: PlanDashboardData;
  onRefresh(): Promise<void> | void;
  onManage(): void;
  onCheckIn(): void;
  onChange(req: ChangeRequest): void;
  notice?: ReactNode;
}) {
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const today = todayIso();
  const [tab, setTab] = useState<Tab>('today'),
    [weekOpen, setWeekOpen] = useState(false),
    [selectedPlan, setSelectedPlan] = useState<string | null>(null),
    [selectedWeek, setSelectedWeek] = useState<number | null>(null),
    [day, setDay] = useState(today);
  const plans = data.plans.filter((p) => !p.archived);
  const plan = plans.find((p) => p.id === selectedPlan) ?? plans[0] ?? null;
  const summary = planPresentation(plan, data.sessions, today),
    index = Math.min(selectedWeek ?? summary.currentWeek, summary.weeks.length - 1),
    week = summary.weeks[index];
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week.start, i));
  const chosen = days.includes(day) ? day : week.start;
  const daily = week.sessions.filter((s) => s.date === chosen),
    pending = daily.find((s) => s.date === today && (s.status === 'planned' || s.status === 'rescheduled'));
  const max = Math.max(1, ...summary.weeks.map((w) => w.plannedMin));
  const groups = [
    {
      name: 'CORSA / CAMMINATA',
      icon: 'walk-outline' as const,
      test: (s: PlannedSession) => s.kind.startsWith('run_') || s.kind === 'aerobic',
    },
    { name: 'FORZA', icon: 'barbell-outline' as const, test: (s: PlannedSession) => s.kind === 'strength' },
    { name: 'MOBILITÀ', icon: 'body-outline' as const, test: (s: PlannedSession) => s.kind === 'mobility' || s.kind === 'recovery_active' },
  ];
  const footer = (
    <View style={{ gap: S.md }}>
      {tab === 'today' || tab === 'calendar' ? (
        <Button
          title="Registra l’allenamento"
          variant="brand"
          iconName="play"
          onPress={() =>
            pending
              ? router.push({
                  pathname: '/registra',
                  params: { session: pending.id, ...(pending.guidedWorkoutId ? { guided: pending.guidedWorkoutId } : {}) },
                })
              : router.push('/registra')
          }
        />
      ) : null}
      <Row gap={0}>
        {TABS.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            accessibilityLabel={item.label}
            onPress={() => setTab(item.id)}
            style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: S.xs }}
          >
            <Ionicons name={item.icon} size={24} color={tab === item.id ? color.text : color.textSecondary} />
            <Text
              style={[
                type.caption,
                { fontSize: 10, color: tab === item.id ? color.text : color.textSecondary, fontWeight: tab === item.id ? '700' : '400' },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </Row>
    </View>
  );
  const header = (<View style={{ paddingTop: insets.top + S.sm, paddingHorizontal: S.lg, gap: S.lg, paddingBottom: S.md, backgroundColor: color.bg }}>      <Row>
        <Pressable accessibilityRole="button" accessibilityLabel="Apri il profilo" onPress={() => router.push('/profilo')}>
          <Avatar name={me?.displayName ?? ''} hue={me?.hue ?? 0} uri={me?.avatar} size={36} />
        </Pressable>
        {tab === 'today' || tab === 'calendar' ? (
          <>
            <IconButton name="notifications-outline" label="Notifiche" onPress={() => router.push('/notifiche')} />
            <Pressable
              onPress={() => setWeekOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Scegli settimana e piano"
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm }}
            >
              <Ring done={week.completed} total={week.total} size={26} />
              <Text style={[t.title, { flexShrink: 1 }]}>
                Settimana {index + 1}
                {plan ? `/${plan.weeks}` : ''} ▾
              </Text>
            </Pressable>
            <IconButton
              name="add"
              label="Aggiungi un allenamento"
              onPress={() => router.push({ pathname: '/allenamento/sessione-form', params: { date: chosen } })}
            />
          </>
        ) : (
          <>
            <Text style={[t.title, { flex: 1, textAlign: 'center' }]}>
              {tab === 'plan' ? 'Il tuo piano' : tab === 'progress' ? 'I tuoi progressi' : 'Supporto al piano'}
            </Text>
            <IconButton name="notifications-outline" label="Notifiche" onPress={() => router.push('/notifiche')} />
          </>
        )}
      </Row>
      {data.state.mode!=='active'?<Banner text={data.advice.message??'Il piano è in pausa.'} action="Gestisci" onAction={onManage}/>:null}
      {tab === 'today' || tab === 'calendar' ? (
        <View style={{ paddingBottom: S.lg, borderBottomWidth: 1, borderColor: color.separator }}>
          <Row gap={2}>
            {days.map((date, i) => {
              const items = week.sessions.filter((s) => s.date === date);
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityState={{ selected: date === chosen }}
                  accessibilityLabel={`${WEEKDAYS_SHORT[i]} ${date.slice(8)}, ${items.length} allenamenti`}
                  onPress={() => setDay(date)}
                  style={{ flex: 1, alignItems: 'center', gap: S.sm }}
                >
                  <Text style={[type.caption, { color: color.textSecondary }]}>{WEEKDAYS_SHORT[i].toUpperCase()}</Text>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: date === chosen ? color.text : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={[type.headline, { color: date === chosen ? color.bg : color.text }]}>{Number(date.slice(8))}</Text>
                  </View>
                  <Row gap={3}>
                    {items.slice(0, 3).map((s) => (
                      <View
                        key={s.id}
                        style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: styleOfKind(s.kind, s.title).solid }}
                      />
                    ))}
                  </Row>
                </Pressable>
              );
            })}
          </Row>
        </View>
      ) : null}
</View>);
  return (
    <Screen onRefresh={onRefresh} bottomPad={148} footer={footer} header={header} style={{ gap: S.xxl }}>
      {notice}
      {data.state.mode !== 'active' ? <Banner text={data.advice.message ?? 'Il piano è in pausa.'} action="Gestisci" onAction={onManage} /> : null}
      {data.advice.tone === 'urgent' ? (
        <Banner
          tone="warn"
          text={data.advice.message ?? 'Controlla come ti senti prima di iniziare.'}
          action="Come mi sento"
          onAction={onCheckIn}
        />
      ) : null}
      {tab === 'today' ? (
        <>
          {daily.length ? (
            daily.map((s) => (
              <Tile
                key={s.id}
                session={s}
                sync={data.sync}
                onChanged={() => void onRefresh()}
                today={today}
                paused={data.state.mode !== 'active'}
              />
            ))
          ) : (
            <Panel style={{ padding: S.xxl, gap: S.sm }}>
              <Text style={t.title1}>{plan ? 'Un giorno di recupero' : 'Inizia con una guida'}</Text>
              <Text style={t.muted}>
                {plan
                  ? 'Nessun allenamento previsto per questo giorno. Il riposo fa parte del programma.'
                  : 'Scegli un piano o il percorso NHS per iniziare a correre con fasi guidate.'}
              </Text>
              {!plan ? <Button title="Inizia a correre" onPress={() => router.push('/allenamento/iniziare')} /> : null}
            </Panel>
          )}
          <Pressable
            onPress={() => {
              setTab('calendar');
            }}
            accessibilityRole="button"
          >
            <Text style={t.h2}>Settimana {index + 1} ›</Text>
          </Pressable>
          <Panel style={{ padding: S.lg }}>
            {week.sessions.map((s, i) => (
              <View key={s.id}>
                {i ? <Divider /> : null}
                <Pressable
                  onPress={() => router.push({ pathname: '/allenamento/sessione/[id]', params: { id: s.id } })}
                  accessibilityRole="button"
                  style={{ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: S.md }}
                >
                  <Text style={[t.small, { width: 30 }]}>
                    {WEEKDAYS_SHORT[(new Date(s.date + 'T12:00:00Z').getUTCDay() + 6) % 7].toLowerCase()}
                  </Text>
                  <View style={{ width: 18, height: 24, borderRadius: 4, backgroundColor: styleOfKind(s.kind, s.title).solid }} />
                  <Text style={[t.title, { flex: 1 }]}>{s.title || KIND_LABEL[s.kind]}</Text>
                  <Text style={t.muted}>{fmtDuration(s.durationMin)}</Text>
                  <Ionicons name="chevron-forward" color={color.textSecondary} size={18} />
                </Pressable>
              </View>
            ))}
            {!week.sessions.length ? <Text style={t.muted}>Nessun allenamento pianificato.</Text> : null}
            <Button variant="soft" title="Riorganizza gli allenamenti" onPress={() => setTab('calendar')} />
          </Panel>
          <Text style={t.h2}>I miei approfondimenti</Text>
          <Panel style={{ padding: S.xl, gap: S.lg, maxWidth: 360 }}>
            <Text style={t.small}>SETTIMANA {index + 1}</Text>
            <Text style={[type.display, { color: color.text, fontWeight: '800' }]}>
              {week.completed}/{week.total}
            </Text>
            {groups.map((g) => {
              const list = week.sessions.filter(g.test);
              if (!list.length) return null;
              return (
                <View key={g.name} style={{ gap: S.xs }}>
                  <Row>
                    <Ionicons name={g.icon} size={20} color={color.text} />
                    <Text style={[t.small, { flex: 1 }]}>{g.name}</Text>
                    <Text style={t.title}>
                      {list.filter((s) => s.status === 'completed').length}/{list.length}
                    </Text>
                  </Row>
                  <Row gap={S.xs}>
                    {list.map((s) => (
                      <View
                        key={s.id}
                        style={{
                          height: 4,
                          borderRadius: 2,
                          flex: 1,
                          backgroundColor: s.status === 'completed' ? color.success : color.controlBorder,
                        }}
                      />
                    ))}
                  </Row>
                </View>
              );
            })}
            <Text style={t.small}>Allenamenti completati, compresi quelli dichiarati manualmente.</Text>
          </Panel>
        </>
      ) : null}
      {tab === 'plan' || tab === 'progress' ? (
        <>
          {tab === 'plan' ? (
            <>
              <Panel style={{ padding: S.xxl, gap: S.xl }}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: S.md }}>
                    <Text style={t.title1}>{plan?.name ?? 'Nessun piano attivo'}</Text>
                    {plan ? <Text style={t.muted}>La tua data di fine: {fmtDate(summary.end + 'T12:00:00Z').toUpperCase()}</Text> : null}
                  </View>
                  <Ionicons name="shield-checkmark-outline" size={36} color={color.success} />
                </Row>
                <Button title="Gestisci piano" variant="soft" onPress={onManage} />
              </Panel>
              <Panel style={{ padding: S.xl }}>
                <Row gap={S.md}>
                  {[
                    { label: 'Guida al piano', icon: 'information-circle-outline' as const, action: () => setTab('support') },
                    { label: 'App collegate', icon: 'grid-outline' as const, action: () => router.push('/integrazioni') },
                    { label: 'I tuoi piani', icon: 'clipboard-outline' as const, action: () => setWeekOpen(true) },
                  ].map((item) => (
                    <Pressable
                      key={item.label}
                      onPress={item.action}
                      accessibilityRole="button"
                      style={{ flex: 1, alignItems: 'center', gap: S.md, paddingVertical: S.md }}
                    >
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 26,
                          borderWidth: 1,
                          borderColor: color.controlBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={item.icon} size={28} color={color.textSecondary} />
                      </View>
                      <Text style={[t.small, { textAlign: 'center', color: color.text }]}>{item.label}</Text>
                    </Pressable>
                  ))}
                </Row>
              </Panel>
            </>
          ) : null}
          <Panel style={{ padding: S.xxl, gap: S.xl }}>
            <Text style={t.title1}>Panoramica del piano</Text>
            {plan ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, alignItems: 'flex-end', minHeight: 170, ...(summary.weeks.length<=12?{flex:1}:{}) }}
                >
                  {summary.weeks.map((w) => (
                    <Pressable
                      key={w.index}
                      onPress={() => {
                        setSelectedWeek(w.index);
                        setTab('today');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Settimana ${w.index + 1}: ${w.plannedMin} minuti previsti, ${w.completed} allenamenti completati`}
                      style={{ width:summary.weeks.length>12?30:undefined, flex:summary.weeks.length<=12?1:undefined, alignItems: 'center', gap: S.sm }}
                    >
                      <View
                        style={{
                          height: Math.max(4, (130 * w.plannedMin) / max),
                          width: '85%',
                          maxWidth:26,
                          borderRadius: 6,
                          backgroundColor: w.index === index ? color.brandText : color.brandTint,
                          borderWidth: 1,
                          borderColor: color.successTint,
                        }}
                      />
                      <Text style={[t.small, w.index === index && { color: color.text, fontWeight: '800' }]}>{w.index + 1}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable onPress={() => setTab('today')} accessibilityRole="button">
                  <Row>
                    <Ring done={week.completed} total={week.total} size={50} />
                    <View style={{ flex: 1 }}>
                      <Text style={t.muted}>Settimana {index + 1}</Text>
                      <Text style={t.title}>
                        {week.completed}/{week.total} allenamenti
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={color.textSecondary} />
                  </Row>
                </Pressable>
                <Divider />
                <Row>
                  <Ionicons name="time-outline" size={38} color={color.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={t.muted}>Durata del piano</Text>
                    <Text style={t.title}>
                      {fmtDuration(summary.completedMin)}/{fmtDuration(summary.plannedMin)}
                    </Text>
                  </View>
                </Row>
                <Text style={t.small}>
                  Le barre mostrano minuti previsti. Il completamento usa gli allenamenti segnati come fatti, non una stima del tempo GPS.
                </Text>
              </>
            ) : (
              <Text style={t.muted}>La panoramica comparirà quando avrai un piano con allenamenti reali.</Text>
            )}
          </Panel>
        </>
      ) : null}
      {tab === 'calendar' ? (
        <>
          <Text style={t.h2}>Settimana {index + 1}</Text>
          <PlanCalendar key={week.start} weekStart={week.start} sessions={week.sessions} />
          <Button variant="soft" title="Sposta o modifica un allenamento" onPress={() => setWeekOpen(true)} />
          <Text style={t.small}>
            Apri un allenamento del giorno per cambiarne data e dettagli.
          </Text>
          {week.sessions.map((s) => (
            <Button
              key={s.id}
              variant="soft"
              title={`${s.title} · ${fmtDate(s.date + 'T12:00:00Z')}`}
              onPress={() => router.push({ pathname: '/allenamento/sessione-form', params: { id: s.id } })}
            />
          ))}
        </>
      ) : null}
      {tab === 'support' ? (
        <>
          <Text style={t.h2}>Un piano adatto alla tua giornata</Text>
          <Text style={t.muted}>{data.advice.message ?? 'Puoi modificare gli allenamenti in base al tempo disponibile e a come ti senti.'}</Text>
          <Button title="Come mi sento oggi" onPress={onCheckIn} />
          {data.advice.options.map((o, i) => (
            <Button
              key={i}
              variant="soft"
              title={o.label}
              onPress={() => onChange({ action: o.action, params: o.params, basis: data.advice.basis })}
            />
          ))}
          <Panel style={{ padding: S.xl, gap: S.md }}>
            <Text style={t.title}>Inizia a correre con una guida</Text>
            <Text style={t.muted}>Programma pubblico NHS: 9 settimane, tre uscite a settimana, corsa e camminata guidate da timer.</Text>
            <Button variant="soft" title="Apri gli allenamenti guidati" onPress={() => router.push('/allenamento/iniziare')} />
          </Panel>
          {data.advice.basis.map((b) => (
            <Text key={b} style={t.small}>
              {b}
            </Text>
          ))}
        </>
      ) : null}
      <Sheet visible={weekOpen} onClose={() => setWeekOpen(false)} title="Piani e settimane">
        {plans.map((p) => (
          <Button
            key={p.id}
            variant="soft"
            title={p.name}
            onPress={() => {
              setSelectedPlan(p.id);
              setSelectedWeek(null);
            }}
          />
        ))}
        {plan?<Button small title="Archivia questo piano" onPress={()=>{call('archivePlan',plan.id,true).then(()=>{setWeekOpen(false);void onRefresh();},(e)=>Alert.alert('Piano non archiviato',humanError(e,'Riprova.')));}}/>:null}
        {data.plans.filter((p)=>p.archived).map((p)=><Button key={`archived-${p.id}`} small title={`Ripristina ${p.name}`} onPress={()=>{call('archivePlan',p.id,false).then(()=>void onRefresh(),(e)=>Alert.alert('Piano non ripristinato',humanError(e,'Riprova.')));}}/>)}
        {summary.weeks.map((w) => (
          <Button
            key={w.index}
            variant="soft"
            title={`Settimana ${w.index + 1} · ${fmtDate(w.start + 'T12:00:00Z')}`}
            onPress={() => {
              setSelectedWeek(w.index);
              setDay(w.start);
              setWeekOpen(false);
            }}
          />
        ))}
        <Button
          title="Crea un altro piano"
          onPress={() => {
            setWeekOpen(false);
            router.push('/allenamento/piano');
          }}
        />
      </Sheet>
    </Screen>
  );
}
