import { activityClass, findDuplicate } from './activities.ts';
import { AppError, type Ctx } from './engine.ts';
import { sportDef } from './sports.ts';
import { isValidTimezone, utcToZoned } from './time.ts';
import type { Activity, ActivityFilter, ActivityInput, ActivityView, Id, PeriodTotals, PersonalStats } from './types.ts';
import { validateActivityInput } from './validation.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

function tzOf(tz: unknown): string {
  return typeof tz === 'string' && isValidTimezone(tz) ? tz : 'Europe/Rome';
}

const dayKey = (iso: string, tz: string) => utcToZoned(iso, tz).date;

function addDaysKey(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/** Lunedì della settimana che contiene il giorno. */
function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysKey(day, -dow);
}

const monthKey = (day: string) => day.slice(0, 7);

function prevMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const monthLabel = (mk: string) => `${MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(2, 4)}`;

function totals(list: Activity[]): PeriodTotals {
  return {
    runs: list.length,
    distanceKm: round1(list.reduce((s, a) => s + (a.distanceKm ?? 0), 0)),
    durationMin: Math.round(list.reduce((s, a) => s + (a.durationMin ?? 0), 0)),
  };
}

function longestStreak(weeks: string[]): number {
  const set = new Set(weeks);
  let best = 0;
  for (const w of set) {
    if (set.has(addDaysKey(w, -7))) continue; // inizio di una serie
    let n = 1;
    while (set.has(addDaysKey(w, n * 7))) n++;
    best = Math.max(best, n);
  }
  return best;
}

export function getStats(ctx: Ctx, timezone?: string): PersonalStats {
  if (!ctx.actorId) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const tz = tzOf(timezone);
  const mine = Object.values(ctx.db.activities).filter((a) => a.userId === ctx.actorId && a.date <= ctx.now.toISOString());
  const today = dayKey(ctx.now.toISOString(), tz);
  const thisWeek = weekKey(today);
  const thisMonth = monthKey(today);
  const lastMonth = prevMonthKey(thisMonth);

  const byWeek = new Map<string, Activity[]>();
  const byMonth = new Map<string, Activity[]>();
  const days = new Set<string>();
  for (const a of mine) {
    const d = dayKey(a.date, tz);
    days.add(d);
    const w = weekKey(d);
    const m = monthKey(d);
    byWeek.set(w, [...(byWeek.get(w) ?? []), a]);
    byMonth.set(m, [...(byMonth.get(m) ?? []), a]);
  }

  const weeksWithActivity = [...byWeek.keys()];
  // La serie resta viva anche se la settimana corrente è ancora vuota (si può ancora allenarsi).
  let streak = 0;
  const wset = new Set(weeksWithActivity);
  let cursor = wset.has(thisWeek) ? thisWeek : addDaysKey(thisWeek, -7);
  while (wset.has(cursor)) {
    streak++;
    cursor = addDaysKey(cursor, -7);
  }

  let longest: PersonalStats['records']['longestKm'] = null;
  let fastest: PersonalStats['records']['fastestPace'] = null;
  for (const a of mine) {
    // "Altro" non entra nei record; trail e corsa + camminata non hanno un passo confrontabile.
    const def = sportDef(a.sport);
    if (!def.performance) continue;
    if (a.distanceKm !== null && (!longest || a.distanceKm > longest.value)) longest = { value: a.distanceKm, date: a.date };
    if (def.paceComparable && a.distanceKm !== null && a.distanceKm >= 3 && a.durationMin) {
      const pace = Math.round((a.durationMin * 60) / a.distanceKm);
      if (!fastest || pace < fastest.secPerKm) fastest = { secPerKm: pace, date: a.date, distanceKm: a.distanceKm };
    }
  }
  const bestOf = <K extends string>(m: Map<K, Activity[]>, f: (l: Activity[]) => number) => {
    let best: { k: K; v: number } | null = null;
    for (const [k, l] of m) {
      const v = f(l);
      if (v > 0 && (!best || v > best.v)) best = { k, v };
    }
    return best;
  };
  const bw = bestOf(byWeek, (l) => totals(l).distanceKm);
  const bm = bestOf(byMonth, (l) => totals(l).distanceKm);
  const mr = bestOf(byWeek, (l) => l.length);

  const monthly = [];
  let mk = thisMonth;
  for (let i = 0; i < 6; i++) {
    const t = totals(byMonth.get(mk) ?? []);
    monthly.unshift({ month: mk, label: monthLabel(mk), runs: t.runs, distanceKm: t.distanceKm });
    mk = prevMonthKey(mk);
  }
  const weekly = [];
  for (let i = 7; i >= 0; i--) {
    const w = addDaysKey(thisWeek, -7 * i);
    const t = totals(byWeek.get(w) ?? []);
    weekly.push({ weekStart: w, runs: t.runs, distanceKm: t.distanceKm });
  }

  const prev = totals(byMonth.get(lastMonth) ?? []);
  const cur = totals(byMonth.get(thisMonth) ?? []);
  const origin = { selfDeclared: 0, imported: 0, verified: 0 };
  for (const a of mine) {
    const c = activityClass(a);
    if (c === 'self_declared') origin.selfDeclared++;
    else if (c === 'imported') origin.imported++;
    else origin.verified++;
  }

  return {
    totals: { ...totals(mine), activeDays: days.size },
    week: totals(byWeek.get(thisWeek) ?? []),
    month: cur,
    prevMonth: prev,
    monthDeltaKm: prev.distanceKm > 0 ? round1(cur.distanceKm - prev.distanceKm) : null,
    streakWeeks: streak,
    bestStreakWeeks: longestStreak(weeksWithActivity),
    records: {
      longestKm: longest,
      bestWeekKm: bw ? { value: bw.v, weekStart: bw.k } : null,
      bestMonthKm: bm ? { value: bm.v, month: bm.k } : null,
      mostRunsInWeek: mr ? { value: mr.v, weekStart: mr.k } : null,
      fastestPace: fastest,
    },
    monthly,
    weekly,
    byOrigin: origin,
    hasData: mine.length > 0,
  };
}

export function listActivities(ctx: Ctx, filter?: ActivityFilter | null, limit = 200): ActivityView[] {
  if (!ctx.actorId) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const f = filter && typeof filter === 'object' ? filter : {};
  return Object.values(ctx.db.activities)
    .filter((a) => a.userId === ctx.actorId)
    .filter((a) => (!f.from || a.date >= f.from) && (!f.to || a.date < f.to) && (!f.sport || a.sport === f.sport))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.min(Math.max(1, Number(limit) || 200), 500))
    .map((a) => ({ ...a, eventTitle: a.eventId ? (ctx.db.events[a.eventId]?.title ?? null) : null, cls: activityClass(a) }));
}

export function updateActivity(ctx: Ctx, id: Id, input: ActivityInput & { visibility?: 'shared' | 'private' }): Activity {
  if (!ctx.actorId) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const a = ctx.db.activities[id];
  if (!a) throw new AppError('not_found', 'Attività non trovata.');
  if (a.userId !== ctx.actorId) throw new AppError('forbidden', 'Puoi modificare solo le tue attività.');
  if (a.source === 'strava') throw new AppError('forbidden', 'Le attività importate da Strava non si modificano: puoi solo eliminarle dall\'app.');
  const imported = a.source === 'file';
  const v = validateActivityInput({ date: imported || a.source === 'event' ? a.date : input?.date, sport: a.sport, distanceKm: imported ? a.distanceKm : input?.distanceKm, durationMin: imported ? a.durationMin : input?.durationMin, note: input?.note ?? a.note, title: input?.title ?? a.title }, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const dayOnly = a.source === 'manual' ? (input?.dayOnly ?? a.dayOnly) : a.dayOnly;
  const dup = findDuplicate(ctx.db, { userId: a.userId, sport: a.sport, date: v.value.date, dayOnly, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin }, a.id);
  if (dup && (v.value.date !== a.date || v.value.distanceKm !== a.distanceKm || v.value.durationMin !== a.durationMin))
    throw new AppError('conflict', 'Con questi valori l\'attività coinciderebbe con un\'altra già presente.');
  Object.assign(a, { date: v.value.date, dayOnly, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin, note: v.value.note, title: v.value.title || a.title, updatedAt: ctx.now.toISOString() });
  if (input?.visibility === 'shared' || input?.visibility === 'private') a.visibility = input.visibility;
  return a;
}

export const statsMethods = { getStats, listActivities, updateActivity } as const;
