/**
 * Obiettivi consigliati. Ogni proposta dichiara cosa propone, su quali dati, quale periodo e perché.
 *  - Con storico (almeno 3 settimane attive nelle ultime 6): mediana settimanale delle ultime 6 settimane,
 *    zeri compresi. Il consiglio MANTIENE il livello attuale: non aumenta il carico in automatico.
 *  - Senza storico: si usano solo disponibilità ed esperienza dichiarate. Per chi comincia, al massimo 3 giorni
 *    a settimana anche se ne ha di più (regola prudente, modificabile).
 * Gli obiettivi sono modificabili e archiviabili; durante pausa o vacanza non contano (nessun senso di colpa).
 */
import { planStateOf } from './adaptive.ts';
import { AppError, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { Goal, GoalType, Id } from './types.ts';
import { clean } from './validation.ts';

export const GOAL_UNITS: Record<GoalType, { unit: string; period: 'week' | 'month'; label: string }> = {
  consistency: { unit: 'uscite', period: 'week', label: 'Costanza' },
  weekly_minutes: { unit: 'minuti', period: 'week', label: 'Tempo disponibile' },
  weekly_km: { unit: 'km', period: 'week', label: 'Distanza settimanale' },
  group: { unit: 'uscite di gruppo', period: 'month', label: 'Partecipazione al gruppo' },
};

export interface GoalSuggestion {
  type: GoalType;
  target: number;
  what: string;
  basis: string;
  why: string;
}

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

function monday(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

function weekly(ctx: Ctx, uid: Id, weeks: number) {
  const start = monday(ctx.now);
  const out: Array<{ runs: number; km: number; min: number }> = [];
  for (let w = weeks; w >= 1; w--) {
    const from = new Date(start.getTime() - w * 7 * 86_400_000).toISOString();
    const to = new Date(start.getTime() - (w - 1) * 7 * 86_400_000).toISOString();
    const acts = Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.date >= from && a.date < to);
    out.push({ runs: acts.length, km: acts.reduce((s, a) => s + (a.distanceKm ?? 0), 0), min: acts.reduce((s, a) => s + (a.durationMin ?? 0), 0) });
  }
  return out;
}

export function suggestGoals(ctx: Ctx): { hasHistory: boolean; period: string; suggestions: GoalSuggestion[] } {
  const uid = actor(ctx);
  const w = weekly(ctx, uid, 6);
  const active = w.filter((x) => x.runs > 0).length;
  const period = 'le 6 settimane complete prima di questa';
  if (active < 3) return { hasHistory: false, period, suggestions: [] };
  const runs = Math.max(1, Math.round(median(w.map((x) => x.runs))));
  const km = Math.round(median(w.map((x) => x.km)) * 2) / 2;
  const min = Math.round(median(w.map((x) => x.min)) / 5) * 5;
  const s: GoalSuggestion[] = [
    { type: 'consistency', target: runs, what: `${runs} ${runs === 1 ? 'uscita' : 'uscite'} a settimana`, basis: `Uscite per settimana: ${w.map((x) => x.runs).join(', ')} (mediana ${runs}).`, why: 'Mantenere la tua abitudine attuale è il modo più semplice per progredire con continuità.' },
  ];
  if (km > 0) s.push({ type: 'weekly_km', target: km, what: `${String(km).replace('.', ',')} km a settimana`, basis: `Km per settimana: ${w.map((x) => Math.round(x.km)).join(', ')} (mediana ${String(km).replace('.', ',')}).`, why: 'È il tuo volume abituale: non viene aumentato in automatico.' });
  if (min > 0) s.push({ type: 'weekly_minutes', target: min, what: `${min} minuti a settimana`, basis: `Minuti per settimana: ${w.map((x) => x.min).join(', ')} (mediana ${min}).`, why: 'Utile se il tempo è il tuo vincolo principale.' });
  const groupRuns = Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.source === 'event' && Date.parse(a.date) >= ctx.now.getTime() - 90 * 86_400_000).length;
  if (groupRuns > 0) {
    const perMonth = Math.max(1, Math.round(groupRuns / 3));
    s.push({ type: 'group', target: perMonth, what: `${perMonth} ${perMonth === 1 ? 'uscita' : 'uscite'} di gruppo al mese`, basis: `${groupRuns} uscite di gruppo confermate negli ultimi 3 mesi.`, why: 'Correre con altre persone aiuta a restare costanti.' });
  }
  return { hasHistory: true, period, suggestions: s };
}

export function suggestFromAnswers(ctx: Ctx, a: { daysPerWeek: number; minutesPerSession: number; experience: 'new' | 'some' | 'regular' }): GoalSuggestion[] {
  actor(ctx);
  if (!a || !Number.isInteger(a.daysPerWeek) || a.daysPerWeek < 1 || a.daysPerWeek > 7) throw new AppError('validation', 'Indica quanti giorni hai a disposizione (1–7).');
  if (typeof a.minutesPerSession !== 'number' || a.minutesPerSession < 10 || a.minutesPerSession > 240) throw new AppError('validation', 'Indica i minuti per uscita (10–240).');
  if (!['new', 'some', 'regular'].includes(a.experience)) throw new AppError('validation', 'Indica la tua esperienza.');
  const days = a.experience === 'new' ? Math.min(3, a.daysPerWeek) : a.daysPerWeek;
  const basis = `Hai indicato ${a.daysPerWeek} ${a.daysPerWeek === 1 ? 'giorno' : 'giorni'} a settimana, ${a.minutesPerSession} minuti per uscita, esperienza: ${a.experience === 'new' ? 'agli inizi' : a.experience === 'some' ? 'qualche corsa' : 'corro con regolarità'}.`;
  return [
    { type: 'consistency', target: days, what: `${days} ${days === 1 ? 'uscita' : 'uscite'} a settimana`, basis, why: a.experience === 'new' && days < a.daysPerWeek ? 'Per iniziare conviene usare meno giorni di quelli disponibili e lasciare spazio al recupero.' : 'Corrisponde alla disponibilità che hai indicato.' },
    { type: 'weekly_minutes', target: days * Math.round(a.minutesPerSession / 5) * 5, what: `${days * Math.round(a.minutesPerSession / 5) * 5} minuti a settimana`, basis, why: 'Si basa solo sul tempo che hai dichiarato, non su dati misurati.' },
  ];
}

export function setGoal(ctx: Ctx, input: { type: GoalType; target: number; basis: string }): Goal {
  const uid = actor(ctx);
  if (!input || !(input.type in GOAL_UNITS)) throw new AppError('validation', 'Obiettivo non valido.');
  const max = { consistency: 14, weekly_minutes: 1500, weekly_km: 300, group: 31 }[input.type];
  if (typeof input.target !== 'number' || !(input.target > 0) || input.target > max) throw new AppError('validation', 'Valore non valido.', { target: `Tra 1 e ${max}.` });
  for (const g of Object.values(ctx.db.goals)) if (g.userId === uid && g.type === input.type && g.status === 'active') g.status = 'archived';
  const now = ctx.now.toISOString();
  const g: Goal = { id: newId('gol'), userId: uid, type: input.type, target: Math.round(input.target * 10) / 10, basis: clean(input.basis, 300), status: 'active', createdAt: now, updatedAt: now };
  ctx.db.goals[g.id] = g;
  return g;
}

export function archiveGoal(ctx: Ctx, id: Id): Goal {
  const uid = actor(ctx);
  const g = ctx.db.goals[id];
  if (!g || g.userId !== uid) throw new AppError('not_found', 'Obiettivo non trovato.');
  g.status = 'archived';
  g.updatedAt = ctx.now.toISOString();
  return g;
}

export interface GoalProgress {
  goal: Goal;
  label: string;
  unit: string;
  period: 'week' | 'month';
  current: number;
  /** true se il piano è in pausa o in vacanza: l'obiettivo non conta in questo periodo. */
  paused: boolean;
}

export function listGoals(ctx: Ctx): GoalProgress[] {
  const uid = actor(ctx);
  const state = planStateOf(ctx, uid);
  const weekFrom = monday(ctx.now).toISOString();
  const monthFrom = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1)).toISOString();
  const acts = Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.date <= ctx.now.toISOString());
  return Object.values(ctx.db.goals)
    .filter((g) => g.userId === uid && g.status === 'active')
    .map((g) => {
      const u = GOAL_UNITS[g.type];
      const inP = acts.filter((a) => a.date >= (u.period === 'week' ? weekFrom : monthFrom));
      const current = g.type === 'consistency' ? inP.length : g.type === 'weekly_km' ? Math.round(inP.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10 : g.type === 'weekly_minutes' ? inP.reduce((s, a) => s + (a.durationMin ?? 0), 0) : inP.filter((a) => a.source === 'event').length;
      return { goal: g, label: u.label, unit: u.unit, period: u.period, current, paused: state.mode !== 'active' };
    });
}

export const goalMethods = { suggestGoals, suggestFromAnswers, setGoal, archiveGoal, listGoals } as const;
export const GOALS_READ_ONLY = ['suggestGoals', 'suggestFromAnswers', 'listGoals'];
