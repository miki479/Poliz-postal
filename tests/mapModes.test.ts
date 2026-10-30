import { describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { DEFAULT_PRIVACY, emptyDb } from '../shared/engine.ts';
import { isNight, POPULAR_MIN, type MapInsights } from '../shared/mapInsights.ts';
import type { WorkoutLog } from '../shared/types.ts';

const NOW = new Date('2026-10-25T12:00:00Z');

/** `n` runner diversi, ognuno con una corsa consentita che attraversa la stessa cella, partita all'ora indicata. */
function world(n: number, startedAt: string) {
  const db = emptyDb();
  for (let i = 0; i < n; i++) {
    const id = `u${i}`;
    db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id, bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
    db.workoutLogs[id] = { id, userId: id, plannedSessionId: null, kind: 'run_free', title: 'Run', startedAt, durationSec: 600, distanceKm: 1, paceSecPerKm: 600, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared: false, heatmapConsent: true, track: [{ lat: 45, lng: 9, t: 0 }, { lat: 45.005, lng: 9, t: 300 }, { lat: 45.01, lng: 9, t: 600 }], createdAt: startedAt, updatedAt: startedAt } satisfies WorkoutLog;
  }
  return { db, now: NOW, actorId: 'u0' };
}
const heat = (ctx: ReturnType<typeof world>, period: string) => (call(ctx, 'mapInsights', [{ period }]) as MapInsights).heat;

describe('mappa di calore: modalità notturna e più popolata', () => {
  it('"notturna" conta solo corse partite tra le 20 e le 6 (ora italiana)', () => {
    expect(isNight(Date.parse('2026-10-24T20:30:00Z'))).toBe(true); // 22:30 a Roma (CEST)
    expect(isNight(Date.parse('2026-10-24T03:00:00Z'))).toBe(true);
    expect(isNight(Date.parse('2026-10-24T10:00:00Z'))).toBe(false);
    expect(heat(world(3, '2026-10-24T20:30:00Z'), 'night')).toHaveLength(1);
    expect(heat(world(3, '2026-10-24T10:00:00Z'), 'night')).toEqual([]);
    // di giorno la mappa globale le vede, quella notturna no
    expect(heat(world(3, '2026-10-24T10:00:00Z'), 'global')).toHaveLength(1);
  });

  it('"più popolata" richiede almeno 6 persone diverse: con 3 o 5 resta vuota', () => {
    expect(POPULAR_MIN).toBe(6);
    expect(heat(world(5, '2026-10-24T10:00:00Z'), 'popular')).toEqual([]);
    expect(heat(world(6, '2026-10-24T10:00:00Z'), 'popular')).toHaveLength(1);
  });

  it('la soglia di anonimato di tre persone vale sempre, anche di notte', () => {
    expect(heat(world(2, '2026-10-24T20:30:00Z'), 'night')).toEqual([]);
  });

  it('un periodo sconosciuto viene rifiutato', () => {
    expect(() => heat(world(3, '2026-10-24T10:00:00Z'), 'sempre')).toThrow();
  });
});
