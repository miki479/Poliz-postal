import { describe, expect, it } from 'vitest';
import { newActivity } from '../shared/activities.ts';
import { emptyDb } from '../shared/engine.ts';
import { decodePolyline, ensureStoryLog } from '../shared/stravaStories.ts';
import { isTimed, splits } from '../shared/track.ts';
import { computePerformances } from '../shared/performances.ts';

// Esempio ufficiale della documentazione dell'algoritmo "encoded polyline".
const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const NOW = new Date('2026-10-24T12:00:00.000Z');

describe('racconti da Strava', () => {
  it('decodifica il tracciato di riferimento', () => {
    const p = decodePolyline(GOOGLE_EXAMPLE);
    expect(p).toHaveLength(3);
    expect(p[0].lat).toBeCloseTo(38.5, 5);
    expect(p[0].lng).toBeCloseTo(-120.2, 5);
    expect(p[2].lat).toBeCloseTo(43.252, 5);
    expect(p[2].lng).toBeCloseTo(-126.453, 5);
  });

  it('crea un solo allenamento privato con tracciato senza tempi per attività importata', () => {
    const db = emptyDb();
    const a = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'running', date: '2026-10-23T17:15:00.000Z', distanceKm: 2.36, durationMin: 26, title: 'Corsa serale', externalId: 'strava:1' });
    db.activities[a.id] = a;
    expect(ensureStoryLog(db, a, GOOGLE_EXAMPLE, NOW)).toBe(true);
    expect(ensureStoryLog(db, a, GOOGLE_EXAMPLE, NOW)).toBe(false); // idempotente: nessun doppione
    const logs = Object.values(db.workoutLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].shared).toBe(false);
    expect(logs[0].origin).toBe('strava');
    expect(logs[0].activityId).toBe(a.id);
    expect(isTimed(logs[0].track!)).toBe(false); // nessun tempo inventato
    expect(splits(logs[0].track!)).toEqual([]);
  });

  it('senza tracciato non crea nulla e non inventa racconti', () => {
    const db = emptyDb();
    const a = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'running', date: '2026-10-23T17:15:00.000Z', distanceKm: 5, durationMin: 30, externalId: 'strava:2' });
    expect(ensureStoryLog(db, a, null, NOW)).toBe(false);
    expect(ensureStoryLog(db, a, '', NOW)).toBe(false);
    expect(Object.keys(db.workoutLogs)).toHaveLength(0);
  });

  it('i tracciati importati non generano record sul percorso', () => {
    const db = emptyDb();
    db.users.u = { id: 'u' } as never;
    const a = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'running', date: '2026-10-23T17:15:00.000Z', distanceKm: 5, durationMin: 30, externalId: 'strava:3' });
    db.activities[a.id] = a;
    ensureStoryLog(db, a, GOOGLE_EXAMPLE, NOW);
    expect(computePerformances(db, 'u', NOW).allTime.some((p) => p.method === 'segment')).toBe(false);
  });
});
