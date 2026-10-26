import type { PlannedSession, TrainingPlan } from './types.ts';
const DAY = 86400000;
const plus = (date: string, n: number) => new Date(Date.parse(date + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
export function planPresentation(plan: TrainingPlan | null, sessions: PlannedSession[], today: string) {
  const start = plan?.startDate ?? plus(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const weeks = plan?.weeks ?? 1;
  const own = plan ? sessions.filter((s) => s.planId === plan.id) : sessions;
  const rows = Array.from({ length: weeks }, (_, i) => {
    const from = plus(start, i * 7),
      to = plus(from, 7);
    const items = own.filter((s) => s.date >= from && s.date < to);
    const actionable = items.filter((s) => s.status !== 'paused' && s.status !== 'skipped');
    return {
      index: i,
      start: from,
      end: plus(to, -1),
      sessions: items,
      plannedMin: actionable.reduce((n, s) => n + s.durationMin, 0),
      completedMin: actionable.filter((s) => s.status === 'completed').reduce((n, s) => n + s.durationMin, 0),
      completed: actionable.filter((s) => s.status === 'completed').length,
      total: actionable.length,
    };
  });
  return {
    start,
    end: plus(start, weeks * 7 - 1),
    weeks: rows,
    currentWeek: Math.max(
      0,
      Math.min(weeks - 1, Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / (7 * DAY))),
    ),
    plannedMin: rows.reduce((n, w) => n + w.plannedMin, 0),
    completedMin: rows.reduce((n, w) => n + w.completedMin, 0),
  };
}
