import { describe, expect, it } from 'vitest';

import { activityAwards, allAwards, ascending, descending, currentRecords, dedupe, nextHint } from '../shared/records.ts';
import type { WorkoutLog } from '../shared/types.ts';

let n = 0;
const log = (day: string, km: number | null, sec: number, extra: Record<string, unknown> = {}) =>
  ({ id: `l${++n}`, userId: 'u', plannedSessionId: null, kind: 'run_free', title: `Corsa ${day}`, startedAt: `2026-03-${day}T08:00:00Z`, durationSec: sec, distanceKm: km, paceSecPerKm: null, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', activityId: null, shared: false, sport: 'running', environment: 'outdoor', createdAt: `2026-03-${day}T09:00:00Z`, updatedAt: '', ...extra }) as unknown as WorkoutLog;
const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('record e riconoscimenti', () => {
  it('la prima attività è "Primo passo", mai un record', () => {
    const a = log('01', 5, 1800);
    const r = activityAwards(a.id, [a]);
    expect(codes(r)).toEqual(['first_running']);
    expect(r[0].record).toBe(false);
  });

  it('senza storico confrontabile non esiste nessun record', () => {
    const walk = log('01', 3, 2400, { sport: 'walking', kind: 'aerobic' });
    const a = log('02', 5, 1500);
    expect(codes(activityAwards(a.id, [walk, a]))).toEqual(['first_running']);
  });

  it('assegna il record solo se supera davvero il precedente, con valore precedente e miglioramento', () => {
    const old = log('01', 5, 1700);
    const faster = log('02', 5, 1500);
    const slower = log('03', 5, 1600);
    const all = [old, faster, slower];
    const r = activityAwards(faster.id, all).find((x) => x.code === 'tot_5')!;
    expect(r.record).toBe(true);
    expect(r.mark).toBe('5');
    expect(r.unit).toBe('km');
    expect(r.previous).toBe('28:20');
    expect(r.improvement).toBe('3:20 più veloce');
    expect(codes(activityAwards(slower.id, all))).not.toContain('tot_5');
  });

  it('parità non è un record', () => {
    const a = log('01', 5, 1500);
    const b = log('02', 5, 1500);
    expect(codes(activityAwards(b.id, [a, b]))).not.toContain('tot_5');
  });

  it("distanza più lunga con i km nell'icona", () => {
    const a = log('01', 5, 1800);
    const b = log('02', 8.4, 3000);
    const r = activityAwards(b.id, [a, b]).find((x) => x.code === 'run_longest_dist')!;
    expect(r.mark).toBe('8,4');
    expect(r.improvement).toBe('+3,4 km');
  });

  it('tapis roulant e attività corrette a mano non battono record', () => {
    const a = log('01', 5, 1800);
    const t = log('02', 10, 2400, { environment: 'treadmill' });
    const e = log('03', 12, 2500, { edited: true });
    expect(codes(activityAwards(t.id, [a, t]))).not.toContain('run_longest_dist');
    expect(codes(activityAwards(e.id, [a, e]))).not.toContain('run_longest_dist');
  });

  it('stessa attività sincronizzata due volte: nessun duplicato né doppio riconoscimento', () => {
    const app = log('01', 5, 1800, { activityId: 'act1' });
    const strava = log('01', 5, 1805, { activityId: 'act1', origin: 'strava', id: 'dup1' });
    const crossSource = log('01', 5.02, 1800, { origin: 'strava', id: 'dup2', startedAt: '2026-03-01T08:03:00Z' });
    expect(dedupe([app, strava, crossSource])).toHaveLength(1);
    const prev = log('00', 5, 2000, { startedAt: '2026-02-20T08:00:00Z' });
    const awards = allAwards([prev, app, strava, crossSource]);
    expect(awards.filter((x) => x.code === 'tot_5')).toHaveLength(1);
    expect(new Set(awards.map((x) => x.id)).size).toBe(awards.length);
  });

  it("cancellare l'attività ricalcola: il record passa a chi lo merita", () => {
    const a = log('01', 5, 1700);
    const b = log('02', 5, 1500);
    const c = log('03', 5, 1600);
    expect(codes(activityAwards(c.id, [a, b, c]))).not.toContain('tot_5');
    expect(codes(activityAwards(c.id, [a, c]))).toContain('tot_5');
  });

  it("record su porzione: solo tracce GPS dell'app senza interruzioni", () => {
    const track = (speedMs: number) => Array.from({ length: 80 }, (_, i) => ({ lat: 45 + (i * speedMs * 10) / 111_000, lng: 7, t: i * 10 }));
    const slow = log('01', 5.5, 2200, { track: track(3), distanceSource: 'gps' });
    const fast = log('02', 5.5, 1900, { track: track(4), distanceSource: 'gps' });
    expect(codes(activityAwards(fast.id, [slow, fast]))).toContain('seg_1');
    const gaps = log('03', 5.5, 1500, { track: track(5), gpsQuality: { gaps: 1, lostSec: 30 } });
    expect(codes(activityAwards(gaps.id, [slow, fast, gaps]))).not.toContain('seg_1');
    const imported = log('04', 5.5, 1500, { track: track(5).map((p) => ({ ...p, t: 0 })), origin: 'strava' });
    expect(codes(activityAwards(imported.id, [slow, fast, imported]))).not.toContain('seg_1');
  });

  it('le metriche di corsa non si applicano a camminata e forza', () => {
    const w1 = log('01', 3, 2400, { sport: 'walking', kind: 'aerobic' });
    const w2 = log('02', 6, 4800, { sport: 'walking', kind: 'aerobic' });
    const c = codes(activityAwards(w2.id, [w1, w2]));
    expect(c).toContain('walk_longest_dist');
    expect(c.some((x) => x.startsWith('tot_') || x.startsWith('seg_') || x.startsWith('run_'))).toBe(false);
  });

  it('forza: carico per esercizio solo con peso e serie svolte', () => {
    const set = (exercise: string, loadKg: number | null, done = true) => ({ exercise, set: 1, reps: 8, loadKg, done });
    const s1 = log('01', null, 2400, { kind: 'strength', sport: undefined, sets: [set('Squat', 60)] });
    const s2 = log('02', null, 2400, { kind: 'strength', sport: undefined, sets: [set('squat', 70), set('Panca', 40, false), set('Corpo libero', null)] });
    const r = activityAwards(s2.id, [s1, s2]);
    const load = r.find((x) => x.code === 'load_squat')!;
    expect(load.unit).toBe('kg');
    expect(load.previous).toBe('60 kg');
    expect(load.improvement).toBe('+10 kg');
    expect(codes(r)).not.toContain('load_panca');
    expect(codes(r)).toContain('str_volume');
  });

  it('precisione: solo una seduta a intervalli del piano svolta', () => {
    const free = log('01', 4, 1800, { kind: 'run_intervals' });
    const planned = log('02', 4, 1800, { kind: 'run_intervals', plannedSessionId: 'ps1' });
    expect(codes(activityAwards(free.id, [free]))).not.toContain('intervals_done');
    expect(codes(activityAwards(planned.id, [free, planned]))).toContain('intervals_done');
  });

  it('costanza alla terza attività della settimana, una sola volta', () => {
    const l = [log('02', 3, 1200), log('03', 3, 1200), log('04', 3, 1200), log('05', 3, 1200)];
    expect(codes(activityAwards(l[2].id, l))).toContain('week_3');
    expect(codes(activityAwards(l[3].id, l))).not.toContain('week_3');
  });

  it('record attuali e suggerimento verso il prossimo traguardo', () => {
    const all = Array.from({ length: 8 }, (_, i) => log(String(i + 1).padStart(2, '0'), 5, 1800 - i * 10));
    const rec = currentRecords(all).find((r) => r.code === 'tot_5')!;
    expect(rec.logId).toBe(all[7].id);
    const last = log('20', 3, 1200);
    expect(nextHint(last, [...all, last])).toContain('10');
    const alone = log('01', 3, 1200);
    expect(nextHint(alone, [alone])).toBeNull();
  });

  it('gerarchia stabile: dal meno al più importante, il più importante in cima alla discendente', () => {
    const olds = [log('01', 5, 1700), log('02', 5, 1800)];
    for (let i = 3; i <= 9; i++) olds.push(log(String(i).padStart(2, '0'), 3, 1200));
    const big = log('15', 10, 3000);
    const all = [...olds, big];
    const asc = ascending(activityAwards(big.id, all));
    const desc = descending(activityAwards(big.id, all));
    expect(asc.map((a) => a.code)).toEqual([...desc.map((a) => a.code)].reverse());
    expect(desc[0].category).toBe('beyond_limit');
    expect(asc[0].category).not.toBe('beyond_limit');
    expect(ascending(asc).map((a) => a.id)).toEqual(asc.map((a) => a.id));
  });
});
