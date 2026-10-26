/**
 * Colori delle attività: UNICA fonte per tutta l'app (calendario, dettaglio giornata, allenamenti registrati, profilo).
 * Non esistono palette alternative: ogni tipologia ha un colore fisso e si ottiene solo da qui.
 *
 * Le attività combinate (corsa e camminata) NON hanno un terzo colore: sono la sfumatura tra i due colori ufficiali.
 * Il trail ha un colore suo (verde bosco), distinto da forza (lime) e aerobico (menta); "Altro" un neutro caldo,
 * distinto dal grigio freddo del riposo (che è uno stato del piano, non un'attività).
 * Pausa, infortunio e riposo sono stati del piano, distinti dalle attività e tra loro (colore + icona + trattino).
 */
import type { SessionKind, SportId } from '../../../shared/types.ts';

export type ActivityTypeId =
  | 'run'
  | 'walk'
  | 'trail'
  | 'run_walk'
  | 'other'
  | 'fartlek'
  | 'intervals'
  | 'long'
  | 'tempo'
  | 'strength'
  | 'aerobic'
  | 'mobility'
  | 'recovery'
  | 'rest'
  | 'injury'
  | 'paused'
  | 'event';

export interface ActivityStyle {
  /** Colore principale (testi e tracciati: contrasto ≥ 4.5:1 su sfondo scuro). */
  solid: string;
  /** Sfondo morbido per righe e celle. */
  tint: string;
  /** Per le attività combinate: i due colori ufficiali da fondere. */
  blend?: [string, string];
  label: string;
  /** Figura vettoriale (corsa, camminata, trail, corsa + camminata): se presente sostituisce l'icona Ionicons. */
  glyph?: 'run' | 'walk' | 'trail' | 'run_walk';
  icon: 'footsteps-outline' | 'walk-outline' | 'triangle-outline' | 'swap-horizontal-outline' | 'shapes-outline' | 'pulse-outline' | 'flash-outline' | 'trail-sign-outline' | 'speedometer-outline' | 'barbell-outline' | 'heart-outline' | 'body-outline' | 'leaf-outline' | 'moon-outline' | 'bandage-outline' | 'pause-circle-outline' | 'people-outline';
  /** true = stato del piano (riposo, infortunio, pausa), non un'attività svolta. */
  planState?: boolean;
}

const C = {
  run: '#70A7FF', // blu: corsa
  walk: '#F2B84B', // ambra
  trail: '#5DBF5A', // verde bosco: sentieri (≥ 6,2:1 su bg, surface e surfaceElevated)
  other: '#B5ADA3', // pietra, neutro caldo: attività di altro tipo (≥ 6,5:1)
  fartlek: '#F2879E', // rosa
  intervals: '#FF7A59', // corallo
  long: '#5B8CFF', // blu
  tempo: '#C38BFF', // lilla
  strength: '#F58AB6', // rosa: forza
  aerobic: '#4FD1A5', // menta
  mobility: '#B7A6FF', // lavanda: mobilità
  recovery: '#9FB4C7', // grigio-azzurro
  rest: '#8693A0', // grigio
  injury: '#FF5C6C', // rosso, solo per limitazioni fisiche
  paused: '#C6B8D9', // malva: stato del piano
  event: '#9F8BFF', // viola brand chiaro: uscite di gruppo
} as const;

const tint = (hex: string) => `${hex}24`;

export const ACTIVITY_STYLES: Record<ActivityTypeId, ActivityStyle> = {
  run: { solid: C.run, tint: tint(C.run), label: 'Corsa', glyph: 'run', icon: 'footsteps-outline' },
  walk: { solid: C.walk, tint: tint(C.walk), label: 'Camminata', glyph: 'walk', icon: 'walk-outline' },
  trail: { solid: C.trail, tint: tint(C.trail), label: 'Trail', glyph: 'trail', icon: 'triangle-outline' },
  run_walk: { solid: C.run, tint: tint(C.run), blend: [C.run, C.walk], label: 'Corsa + camminata', glyph: 'run_walk', icon: 'swap-horizontal-outline' },
  other: { solid: C.other, tint: tint(C.other), label: 'Altro', icon: 'shapes-outline' },
  fartlek: { solid: C.fartlek, tint: tint(C.fartlek), label: 'Fartlek', icon: 'pulse-outline' },
  intervals: { solid: C.intervals, tint: tint(C.intervals), label: 'Ripetute', icon: 'flash-outline' },
  long: { solid: C.long, tint: tint(C.long), label: 'Lungo', icon: 'trail-sign-outline' },
  tempo: { solid: C.tempo, tint: tint(C.tempo), label: 'Ritmo', icon: 'speedometer-outline' },
  strength: { solid: C.strength, tint: tint(C.strength), label: 'Forza', icon: 'barbell-outline' },
  aerobic: { solid: C.aerobic, tint: tint(C.aerobic), label: 'Aerobico', icon: 'heart-outline' },
  mobility: { solid: C.mobility, tint: tint(C.mobility), label: 'Mobilità', icon: 'body-outline' },
  recovery: { solid: C.recovery, tint: tint(C.recovery), label: 'Recupero', icon: 'leaf-outline' },
  rest: { solid: C.rest, tint: tint(C.rest), label: 'Riposo', icon: 'moon-outline', planState: true },
  injury: { solid: C.injury, tint: tint(C.injury), label: 'Limitazione fisica', icon: 'bandage-outline', planState: true },
  paused: { solid: C.paused, tint: tint(C.paused), label: 'Piano in pausa', icon: 'pause-circle-outline', planState: true },
  event: { solid: C.event, tint: tint(C.event), label: 'Uscita di gruppo', icon: 'people-outline' },
};

/** Tipo dall'attività pianificata o registrata. Mapping esplicito: nessun valore può restare senza colore. */
const FROM_KIND: Record<SessionKind, ActivityTypeId> = {
  run_easy: 'run',
  run_continuous: 'run',
  run_intervals: 'intervals',
  run_progressive: 'tempo',
  run_long: 'long',
  run_free: 'run',
  run_walk: 'run_walk',
  aerobic: 'aerobic',
  strength: 'strength',
  rest: 'rest',
  recovery_active: 'recovery',
  mobility: 'mobility',
};

export function activityTypeOf(kind: SessionKind, title = ''): ActivityTypeId {
  // Il fartlek è una corsa con variazioni di ritmo: oggi è un titolo di sessione di tipo "ripetute".
  if (kind === 'run_intervals' && /fartlek/i.test(title)) return 'fartlek';
  return FROM_KIND[kind];
}

export const activityStyle = (id: ActivityTypeId): ActivityStyle => ACTIVITY_STYLES[id];
export const styleOfKind = (kind: SessionKind, title = ''): ActivityStyle => ACTIVITY_STYLES[activityTypeOf(kind, title)];

/** Tipo da uno sport registrato o di un'uscita. Mapping esplicito: gli sport non ancora attivi valgono "Altro". */
const FROM_SPORT: Record<SportId, ActivityTypeId> = {
  running: 'run',
  walking: 'walk',
  trail: 'trail',
  run_walk: 'run_walk',
  other: 'other',
  cycling: 'other',
  padel: 'other',
  football5: 'other',
};
export const activityTypeOfSport = (sport: SportId): ActivityTypeId => FROM_SPORT[sport] ?? 'run';
export const styleOfSport = (sport: SportId): ActivityStyle => ACTIVITY_STYLES[activityTypeOfSport(sport)];

/**
 * Colori per un indicatore: uno solo, oppure i due colori ufficiali in sfumatura se l'attività è combinata.
 * Più attività nella stessa giornata: l'indicatore aggregato usa i loro colori, ciascuna resta riconoscibile.
 */
export function gradientFor(styles: ActivityStyle[]): [string, string] {
  const first = styles[0];
  if (!first) return [ACTIVITY_STYLES.rest.solid, ACTIVITY_STYLES.rest.solid];
  if (first.blend) return first.blend;
  const second = styles.find((s) => s.solid !== first.solid);
  return [first.solid, second ? (second.blend ? second.blend[1] : second.solid) : first.solid];
}

/**
 * Priorità degli stati del piano (la più alta vince):
 *  1 infortunio dichiarato  2 piano in pausa o vacanza  3 attività  4 riposo.
 * Un normale check-in (stanchezza, poco tempo) non sovrascrive mai pausa o infortunio.
 */
export const STATE_PRIORITY = ['injury', 'paused', 'activity', 'rest'] as const;
export type PlanStateKind = (typeof STATE_PRIORITY)[number];
export const resolveState = (present: PlanStateKind[]): PlanStateKind => STATE_PRIORITY.find((s) => present.includes(s)) ?? 'rest';
