import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, LayoutAnimation, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeInLeft, FadeInRight, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanCalendar } from '@/components/PlanCalendar';
import { ActivityGlyph, SportGlyph, type Glyph } from '@/components/SportIcon';
import { BriefPanel, TONE_LAYOUT, ToneBanner } from '@/components/ToneBanner';
import { Banner, Button, Loading, Panel, PressableScale, Row, Sheet, t, useReduceMotion, type IconName } from '@/components/ui';
import { ACTIVITY_STYLES, type ActivityTypeId } from '@/constants/activityColors';
import { color, GUTTER, HIT, R, S, type } from '@/constants/theme';
import { call, ext } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { addDaysIso, toISODate, WEEKDAYS_SHORT } from '@/lib/format';
import { mix } from '@/lib/storyPalette';
import type { EquipmentId, PlanGoal, PlanLevel, PlanWizardInput, SessionInput, TrainingPlan } from '@shared/types.ts';

/** Lunedì della settimana di `d` come giorno locale "YYYY-MM-DD" (il server vuole un giorno, non un orario). */
function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return toISODate(x);
}

/**
 * Un'opzione: titolo, eventuale spiegazione breve e il riquadro colorato a sinistra. Il colore viene SOLO dalla
 * palette centralizzata delle attività (`tone`); dentro c'è un'icona oppure la figura vettoriale dell'attività.
 */
type Opt<V> = { value: V; title: string; hint?: string; icon?: IconName; figure?: Glyph; tone: ActivityTypeId };

const GOALS: Opt<PlanGoal>[] = [
  { value: 'start_running', title: 'Iniziare a correre', hint: 'Alternando corsa e camminata', figure: 'run_walk', tone: 'run_walk' },
  { value: 'general_fitness', title: 'Stare in forma', hint: 'Uscite varie e piacevoli', icon: 'happy', tone: 'aerobic' },
  { value: 'endurance', title: 'Migliorare la resistenza', hint: 'Correre più a lungo senza fatica', figure: 'run', tone: 'long' },
  { value: 'distance', title: 'Aumentare la distanza', hint: 'Un lungo che cresce piano', icon: 'trail-sign', tone: 'run' },
  { value: 'pace', title: 'Migliorare il passo', hint: 'Ritmi, salite e fartlek', icon: 'speedometer', tone: 'tempo' },
  { value: 'race_5k', title: 'Gara 5 km', icon: 'flag', tone: 'intervals' },
  { value: 'race_10k', title: 'Gara 10 km', icon: 'trophy', tone: 'fartlek' },
  { value: 'half_marathon', title: 'Mezza maratona', icon: 'medal', tone: 'event' },
];
const LEVELS: Opt<PlanLevel>[] = [
  { value: 'beginner', title: 'Agli inizi', hint: 'Corro poco o per niente', figure: 'walk', tone: 'walk' },
  { value: 'intermediate', title: 'Corro già', hint: 'Qualche uscita a settimana', figure: 'run', tone: 'run' },
  { value: 'advanced', title: 'Esperto', hint: 'Corro con regolarità da tempo', icon: 'flash', tone: 'intervals' },
];
const MINUTES: Opt<number>[] = [
  { value: 20, title: '20 minuti', hint: 'Una pausa veloce', icon: 'hourglass', tone: 'mobility' },
  { value: 30, title: '30 minuti', hint: 'Il classico', icon: 'time', tone: 'run' },
  { value: 45, title: '45 minuti', icon: 'timer', tone: 'aerobic' },
  { value: 60, title: '60 minuti', icon: 'stopwatch', tone: 'long' },
  { value: 90, title: '90 minuti', hint: 'Per i lunghi', icon: 'alarm', tone: 'tempo' },
];
const WEEKS: Opt<number>[] = [
  { value: 4, title: '4 settimane', hint: 'Un mese per prendere il ritmo', icon: 'sunny', tone: 'aerobic' },
  { value: 8, title: '8 settimane', hint: 'Il più scelto', icon: 'calendar-number', tone: 'run' },
  { value: 12, title: '12 settimane', hint: 'Per una gara o un obiettivo grande', icon: 'trending-up', tone: 'long' },
];
const EXTRAS: Opt<'none' | 'mobility' | 'strength' | 'both'>[] = [
  { value: 'none', title: 'Solo corsa', figure: 'run', tone: 'run' },
  { value: 'mobility', title: 'Corsa + mobilità', hint: '10 minuti facoltativi dopo le uscite più dure', icon: 'body', tone: 'mobility' },
  { value: 'strength', title: 'Corsa + forza', hint: 'Un allenamento a corpo libero a settimana', icon: 'barbell', tone: 'strength' },
  { value: 'both', title: 'Corsa, forza e mobilità', icon: 'sparkles', tone: 'tempo' },
];

type Step = 'start' | 'goal' | 'level' | 'days' | 'minutes' | 'weeks' | 'extras' | 'confirm' | 'preview';
const CUSTOM_STEPS: Step[] = ['start', 'goal', 'level', 'days', 'minutes', 'weeks', 'extras', 'confirm', 'preview'];
const PRESET_STEPS: Step[] = ['start', 'confirm', 'preview'];

/** Piani già pronti: un tocco e il piano è completo; si personalizza dopo, se si vuole. */
interface Preset { id: string; title: string; hint: string; icon?: IconName; figure?: Glyph; tone: ActivityTypeId; goal: PlanGoal; level: PlanLevel; days: number[]; minutes: number; weeks: number }
const PRESETS: Preset[] = [
  { id: 'start', title: 'Inizia a correre', hint: '8 settimane, 3 giorni: corsa e camminata, poco a poco', figure: 'run_walk', tone: 'run_walk', goal: 'start_running', level: 'beginner', days: [2, 4, 6], minutes: 30, weeks: 8 },
  { id: '5k', title: 'La tua prima 5 km', hint: '8 settimane, 3 giorni, uscite fino a 40 minuti', icon: 'flag', tone: 'intervals', goal: 'race_5k', level: 'beginner', days: [2, 4, 6], minutes: 40, weeks: 8 },
  { id: '10k', title: '10 km', hint: '12 settimane, 3 giorni, con lunghi e ritmo', icon: 'trophy', tone: 'fartlek', goal: 'race_10k', level: 'intermediate', days: [2, 4, 6], minutes: 60, weeks: 12 },
  { id: 'half', title: 'Mezza maratona', hint: '12 settimane, 4 giorni, lungo crescente', icon: 'medal', tone: 'event', goal: 'half_marathon', level: 'intermediate', days: [2, 4, 6, 7], minutes: 90, weeks: 12 },
  { id: 'fit', title: 'Stare in forma', hint: '8 settimane, 3 giorni, uscite varie e piacevoli', icon: 'happy', tone: 'aerobic', goal: 'general_fitness', level: 'intermediate', days: [2, 4, 6], minutes: 45, weeks: 8 },
];
const QUESTION: Record<Step, string> = {
  start: 'Da dove partiamo?',
  goal: 'Qual è il tuo obiettivo?',
  level: 'Come corri oggi?',
  days: 'In quali giorni puoi correre?',
  minutes: 'Quanto tempo hai per uscita?',
  weeks: 'Per quante settimane?',
  extras: 'Vuoi aggiungere altro?',
  confirm: 'Sei tu?',
  preview: 'Riepilogo',
};
/** Sottotitolo sotto la domanda (come nel mockup). "Sei tu?" non ne ha: deve stare in una schermata senza scorrere. */
const SUBTITLE: Partial<Record<Step, string>> = {
  start: 'Scegli un piano già pronto: lo vedi subito e lo personalizzi dopo, se vuoi.',
  goal: 'Scegli quello principale che vuoi raggiungere con il nuovo piano.',
  level: 'Così il piano parte dal punto giusto per te.',
  days: 'Scegli i giorni liberi: il piano lascia sempre spazio al recupero.',
  minutes: 'Il tempo che hai di solito per un’uscita.',
  weeks: 'Quanto dura il piano, dalla prima all’ultima settimana.',
  extras: 'Allenamenti facoltativi da aggiungere alla corsa.',
  preview: 'Ecco il piano che abbiamo creato per te.',
};
/** Nome dei passi per lo screen reader (pallini dell'avanzamento). */
const STEP_LABEL: Record<Step, string> = { start: 'Partenza', goal: 'Obiettivo', level: 'Livello', days: 'Giorni', minutes: 'Tempo per uscita', weeks: 'Settimane', extras: 'Extra', confirm: 'Sei tu?', preview: 'Riepilogo' };

const DAY_NAMES = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
const GOAL_PHRASE: Record<PlanGoal, string> = {
  start_running: 'iniziare a correre senza forzare',
  general_fitness: 'stare in forma con uscite varie e piacevoli',
  endurance: 'correre più a lungo con meno fatica',
  distance: 'aumentare piano piano la distanza',
  pace: 'migliorare il passo',
  strength_support: 'sostenere la corsa con la forza',
  race_5k: 'arrivare pronto a una 5 km',
  race_10k: 'arrivare pronto a una 10 km',
  half_marathon: 'arrivare pronto a una mezza maratona',
};
const LEVEL_PHRASE: Record<PlanLevel, string> = { beginner: 'Stai cominciando', intermediate: 'Corri già', advanced: 'Hai esperienza' };

function joinIt(a: string[]): string {
  return a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${a[a.length - 1]}`;
}

/** Descrizione in linguaggio semplice: usa solo le risposte date, non inventa nulla. */
function describeUser(a: { goal: PlanGoal | null; level: PlanLevel | null; days: number[]; minutes: number | null; weeks: number | null; extras: string | null }): { who: string; text: string; plan: string } {
  const days = joinIt(a.days.map((d) => DAY_NAMES[d - 1]));
  const extras = a.extras === 'both' ? ', con forza e mobilità' : a.extras === 'strength' ? ', con un po’ di forza' : a.extras === 'mobility' ? ', con mobilità dopo le uscite più dure' : '';
  // `who` è la prima frase di `text`: i giorni e i minuti sono già nella riga "Le tue scelte" e nel dettaglio di ogni lettura.
  const who = `${LEVEL_PHRASE[a.level ?? 'beginner']} e vuoi ${GOAL_PHRASE[a.goal ?? 'general_fitness']}.`;
  const text = `${who} Puoi uscire ${days}, fino a ${a.minutes ?? 30} minuti per volta, per ${a.weeks ?? 8} settimane${extras}.`;
  const plan = a.level === 'beginner' || a.goal === 'start_running'
    ? 'Per questo ti preparo un piano graduale: alterno corsa leggera e camminata e decido io la struttura di ogni uscita, così non devi scegliere niente. Aumento poco alla volta e lascio sempre giorni di recupero.'
    : a.goal === 'pace'
      ? 'Per questo ti preparo un piano con uscite facili e qualche allenamento di ritmo, salite e fartlek, senza metterne due dure di fila.'
      : 'Per questo ti preparo un piano vario: uscite facili, un lungo che cresce con calma e, ogni tanto, un allenamento più vivace.';
  return { who, text, plan };
}

type Tone = 'calm' | 'balanced' | 'grit';
/**
 * `short` è la seconda metà di `sentence` (cosa cambia), mostrata sui banner chiusi.
 * Tinte dalla palette delle attività: calma = mobilità (aggiunge mobilità), regolare = aerobico, grinta = ripetute.
 */
const TONES: Record<Tone, { title: string; icon: IconName; tint: string; sentence: string; short: string }> = {
  calm: { title: 'Con calma', icon: 'cafe-outline', tint: ACTIVITY_STYLES.mobility.solid, sentence: 'Preferisci andare piano e costruire con pazienza: accorcio un po’ le uscite e aggiungo mobilità per il recupero.', short: 'Accorcio un po’ le uscite e aggiungo mobilità.' },
  balanced: { title: 'A ritmo regolare', icon: 'pulse-outline', tint: ACTIVITY_STYLES.aerobic.solid, sentence: 'Vuoi un ritmo costante e sostenibile: seguo le tue scelte così come sono.', short: 'Seguo le tue scelte così come sono.' },
  grit: { title: 'Con più grinta', icon: 'rocket-outline', tint: ACTIVITY_STYLES.intervals.solid, sentence: 'Hai voglia di spingere un po’ di più: allungo di poco le uscite, restando graduale.', short: 'Allungo di poco le uscite, restando graduale.' },
};

/** Altezza della barra fissa in basso (pulsante 52 + margini), senza la safe area. */
const BAR_H = 52 + S.md * 2;

/** Come il tono modifica le risposte: regole esplicite, mai un salto di carico nascosto. */
function adjust(tone: Tone, a: { days: number[]; minutes: number; level: PlanLevel }): { days: number[]; minutes: number; mobility: boolean } {
  if (tone === 'calm') return { days: a.days.length >= 4 ? a.days.slice(0, -1) : a.days, minutes: Math.max(20, a.minutes - 10), mobility: true };
  if (tone === 'grit') return { days: a.days, minutes: Math.max(a.minutes, Math.min(a.minutes + 10, a.level === 'beginner' ? 45 : 180)), mobility: false };
  return { days: a.days, minutes: a.minutes, mobility: false };
}

/** Lettura consigliata, dalle risposte e dalle regole del piano (non dall'AI): prudenza per chi comincia o ha un carico alto. */
function recommend(level: PlanLevel | null, days: number[], minutes: number | null): { tone: Tone; why: string } {
  if (level === 'beginner') return { tone: 'calm', why: 'stai cominciando: conviene salire piano.' };
  if (days.length >= 5 || (minutes ?? 0) >= 90) return { tone: 'calm', why: 'il carico che hai scelto è già alto.' };
  return { tone: 'balanced', why: 'corri già e il carico scelto è sostenibile.' };
}

/* ---------- componenti della procedura ---------- */

/** Stile della domanda grande (mockup: titolo forte, su una o due righe). */
const QUESTION_STYLE = { ...type.display, fontSize: 28, lineHeight: 34, color: color.text } as const;
/** Fondo dell'opzione scelta: velo turchese → viola del marchio, come la riga evidenziata del mockup. */
const SELECTED_FILL: [string, string] = [mix(color.accent, color.bg, 0.68), mix(color.brand, color.bg, 0.8)];
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Riquadro colorato dell'opzione: sfumatura della tinta ufficiale (o dei due colori, per corsa + camminata) e figura bianca. */
function Tile({ tone, icon, figure, size = 40, round }: { tone: ActivityTypeId; icon?: IconName; figure?: Glyph; size?: number; round?: boolean }) {
  const s = ACTIVITY_STYLES[tone];
  const [a, b] = s.blend ?? [s.solid, s.solid];
  return (
    <LinearGradient
      colors={[mix(a, '#000000', 0.1), mix(b, '#000000', 0.4)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: round ? size / 2 : R.control, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {figure ? <SportGlyph glyph={figure} size={Math.round(size * 0.62)} color={color.storyInk} /> : icon ? <Ionicons name={icon} size={Math.round(size * 0.5)} color={color.storyInk} /> : <ActivityGlyph style={s} size={Math.round(size * 0.55)} color={color.storyInk} />}
    </LinearGradient>
  );
}

/** Riga di scelta: riquadro colorato, titolo (ed eventuale spiegazione); la scelta si evidenzia e compare la spunta. */
function Choice<V>({ o, on, onPress }: { o: Opt<V>; on: boolean; onPress: () => void }) {
  const reduce = useReduceMotion();
  const pop = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    pop.value = reduce ? (on ? 1 : 0) : on ? withSpring(1, { damping: 13, stiffness: 260 }) : withTiming(0, { duration: 120 });
  }, [on, reduce, pop]);
  const check = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ scale: 0.5 + 0.5 * pop.value }] }));
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={o.hint ? `${o.title}. ${o.hint}` : o.title}>
      <View style={{ borderRadius: R.card, overflow: 'hidden', borderWidth: 1, borderColor: on ? color.accent : 'rgba(255,255,255,0.05)', backgroundColor: color.surface }}>
        {on ? <LinearGradient colors={SELECTED_FILL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={FILL} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingHorizontal: S.md, paddingVertical: S.sm + 2 }}>
          <Tile tone={o.tone} icon={o.icon} figure={o.figure} />
          <View style={{ flex: 1 }}>
            <Text style={[type.headline, { color: color.text }]}>{o.title}</Text>
            {o.hint ? <Text style={[type.footnote, { color: color.textSecondary }]}>{o.hint}</Text> : null}
          </View>
          {/* spazio sempre riservato alla spunta: scegliere non sposta il testo */}
          <Animated.View style={[{ width: 24, height: 24 }, check]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="checkmark-circle" size={24} color={color.accent} />
          </Animated.View>
        </View>
      </View>
    </PressableScale>
  );
}

/** Gruppo di opzioni a scelta singola. */
function Choices<V>({ opts, value, onPick }: { opts: Opt<V>[]; value: V | null; onPick: (v: V) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: S.sm + 2 }}>
      {opts.map((o) => (
        <Choice key={String(o.value)} o={o} on={value === o.value} onPress={() => onPick(o.value)} />
      ))}
    </View>
  );
}

/** Pallino dell'avanzamento: pieno se fatto o in corso (con alone), spento se ancora da fare. I passi fatti si toccano per tornarci. */
const DOT = 10;
const DOT_BOX = 20;
function StepDot({ state, label, pos, onPress }: { state: 'done' | 'current' | 'todo'; label: string; pos: string; onPress?: () => void }) {
  const reduce = useReduceMotion();
  const pop = useSharedValue(1);
  const halo = useSharedValue(state === 'current' ? 1 : 0);
  useEffect(() => {
    const on = state === 'current' ? 1 : 0;
    halo.value = reduce ? on : withTiming(on, { duration: 260, easing: Easing.out(Easing.cubic) });
    if (reduce || state !== 'current') return;
    // il passo appena raggiunto "pulsa" una volta
    pop.value = withSequence(withTiming(0.6, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 220 }));
  }, [state, reduce, pop, halo]);
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: halo.value, transform: [{ scale: 0.4 + 0.6 * halo.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      accessible={state !== 'todo'}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={onPress ? `Torna a: ${label}` : `${pos}: ${label}`}
      style={{ width: DOT_BOX, height: DOT_BOX, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: DOT_BOX, height: DOT_BOX, borderRadius: DOT_BOX / 2, backgroundColor: color.accentTint }, ring]} />
      <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: state === 'todo' ? color.surfaceElevated : color.accent, borderWidth: state === 'todo' ? 1 : 0, borderColor: color.controlBorder }, dot]} />
    </Pressable>
  );
}

/** Tratto tra due pallini: si riempie (da sinistra) quando il passo successivo è raggiunto. */
function StepLine({ on }: { on: boolean }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [on, reduce, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View style={{ flex: 1, height: 3, marginHorizontal: 2, borderRadius: 2, backgroundColor: color.surfaceElevated, overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1, backgroundColor: color.accent, transformOrigin: 'left' }, fill]} />
    </View>
  );
}

/** Avanzamento a pallini collegati da una linea (mockup): stessa altezza in ogni stato, nessun salto. */
function PlanSteps({ steps, index, onJump }: { steps: Step[]; index: number; onJump: (k: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: DOT_BOX }}>
      {steps.map((s, k) => (
        <Fragment key={s}>
          {k ? <StepLine on={k <= index} /> : null}
          <StepDot state={k < index ? 'done' : k === index ? 'current' : 'todo'} label={STEP_LABEL[s]} pos={`Passo ${k + 1} di ${steps.length}`} onPress={k < index ? () => onJump(k) : undefined} />
        </Fragment>
      ))}
    </View>
  );
}

/** "Avanti" (o "Sì, sono io"): pillola a destra della barra, compare in dissolvenza solo quando serve. */
function NextPill({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(200)}>
      <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} style={{ minHeight: 52, borderRadius: R.pill, paddingHorizontal: S.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, backgroundColor: color.accent, opacity: disabled ? 0.5 : 1 }}>
        <Text style={[type.headline, { color: color.onAccent }]}>{title}</Text>
        <Ionicons name="arrow-forward" size={20} color={color.onAccent} />
      </PressableScale>
    </Animated.View>
  );
}

/** Icona tonda "a vetro" delle righe Durata, Frequenza e Livello del riepilogo. */
function RingIcon({ icon }: { icon: IconName }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name={icon} size={20} color={color.textSecondary} />
    </View>
  );
}

/** Riga del riepilogo: etichetta piccola e valore; tocco = torna alla domanda per cambiarlo. Entrano una dopo l'altra. */
function SummaryRow({ lead, label, value, order, onPress }: { lead: ReactNode; label: string; value: string; order: number; onPress: () => void }) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={reduce ? undefined : FadeInDown.delay(80 + order * 70).duration(320)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityHint="Torna alla domanda per cambiarlo" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 68, paddingVertical: S.sm }, pressed && { opacity: 0.65 }]}>
        {lead}
        <View style={{ flex: 1 }}>
          <Text style={[type.footnote, { color: color.textSecondary }]}>{label}</Text>
          <Text style={[type.headline, { color: color.text }]}>{value}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

/** Creazione del piano passo per passo: una domanda per schermata; "Avanti" solo dove serve. */
export default function Piano() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const [edit, setEdit] = useState(false);
  const [mode, setMode] = useState<'preset' | 'custom'>('custom');
  const [presetTitle, setPresetTitle] = useState('');
  const [tone, setTone] = useState<Tone>('balanced');
  const [more, setMore] = useState<{ tone: Tone; state: 'loading' | 'done' | 'error'; text: string } | null>(null);
  const [moreCache] = useState(() => new Map<string, string>());
  const [ai, setAi] = useState<{ key: string; lines: Record<Tone, string> | null; state: 'loading' | 'done' } | null>(null);
  const [goal, setGoal] = useState<PlanGoal | null>(null);
  const [level, setLevel] = useState<PlanLevel | null>(null);
  const [days, setDays] = useState<number[]>([2, 4, 6]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [weeks, setWeeks] = useState<number | null>(null);
  const [extras, setExtras] = useState<'none' | 'mobility' | 'strength' | 'both' | null>(null);
  const [preview, setPreview] = useState<{ sessions: SessionInput[]; warnings: string[] } | null>(null);
  const [previewTry, setPreviewTry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const STEPS = mode === 'preset' ? PRESET_STEPS : CUSTOM_STEPS;
  const step = STEPS[Math.min(i, STEPS.length - 1)];
  /** Risposte mostrate ora da "Sei tu?" (null sugli altri passi): una risposta AI arrivata dopo non anima altre schermate. */
  const shownKey = useRef<string | null>(null);
  /** Avanzamento automatico già in coda: un doppio tocco non salta la domanda successiva. */
  const advancing = useRef(false);
  /** Direzione dell'ultimo cambio di passo: avanti la domanda entra da destra, indietro da sinistra. */
  const lastI = useRef(i);
  const forward = i >= lastI.current;
  useEffect(() => {
    lastI.current = i;
  }, [i]);
  /** Ultimo approfondimento aperto: resta nel pannello mentre si chiude in dissolvenza. */
  const lastMore = useRef(more);
  if (more) lastMore.current = more;

  const back = () => (i ? setI(i - 1) : router.back());
  // Android: il tasto indietro torna alla domanda precedente invece di chiudere la procedura.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (i === 0) return false;
      setI(i - 1);
      return true;
    });
    return () => sub.remove();
  }, [i]);

  const input = (): PlanWizardInput => {
    const monday = mondayOf(new Date());
    const adj = adjust(tone, { days, minutes: minutes ?? 30, level: level ?? 'beginner' });
    return {
      name: presetTitle || GOALS.find((g) => g.value === goal)?.title || 'Il mio piano',
      goal: goal ?? 'general_fitness',
      level: level ?? 'beginner',
      weekdays: adj.days,
      maxMinutes: adj.minutes,
      equipment: ['bodyweight'] as EquipmentId[],
      preference: 'mixed',
      includeStrength: extras === 'strength' || extras === 'both',
      includeMobility: extras === 'mobility' || extras === 'both' || adj.mobility,
      startDate: new Date().getDay() >= 5 || new Date().getDay() === 0 ? addDaysIso(monday, 7) : monday, // da venerdì in poi parte la settimana dopo
      weeks: weeks ?? 8,
    };
  };

  // Rifinitura del Coach AI: una sola richiesta per insieme di risposte; se manca la quota o l'AI, restano i testi a modello.
  useEffect(() => {
    if (step !== 'confirm' || !goal || !level) return;
    const key = JSON.stringify([goal, level, days, minutes, weeks, extras]);
    if (ai?.key === key) return;
    setTone(recommend(level, days, minutes).tone);
    setAi({ key, lines: null, state: 'loading' });
    const me = describeUser({ goal, level, days, minutes, weeks, extras });
    const prompt = `Obiettivo: ${GOAL_PHRASE[goal]}. ${me.text} Livello: ${LEVEL_PHRASE[level]}.`.slice(0, 480);
    ext.ai
      .chat({ prompt, preset: 'plan_intro', useData: false })
      .then((r) => {
        const found: Record<string, string> = {};
        for (const line of r.text.split(/\r?\n/)) {
          const mm = /^\s*([123])\s*[:.)]\s*(.+)$/.exec(line);
          if (mm) found[mm[1]] = mm[2].trim();
        }
        const [a, b, c] = [found['1'], found['2'], found['3']];
        const lines = a && b && c ? { calm: a, balanced: b, grit: c } : null;
        // il testo rifinito cambia altezza al banner: niente salto (solo se "Sei tu?" mostra ancora queste risposte)
        if (lines && !reduce && shownKey.current === key) LayoutAnimation.configureNext(TONE_LAYOUT);
        // una risposta per risposte nel frattempo cambiate non sovrascrive quella in corso
        setAi((cur) => (cur?.key === key ? { key, lines, state: 'done' } : cur));
      })
      .catch(() => setAi((cur) => (cur?.key === key ? { key, lines: null, state: 'done' } : cur)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, goal, level, days, minutes, weeks, extras]);

  useEffect(() => {
    if (step !== 'preview') return;
    let active = true;
    setPreview(null);
    setErr('');
    call<{ sessions: SessionInput[]; warnings: string[] }>('previewPlan', input()).then(
      (value) => { if (active) setPreview(value); },
      (e) => { if (active) setErr(humanError(e, 'Anteprima non disponibile.')); },
    );
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, tone, previewTry]);

  // scelta singola: si passa da soli alla domanda successiva
  const pick = <V,>(set: (v: V) => void) => (v: V) => {
    set(v);
    if (advancing.current) return;
    advancing.current = true;
    setTimeout(() => {
      advancing.current = false;
      setI((x) => Math.min(x + 1, STEPS.length - 1));
    }, 180);
  };

  async function explain(k: Tone, mine: string) {
    const key = JSON.stringify([k, goal, level, days, minutes, weeks, extras]); // `mine` cita anche forza e mobilità
    const cached = moreCache.get(key);
    if (cached) return setMore({ tone: k, state: 'done', text: cached });
    setMore({ tone: k, state: 'loading', text: '' });
    try {
      const r = await ext.ai.chat({ prompt: `Spiega in massimo 70 parole, con tono diretto e rassicurante, perché la lettura «${TONES[k].title}» è adatta a questa persona e cosa cambia nel suo piano. ${TONES[k].sentence} ${mine}`.slice(0, 490), preset: 'free', useData: false });
      moreCache.set(key, r.text);
      setMore((cur) => (cur && cur.tone === k ? { tone: k, state: 'done', text: r.text } : cur)); // ignora risposte di un'altra lettura
    } catch (e) {
      setMore((cur) => (cur && cur.tone === k ? { tone: k, state: 'error', text: humanError(e, 'Non riesco a spiegartelo adesso. Riprova tra poco.') } : cur));
    }
  }

  function usePreset(pr: Preset) {
    setGoal(pr.goal);
    setLevel(pr.level);
    setDays(pr.days);
    setMinutes(pr.minutes);
    setWeeks(pr.weeks);
    setExtras('none');
    setPresetTitle(pr.title);
    setMode('preset');
    setTimeout(() => setI(1), 120);
  }

  /** Torna a una domanda per cambiare la risposta (dal riepilogo o da "Le tue scelte"): da lì si prosegue su misura. */
  function goTo(target: Step) {
    setMode('custom');
    setI(CUSTOM_STEPS.indexOf(target));
  }

  async function create() {
    setBusy(true);
    setErr('');
    try {
      await call<{ plan: TrainingPlan }>('createPlanFromWizard', input());
      router.dismissTo('/allenamento');
    } catch (e) {
      setErr(humanError(e, 'Piano non creato.'));
    } finally {
      setBusy(false);
    }
  }

  // Anteprima con numeri veri, dagli allenamenti generati: giorni con un allenamento (la mobilità facoltativa aggiunta dalla lettura
  // non è un giorno in più) e allenamento più lungo del piano (dopo la lettura: "Con calma" accorcia, "Con più grinta" allunga).
  const adjNow = adjust(tone, { days, minutes: minutes ?? 30, level: level ?? 'beginner' });
  const perWeek = preview ? Math.round(new Set(preview.sessions.filter((x) => x.kind !== 'mobility' && x.kind !== 'rest').map((x) => x.date)).size / (weeks ?? 8)) : adjNow.days.length;
  const capMin = preview?.sessions.length ? Math.max(...preview.sessions.map((x) => x.durationMin)) : adjNow.minutes;
  const me = describeUser({ goal, level, days, minutes, weeks, extras });
  const rec = recommend(level, days, minutes);
  // Le stesse 5 voci di prima, ora dentro il pannello "Le tue scelte": stessa navigazione verso le domande.
  const choiceRows: Array<[string, string, Step]> = [
    ['Obiettivo', GOALS.find((g) => g.value === goal)?.title ?? '—', 'goal'],
    ['Come corri', LEVELS.find((l) => l.value === level)?.title ?? '—', 'level'],
    ['Giorni', joinIt(days.map((d) => WEEKDAYS_SHORT[d - 1])) || '—', 'days'],
    ['Durata', minutes ? `${minutes} minuti` : '—', 'minutes'],
    ['Settimane', weeks ? String(weeks) : '—', 'weeks'],
  ];
  // Al primo disegno di "Sei tu?" l'effetto non ha ancora impostato la lettura consigliata: la si mostra subito,
  // così il banner aperto non cambia dopo un fotogramma. Lo stato `tone` converge allo stesso valore.
  const toneKey = JSON.stringify([goal, level, days, minutes, weeks, extras]);
  const shownTone: Tone = step === 'confirm' && goal && level && ai?.key !== toneKey ? rec.tone : tone;
  // Testi AI solo se riguardano le risposte attuali: tornando con una scelta cambiata non compaiono, nemmeno per un fotogramma, quelli vecchi.
  const aiNow = ai?.key === toneKey ? ai : null;
  useEffect(() => {
    shownKey.current = step === 'confirm' ? toneKey : null;
  });

  // "Avanti" solo dove serve: sui giorni (scelta multipla) e quando si torna a una domanda che ha già una risposta.
  // Sulle scelte singole senza risposta non c'è: toccare un'opzione porta già alla domanda successiva.
  const nextOk: Record<Step, boolean> = {
    start: mode === 'preset' ? !!presetTitle : !!goal,
    goal: !!goal,
    level: !!level,
    days: true,
    minutes: !!minutes,
    weeks: !!weeks,
    extras: !!extras,
    confirm: true,
    preview: false,
  };
  const enter = reduce ? undefined : (forward ? FadeInRight : FadeInLeft).duration(260);
  const goalOpt = GOALS.find((g) => g.value === goal);
  const shown = more ?? lastMore.current;
  const shownAdj = shown ? adjust(shown.tone, { days, minutes: minutes ?? 30, level: level ?? 'beginner' }) : null;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top + S.md, paddingHorizontal: GUTTER }}>
        <PlanSteps steps={STEPS} index={Math.min(i, STEPS.length - 1)} onJump={setI} />
      </View>

      {/* key: ogni domanda riparte dall'alto ed entra scorrendo appena (da destra avanti, da sinistra indietro) */}
      <Animated.View key={`${mode}-${step}`} entering={enter} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: GUTTER, paddingTop: S.lg, gap: S.xs + 2 }}>
          <Text style={QUESTION_STYLE} accessibilityRole="header">
            {QUESTION[step]}
          </Text>
          {SUBTITLE[step] ? <Text style={t.muted}>{SUBTITLE[step]}</Text> : null}
        </View>

        {/* senza rimbalzo quando il contenuto sta già nello schermo */}
        <ScrollView alwaysBounceVertical={false} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: S.lg, gap: S.sm, paddingBottom: BAR_H + S.lg + insets.bottom }}>
          {step === 'start' ? (
            <>
              <Choices opts={PRESETS.map((pr) => ({ value: pr.id, title: pr.title, hint: pr.hint, icon: pr.icon, figure: pr.figure, tone: pr.tone }))} value={mode === 'preset' ? (PRESETS.find((pr) => pr.title === presetTitle)?.id ?? null) : null} onPick={(id) => usePreset(PRESETS.find((pr) => pr.id === id)!)} />
              <PressableScale
                onPress={() => {
                  setMode('custom');
                  setPresetTitle('');
                  setI(1);
                }}
                accessibilityRole="button"
                accessibilityLabel="Costruiscilo su misura. Rispondi a qualche domanda"
                style={{ marginTop: S.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingHorizontal: S.md, borderRadius: R.card, borderWidth: 1, borderColor: color.separator }}>
                  <View style={{ width: 40, height: 40, borderRadius: R.control, backgroundColor: color.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="options" size={20} color={color.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={t.title}>Costruiscilo su misura</Text>
                    <Text style={[type.footnote, { color: color.textSecondary }]}>Rispondi a qualche domanda</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
                </View>
              </PressableScale>
            </>
          ) : null}

          {step === 'confirm'
            ? (() => {
                const [goalTitle, levelTitle, dayList, minLabel] = choiceRows.map((r) => r[1]);
                // riga sempre alta 56 pt: da 4 giorni in su l'elenco diventa il numero (i giorni restano nel pannello e nell'etichetta vocale)
                const dayShort = days.length >= 4 ? `${days.length} giorni` : dayList;
                return (
                  <>
                    {/* Le 5 scelte in una riga: l'icona di modifica apre il pannello con le voci da cambiare. */}
                    <Pressable
                      onPress={() => setEdit(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Le tue scelte: ${goalTitle}, ${levelTitle}, ${dayList}, ${minLabel}, ${weeks ? `${weeks} settimane` : 'settimane da scegliere'}`}
                      accessibilityHint="Apre le scelte per cambiarle"
                      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 52, paddingHorizontal: S.md, paddingVertical: S.sm, borderRadius: R.control, backgroundColor: color.surface }, pressed && { opacity: 0.7 }]}>
                      <Ionicons name="person-circle-outline" size={24} color={color.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={t.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {goalTitle} · {levelTitle}
                        </Text>
                        <Text style={[type.footnote, { color: color.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                          {dayShort} · {minutes ? `${minutes} min` : '—'} · {weeks ? `${weeks} settimane` : '—'}
                        </Text>
                      </View>
                      <Ionicons name="create-outline" size={20} color={color.textSecondary} />
                    </Pressable>
                    <Row gap={S.xs + 2} style={{ minHeight: 20, marginTop: S.xs }}>
                      <Text style={[t.muted, { flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        Scegli la lettura in cui ti riconosci.
                      </Text>
                      {aiNow?.state === 'loading' ? (
                        <ActivityIndicator size="small" color={color.textTertiary} accessibilityLabel="Il Coach AI sta rifinendo i testi" />
                      ) : aiNow?.lines ? (
                        <Row gap={S.xs} accessible accessibilityLabel="Testi rifiniti dal Coach AI">
                          <Ionicons name="sparkles" size={13} color={color.accent} />
                          <Text style={[type.caption, { color: color.accent }]}>Coach AI</Text>
                        </Row>
                      ) : null}
                    </Row>
                    {/* le tre letture: un solo gruppo di scelta (stesso spazio di 8 pt della lista) */}
                    <View accessibilityRole="radiogroup" style={{ gap: S.sm }}>
                      {(Object.keys(TONES) as Tone[]).map((k) => {
                        const info = TONES[k];
                        const ad = adjust(k, { days, minutes: minutes ?? 30, level: level ?? 'beginner' });
                        return (
                          <ToneBanner
                            key={k}
                            title={info.title}
                            icon={info.icon}
                            tint={info.tint}
                            text={aiNow?.lines?.[k] ?? `${me.who} ${info.sentence}`}
                            short={info.short}
                            detail={`${ad.days.length} ${ad.days.length === 1 ? 'giorno' : 'giorni'} a settimana · fino a ${ad.minutes} min${ad.mobility ? ' · mobilità' : ''}`}
                            selected={shownTone === k}
                            anySelected
                            recommended={rec.tone === k}
                            onPress={() => setTone(k)}
                            onMore={() => void explain(k, me.text)}
                          />
                        );
                      })}
                    </View>
                  </>
                );
              })()
            : null}

          {step === 'goal' ? <Choices opts={GOALS} value={goal} onPick={pick(setGoal)} /> : null}
          {step === 'level' ? <Choices opts={LEVELS} value={level} onPick={pick(setLevel)} /> : null}
          {step === 'days' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {WEEKDAYS_SHORT.map((d, k) => {
                  const v = k + 1;
                  const on = days.includes(v);
                  return (
                    <PressableScale key={d} onPress={() => setDays(on ? days.filter((x) => x !== v) : [...days, v].sort())} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_NAMES[k]} style={{ flex: 1 }}>
                      <View style={{ minHeight: 68, borderRadius: R.control, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: color.surface, borderWidth: 1, borderColor: on ? color.accent : 'rgba(255,255,255,0.05)' }}>
                        {on ? <LinearGradient colors={[color.accent, mix(color.accent, color.brand, 0.35)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={FILL} /> : null}
                        <Text style={[type.callout, { color: on ? color.onAccent : color.text, fontWeight: '700' }]} numberOfLines={1} adjustsFontSizeToFit>
                          {d.slice(0, 1)}
                        </Text>
                        <Text style={[type.caption, { color: on ? color.onAccent : color.textSecondary }]} numberOfLines={1}>
                          {d}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
              <Text style={t.small}>{days.length ? `${days.length} ${days.length === 1 ? 'giorno' : 'giorni'} a settimana` : 'Scegli almeno un giorno'}</Text>
            </>
          ) : null}
          {step === 'minutes' ? <Choices opts={MINUTES} value={minutes} onPick={pick(setMinutes)} /> : null}
          {step === 'weeks' ? <Choices opts={WEEKS} value={weeks} onPick={pick(setWeeks)} /> : null}
          {step === 'extras' ? <Choices opts={EXTRAS} value={extras} onPick={pick(setExtras)} /> : null}

          {step === 'preview' ? (
            <>
              {/* Riepilogo (mockup): obiettivo in evidenza, poi durata, frequenza e livello. Valori dalle risposte e dall'anteprima vera. */}
              <Panel style={{ paddingHorizontal: S.lg, paddingVertical: S.xs }}>
                <SummaryRow order={0} lead={goalOpt ? <Tile tone={goalOpt.tone} icon={goalOpt.icon} figure={goalOpt.figure} size={44} round /> : <RingIcon icon="flag-outline" />} label="Obiettivo" value={presetTitle || goalOpt?.title || '—'} onPress={() => goTo('goal')} />
              </Panel>
              <Panel style={{ paddingHorizontal: S.lg, paddingVertical: S.xs, marginTop: S.xs }}>
                <SummaryRow order={1} lead={<RingIcon icon="time-outline" />} label="Durata" value={`${weeks ?? 8} settimane`} onPress={() => goTo('weeks')} />
                <SummaryRow order={2} lead={<RingIcon icon="repeat-outline" />} label="Frequenza" value={`${perWeek} ${perWeek === 1 ? 'allenamento' : 'allenamenti'} / settimana`} onPress={() => goTo('days')} />
                <SummaryRow order={3} lead={<RingIcon icon="ribbon-outline" />} label="Livello" value={LEVELS.find((l) => l.value === level)?.title ?? '—'} onPress={() => goTo('level')} />
              </Panel>
              <Text style={[t.small, { marginTop: S.xs }]}>Al massimo {capMin} minuti per uscita. Puoi spostare o cambiare ogni allenamento quando vuoi.</Text>
              {err ? <Banner tone="error" text={err} action={preview ? undefined : 'Riprova'} onAction={() => setPreviewTry((n) => n + 1)} /> : null}
              {preview?.warnings.map((w) => (
                <Banner key={w} tone="warn" text={w} />
              ))}
              <Text style={[t.h2, { marginTop: S.md }]}>La prima settimana</Text>
              {preview ? <PlanCalendar weekStart={input().startDate} sessions={preview.sessions.filter((x) => x.date >= input().startDate && x.date < addDaysIso(input().startDate, 7))} /> : err ? null : <Loading label="Preparo l’anteprima" />}
              <Text style={t.small}>Programma generale e prudente, non una prescrizione medica.</Text>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>

      {/* "Dimmi di più": pannello dedicato con icona, titolo, spiegazione e "Chiudi" */}
      <BriefPanel
        visible={!!more}
        onClose={() => setMore(null)}
        icon={shown ? TONES[shown.tone].icon : 'pulse-outline'}
        tint={shown ? TONES[shown.tone].tint : color.accent}
        badge={shown && rec.tone === shown.tone ? 'Consigliato' : undefined}
        title={shown ? TONES[shown.tone].title : ''}
        subtitle={shownAdj ? `${shownAdj.days.length} ${shownAdj.days.length === 1 ? 'giorno' : 'giorni'} a settimana · fino a ${shownAdj.minutes} min${shownAdj.mobility ? ' · mobilità' : ''}` : undefined}>
        {shown?.state === 'loading' ? (
          <View style={{ alignItems: 'center', gap: S.sm, paddingVertical: S.lg }} accessibilityLabel="Preparo la spiegazione" accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.storyInk} />
            <Text style={[type.subhead, { color: color.storyInkSecondary }]}>Preparo la spiegazione…</Text>
          </View>
        ) : shown?.state === 'error' ? (
          <Banner tone="error" text={shown.text} action="Riprova" onAction={() => void explain(shown.tone, me.text)} />
        ) : shown ? (
          <Text style={[type.body, { color: color.storyInk, textAlign: 'center' }]}>{shown.text}</Text>
        ) : null}
        <Text style={[type.footnote, { color: color.storyInkSecondary, textAlign: 'center' }]}>Spiegazione del Coach AI, basata solo sulle tue risposte. Non è un consiglio medico.</Text>
      </BriefPanel>

      {/* "Le tue scelte": le voci modificabili e come costruisco il piano (prima occupavano la schermata "Sei tu?"). */}
      <Sheet visible={edit && step === 'confirm'} onClose={() => setEdit(false)} title="Le tue scelte">
        <View>
          {choiceRows.map(([label, value, target], k) => (
            <View key={label}>
              {k ? <View style={{ height: 1, backgroundColor: color.separator }} /> : null}
              <Pressable
                onPress={() => {
                  setEdit(false);
                  goTo(target);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${value}. Tocca per cambiare`}
                style={({ pressed }) => [{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: S.md }, pressed && { opacity: 0.6 }]}>
                <Text style={[t.small, { width: 92 }]}>{label}</Text>
                <Text style={[t.body, { flex: 1 }]}>{value}</Text>
                <Ionicons name="create-outline" size={18} color={color.textTertiary} />
              </Pressable>
            </View>
          ))}
        </View>
        <Text style={t.muted}>{me.plan}</Text>
        <Text style={t.small}>Le letture partono solo dalle tue risposte{aiNow?.lines ? ' e sono rifinite dal Coach AI' : ''}. Tocca una voce per cambiarla.</Text>
      </Sheet>

      {/* Barra in basso (mockup): "Indietro" a sinistra e "Avanti" a destra solo dove serve; all'ultimo passo solo "Inizia il piano". */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: S.md, paddingBottom: insets.bottom + S.md, backgroundColor: color.bg }}>
        {/* sfumatura sopra la barra: se il contenuto scorre sotto, non c'è un taglio netto */}
        <LinearGradient pointerEvents="none" colors={[`${color.bg}00`, color.bg]} style={{ position: 'absolute', left: 0, right: 0, top: -S.lg, height: S.lg }} />
        {step === 'preview' ? (
          <Button title="Inizia il piano" busy={busy} disabled={!preview} onPress={create} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 }}>
            <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={i ? 'Indietro' : 'Indietro, chiude la creazione del piano'} hitSlop={8} style={({ pressed }) => [{ minHeight: HIT, flexDirection: 'row', alignItems: 'center', gap: S.xs + 2, paddingRight: S.md }, pressed && { opacity: 0.6 }]}>
              <Ionicons name="arrow-back" size={18} color={color.textSecondary} />
              <Text style={[type.callout, { color: color.textSecondary }]}>Indietro</Text>
            </Pressable>
            {nextOk[step] ? <NextPill key={step} title={step === 'confirm' ? 'Sì, sono io' : 'Avanti'} disabled={step === 'days' && days.length === 0} onPress={() => setI(i + 1)} /> : null}
          </View>
        )}
      </View>
    </View>
  );
}
