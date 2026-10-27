import { describe, expect, it } from 'vitest';

import { applyMetrics, metricsFromSummary } from '../shared/stravaStories.ts';
import { elevationOf } from '../shared/track.ts';
import type { DbState } from '../shared/types.ts';

describe('statistiche reali', () => {
  it('riepilogo Strava: solo i campi presenti, cadenza della corsa raddoppiata, niente valori inventati', () => {
    const m = metricsFromSummary({ moving_time: 1800, elapsed_time: 1900, average_heartrate: 151.4, max_heartrate: 178, total_elevation_gain: 42.6, max_speed: 4.5, average_cadence: 84 }, 'running');
    expect(m).toMatchObject({ movingSec: 1800, elapsedSec: 1900, hrAvg: 151, hrMax: 178, elevGainM: 43, maxSpeedKmh: 16.2, cadenceSpm: 168, calories: null, avgWatts: null });
    const empty = metricsFromSummary({ moving_time: 600 }, 'walking');
    expect(empty.hrAvg).toBeNull();
    expect(empty.hrMax).toBeNull();
    expect(empty.elevGainM).toBeNull();
    expect(empty.cadenceSpm).toBeNull();
  });

  it('senza cardiofrequenzimetro (has_heartrate=false) non mostra il cuore', () => {
    expect(metricsFromSummary({ has_heartrate: false, average_heartrate: 120 }, 'running').hrAvg).toBeNull();
  });

  it('applyMetrics è idempotente e non crea nulla se il racconto non esiste', () => {
    const log = { id: 'l1', activityId: 'a1', origin: 'strava', metrics: null };
    const db = { workoutLogs: { l1: log } } as unknown as DbState;
    const m = metricsFromSummary({ average_heartrate: 140 }, 'running');
    expect(applyMetrics(db, 'a1', m)).toBe(true);
    expect(applyMetrics(db, 'a1', m)).toBe(false);
    expect(applyMetrics(db, 'nope', m)).toBe(false);
  });

  it('dislivello GPS: ignora il rumore sotto 3 m, conta salita e discesa, null senza altitudine', () => {
    const pts = (alts: Array<number | undefined>) => alts.map((alt, i) => ({ lat: 45 + i * 0.0003, lng: 7, t: i * 10, ...(alt === undefined ? {} : { alt }) }));
    const noisy = elevationOf(pts(Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 1 : -1))))!;
    expect(noisy.gainM).toBe(0);
    const climb = elevationOf(pts([...Array.from({ length: 30 }, (_, i) => 100 + i), ...Array.from({ length: 30 }, (_, i) => 130 - i)]))!;
    expect(climb.gainM).toBeGreaterThanOrEqual(24);
    expect(climb.lossM).toBeGreaterThanOrEqual(24);
    expect(elevationOf(pts(Array.from({ length: 30 }, () => undefined)))).toBeNull();
  });
});
