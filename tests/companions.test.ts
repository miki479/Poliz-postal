import { describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { TrackPoint, UserPublic, WorkoutLog } from '../shared/types.ts';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const line = (lat0: number, lng0: number, km: number): TrackPoint[] => Array.from({ length: 41 }, (_, i) => ({ lat: lat0 + ((km / 111.2) * i) / 40, lng: lng0, t: i * 9 }));

function setup() {
  const db = emptyDb();
  for (const id of ['a', 'b', 'c', 'd']) db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: 'U' + id, bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const log = (id: string, user: string, start: string, track: TrackPoint[], shared = true): WorkoutLog => (db.workoutLogs[id] = { id, userId: user, plannedSessionId: null, kind: 'run_free', title: 'Corsa', startedAt: start, durationSec: 1800, distanceKm: 4, paceSecPerKm: 450, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared, track, createdAt: start, updatedAt: start });
  return { db, log };
}
const as = (db: Ctx['db'], a: string): Ctx => ({ db, now: NOW, actorId: a });

describe('con chi hai corso', () => {
  it('riconosce chi ha fatto lo stesso tragitto alla stessa ora, anche fuori dai club', () => {
    const { db, log } = setup();
    log('la', 'a', '2026-10-24T07:00:00.000Z', line(45, 7.7, 4));
    log('lb', 'b', '2026-10-24T07:04:00.000Z', line(45.0002, 7.7001, 4)); // stesso percorso, partenza a 4 minuti
    log('lc', 'c', '2026-10-24T09:00:00.000Z', line(45, 7.7, 4)); // stesso percorso, due ore dopo
    log('ld', 'd', '2026-10-24T07:01:00.000Z', line(45, 7.75, 4)); // stessa ora, strada diversa
    const r = call(as(db, 'a'), 'runCompanions', ['la']) as UserPublic[];
    expect(r.map((u) => u.id)).toEqual(['b']);
  });

  it('privacy: niente abbinamento se uno dei due non condivide', () => {
    const { db, log } = setup();
    log('la', 'a', '2026-10-24T07:00:00.000Z', line(45, 7.7, 4));
    log('lb', 'b', '2026-10-24T07:02:00.000Z', line(45, 7.7, 4), false);
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
    db.workoutLogs.lb.shared = true;
    db.users.b.privacy.shareActivity = false;
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
    db.users.b.privacy.shareActivity = true;
    db.workoutLogs.la.shared = false; // anche chi chiede deve condividere
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
  });
});
