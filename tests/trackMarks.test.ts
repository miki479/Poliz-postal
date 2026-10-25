import { describe, expect, it } from 'vitest';

import { buildMarks, bestSegmentEnd } from '../shared/trackMarks.ts';
import { bestSegmentSec } from '../shared/performances.ts';
import type { Award } from '../shared/records.ts';

// ~1 grado di latitudine = 111.19 km; punti ogni 10 s a velocità costante v (m/s)
const line = (v: number, n = 400, t0 = 0) => Array.from({ length: n }, (_, i) => ({ lat: 45 + (i * v * 10) / 111_195, lng: 7, t: t0 + i * 10 }));

describe('marker del tracciato', () => {
  it('partenza, chilometri e arrivo su tracce con tempi reali', () => {
    const track = line(3.3, 140); // ~4.5 km in ~1390 s
    const m = buildMarks({ id: 'x', track }, []);
    expect(m[0].kind).toBe('start');
    expect(m[m.length - 1].kind).toBe('finish');
    const km = m.filter((x) => x.kind === 'split');
    expect(km.map((x) => x.label)).toEqual(['1', '2', '3', '4']);
    expect(km[0].detail).toMatch(/^5:0\d · passo 5:0\d\/km$/);
    expect(km[0].lat).toBeGreaterThan(m[0].lat); // il km 1 è dopo la partenza
    expect(km[1].lat).toBeGreaterThan(km[0].lat);
  });

  it('senza tempi reali (Strava) niente chilometri né record inventati', () => {
    const track = line(3.3, 140).map((p) => ({ ...p, t: 0 }));
    const rec = { id: 'a:seg_5', code: 'seg_5', value: '20:00', previous: null, improvement: null } as unknown as Award;
    const m = buildMarks({ id: 'x', track }, [rec]);
    expect(m.map((x) => x.kind)).toEqual(['start', 'finish']);
  });

  it('il marker del record sta dove finisce davvero la porzione più veloce', () => {
    // prima metà lenta (3 m/s), seconda veloce (5 m/s): i 1000 m più rapidi finiscono in fondo
    const slow = line(3, 120);
    const last = slow[slow.length - 1];
    let lat = last.lat;
    let t = last.t;
    const fast = Array.from({ length: 60 }, (_, i) => {
      lat += ((50 + i * 2) / 111_195);
      t += 10;
      return { lat, lng: 7, t };
    });
    const track = [...slow, ...fast];
    const sec = bestSegmentSec(track, 1)!;
    const end = bestSegmentEnd(track, 1)!;
    expect(end.sec).toBe(sec);
    expect(end.lat).toBeCloseTo(track[track.length - 1].lat, 4);
    const rec = { id: 'a:seg_1', code: 'seg_1', value: '3:20', previous: '5:00', improvement: '1:40 più veloce' } as unknown as Award;
    const m = buildMarks({ id: 'x', track }, [rec]).find((x) => x.kind === 'record')!;
    expect(m.lat).toBeCloseTo(end.lat, 6);
    expect(m.detail).toContain('prima 5:00');
  });

  it('molti chilometri: i marker si diradano per restare leggibili', () => {
    const track = line(3.3, 4000); // ~132 km? limitato: 4000*33 m
    const n = buildMarks({ id: 'x', track }, []).filter((x) => x.kind === 'split').length;
    expect(n).toBeLessThan(40);
  });
});
