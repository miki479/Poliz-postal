import { describe, expect, it } from 'vitest';
import { replayPosition, replaySlice, replayTimeline } from '../shared/replay.ts';
import type { TrackPoint } from '../shared/types.ts';

const point = (lng: number, t: number, breakBefore = false): TrackPoint => ({ lat: 45, lng, t, breakBefore });
describe('replay con tempi reali', () => {
  it('interpola per tempo e non per numero di punti', () => {
    const t = replayTimeline([point(7, 50), point(7.001, 60), point(7.002, 90)]);
    expect(t.timed).toBe(true);
    expect(t.total).toBe(40);
    expect(replayPosition(t, 10)?.point.lng).toBe(7.001);
    expect(replayPosition(t, 25)?.point.lng).toBeCloseTo(7.0015);
    expect(replayPosition(t, 25)?.point.t).toBe(75);
    expect(replayPosition(t, 100)?.point.lng).toBe(7.002);
  });
  it('un secondo giro più veloce segue il tempo registrato, senza accelerazione artificiale', () => {
    const t = replayTimeline([point(7, 0), point(7.001, 10), point(7, 20), point(7.001, 25), point(7, 30)]);
    expect(replayPosition(t, 10)?.point.lng).toBe(7.001);
    expect(replayPosition(t, 25)?.point.lng).toBe(7.001);
    expect(replayPosition(t, 22.5)?.point.lng).toBeCloseTo(replayPosition(t, 5)!.point.lng);
  });
  it('non disegna né interpola una scorciatoia durante la perdita di segnale', () => {
    const t = replayTimeline([point(7, 0), point(7.001, 10), point(8, 60, true), point(8.001, 70)]);
    expect(replayPosition(t, 35)).toMatchObject({ point: { lng: 7.001 }, gap: true });
    expect(replayPosition(t, 60)).toMatchObject({ point: { lng: 8 }, gap: false });
  });
  it('senza timestamp è soltanto un’animazione geometrica, senza velocità dichiarata', () => {
    const t = replayTimeline([point(7, 0), point(7.001, 0), point(7.002, 0)]);
    expect(t.timed).toBe(false);
    expect(replayPosition(t, t.total / 2)?.point.lng).toBeCloseTo(7.001);
    expect(replaySlice(t, 0, 5)).toEqual([]);
  });
  it('ritaglia un tratto record esattamente ai tempi di inizio e fine', () => {
    const t = replayTimeline([point(7, 50), point(7.001, 60), point(7.002, 90)]);
    const slice = replaySlice(t, 55, 75);
    expect(slice[0]).toMatchObject({ t: 55 });
    expect(slice[0].lng).toBeCloseTo(7.0005);
    expect(slice[slice.length - 1].lng).toBeCloseTo(7.0015);
    expect(slice.map((p) => p.t)).toEqual([55, 60, 75]);
  });
});
