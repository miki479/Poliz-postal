import { beforeEach, describe, expect, it } from 'vitest';
import { newActivity } from '../shared/activities.ts';
import type { ChangePreview, PlanAdvice, SessionMatch } from '../shared/adaptive.ts';
import { call } from '../shared/api.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { PlanChange, PlannedSession, SessionInput, WorkoutLogInput } from '../shared/types.ts';

const NOW = new Date('2026-10-23T08:00:00.000Z'); // venerdì
const TODAY = '2026-10-23';
let db: ReturnType<typeof emptyDb>;
const addUser = (id: string) => {
  db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id.toUpperCase(), bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
};
const as = (a: string, now = NOW): Ctx => ({ db, now, actorId: a });
const run = <T>(a: string, m: string, args: unknown[] = [], now = NOW) => call(as(a, now), m, args) as T;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};
const ses = (over: Partial<SessionInput> = {}): SessionInput => ({ date: TODAY, time: null, kind: 'run_intervals', title: 'Ripetute 6 × 2 min', description: '', durationMin: 45, distanceKm: null, intensity: 'high', paceSecPerKm: null, warmupMin: 10, cooldownMin: 10, segments: [{ kind: 'work', label: 'x', durationSec: 120, reps: 6 }], exercises: [], notes: '', ...over });
const apply = (who: string, p: ChangePreview, params: object, req = 'req-' + Math.random().toString(36).slice(2, 10)) => run<PlanChange>(who, 'applyPlanChange', [p.action, params, TODAY, p.token, req]);

beforeEach(() => {
  db = emptyDb();
  addUser('a');
  addUser('b');
});

describe('check-in e consigli', () => {
  it('senza check-in: nessun messaggio né azioni (nessun sollecito)', () => {
    run('a', 'createSession', [ses()]);
    const adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.message).toBeNull();
    expect(adv.options).toHaveLength(0);
  });

  it('stanchezza dichiarata: alternativa leggera, spostamento o salto; anteprima e conferma', () => {
    const s = run<PlannedSession>('a', 'createSession', [ses()]);
    run('a', 'saveCheckIn', [{ date: TODAY, kind: 'feeling', energy: 2 }]);
    const adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.options.map((o) => o.action)).toEqual(['swap_easy', 'move', 'skip']);
    expect(adv.basis.join(' ')).toMatch(/energia 2\/5/);
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['swap_easy', adv.options[0].params, TODAY]);
    expect(pv.changes[0].after.kind).toBe('run_easy');
    expect(pv.changes[0].after.durationMin).toBeLessThan(45);
    expect(db.sessions[s.id].kind).toBe('run_intervals'); // l'anteprima non scrive nulla
    const ch = apply('a', pv, adv.options[0].params);
    expect(db.sessions[s.id].kind).toBe('run_easy');
    expect(db.sessions[s.id].adjustment?.from.kind).toBe('run_intervals');
    // annullabile
    run('a', 'undoPlanChange', [ch.id]);
    expect(db.sessions[s.id].kind).toBe('run_intervals');
  });

  it('dolore: nessuna alternativa "sicura" né invito a continuare; segnali urgenti → indicazioni di assistenza', () => {
    run('a', 'createSession', [ses()]);
    run('a', 'saveCheckIn', [{ date: TODAY, kind: 'pain', pain: { area: 'ginocchio', level: 'moderate', trend: 'new', urgent: false } }]);
    let adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.options.map((o) => o.action).sort()).toEqual(['pause', 'skip']);
    expect(adv.message).toMatch(/Interrompi l’attività/);
    expect(adv.message).toMatch(/medico o da un fisioterapista/);
    run('a', 'saveCheckIn', [{ date: TODAY, kind: 'pain', pain: { area: 'petto', level: 'severe', trend: 'new', urgent: true } }]);
    adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.tone).toBe('urgent');
    expect(adv.message).toMatch(/112/);
    expect(adv.canTalk).toBe(false);
    expect(adv.options.some((o) => o.action === 'swap_easy' || o.action === 'shorten')).toBe(false);
  });

  it('poco tempo: la seduta intensa diventa facile invece di comprimere l’intensità', () => {
    run('a', 'createSession', [ses()]);
    run('a', 'saveCheckIn', [{ date: TODAY, kind: 'time', minutes: 25 }]);
    const adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.options[0].action).toBe('swap_easy');
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['swap_easy', adv.options[0].params, TODAY]);
    expect(pv.changes[0].after.durationMin).toBe(25);
  });

  it('il check-in è privato e correggibile', () => {
    const c1 = run<{ id: string }>('a', 'saveCheckIn', [{ date: TODAY, kind: 'feeling', energy: 2 }]);
    const c2 = run<{ id: string; energy: number }>('a', 'saveCheckIn', [{ date: TODAY, kind: 'feeling', energy: 4 }]);
    expect(c2.id).toBe(c1.id);
    expect(c2.energy).toBe(4);
    expect(code(() => run('b', 'deleteCheckIn', [c1.id]))).toBe('not_found');
  });
});

describe('conferma sicura', () => {
  it('proposta obsoleta: se la seduta cambia dopo l’anteprima, nessuna scrittura parziale', () => {
    const s = run<PlannedSession>('a', 'createSession', [ses()]);
    const s2 = run<PlannedSession>('a', 'createSession', [ses({ date: '2026-10-25', title: 'Altra' })]);
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['vacation', { from: TODAY, until: '2026-10-26', style: 'pause' }, TODAY]);
    expect(pv.changes).toHaveLength(2);
    run('a', 'updateSession', [s2.id, { ...ses({ date: '2026-10-25', title: 'Modificata' }) }], new Date(NOW.getTime() + 1000));
    expect(code(() => apply('a', pv, { from: TODAY, until: '2026-10-26', style: 'pause' }))).toBe('conflict');
    expect(db.sessions[s.id].status).toBe('planned'); // nulla scritto a metà
    expect(db.planStates.a).toBeUndefined();
  });

  it('doppio tap / retry: stessa richiesta, una sola modifica', () => {
    const s = run<PlannedSession>('a', 'createSession', [ses()]);
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['skip', { sessionId: s.id }, TODAY]);
    const c1 = apply('a', pv, { sessionId: s.id }, 'same-request-1');
    const c2 = apply('a', pv, { sessionId: s.id }, 'same-request-1');
    expect(c2.id).toBe(c1.id);
    expect(Object.keys(db.planChanges)).toHaveLength(1);
  });

  it('spostamento: niente due sedute intense attaccate, solo nei 7 giorni', () => {
    const s = run<PlannedSession>('a', 'createSession', [ses()]);
    run('a', 'createSession', [ses({ date: '2026-10-25', title: 'Lungo', kind: 'run_long', intensity: 'low' })]);
    run('a', 'createSession', [ses({ date: '2026-10-27', title: 'Ripetute 2' })]);
    expect(code(() => run('a', 'previewPlanChange', ['move', { sessionId: s.id, date: '2026-10-26' }, TODAY]))).toBe('conflict');
    expect(code(() => run('a', 'previewPlanChange', ['move', { sessionId: s.id, date: '2026-11-05' }, TODAY]))).toBe('validation');
    expect(run<ChangePreview>('a', 'previewPlanChange', ['move', { sessionId: s.id, date: '2026-10-24' }, TODAY]).changes[0].after.date).toBe('2026-10-24');
  });
});

describe('vacanza, pausa e ripresa', () => {
  it('vacanza ridotta: sedute facili e brevi nel periodo, intense trasformate; stato piano in vacanza', () => {
    run('a', 'createSession', [ses()]);
    run('a', 'createSession', [ses({ date: '2026-10-24', kind: 'strength', title: 'Forza', intensity: 'moderate', segments: [] })]);
    const params = { from: TODAY, until: '2026-10-30', style: 'reduced', maxMinutes: 30 };
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['vacation', params, TODAY]);
    const after = pv.changes.map((c) => c.after);
    expect(after.find((x) => x.title === 'Corsa facile')?.durationMin).toBe(30);
    expect(after.find((x) => x.title === 'Forza')?.status).toBe('paused');
    expect(pv.impact).toMatch(/gara con data fissa/);
    apply('a', pv, params);
    expect(db.planStates.a.mode).toBe('vacation');
    const adv = run<PlanAdvice>('a', 'planAdvice', [TODAY]);
    expect(adv.options.map((o) => o.action)).toEqual(['resume']); // niente solleciti di allenamento
  });

  it('pausa e ripresa: storico conservato, nessun recupero delle sedute perse', () => {
    const past = run<PlannedSession>('a', 'createSession', [ses({ date: '2026-10-24' })]);
    const future = run<PlannedSession>('a', 'createSession', [ses({ date: '2026-11-03' })]);
    const log: WorkoutLogInput = { kind: 'run_easy', title: 'Corsa', startedAt: '2026-10-22T07:00:00.000Z', durationSec: 1800, distanceKm: 5, rpe: 4, difficulties: '', notes: '', sets: [], mode: 'manual', shared: false, timezone: 'Europe/Rome' };
    run('a', 'logWorkout', [log]);
    const pv = run<ChangePreview>('a', 'previewPlanChange', ['pause', { from: TODAY, until: null }, TODAY]);
    apply('a', pv, { from: TODAY, until: null });
    expect(db.sessions[past.id].status).toBe('paused');
    expect(Object.keys(db.workoutLogs)).toHaveLength(1); // storico intatto
    const LATER = new Date('2026-10-30T08:00:00.000Z');
    const rv = run<ChangePreview>('a', 'previewPlanChange', ['resume', { date: '2026-10-30' }, '2026-10-30'], LATER);
    expect(rv.changes.map((c) => c.sessionId)).toEqual([future.id]);
    run<PlanChange>('a', 'applyPlanChange', ['resume', { date: '2026-10-30' }, '2026-10-30', rv.token, 'resume-req-1'], LATER);
    expect(db.sessions[past.id].status).toBe('paused'); // persa, non recuperata
    expect(db.sessions[future.id].status).toBe('planned');
    expect(db.planStates.a.mode).toBe('active');
  });
});

describe('corse reali e piano', () => {
  it('corsa del club: proposta di associazione con criteri dichiarati, una corsa completa una sola seduta', () => {
    const s = run<PlannedSession>('a', 'createSession', [ses({ kind: 'run_easy', title: 'Corsa facile', intensity: 'low', durationMin: 40, segments: [] })]);
    run('a', 'createSession', [ses({ kind: 'run_easy', title: 'Altra facile', intensity: 'low', durationMin: 40, segments: [], date: '2026-10-24' })]);
    const act = newActivity(NOW, { userId: 'a', source: 'event', sport: 'running', date: '2026-10-23T07:00:00.000Z', distanceKm: 6, durationMin: 42 });
    db.activities[act.id] = act;
    const m = run<SessionMatch[]>('a', 'sessionMatches', [act.id]);
    expect(m[0].session.id).toBe(s.id);
    expect(m[0].reasons.join(' ')).toMatch(/Durata 42/);
    run('a', 'linkActivityToSession', [act.id, s.id]);
    expect(db.sessions[s.id].status).toBe('completed');
    expect(run<SessionMatch[]>('a', 'sessionMatches', [act.id])).toHaveLength(0);
    expect(code(() => run('a', 'linkActivityToSession', [act.id, m[1]?.session.id ?? 'x']))).toBe('conflict');
  });

  it('durata troppo diversa: nessuna associazione proposta', () => {
    run('a', 'createSession', [ses({ kind: 'run_long', title: 'Lungo', intensity: 'low', durationMin: 90, segments: [] })]);
    const act = newActivity(NOW, { userId: 'a', source: 'strava', sport: 'running', date: '2026-10-23T07:00:00.000Z', distanceKm: 3, durationMin: 20 });
    db.activities[act.id] = act;
    expect(run<SessionMatch[]>('a', 'sessionMatches', [act.id])).toHaveLength(0);
  });
});
