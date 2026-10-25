import { expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { DEFAULT_PRIVACY, emptyDb } from '../shared/engine.ts';
import type { HeatCell } from '../shared/heatmap.ts';
import type { WorkoutLog } from '../shared/types.ts';

it('aggrega solo tracce consentite di tre persone, esclude estremità e permette la revoca', () => {
  const db = emptyDb(), now = new Date('2026-10-25T12:00:00Z');
  for (const id of ['a', 'b', 'c']) {
    db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id, bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: now.toISOString() };
    db.workoutLogs[id] = { id, userId: id, plannedSessionId: null, kind: 'run_free', title: 'Run', startedAt: now.toISOString(), durationSec: 600, distanceKm: 1, paceSecPerKm: 600, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared: false, heatmapConsent: id !== 'c', track: [{ lat: 45, lng: 9, t: 0 }, { lat: 45.005, lng: 9, t: 300 }, { lat: 45.01, lng: 9, t: 600 }], createdAt: now.toISOString(), updatedAt: now.toISOString() } satisfies WorkoutLog;
  }
  const ctx = { db, now, actorId: 'a' };
  const heat = () => call(ctx, 'nearbyHeatmap', [{ lat: 45.005, lng: 9 }]) as HeatCell[];
  expect(heat()).toEqual([]);
  db.workoutLogs.c.heatmapConsent = true;
  expect(heat()).toEqual([{ lat: 45.005, lng: 9, runners: 3 }]);
  // A second activity by the same person never counts as another runner.
  db.workoutLogs.a2 = { ...db.workoutLogs.a, id: 'a2' };
  call({ ...ctx, actorId: 'c' }, 'updateWorkoutLog', ['c', { heatmapConsent: false }]);
  expect(heat()).toEqual([]);
  expect(() => call({ ...ctx, actorId: null }, 'nearbyHeatmap', [{ lat: 45, lng: 9 }])).toThrow();
});
