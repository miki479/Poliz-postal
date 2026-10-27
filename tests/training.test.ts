import { beforeEach, describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { newActivity } from '../shared/activities.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { generatePlan } from '../shared/planGenerator.ts';
import type { EventView, PlanWizardInput, PlannedSession, RouteInput, RouteView, SessionInput, WorkoutLog, WorkoutLogInput } from '../shared/types.ts';
import type { StrengthPoint, WeekSummary } from '../shared/training.ts';

const NOW = new Date('2026-10-23T10:00:00.000Z'); // venerdì
let db: ReturnType<typeof emptyDb>;
const addUser = (id: string) => {
  db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id.toUpperCase(), bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
};
const as = (actorId: string | null, now = NOW): Ctx => ({ db, now, actorId });
const run = <T>(actor: string | null, method: string, args: unknown[] = [], now = NOW) => call(as(actor, now), method, args) as T;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};

const session = (over: Partial<SessionInput> = {}): SessionInput => ({
  date: '2026-10-26', time: '07:00', kind: 'run_easy', title: 'Corsa facile', description: '', durationMin: 40, distanceKm: 6, intensity: 'low',
  paceSecPerKm: null, warmupMin: 5, cooldownMin: 5, segments: [], exercises: [], notes: '', ...over,
});
const logIn = (over: Partial<WorkoutLogInput> = {}): WorkoutLogInput => ({
  kind: 'run_easy', title: 'Corsa facile', startedAt: '2026-10-22T06:30:00.000Z', durationSec: 2400, distanceKm: 6, rpe: 5, difficulties: '', notes: '', sets: [], mode: 'manual', shared: false, timezone: 'Europe/Rome', ...over,
});
const wizard = (over: Partial<PlanWizardInput> = {}): PlanWizardInput => ({
  name: 'Piano di prova', goal: 'start_running', level: 'beginner', weekdays: [2, 4, 6], maxMinutes: 45, equipment: [], preference: 'solo', includeStrength: false, startDate: '2026-10-26', weeks: 4, ...over,
});

beforeEach(() => {
  db = emptyDb();
  for (const u of ['a', 'b']) addUser(u);
});

it('il salto salva un motivo privato, è annullabile e non modifica allenamenti altrui o completati',()=>{
 const s=run<PlannedSession>('a','createSession',[session()]);
 expect(code(()=>run('b','skipSession',[s.id,true,'injury']))).not.toBe('none');
 expect(code(()=>run('a','skipSession',[s.id,true,'invalid']))).toBe('validation');
 expect(run<PlannedSession>('a','skipSession',[s.id,true,'time'])).toMatchObject({status:'skipped',skipReason:'time'});
 expect(db.checkins).toEqual({});
 expect(run<PlannedSession>('a','skipSession',[s.id,false])).toMatchObject({status:'planned',skipReason:null});
 db.sessions[s.id].status='completed';
 expect(code(()=>run('a','skipSession',[s.id,true,'injury']))).toBe('conflict');
});

describe('generatore del piano', () => {
  it('principiante: corsa/camminata graduale entro la durata massima, con giorni liberi e scarico', () => {
    const { sessions } = generatePlan(wizard({ weeks: 6, weekdays: [1, 3, 5, 6, 7] }));
    expect(sessions.every((s) => s.kind === 'run_walk' || s.kind === 'mobility')).toBe(true);
    expect(sessions.every((s) => s.durationMin <= 45)).toBe(true);
    const perWeek = new Map<string, number>();
    for (const s of sessions) perWeek.set(s.date.slice(0, 7) + Math.floor(Date.parse(s.date) / (7 * 86400000)), (perWeek.get(s.date.slice(0, 7) + Math.floor(Date.parse(s.date) / (7 * 86400000))) ?? 0) + 1);
    expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(5); // 4 sessioni + 1 mobilità: almeno 2 giorni liberi su 7
    const first = sessions.find((s) => s.kind === 'run_walk')!;
    expect(first.segments.find((x) => x.kind === 'run')?.durationSec).toBe(60); // settimana 1: 1' di corsa
    expect(first.segments.find((x) => x.kind === 'walk')?.durationSec).toBe(120);
    expect(first.description).toMatch(/parlare/);
  });

  it('usa solo i giorni scelti, rispetta il massimo di sessioni e include forza se richiesta', () => {
    const w = wizard({ goal: 'endurance', level: 'intermediate', weekdays: [1, 2, 3, 4, 5, 6, 7], includeStrength: true, equipment: ['dumbbells'], maxMinutes: 60, weeks: 2 });
    const { sessions, warnings } = generatePlan(w);
    expect(warnings.join(' ')).toMatch(/al massimo 5 sessioni/);
    const week1 = sessions.filter((s) => s.date < '2026-11-02');
    expect(week1.length).toBeLessThanOrEqual(5);
    expect(week1.filter((s) => s.kind === 'strength')).toHaveLength(1);
    const str = week1.find((s) => s.kind === 'strength')!;
    expect(str.exercises.length).toBeGreaterThan(0);
    expect(str.exercises.every((e) => e.equipment === 'bodyweight' || e.equipment === 'dumbbells')).toBe(true); // solo attrezzatura dichiarata
    expect(week1.some((s) => s.kind === 'run_long')).toBe(true);
    // niente forza il giorno prima della sessione lunga
    const long = week1.find((s) => s.kind === 'run_long')!;
    const dayBefore = new Date(Date.parse(long.date) - 86400000).toISOString().slice(0, 10);
    expect(week1.find((s) => s.date === dayBefore)?.kind).not.toBe('strength');
  });

  it('settimana di scarico ogni quarta settimana e obiettivo distanza con incrementi graduali', () => {
    const { sessions } = generatePlan(wizard({ goal: 'distance', level: 'intermediate', weekdays: [2, 4, 7], weeks: 8, maxMinutes: 120 }));
    const longs = sessions.filter((s) => s.kind === 'run_long').map((s) => s.distanceKm!);
    expect(longs).toHaveLength(8);
    for (let i = 1; i < longs.length; i++) if (i !== 3 && i !== 4 && i !== 7) expect(longs[i]).toBeGreaterThanOrEqual(longs[i - 1]);
    expect(longs[3]).toBeLessThan(longs[2]); // scarico
    expect(Math.max(...longs.map((v, i) => (i && i !== 4 ? v / longs[i - 1] : 1)))).toBeLessThanOrEqual(1.15);
  });

  it('senza giorni disponibili non inventa nulla', () => {
    expect(generatePlan(wizard({ weekdays: [] })).sessions).toHaveLength(0);
  });
});

describe('piano personale: sessioni', () => {
  it('crea, legge, modifica, sposta, salta e elimina', () => {
    const s = run<PlannedSession>('a', 'createSession', [session()]);
    expect(s.status).toBe('planned');
    expect(run<PlannedSession[]>('a', 'listSessions', [{ from: '2026-10-26', to: '2026-11-01' }])).toHaveLength(1);
    const up = run<PlannedSession>('a', 'updateSession', [s.id, session({ title: 'Corsa più lunga', durationMin: 50 })]);
    expect(up).toMatchObject({ title: 'Corsa più lunga', durationMin: 50, status: 'planned' });
    const moved = run<PlannedSession>('a', 'moveSession', [s.id, '2026-10-28', '18:30']);
    expect(moved).toMatchObject({ date: '2026-10-28', time: '18:30', status: 'rescheduled', rescheduledFrom: '2026-10-26' });
    expect(run<PlannedSession>('a', 'skipSession', [s.id]).status).toBe('skipped');
    expect(run<PlannedSession>('a', 'skipSession', [s.id, false]).status).toBe('rescheduled');
    run('a', 'deleteSession', [s.id]);
    expect(run<PlannedSession[]>('a', 'listSessions', [{}])).toHaveLength(0);
  });

  it('valida i campi lato server', () => {
    let err: AppError | null = null;
    try {
      run('a', 'createSession', [session({ date: '2026-02-31', title: 'x', durationMin: 2, distanceKm: -1, kind: 'volo' as never })]);
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.code).toBe('validation');
    expect(Object.keys(err!.fields!).sort()).toEqual(['date', 'distanceKm', 'durationMin', 'kind', 'title']);
    expect(code(() => run('a', 'createSession', [session({ exercises: [{ name: 'Squat', muscle: 'legs', equipment: 'bodyweight', sets: 99, reps: 10, loadKg: null, restSec: 60 }] })]))).toBe('validation');
    expect(code(() => run('a', 'moveSession', ['ses_x', '2026-10-28']))).toBe('not_found');
  });

  it('il piano è privato: nessun altro utente legge o modifica le sessioni', () => {
    const s = run<PlannedSession>('a', 'createSession', [session()]);
    expect(run<PlannedSession[]>('b', 'listSessions', [{}])).toHaveLength(0);
    for (const [m, args] of [['getSession', [s.id]], ['updateSession', [s.id, session()]], ['moveSession', [s.id, '2026-10-29']], ['deleteSession', [s.id]], ['skipSession', [s.id]], ['completeSession', [s.id, logIn()]]] as const)
      expect(code(() => run('b', m, [...args])), m).toBe('not_found');
    expect(code(() => run(null, 'listSessions', [{}]))).toBe('unauthenticated');
    expect(run<PlannedSession>('a', 'getSession', [s.id]).id).toBe(s.id);
  });

  it('piano generato: salva sessioni, anteprima non salva, eliminazione conserva le completate', () => {
    const prev = run<{ sessions: SessionInput[] }>('a', 'previewPlan', [wizard()]);
    expect(prev.sessions.length).toBeGreaterThan(0);
    expect(Object.keys(db.sessions)).toHaveLength(0); // l'anteprima non scrive nulla
    const { plan, sessions } = run<{ plan: { id: string }; sessions: PlannedSession[] }>('a', 'createPlanFromWizard', [wizard()]);
    expect(sessions.every((s) => s.planId === plan.id && s.userId === 'a')).toBe(true);
    const done = run<{ session: PlannedSession }>('a', 'completeSession', [sessions[0].id, logIn({ kind: 'run_walk' })]);
    expect(done.session.status).toBe('completed');
    const del = run<{ removedSessions: number }>('a', 'deletePlan', [plan.id]);
    expect(del.removedSessions).toBe(sessions.length - 1);
    expect(run<PlannedSession[]>('a', 'listSessions', [{}])).toHaveLength(1);
    expect(code(() => run('b', 'deletePlan', [plan.id]))).toBe('not_found');
  });

  it('rifiuta una procedura guidata incoerente', () => {
    expect(code(() => run('a', 'previewPlan', [wizard({ startDate: '2026-10-27' })]))).toBe('validation'); // non è lunedì
    expect(code(() => run('a', 'previewPlan', [wizard({ maxMinutes: 5 })]))).toBe('validation');
  });
});

describe('registrazione e completamento', () => {
  it('completa una sessione: crea il registro, lo storico e aggiorna le statistiche', () => {
    const s = run<PlannedSession>('a', 'createSession', [session({ date: '2026-10-22' })]);
    const r = run<{ log: WorkoutLog; session: PlannedSession; linkedExisting: boolean }>('a', 'completeSession', [s.id, logIn()]);
    expect(r.session).toMatchObject({ status: 'completed', logId: r.log.id });
    expect(r.log.paceSecPerKm).toBe(400); // 2400 s / 6 km, derivato solo dai dati inseriti
    expect(r.log.activityId).toBeTruthy();
    expect(run<unknown[]>('a', 'listActivities', [{}])).toHaveLength(1);
    expect(run<{ totals: { runs: number; distanceKm: number } }>('a', 'getStats', ['UTC']).totals).toMatchObject({ runs: 1, distanceKm: 6 });
    expect(code(() => run('a', 'completeSession', [s.id, logIn()]))).toBe('conflict'); // niente doppio completamento
    expect(code(() => run('a', 'updateSession', [s.id, session()]))).toBe('conflict');
  });

  it('un allenamento individuale resta privato finché l\'utente non lo condivide', () => {
    const club = run<{ id: string; inviteCode: string }>('a', 'createClub', [{ name: 'Palestra', description: '', sport: 'running', area: '', imageDataUrl: null }]);
    run('b', 'joinClub', [club.inviteCode]);
    run('a', 'logWorkout', [logIn({ title: 'Privato', startedAt: '2026-10-21T06:00:00.000Z' })]);
    expect(run<unknown[]>('b', 'getFeed')).toHaveLength(0);
    expect(run<{ rows: unknown[] }>('b', 'clubLeaderboard', [club.id, 'distance', '2026-10-19T00:00:00Z']).rows).toHaveLength(0);
    run('a', 'logWorkout', [logIn({ title: 'Condiviso', startedAt: '2026-10-22T06:00:00.000Z', distanceKm: 8, shared: true })]);
    const feed = run<Array<{ kind: string; workout?: { title: string } }>>('b', 'getFeed');
    expect(feed.map((f) => f.kind)).toContain('workout_shared');
    expect(feed.find((f) => f.workout)?.workout?.title).toBe('Condiviso');
    expect(run<{ rows: Array<{ value: number }> }>('b', 'clubLeaderboard', [club.id, 'distance', '2026-10-19T00:00:00Z']).rows[0].value).toBe(8);
  });

  it('deduplica: se la corsa è già nello storico (es. Strava) la collega invece di duplicarla', () => {
    const a = newActivity(NOW, { userId: 'a', source: 'strava', sport: 'running', date: '2026-10-22T06:28:00.000Z', distanceKm: 6.02, durationMin: 40, visibility: 'private', externalId: '1', dayOnly: false });
    db.activities[a.id] = a;
    const s = run<PlannedSession>('a', 'createSession', [session({ date: '2026-10-22' })]);
    const r = run<{ log: WorkoutLog; linkedExisting: boolean }>('a', 'completeSession', [s.id, logIn({ mode: 'timer' })]);
    expect(r.linkedExisting).toBe(true);
    expect(r.log.activityId).toBe(a.id);
    expect(Object.values(db.activities)).toHaveLength(1);
    expect(run<{ totals: { runs: number } }>('a', 'getStats', ['UTC']).totals.runs).toBe(1);
  });

  it('forza: registra serie, ripetizioni e carichi e ne mostra la progressione', () => {
    const sets = (load: number) => [1, 2, 3].map((n) => ({ exercise: 'Squat con bilanciere', set: n, reps: 8, loadKg: load, done: true }));
    run('a', 'logWorkout', [logIn({ kind: 'strength', title: 'Forza', distanceKm: null, startedAt: '2026-10-12T17:00:00.000Z', sets: sets(60) })]);
    run('a', 'logWorkout', [logIn({ kind: 'strength', title: 'Forza', distanceKm: null, startedAt: '2026-10-19T17:00:00.000Z', sets: [...sets(65), { exercise: 'Squat con bilanciere', set: 4, reps: 5, loadKg: 70, done: false }] })]);
    expect(Object.values(db.activities)).toHaveLength(0); // la forza non crea attività di corsa
    const prog = run<Array<{ exercise: string; points: StrengthPoint[] }>>('a', 'strengthProgress');
    expect(prog).toHaveLength(1);
    expect(prog[0].points.map((p) => [p.topLoadKg, p.volumeKg, p.sets])).toEqual([[60, 1440, 3], [65, 1560, 3]]); // la serie non completata non conta
    expect(code(() => run('a', 'logWorkout', [logIn({ kind: 'strength', sets: [{ exercise: 'Squat', set: 1, reps: 8, loadKg: 99999, done: true }] })]))).toBe('validation');
  });

  it('modifica ed eliminazione del registro mantengono coerenti attività e sessione', () => {
    const s = run<PlannedSession>('a', 'createSession', [session({ date: '2026-10-22' })]);
    const { log } = run<{ log: WorkoutLog }>('a', 'completeSession', [s.id, logIn()]);
    const upd = run<WorkoutLog>('a', 'updateWorkoutLog', [log.id, { durationSec: 2700, distanceKm: 6.5, rpe: 7, notes: 'faticosa' }]);
    expect(upd).toMatchObject({ durationSec: 2700, distanceKm: 6.5, rpe: 7 });
    expect(db.activities[log.activityId!].distanceKm).toBe(6.5);
    expect(code(() => run('b', 'updateWorkoutLog', [log.id, { notes: 'hack' }]))).toBe('not_found');
    expect(code(() => run('b', 'deleteWorkoutLog', [log.id]))).toBe('not_found');
    run('a', 'deleteWorkoutLog', [log.id]);
    expect(Object.values(db.activities)).toHaveLength(0);
    expect(run<PlannedSession>('a', 'getSession', [s.id]).status).toBe('planned'); // di nuovo da fare
  });

  it('rifiuta registrazioni non valide o future', () => {
    expect(code(() => run('a', 'logWorkout', [logIn({ startedAt: '2026-12-01T00:00:00Z' })]))).toBe('validation');
    expect(code(() => run('a', 'logWorkout', [logIn({ durationSec: 10 })]))).toBe('validation');
    expect(code(() => run('a', 'logWorkout', [logIn({ rpe: 11 })]))).toBe('validation');
  });
});

describe('riepilogo e progressione', () => {
  it('confronta pianificato e svolto e separa le fonti', () => {
    const a = run<PlannedSession>('a', 'createSession', [session({ date: '2026-10-20', durationMin: 40 })]);
    run('a', 'createSession', [session({ date: '2026-10-22', durationMin: 30 })]);
    run('a', 'createSession', [session({ date: '2026-10-24', durationMin: 60, kind: 'run_long' })]);
    run('a', 'skipSession', [(Object.values(db.sessions).find((s) => s.date === '2026-10-24') as PlannedSession).id]);
    run('a', 'completeSession', [a.id, logIn({ startedAt: '2026-10-20T06:00:00.000Z', durationSec: 2700, rpe: 6 })]);
    const imp = newActivity(NOW, { userId: 'a', source: 'strava', sport: 'running', date: '2026-10-22T05:30:00.000Z', distanceKm: 10, durationMin: 55, visibility: 'private', externalId: '9', dayOnly: false });
    db.activities[imp.id] = imp;
    const w = run<WeekSummary>('a', 'weekSummary', ['2026-10-19', 'UTC']);
    expect(w.planned).toEqual({ count: 3, minutes: 130 });
    expect(w.completed).toEqual({ count: 1, minutes: 45 });
    expect(w.skipped).toBe(1);
    expect(w.perceivedLoad).toBe(270); // 45 min × 6
    expect(w.sources).toMatchObject({ manualLogs: 1, importedActivities: 1, importedKm: 10, manualKm: 6 });
    const prog = run<WeekSummary[]>('a', 'trainingProgress', [4, '2026-10-19', 'UTC']);
    expect(prog.map((p) => p.weekStart)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(prog[0].planned.count).toBe(0);
    expect(prog[0].perceivedLoad).toBeNull(); // nessun dato → nessun valore inventato
    expect(code(() => run('b', 'weekSummary', ['2026-10-19', 'UTC']))).toBe('none');
    expect(run<WeekSummary>('b', 'weekSummary', ['2026-10-19', 'UTC']).planned.count).toBe(0); // i dati di a non compaiono per b
  });
});

describe('routine di forza', () => {
  const ex = { name: 'Squat a corpo libero', muscle: 'legs' as const, equipment: 'bodyweight' as const, sets: 3, reps: 12, loadKg: null, restSec: 60 };
  it('crea, aggiorna, elenca solo le proprie ed elimina', () => {
    const r = run<{ id: string }>('a', 'saveRoutine', [{ name: 'Gambe', exercises: [ex] }]);
    run('a', 'saveRoutine', [{ id: r.id, name: 'Gambe 2', exercises: [ex, { ...ex, name: 'Affondi' }] }]);
    expect(run<Array<{ name: string; exercises: unknown[] }>>('a', 'listRoutines')).toMatchObject([{ name: 'Gambe 2' }]);
    expect(run<unknown[]>('b', 'listRoutines')).toHaveLength(0);
    expect(code(() => run('b', 'saveRoutine', [{ id: r.id, name: 'Hack', exercises: [ex] }]))).toBe('not_found');
    expect(code(() => run('a', 'saveRoutine', [{ name: 'Vuota', exercises: [] }]))).toBe('validation');
    run('a', 'deleteRoutine', [r.id]);
    expect(run<unknown[]>('a', 'listRoutines')).toHaveLength(0);
  });
});

describe('percorsi e condivisione', () => {
  const route = (over: Partial<RouteInput> = {}): RouteInput => ({
    name: 'Giro del parco', description: 'Anello facile', startName: 'Ingresso nord', endName: '', area: 'Forlì', distanceKm: 5.2, distanceSource: 'manual', notes: '',
    start: null, end: null, geometry: null, geometryProvider: null, visibility: 'link', ...over,
  });
  // ~1,11 km per 0,01° di latitudine
  const geo = [{ lat: 44.22, lng: 12.04 }, { lat: 44.23, lng: 12.04 }, { lat: 44.24, lng: 12.04 }];

  it('crea, condivide con link, salva nei preferiti, modifica ed elimina', () => {
    const r = run<RouteView>('a', 'createRoute', [route()]);
    expect(r.endName).toBe('Ingresso nord'); // anello: arrivo = partenza
    expect(r.shareToken).toBeTruthy();
    expect(code(() => run('b', 'getRoute', [r.id]))).toBe('not_found'); // senza token non si vede
    const seen = run<RouteView>('b', 'getRoute', [r.id, r.shareToken]);
    expect(seen.shareToken).toBe(''); // il token non si espone
    expect(run<RouteView>('b', 'setRouteFavorite', [r.id, true, r.shareToken]).isFavorite).toBe(true);
    expect(run<RouteView>('b', 'getRoute', [r.id]).isFavorite).toBe(true); // già nei preferiti: accesso senza token
    expect(run<RouteView[]>('b', 'listRoutes', [{ scope: 'saved' }])).toHaveLength(1);
    expect(code(() => run('b', 'updateRoute', [r.id, route({ name: 'Hack' })]))).toBe('forbidden');
    expect(code(() => run('b', 'deleteRoute', [r.id]))).toBe('forbidden');
    expect(run<RouteView>('a', 'updateRoute', [r.id, route({ name: 'Giro del parco 2', visibility: 'public' })]).name).toBe('Giro del parco 2');
    expect(run<RouteView[]>('b', 'listRoutes', [{ scope: 'explore' }])).toHaveLength(1);
    run('a', 'deleteRoute', [r.id]);
    expect(run<RouteView[]>('b', 'listRoutes', [{ scope: 'saved' }])).toHaveLength(0);
  });

  it('un percorso privato è visibile solo al proprietario', () => {
    const r = run<RouteView>('a', 'createRoute', [route({ visibility: 'private' })]);
    expect(code(() => run('b', 'getRoute', [r.id, r.shareToken]))).toBe('not_found');
    expect(run<RouteView[]>('b', 'listRoutes', [{ scope: 'explore' }])).toHaveLength(0);
    expect(code(() => run(null, 'listRoutes', [{ scope: 'mine' }]))).toBe('unauthenticated');
  });

  it('non accetta distanze inventate: con geometria da routing deve coincidere col tracciato', () => {
    expect(code(() => run('a', 'createRoute', [route({ geometry: geo, distanceKm: 5, distanceSource: 'routing', geometryProvider: 'osrm' })]))).toBe('validation');
    const ok = run<RouteView>('a', 'createRoute', [route({ geometry: geo, distanceKm: 2.22, distanceSource: 'routing', geometryProvider: 'osrm' })]);
    expect(ok.distanceSource).toBe('routing');
    expect(code(() => run('a', 'createRoute', [route({ geometry: geo, distanceKm: null })]))).toBe('validation');
    expect(code(() => run('a', 'createRoute', [route({ distanceKm: 2.22, distanceSource: 'routing' })]))).toBe('validation'); // routing senza geometria
    expect(run<RouteView>('a', 'createRoute', [route({ distanceKm: null })]).distanceKm).toBeNull(); // distanza facoltativa
  });

  it('associa un percorso a un\'uscita: solo percorsi propri, pubblici o salvati; eliminandolo l\'uscita resta', () => {
    const mine = run<RouteView>('a', 'createRoute', [route()]);
    const priv = run<RouteView>('b', 'createRoute', [route({ visibility: 'private' })]);
    const ev = (routeId: string | null) => ({ title: 'Corsa', sport: 'running', startsAt: '2026-10-25T17:30:00.000Z', timezone: 'Europe/Rome', meetingPlace: 'Ingresso', area: '', lat: null, lng: null, distanceKm: null, paceSecPerKm: null, level: 'medium', notes: '', maxParticipants: null, visibility: 'public', clubId: null, routeId });
    const e = run<EventView>('a', 'createEvent', [ev(mine.id)]);
    expect(e.route).toMatchObject({ id: mine.id, name: 'Giro del parco', distanceKm: 5.2 });
    expect(code(() => run('a', 'createEvent', [ev(priv.id)]))).toBe('validation');
    expect(run<EventView>('b', 'getEvent', [e.id]).route?.name).toBe('Giro del parco'); // i partecipanti vedono il percorso dell'uscita
    run('a', 'deleteRoute', [mine.id]);
    expect(run<EventView>('a', 'getEvent', [e.id]).route).toBeNull();
  });

  it('eliminando l\'account si rimuovono percorsi, piani e registri', () => {
    run('a', 'createRoute', [route()]);
    run('a', 'createSession', [session()]);
    run('a', 'logWorkout', [logIn()]);
    run('a', 'saveRoutine', [{ name: 'Routine', exercises: [{ name: 'Squat', muscle: 'legs', equipment: 'bodyweight', sets: 3, reps: 10, loadKg: null, restSec: 60 }] }]);
    run('a', 'deleteAccount');
    expect([db.routes, db.sessions, db.workoutLogs, db.routines, db.activities].map((x) => Object.keys(x).length)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('spunta senza registrazione', () => {
  it('non inventa attività, distanze, tempi o record ed è reversibile', () => {
    const s = run<PlannedSession>('a', 'createSession', [session({ date: '2026-10-22' })]);
    run('a', 'markSessionDone', [s.id, true]);
    expect(s.status).toBe('completed');
    expect(s.manualDone).toBe(true);
    expect(s.logId).toBeNull();
    expect(Object.values(db.workoutLogs)).toHaveLength(0);
    expect(Object.values(db.activities)).toHaveLength(0);
    expect(code(() => run('b', 'markSessionDone', [s.id]))).toBe('not_found');
    run('a', 'markSessionDone', [s.id, false]);
    expect(s.status).toBe('planned');
    run('a', 'completeSession', [s.id, logIn()]);
    expect(code(() => run('a', 'markSessionDone', [s.id, false]))).toBe('conflict');
  });
  it('rifiuta una spunta futura', () => {
    const s = run<PlannedSession>('a', 'createSession', [session()]);
    expect(code(() => run('a', 'markSessionDone', [s.id]))).toBe('validation');
  });
});

describe('collegamento di un allenamento a un’uscita', () => {
 const prepare = () => {
  const { log: l } = run<{ log: WorkoutLog }>('a', 'logWorkout', [logIn()]);
  db.events.e = { id: 'e', status: 'active', startsAt: l.startedAt } as typeof db.events[string];
  return l;
 };
 it('richiede il proprietario e l’iscrizione senza creare presenze', () => {
  const l = prepare();
  expect(code(() => run('b', 'linkWorkoutEvent', [l.id, 'e']))).toBe('not_found');
  expect(code(() => run('a', 'linkWorkoutEvent', [l.id, 'e']))).toBe('validation');
  expect(Object.keys(db.participations)).toHaveLength(0);
 });
 it('collega e scollega un’uscita compatibile lasciando Strava privata', () => {
  const l = prepare(); l.origin = 'strava';
  db.participations.e__a = { eventId: 'e', userId: 'a' } as typeof db.participations[string];
  const updated = run<WorkoutLog>('a', 'linkWorkoutEvent', [l.id, 'e']);
  expect(updated.eventId).toBe('e'); expect(updated.shared).toBe(false); expect(updated.origin).toBe('strava');
  expect(run<WorkoutLog>('a', 'linkWorkoutEvent', [l.id, null]).eventId).toBeNull();
 });
 it('rifiuta orari non compatibili e uscite cancellate', () => {
  const l = prepare(); db.participations.e__a = { eventId: 'e', userId: 'a' } as typeof db.participations[string];
  db.events.e.startsAt = '2026-10-10T06:30:00Z';
  expect(code(() => run('a', 'linkWorkoutEvent', [l.id, 'e']))).toBe('validation');
  db.events.e.startsAt = l.startedAt; db.events.e.status = 'cancelled';
  expect(code(() => run('a', 'linkWorkoutEvent', [l.id, 'e']))).toBe('validation');
 });
});

describe('programma NHS nel piano reale',()=>{
 it('crea 27 sedute in 9 settimane con recupero e non duplica la richiesta',()=>{
  const result=run<{plan:{id:string;programId:string};sessions:PlannedSession[]}>('a','createBeginnerPlan',['2026-10-26']);
  expect(result.sessions).toHaveLength(27);expect(result.plan.programId).toBe('nhs-c25k');expect(result.sessions[0]).toMatchObject({date:'2026-10-26',durationMin:28.5,guidedWorkoutId:'nhs-c25k-1-1'});
  expect(result.sessions[1].date).toBe('2026-10-28');expect(result.sessions.at(-1)?.date).toBe('2026-12-25');
  expect(run<{plan:{id:string}}>('a','createBeginnerPlan',['2026-10-26']).plan.id).toBe(result.plan.id);expect(Object.values(db.sessions)).toHaveLength(27);
  expect(code(()=>run('a','createBeginnerPlan',['2026-10-27']))).toBe('validation');
  expect((run<PlannedSession[]>('b','listSessions',[]))).toEqual([]);
 });
 it('salva la guida scelta solo su una registrazione timer valida',()=>{
  const {log}=run<{log:WorkoutLog}>('a','logWorkout',[logIn({mode:'timer',guidedWorkoutId:'nhs-c25k-1-1'})]);expect(log.guidedWorkoutId).toBe('nhs-c25k-1-1');
  expect(code(()=>run('a','logWorkout',[logIn({guidedWorkoutId:'nhs-c25k-1-1'})]))).toBe('validation');
  expect(code(()=>run('a','logWorkout',[logIn({mode:'timer',guidedWorkoutId:'seduta-inventata'})]))).toBe('validation');
 });
});
