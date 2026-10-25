import { beforeEach, describe, expect, it } from 'vitest';

import { call } from '../shared/api.ts';
import { newActivity } from '../shared/activities.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { listGear, saveGear, setGearRetired, setWorkoutGear, type GearInput } from '../shared/gear.ts';
import { mapInsights } from '../shared/mapInsights.ts';
import { createRoute } from '../shared/routes.ts';
import type { PlannedSession, WorkoutLog } from '../shared/types.ts';

const NOW = new Date('2026-10-25T12:00:00Z');
let db: ReturnType<typeof emptyDb>;
const as = (actorId: string | null = 'a', now = NOW): Ctx => ({ db, actorId, now });
const input = (over: Partial<GearInput> = {}): GearInput => ({ name: 'Scarpe strada', sport: 'running', initialKm: null, ...over });
function log(id: string, over: Partial<WorkoutLog> = {}): WorkoutLog {
  return { id, userId: 'a', plannedSessionId: null, kind: 'run_free', title: 'Corsa', startedAt: '2026-10-24T10:00:00Z', durationSec: 1800, distanceKm: 5, paceSecPerKm: 360, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', activityId: null, shared: false, origin: 'app', sport: 'running', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...over };
}
const errorCode = (fn: () => unknown) => {
  try { fn(); return 'none'; } catch (error) { return error instanceof AppError ? error.code : 'other'; }
};
beforeEach(() => {
  db = emptyDb();
  for (const id of ['a', 'b']) db.users[id] = { id, username: id, displayName: id, avatar: null, profileCompleted: true, bio: '', hue: 10, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
});

describe('attrezzatura personale reale', () => {
  it('richiede una sessione e non rivela elementi di altri utenti', () => {
    const own = saveGear(as(), input()); const other = saveGear(as('b'), input({ name: 'Scarpe di B' }));
    db.workoutLogs.mine = log('mine'); db.workoutLogs.foreign = log('foreign', { userId: 'b' });
    for (const action of [() => listGear(as(null)), () => saveGear(as(null), input()), () => setGearRetired(as(null), own.id, true), () => setWorkoutGear(as(null), 'mine', own.id)]) expect(errorCode(action)).toBe('unauthenticated');
    expect(listGear(as()).map((g) => g.id)).toEqual([own.id]);
    expect(errorCode(() => saveGear(as(), input(), other.id))).toBe('not_found');
    expect(errorCode(() => setGearRetired(as(), other.id, true))).toBe('not_found');
    expect(errorCode(() => setWorkoutGear(as(), 'mine', other.id))).toBe('not_found');
    expect(errorCode(() => setWorkoutGear(as(), 'foreign', own.id))).toBe('not_found');
    expect(db.workoutLogs.mine.gearId).toBeUndefined(); expect(db.workoutLogs.foreign.gearId).toBeUndefined();
  });

  it('salva e modifica nome, sport e km dichiarati mantenendo identità e date', () => {
    const created = saveGear(as(), input({ name: '  Scarpe sentieri  ', sport: 'trail', initialKm: 12.126 }));
    expect(created).toMatchObject({ userId: 'a', name: 'Scarpe sentieri', sport: 'trail', initialKm: 12.13, usedKm: 0, activities: 0, totalKm: 12.13, retired: false });
    setGearRetired(as(), created.id, true);
    const tomorrow = new Date('2026-10-26T12:00:00Z');
    const changed = saveGear(as('a', tomorrow), input({ name: 'Scarpe parco', sport: 'walking', initialKm: 0 }), created.id);
    expect(changed.id).toBe(created.id); expect(changed.createdAt).toBe(NOW.toISOString()); expect(changed.updatedAt).toBe(tomorrow.toISOString());
    expect(changed.retired).toBe(true); expect(changed.totalKm).toBe(0); expect(Object.keys(db.gear)).toHaveLength(1);
    expect(listGear(as(), false)).toEqual([]);
  });

  it('rifiuta valori invalidi senza modificare il database', () => {
    const before = JSON.stringify(db);
    for (const bad of [input({ name: ' ' }), input({ name: 'x'.repeat(81) }), input({ sport: 'cycling' as never }), input({ initialKm: -1 }), input({ initialKm: NaN }), input({ initialKm: Infinity }), input({ initialKm: 100001 }), input({ initialKm: undefined as never })]) {
      expect(errorCode(() => saveGear(as(), bad))).toBe('validation');
      expect(JSON.stringify(db)).toBe(before);
    }
  });

  it('limita a cento elementi senza impedire una modifica già esistente', () => {
    for (let i = 0; i < 100; i++) saveGear(as(), input({ name: `Scarpe ${i}` }));
    expect(errorCode(() => saveGear(as(), input()))).toBe('validation');
    const [first] = listGear(as());
    expect(saveGear(as(), input({ name: 'Nome aggiornato' }), first.id).id).toBe(first.id);
    expect(Object.keys(db.gear)).toHaveLength(100);
  });

  it('assegna e rimuove una scelta esplicita senza cambiare il tipo dell’attività', () => {
    const gear = saveGear(as(), input({ sport: 'trail', initialKm: 10 })); db.workoutLogs.mine = log('mine');
    expect(setWorkoutGear(as(), 'mine', gear.id)).toEqual({ id: 'mine', gearId: gear.id });
    expect(db.workoutLogs.mine.sport).toBe('running'); expect(db.workoutLogs.mine.trail).toBeUndefined();
    expect(listGear(as())[0]).toMatchObject({ usedKm: 5, activities: 1, missingDistanceActivities: 0, totalKm: 15 });
    expect(setWorkoutGear(as(), 'mine', null)).toEqual({ id: 'mine', gearId: null });
    expect(listGear(as())[0]).toMatchObject({ usedKm: 0, activities: 0, totalKm: 10 });
    expect(errorCode(() => setWorkoutGear(as(), 'mine', 3 as never))).toBe('validation');
  });

  it('mettere a riposo conserva lo storico, blocca nuove assegnazioni e permette la riattivazione', () => {
    const gear = saveGear(as(), input({ initialKm: 0 }));
    db.workoutLogs.old = log('old'); db.workoutLogs.next = log('next');
    setWorkoutGear(as(), 'old', gear.id);
    expect(setGearRetired(as(), gear.id, true)).toMatchObject({ retired: true, activities: 1, totalKm: 5 });
    expect(setWorkoutGear(as(), 'old', gear.id).gearId).toBe(gear.id);
    expect(errorCode(() => setWorkoutGear(as(), 'next', gear.id))).toBe('validation');
    expect(errorCode(() => setGearRetired(as(), gear.id, 'true' as never))).toBe('validation');
    setGearRetired(as(), gear.id, false);
    expect(setWorkoutGear(as(), 'next', gear.id).gearId).toBe(gear.id);
    expect(listGear(as(), false)[0]).toMatchObject({ activities: 2, totalKm: 10 });
  });

  it('somma solo distanze note Runngo e non produce un totale se mancano dati', () => {
    const gear = saveGear(as(), input({ initialKm: 100 }));
    db.workoutLogs.a = log('a', { gearId: gear.id, distanceKm: 3.456 });
    db.workoutLogs.legacy = log('legacy', { origin: undefined, gearId: gear.id, distanceKm: 6.544 });
    db.workoutLogs.missing = log('missing', { gearId: gear.id, distanceKm: null });
    db.workoutLogs.bad = log('bad', { gearId: gear.id, distanceKm: Infinity });
    db.workoutLogs.foreign = log('foreign', { userId: 'b', gearId: gear.id, distanceKm: 80 });
    db.workoutLogs.strava = log('strava', { origin: 'strava', gearId: gear.id, distanceKm: 50 });
    db.workoutLogs.file = log('file', { origin: 'file', gearId: gear.id, distanceKm: 60 });
    expect(listGear(as())[0]).toMatchObject({ usedKm: 10, activities: 4, missingDistanceActivities: 2, totalKm: null });
    delete db.workoutLogs.missing; delete db.workoutLogs.bad;
    expect(listGear(as())[0]).toMatchObject({ usedKm: 10, activities: 2, totalKm: 110 });
    saveGear(as(), input({ initialKm: null }), gear.id);
    expect(listGear(as())[0]).toMatchObject({ usedKm: 10, totalKm: null });
  });

  it.each(['strava', 'file'] as const)('non assegna né importa attrezzatura da attività %s', (origin) => {
    const gear = saveGear(as(), input()); db.workoutLogs.imported = log('imported', { origin });
    expect(errorCode(() => setWorkoutGear(as(), 'imported', gear.id))).toBe('forbidden');
    expect(errorCode(() => setWorkoutGear(as(), 'imported', null))).toBe('forbidden');
    expect(listGear(as())[0]).toMatchObject({ activities: 0, usedKm: 0, totalKm: null });
    expect(db.workoutLogs.imported.gearId).toBeUndefined();
  });

  it('espone i metodi nel registro API senza saltare i controlli del proprietario', () => {
    const gear = call(as(), 'saveGear', [input()]) as { id: string };
    expect((call(as(), 'listGear', []) as Array<{ id: string }>).map((g) => g.id)).toEqual([gear.id]);
    expect(errorCode(() => call(as('b'), 'setGearRetired', [gear.id, true]))).toBe('not_found');
  });
});

const routeInput = (km: number) => ({ name: `Giro ${km}`, description: '', startName: 'Parco', endName: 'Parco', area: '', notes: '', start: null, end: null, geometry: [{ lat: 45, lng: 9 }, { lat: 45.01, lng: 9.01 }], geometryProvider: null, distanceKm: km, distanceSource: 'manual' as const, visibility: 'public' as const });
describe('consigli basati su attrezzatura effettivamente registrata', () => {
  it('usa le distanze delle attività assegnate e le sedute compatibili con il tipo dichiarato', () => {
    const gear = saveGear(as(), input({ name: 'Scarpe passeggiate', sport: 'walking', initialKm: null }));
    const long = createRoute(as('a'), routeInput(20)); const short = createRoute(as('a'), routeInput(4));
    db.workoutLogs.own = log('own', { gearId: gear.id, distanceKm: 4 });
    db.workoutLogs.strava = log('strava', { gearId: gear.id, distanceKm: 20, origin: 'strava' });
    db.workoutLogs.file = log('file', { gearId: gear.id, distanceKm: 20, origin: 'file' });
    db.workoutLogs.foreign = log('foreign', { gearId: gear.id, distanceKm: 20, userId: 'b' });
    db.sessions.walk = { id: 'walk', userId: 'a', kind: 'aerobic', date: '2026-10-26', status: 'planned' } as PlannedSession;
    db.sessions.run = { id: 'run', userId: 'a', kind: 'run_easy', date: '2026-10-26', status: 'planned' } as PlannedSession;
    const result = mapInsights(as(), { gearId: gear.id });
    expect(result.routes.map((r) => r.id)).toEqual([short.id, long.id]);
    expect(result.routes[0].reason).toContain(gear.name);
    expect(result.workouts.map((s) => s.id)).toEqual(['walk']);
    expect(result.gear).toMatchObject({ id: gear.id, usedKm: 4, activities: 1, totalKm: null });
    expect(result.basis).toContain('1 attività');
  });

  it('se non esistono associazioni usa soltanto lo storico proprio dello sport, escludendo Strava', () => {
    const gear = saveGear(as(), input({ name: 'Scarpe camminata', sport: 'walking' }));
    const long = createRoute(as('a'), routeInput(20)); const short = createRoute(as('a'), routeInput(4));
    const add = (id: string, source: 'manual' | 'file' | 'strava', sport: 'running' | 'walking', km: number, userId = 'a') => {
      const a = newActivity(NOW, { userId, source, sport, date: `2026-10-${id}T10:00:00Z`, distanceKm: km, durationMin: 30 }); db.activities[a.id] = a;
    };
    add('24', 'strava', 'walking', 20); add('23', 'manual', 'running', 20); add('22', 'manual', 'walking', 20, 'b'); add('21', 'file', 'walking', 4);
    const result = mapInsights(as(), { gearId: gear.id });
    expect(result.routes.map((r) => r.id)).toEqual([short.id, long.id]);
    expect(result.routes[0].reason).toContain('camminata');
    expect(result.basis).toContain('ultime 1 attività dello stesso sport');
    expect(result.gear).toMatchObject({ usedKm: 0, totalKm: null });
  });

  it('non accetta attrezzatura sconosciuta, altrui o a riposo', () => {
    const mine = saveGear(as(), input()); const other = saveGear(as('b'), input());
    expect(errorCode(() => mapInsights(as(), { gearId: 'missing' }))).toBe('not_found');
    expect(errorCode(() => mapInsights(as(), { gearId: other.id }))).toBe('not_found');
    setGearRetired(as(), mine.id, true);
    expect(errorCode(() => mapInsights(as(), { gearId: mine.id }))).toBe('not_found');
  });

  it('una distanza non finita non diventa una base per i percorsi consigliati', () => {
    const gear = saveGear(as(), input()); db.workoutLogs.bad = log('bad', { gearId: gear.id, distanceKm: Infinity });
    const result = mapInsights(as(), { gearId: gear.id });
    expect(result.basis).toContain('Nessuna uscita associata');
    expect(result.gear).toMatchObject({ usedKm: 0, missingDistanceActivities: 1, totalKm: null });
  });
});
