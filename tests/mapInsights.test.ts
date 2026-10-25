import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { mapInsights, setMapVisibility } from '../shared/mapInsights.ts';
import { createRoute } from '../shared/routes.ts';
import { newActivity } from '../shared/activities.ts';
import type { PlannedSession, WorkoutLog } from '../shared/types.ts';

const NOW = new Date('2026-10-25T12:00:00Z');
let db: ReturnType<typeof emptyDb>;
const as = (id = 'a'): Ctx => ({ db, actorId: id, now: NOW });
function log(id: string, userId: string, over: Partial<WorkoutLog> = {}): WorkoutLog {
  return { id, userId, plannedSessionId: null, kind: 'run_free', title: 'Corsa', startedAt: '2026-10-24T10:00:00Z', durationSec: 1800, distanceKm: 5, paceSecPerKm: 360, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', activityId: null, shared: true, origin: 'app', track: [{ lat: 45.11, lng: 9.12345, t: 0 }, { lat: 45.12345, lng: 9.12345, t: 300 }, { lat: 45.12346, lng: 9.12346, t: 360 }, { lat: 45.14, lng: 9.12345, t: 900 }], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...over };
}
beforeEach(() => {
  db = emptyDb();
  for (const id of ['a', 'b', 'c', 'd']) db.users[id] = { id, username: id, displayName: id, avatar: null, profileCompleted: true, bio: '', hue: 10, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
});

describe('mappe reali e private', () => {
  it('shared non autorizza il GPS; servono opt-in e almeno tre atleti nella cella', () => {
    for (const id of ['a', 'b', 'c']) db.workoutLogs[id] = log(id, id);
    expect(mapInsights(as()).heat).toEqual([]);
    setMapVisibility(as('a'), 'a', true); setMapVisibility(as('b'), 'b', true);
    expect(mapInsights(as()).heat).toEqual([]);
    setMapVisibility(as('c'), 'c', true);
    const heat = mapInsights(as()).heat;
    expect(heat).toHaveLength(1); expect(heat[0].weight).toBe(3);
    expect(heat[0].lat).not.toBe(45.12345); expect(heat[0].lng).not.toBe(9.12345);
    expect(Object.keys(heat[0]).sort()).toEqual(['lat', 'lng', 'weight']);
  });
  it('più log dello stesso atleta non sostituiscono tre persone; Strava e file non contribuiscono', () => {
    for (let i = 0; i < 10; i++) db.workoutLogs[String(i)] = log(String(i), 'a', { mapShared: true });
    db.workoutLogs.b = log('b', 'b', { origin: 'strava', mapShared: true });
    db.workoutLogs.c = log('c', 'c', { origin: 'file', mapShared: true });
    expect(mapInsights(as()).heat).toEqual([]);
    expect(() => setMapVisibility(as('b'), 'b', true)).toThrow(/Runngo/);
    expect(() => setMapVisibility(as('d'), '0', true)).toThrow(/non trovata/);
  });
  it('periodo e zona filtrano senza salvare la posizione di ricerca', () => {
    for (const id of ['a', 'b', 'c']) db.workoutLogs[id] = log(id, id, { mapShared: true, startedAt: '2026-10-01T10:00:00Z' });
    expect(mapInsights(as()).heat).toHaveLength(1);
    expect(mapInsights(as(), { period: 'week' }).heat).toEqual([]);
    const before = JSON.stringify(db);
    expect(mapInsights(as(), { nearby: { lat: 0, lng: 0, radiusKm: 5 } }).heat).toEqual([]);
    expect(JSON.stringify(db)).toBe(before);
    expect(() => mapInsights(as(), { nearby: { lat: 91, lng: 0, radiusKm: 5 } })).toThrow(/zona valida/);
  });
  it('ritirare il consenso elimina subito il contributo aggregato', () => {
    for (const id of ['a', 'b', 'c']) db.workoutLogs[id] = log(id, id, { mapShared: true });
    expect(mapInsights(as()).heat).toHaveLength(1);
    setMapVisibility(as('a'), 'a', false);
    expect(mapInsights(as()).heat).toEqual([]);
    expect(db.workoutLogs.a.shared).toBe(true);
  });
  it('propone solo percorsi accessibili e sedute proprie reali, ordinate sullo storico', () => {
    const input = (distanceKm: number, visibility: 'private' | 'public') => ({ name: `Giro ${distanceKm}`, description: '', startName: 'Parco', endName: 'Parco', area: '', notes: '', start: null, end: null, geometry: [{ lat: 45, lng: 9 }, { lat: 45.01, lng: 9.01 }], geometryProvider: null, distanceKm, distanceSource: 'manual' as const, visibility });
    const near = createRoute(as('a'), input(5, 'private')); const far = createRoute(as('b'), input(20, 'public')); const hidden = createRoute(as('b'), input(5, 'private'));
    const activity = newActivity(NOW, { userId: 'a', source: 'manual', sport: 'running', date: '2026-10-24T10:00:00Z', distanceKm: 5, durationMin: 30 }); db.activities[activity.id] = activity;
    db.sessions.s = { id: 's', userId: 'a', kind: 'run_easy', date: '2026-10-26', status: 'planned' } as PlannedSession;
    db.sessions.other = { id: 'other', userId: 'b', kind: 'run_easy', date: '2026-10-26', status: 'planned' } as PlannedSession;
    db.sessions.rest = { id: 'rest', userId: 'a', kind: 'rest', date: '2026-10-26', status: 'planned' } as PlannedSession;
    db.sessions.strength = { id: 'strength', userId: 'a', kind: 'strength', date: '2026-10-26', status: 'planned' } as PlannedSession;
    const result = mapInsights(as());
    expect(result.routes.map((r) => r.id)).toEqual([near.id, far.id]);
    expect(result.routes.some((r) => r.id === hidden.id)).toBe(false);
    expect(result.workouts.map((s) => s.id)).toEqual(['s']);
    expect(result.basis).toContain('1 attività');
    expect((mapInsights(as('d')).basis)).toBeNull();
  });
});
