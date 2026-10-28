/**
 * Record personali e riconoscimenti, derivati SEMPRE dallo storico degli allenamenti (funzione pura).
 *
 * Perché derivati e non salvati: così una stessa attività sincronizzata due volte non può produrre duplicati,
 * una modifica o una cancellazione ricalcola tutto da sola, e nessun riconoscimento esiste senza dati che lo provino.
 *
 * Regole:
 *  - Normalizzazione: sport dedotto da `sport`/`kind`; attività duplicate tra fonti (stesso `activityId`, oppure stesso
 *    sport con partenza entro 10 minuti e distanze entro il 5%) contano una volta sola, preferendo l'allenamento nato nell'app.
 *  - Un record esiste solo se c'è uno storico confrontabile PRECEDENTE: il primo risultato non è un record.
 *  - Tempi su porzione (1/5/10 km): solo tracce GPS dell'app senza interruzioni (vedi trackIssue). Tempi totali (5/10/21 km),
 *    distanza e durata massime: escluse attività corrette a mano e tapis roulant. Le metriche di corsa non si applicano ad altri sport.
 *  - Trail (corsa su sentieri, `trail: true`): gruppo a sé con record di distanza e durata, MAI di passo o di tempo sui km
 *    da strada (il dislivello li falsa).
 *  - Corsa + camminata (allenamento `run_walk`): resta tra le corse per conteggi, distanza e durata, ma non entra nei tempi
 *    su porzione né nei tempi totali (alterna due andature, il passo non è confrontabile).
 *  - "Altro": nessun allenamento registrato ha questo tipo, quindi nessun record di prestazione.
 *  - Forza: carico per esercizio solo con serie svolte e peso indicato; volume = Σ ripetizioni × carico.
 *  - Ripetute: "Precisione" solo per un allenamento a intervalli del piano svolta; nessun progresso di ritmo (dati insufficienti).
 *  - Distanza totale e serie di settimane restano nei distintivi (badges.ts): qui non si duplicano.
 *  - Fuso orario: gli orari sono UTC; le settimane vanno da lunedì a domenica UTC (limite dichiarato).
 */
import { bestSegmentSec, trackIssue } from './performances.ts';
import type { LoggedSet, WorkoutLog } from './types.ts';

export type AwardCategory = 'new_peak' | 'first_step' | 'beyond_limit' | 'steady' | 'strength_up' | 'precision' | 'explorer';
export type AwardSport = 'running' | 'walking' | 'trail' | 'strength';

/** Colore e forma dell'icona sono scelti dal client in base a `tone`; il testo nell'icona è `mark` + `unit`. */
export interface Award {
  /** Stabile: `${logId}:${code}`. Una sola volta per attività. */
  id: string;
  code: string;
  category: AwardCategory;
  sport: AwardSport;
  tone: string;
  name: string;
  description: string;
  headline: string;
  /** Testo dentro l'icona: i km (o minuti, kg, numero) conquistati. */
  mark: string;
  unit: string;
  /** true = nuovo record personale (confronto con lo storico). */
  record: boolean;
  value: string;
  previous: string | null;
  improvement: string | null;
  logId: string;
  date: string;
  level?: number;
}

export interface RecordEntry {
  code: string;
  label: string;
  sport: AwardSport;
  tone: string;
  mark: string;
  unit: string;
  value: string;
  logId: string;
  title: string;
  date: string;
}

export interface NextTarget {
  label: string;
  current: number;
  target: number;
  unit: string;
  sport: AwardSport;
}

const SEGMENTS = [1, 5, 10];
const TOTALS: Array<[number, string, string]> = [[5, '5 km', '5'], [10, '10 km', '10'], [21.0975, 'mezza maratona', '21']];
const COUNT_STEPS = [10, 25, 50, 100];
/**
 * Gerarchia ESPLICITA e stabile dei riconoscimenti, dal meno al più importante.
 * A parità di categoria decide il livello (km più lunghi pesano di più, `level` per le serie di conteggio).
 * È l'unica fonte: dettaglio attività, racconti e card leggono l'ordine da qui.
 */
export const IMPORTANCE: Record<AwardCategory, number> = { first_step: 1, explorer: 2, steady: 3, precision: 4, strength_up: 5, beyond_limit: 6, new_peak: 7 };
const KM_WEIGHT: Record<string, number> = { km1: 1, km5: 2, km10: 3, km21: 4, distance: 5, time: 4 };

export function importanceOf(a: Pick<Award, 'category' | 'tone' | 'level'>): number {
  return IMPORTANCE[a.category] * 100 + (KM_WEIGHT[a.tone] ?? 0) * 10 + (a.level ?? 0);
}

/** Dal meno importante al più importante (ordine di comparsa nei racconti). */
export const ascending = (list: Award[]): Award[] => [...list].sort((a, b) => importanceOf(a) - importanceOf(b) || a.code.localeCompare(b.code));
/** Dal più importante: il primo è il riconoscimento principale. */
export const descending = (list: Award[]): Award[] => ascending(list).reverse();

export const SPORT_NAME: Record<AwardSport, string> = { running: 'Corsa', walking: 'Camminata', trail: 'Trail', strength: 'Forza' };
/** Plurale usato nei conteggi ("10 corse registrate"). */
const PLURAL: Record<AwardSport, string> = { running: 'corse', walking: 'camminate', trail: 'uscite trail', strength: 'sessioni di forza' };
const COUNT_LABEL: Record<AwardSport, string> = { running: 'Corse', walking: 'Camminate', trail: 'Uscite trail', strength: 'Sessioni di forza' };

export function groupOf(l: WorkoutLog): AwardSport | null {
  if (l.kind === 'strength') return 'strength';
  if (l.sport === 'walking') return 'walking';
  if (l.trail) return 'trail';
  if (l.sport === 'running' || l.kind.startsWith('run_')) return 'running';
  return null;
}

const before = (a: WorkoutLog, b: WorkoutLog) => a.startedAt < b.startedAt || (a.startedAt === b.startedAt && a.id < b.id);
const counts = (l: WorkoutLog) => l.durationSec >= 60;
const comparable = (l: WorkoutLog) => !l.edited && l.environment !== 'treadmill';
/** Il passo della corsa è confrontabile: non per corsa + camminata (né per il trail, che ha un gruppo a sé). */
const pacedRun = (l: WorkoutLog) => l.kind !== 'run_walk' && !l.trail;

/** Una stessa uscita non conta due volte, qualunque fonte l'abbia portata. */
export function dedupe(logs: WorkoutLog[]): WorkoutLog[] {
  const sorted = [...logs].sort((a, b) => (a.origin === 'strava' ? 1 : 0) - (b.origin === 'strava' ? 1 : 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const kept: WorkoutLog[] = [];
  for (const l of sorted) {
    const g = groupOf(l);
    const dup = kept.some((k) => {
      if (l.activityId && k.activityId === l.activityId) return true;
      if (g === null || groupOf(k) !== g || g === 'strength') return false;
      if (Math.abs(Date.parse(l.startedAt) - Date.parse(k.startedAt)) > 10 * 60_000) return false;
      if (l.distanceKm && k.distanceKm) return Math.abs(l.distanceKm - k.distanceKm) / Math.max(l.distanceKm, k.distanceKm) <= 0.05;
      return !l.distanceKm && !k.distanceKm;
    });
    if (!dup) kept.push(l);
  }
  return kept.sort((a, b) => (before(a, b) ? -1 : 1));
}

/* ---------- formati ---------- */

export function fmtSec(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
const num = (v: number, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const kmText = (v: number) => `${num(v)} km`;
const minText = (sec: number) => `${Math.round(sec / 60)} min`;

/* ---------- metriche ---------- */

interface Metric {
  code: string;
  sport: AwardSport;
  category: AwardCategory;
  tone: string;
  name: string;
  mark: (v: number) => string;
  unit: string;
  low: boolean;
  headline: (v: number) => string;
  describe: string;
  value: (l: WorkoutLog) => number | null;
  show: (v: number) => string;
  delta: (now: number, prev: number) => string;
}

const timeDelta = (n: number, p: number) => `${fmtSec(p - n)} più veloce`;
const kmDelta = (n: number, p: number) => `+${num(n - p)} km`;
const minDelta = (n: number, p: number) => `+${Math.max(1, Math.round((n - p) / 60))} min`;

const RUN_METRICS: Metric[] = [
  ...SEGMENTS.map((km): Metric => ({
    code: `seg_${km}`,
    sport: 'running',
    category: 'new_peak',
    tone: `km${km}`,
    name: `Nuova vetta · ${km} km`,
    mark: () => String(km),
    unit: 'km',
    low: true,
    headline: () => `Il tuo miglior tempo di sempre sui ${km} km!`,
    describe: `Porzione continua più veloce di ${km} km su una traccia GPS registrata nell'app, senza interruzioni.`,
    value: (l) => {
      if (!pacedRun(l) || !l.track || l.track.length < 2 || trackIssue(l)) return null;
      const s = bestSegmentSec(l.track, km);
      return s !== null && s / km >= 150 && s / km <= 1200 ? s : null;
    },
    show: fmtSec,
    delta: timeDelta,
  })),
  ...TOTALS.map(([km, name, mark]): Metric => ({
    code: `tot_${km === 21.0975 ? 21 : km}`,
    sport: 'running',
    category: 'new_peak',
    tone: `km${mark}`,
    name: `Nuova vetta · ${name}`,
    mark: () => mark,
    unit: 'km',
    low: true,
    headline: () => `La tua corsa più veloce di sempre su ${name}!`,
    describe: `Tempo totale di una corsa tra ${num(km)} e ${num(km * 1.05, 1)} km (non su una porzione).`,
    value: (l) => (pacedRun(l) && comparable(l) && l.distanceKm !== null && l.distanceKm >= km && l.distanceKm <= km * 1.05 ? l.durationSec : null),
    show: fmtSec,
    delta: timeDelta,
  })),
  {
    code: 'run_longest_dist',
    sport: 'running',
    category: 'beyond_limit',
    tone: 'distance',
    name: 'Oltre il limite · distanza',
    mark: (v) => num(v, 1),
    unit: 'km',
    low: false,
    headline: () => 'La tua corsa più lunga di sempre!',
    describe: 'Distanza totale più lunga tra le tue corse.',
    value: (l) => (comparable(l) && l.distanceKm && l.distanceKm >= 1 ? l.distanceKm : null),
    show: kmText,
    delta: kmDelta,
  },
  {
    code: 'run_longest_time',
    sport: 'running',
    category: 'beyond_limit',
    tone: 'time',
    name: 'Oltre il limite · durata',
    mark: (v) => String(Math.round(v / 60)),
    unit: 'min',
    low: false,
    headline: () => 'Il tuo allenamento di corsa più lungo di sempre!',
    describe: 'Durata più lunga tra le tue corse.',
    value: (l) => (comparable(l) && l.durationSec >= 600 ? l.durationSec : null),
    show: minText,
    delta: minDelta,
  },
];

const WALK_METRICS: Metric[] = [
  {
    code: 'walk_longest_dist',
    sport: 'walking',
    category: 'beyond_limit',
    tone: 'walk',
    name: 'Oltre il limite · camminata',
    mark: (v) => num(v, 1),
    unit: 'km',
    low: false,
    headline: () => 'La tua camminata più lunga di sempre!',
    describe: 'Distanza più lunga tra le tue camminate.',
    value: (l) => (comparable(l) && l.distanceKm && l.distanceKm >= 0.5 ? l.distanceKm : null),
    show: kmText,
    delta: kmDelta,
  },
  {
    code: 'walk_longest_time',
    sport: 'walking',
    category: 'beyond_limit',
    tone: 'walk',
    name: 'Oltre il limite · durata',
    mark: (v) => String(Math.round(v / 60)),
    unit: 'min',
    low: false,
    headline: () => 'La tua camminata più lunga per durata!',
    describe: 'Durata più lunga tra le tue camminate.',
    value: (l) => (comparable(l) && l.durationSec >= 600 ? l.durationSec : null),
    show: minText,
    delta: minDelta,
  },
];

/** Trail: solo distanza e durata. Niente passo né tempi sui km da strada: salite e discese li rendono incomparabili. */
const TRAIL_METRICS: Metric[] = [
  {
    code: 'trail_longest_dist',
    sport: 'trail',
    category: 'beyond_limit',
    tone: 'distance',
    name: 'Oltre il limite · trail',
    mark: (v) => num(v, 1),
    unit: 'km',
    low: false,
    headline: () => 'Il tuo trail più lungo di sempre!',
    describe: 'Distanza più lunga tra le tue uscite trail. Sul trail non si confrontano passo e tempi: il dislivello li cambia.',
    value: (l) => (comparable(l) && l.distanceKm && l.distanceKm >= 1 ? l.distanceKm : null),
    show: kmText,
    delta: kmDelta,
  },
  {
    code: 'trail_longest_time',
    sport: 'trail',
    category: 'beyond_limit',
    tone: 'time',
    name: 'Oltre il limite · durata trail',
    mark: (v) => String(Math.round(v / 60)),
    unit: 'min',
    low: false,
    headline: () => 'Il tuo trail più lungo per durata!',
    describe: 'Durata più lunga tra le tue uscite trail.',
    value: (l) => (comparable(l) && l.durationSec >= 600 ? l.durationSec : null),
    show: minText,
    delta: minDelta,
  },
];

const METRICS: Record<AwardSport, Metric[]> = { running: RUN_METRICS, walking: WALK_METRICS, trail: TRAIL_METRICS, strength: [] };

const volumeOf = (sets: LoggedSet[]) => sets.filter((s) => s.done && s.loadKg && s.loadKg > 0 && s.reps > 0).reduce((a, s) => a + s.reps * s.loadKg!, 0);
const exKey = (s: LoggedSet) => s.exercise.trim().toLowerCase();
function loads(l: WorkoutLog): Map<string, { name: string; kg: number }> {
  const m = new Map<string, { name: string; kg: number }>();
  for (const s of l.sets) {
    if (!s.done || !s.loadKg || s.loadKg <= 0 || s.reps <= 0) continue;
    const k = exKey(s);
    if (!m.has(k) || m.get(k)!.kg < s.loadKg) m.set(k, { name: s.exercise.trim(), kg: s.loadKg });
  }
  return m;
}

/* ---------- riconoscimenti di una attività ---------- */

function weekKey(iso: string): string {
  const d = new Date(iso);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

function mk(l: WorkoutLog, g: AwardSport, a: Omit<Award, 'id' | 'logId' | 'date' | 'sport'>): Award {
  return { ...a, id: `${l.id}:${a.code}`, sport: g, logId: l.id, date: l.startedAt };
}

/** Riconoscimenti di `log` rispetto allo storico PRECEDENTE. */
export function awardsFor(log: WorkoutLog, history: WorkoutLog[]): Award[] {
  const g = groupOf(log);
  if (!g || !counts(log)) return [];
  const prior = dedupe(history.filter((l) => l.id !== log.id)).filter((l) => before(l, log) && counts(l));
  const sameSport = prior.filter((l) => groupOf(l) === g);
  const out: Award[] = [];

  if (g !== 'strength' && comparable(log) && Number.isFinite(log.distanceKm) && log.distanceKm! >= 21
    && !sameSport.some(l => comparable(l) && Number.isFinite(l.distanceKm) && l.distanceKm! >= 21)) {
    out.push(mk(log,g,{code:'distance_21km',category:'beyond_limit',tone:'distance',name:'Traguardo 21 km',description:'Almeno 21 km in un unico allenamento, dalla distanza riportata nell’attività.',headline:'Hai raggiunto i 21 km in un unico allenamento!',mark:'21',unit:'km',record:false,value:`${num(log.distanceKm!,2)} km`,previous:null,improvement:null}));
  }

  if (!sameSport.length) {
    out.push(mk(log, g, { code: `first_${g}`, category: 'first_step', tone: 'first', name: 'Primo passo', description: `La tua prima attività di ${SPORT_NAME[g].toLowerCase()} registrata.`, headline: `La tua prima attività di ${SPORT_NAME[g].toLowerCase()}!`, mark: '1', unit: '', record: false, value: '1ª', previous: null, improvement: null }));
  }

  for (const m of METRICS[g]) {
    const now = m.value(log);
    if (now === null) continue;
    const olds = sameSport.map(m.value).filter((v): v is number => v !== null);
    if (!olds.length) continue;
    const best = m.low ? Math.min(...olds) : Math.max(...olds);
    if (m.low ? now >= best : now <= best) continue;
    out.push(mk(log, g, { code: m.code, category: m.category, tone: m.tone, name: m.name, description: m.describe, headline: m.headline(now), mark: m.mark(now), unit: m.unit, record: true, value: m.show(now), previous: m.show(best), improvement: m.delta(now, best) }));
  }

  if (g === 'strength') {
    const mine = loads(log);
    const hist = new Map<string, number>();
    for (const l of sameSport) for (const [k, v] of loads(l)) hist.set(k, Math.max(hist.get(k) ?? 0, v.kg));
    let n = 0;
    for (const [k, v] of [...mine].sort((a, b) => b[1].kg - a[1].kg)) {
      const prev = hist.get(k);
      if (prev === undefined || v.kg <= prev || n >= 3) continue;
      n++;
      out.push(mk(log, g, { code: `load_${k.replace(/[^a-z0-9]+/g, '_')}`, category: 'strength_up', tone: 'strength', name: `Forza in crescita · ${v.name}`, description: `Carico più alto che hai usato in ${v.name}, con serie svolte.`, headline: `Nuovo carico massimo in ${v.name}!`, mark: num(v.kg, 1), unit: 'kg', record: true, value: `${num(v.kg, 1)} kg`, previous: `${num(prev, 1)} kg`, improvement: `+${num(v.kg - prev, 1)} kg` }));
    }
    const vol = volumeOf(log.sets);
    const volPrev = Math.max(0, ...sameSport.map((l) => volumeOf(l.sets)));
    if (vol > 0 && volPrev > 0 && vol > volPrev) {
      out.push(mk(log, g, { code: 'str_volume', category: 'strength_up', tone: 'strength', name: 'Forza in crescita · volume', description: 'Volume di allenamento (ripetizioni × carico, solo serie svolte) più alto di sempre.', headline: 'Il tuo allenamento di forza più “pesante” di sempre!', mark: String(Math.round(vol / 100) / 10), unit: 't', record: true, value: `${Math.round(vol)} kg`, previous: `${Math.round(volPrev)} kg`, improvement: `+${Math.round(vol - volPrev)} kg` }));
    }
  }

  if (log.kind === 'run_intervals' && log.plannedSessionId) {
    const n = sameSport.filter((l) => l.kind === 'run_intervals' && l.plannedSessionId).length + 1;
    out.push(mk(log, g, { code: 'intervals_done', category: 'precision', tone: 'precision', name: 'Precisione', description: 'Allenamento a intervalli del piano completata.', headline: 'Ripetute del piano completate!', mark: String(n), unit: '×', record: false, value: `${n}ª allenamento`, previous: null, improvement: null }));
  }

  const wk = weekKey(log.startedAt);
  const inWeek = prior.filter((l) => weekKey(l.startedAt) === wk).length + 1;
  if (inWeek === 3) {
    out.push(mk(log, g, { code: 'week_3', category: 'steady', tone: 'steady', name: 'Costanza', description: 'Tre attività svolte nella stessa settimana (lunedì–domenica).', headline: 'Terza attività della settimana: costanza!', mark: '3', unit: '/sett.', record: false, value: '3 attività', previous: null, improvement: null }));
  }

  const nSport = sameSport.length + 1;
  const step = COUNT_STEPS.find((s) => s === nSport);
  if (step) {
    const what = PLURAL[g];
    out.push(mk(log, g, { code: `count_${g}_${step}`, category: 'explorer', tone: 'explorer', name: 'Esploratore', description: `${step} ${what} registrate, senza duplicati tra fonti.`, headline: `${step} ${what} all'attivo!`, mark: String(step), unit: '×', record: false, value: `${step} ${what}`, previous: null, improvement: null, level: COUNT_STEPS.indexOf(step) + 1 }));
  }
  return descending(out);
}

/** Riconoscimenti di una singola attività, calcolati sullo storico completo dell'utente. */
export function activityAwards(logId: string, all: WorkoutLog[]): Award[] {
  const log = all.find((l) => l.id === logId);
  return log ? awardsFor(log, all) : [];
}

/** Tutti i riconoscimenti, dal più recente. */
export function allAwards(all: WorkoutLog[]): Award[] {
  const logs = dedupe(all);
  return logs.flatMap((l) => awardsFor(l, logs)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Record personali attuali: il valore migliore per metrica, con l'attività che lo detiene. */
export function currentRecords(all: WorkoutLog[]): RecordEntry[] {
  const logs = dedupe(all).filter(counts);
  const out: RecordEntry[] = [];
  for (const m of [...RUN_METRICS, ...WALK_METRICS, ...TRAIL_METRICS]) {
    let best: { v: number; l: WorkoutLog } | null = null;
    for (const l of logs) {
      if (groupOf(l) !== m.sport) continue;
      const v = m.value(l);
      if (v === null) continue;
      if (!best || (m.low ? v < best.v : v > best.v)) best = { v, l };
    }
    if (best) out.push({ code: m.code, label: m.name, sport: m.sport, tone: m.tone, mark: m.mark(best.v), unit: m.unit, value: m.show(best.v), logId: best.l.id, title: best.l.title, date: best.l.startedAt });
  }
  const bestLoad = new Map<string, { kg: number; name: string; l: WorkoutLog }>();
  for (const l of logs.filter((x) => groupOf(x) === 'strength')) {
    for (const [k, v] of loads(l)) if (!bestLoad.has(k) || bestLoad.get(k)!.kg < v.kg) bestLoad.set(k, { kg: v.kg, name: v.name, l });
  }
  for (const [k, v] of [...bestLoad].sort((a, b) => b[1].kg - a[1].kg).slice(0, 5)) {
    out.push({ code: `load_${k}`, label: `Carico · ${v.name}`, sport: 'strength', tone: 'strength', mark: num(v.kg, 1), unit: 'kg', value: `${num(v.kg, 1)} kg`, logId: v.l.id, title: v.l.title, date: v.l.startedAt });
  }
  return out;
}

/** Prossimi traguardi misurabili (solo conteggi: i record non hanno un "prossimo livello"). */
export function nextTargets(all: WorkoutLog[]): NextTarget[] {
  const logs = dedupe(all).filter(counts);
  const out: NextTarget[] = [];
  for (const g of ['running', 'walking', 'trail', 'strength'] as const) {
    const n = logs.filter((l) => groupOf(l) === g).length;
    if (!n) continue;
    const target = COUNT_STEPS.find((s) => s > n);
    if (target) out.push({ label: COUNT_LABEL[g], current: n, target, unit: '', sport: g });
  }
  return out;
}

/** Un suggerimento discreto quando l'attività non ha conquistato nulla, solo se il traguardo è davvero vicino. */
export function nextHint(log: WorkoutLog, all: WorkoutLog[]): string | null {
  const g = groupOf(log);
  if (!g) return null;
  const t = nextTargets(all).find((x) => x.sport === g);
  return t && t.target - t.current <= 3 ? `Ancora ${t.target - t.current} per il traguardo “${t.label}: ${t.target}”.` : null;
}
