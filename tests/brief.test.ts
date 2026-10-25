import { describe, expect, it } from 'vitest';
import { analyzeWorkout, factsToContext, factsToText } from '../shared/brief.ts';
import { emptyDb } from '../shared/engine.ts';
import { generatePlan } from '../shared/planGenerator.ts';
import { countLaps, downsample, splits, trackDistanceKm } from '../shared/track.ts';
import type { PlanWizardInput, TrackPoint, WorkoutLog } from '../shared/types.ts';

/** Circuito quadrato di ~0,4 km percorso `laps` volte a ~6 min/km. */
function circuit(laps: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const side = 0.0009; // ≈100 m
  const corners = [[0, 0], [0, side], [side, side], [side, 0], [0, 0]];
  let t = 0;
  for (let l = 0; l < laps; l++)
    for (let c = 0; c < corners.length - 1; c++)
      for (let k = 0; k < 10; k++) {
        const a = corners[c], b = corners[c + 1];
        pts.push({ lat: 44 + a[0] + ((b[0] - a[0]) * k) / 10, lng: 12 + a[1] + ((b[1] - a[1]) * k) / 10, t: (t += 3) });
      }
  pts.push({ lat: 44, lng: 12, t: (t += 3) });
  return pts;
}

describe('tracciato GPS', () => {
  it('distanza, giri e passaggi per chilometro derivano solo dai punti', () => {
    const t = circuit(4);
    const km = trackDistanceKm(t);
    expect(km).toBeGreaterThan(1.3);
    expect(km).toBeLessThan(1.8);
    expect(countLaps(t)).toBe(4);
    expect(countLaps(circuit(1))).toBe(1);
    const s = splits(t);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s[0].distKm).toBe(1);
    expect(downsample(t, 20)).toHaveLength(20);
    expect(downsample(t, 20)[19]).toEqual(t[t.length - 1]);
  });
});

function log(over: Partial<WorkoutLog>): WorkoutLog {
  return { id: 'l', userId: 'u', plannedSessionId: null, kind: 'run_easy', title: 'Corsa', startedAt: '2026-10-20T08:00:00.000Z', durationSec: 1800, distanceKm: 5, paceSecPerKm: 360, rpe: 5, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared: false, createdAt: '', updatedAt: '', ...over };
}

describe('briefing', () => {
  it('confronta con piano, storico e altri runner (solo con almeno 5 runner) e propone la prossima sessione', () => {
    const db = emptyDb();
    const now = log({ id: 'now', plannedSessionId: 's1', startedAt: '2026-10-22T08:00:00.000Z' });
    db.workoutLogs.now = now;
    db.workoutLogs.old = log({ id: 'old', startedAt: '2026-10-18T08:00:00.000Z', durationSec: 1950, distanceKm: 5 });
    for (let i = 0; i < 6; i++) db.workoutLogs['o' + i] = log({ id: 'o' + i, userId: 'x' + i, startedAt: '2026-10-15T08:00:00.000Z', durationSec: 1500 + i * 200, distanceKm: 5, shared: true });
    db.sessions.s1 = { id: 's1', userId: 'u', planId: null, date: '2026-10-22', time: null, kind: 'run_easy', title: 'Corsa facile', description: '', durationMin: 30, distanceKm: 5, intensity: 'low', paceSecPerKm: null, warmupMin: 0, cooldownMin: 0, segments: [], exercises: [], notes: '', status: 'completed', rescheduledFrom: null, eventId: null, logId: 'now', createdAt: '', updatedAt: '' };
    db.sessions.s2 = { ...db.sessions.s1, id: 's2', date: '2026-10-25', title: 'Ripetute', status: 'planned', logId: null };
    const f = analyzeWorkout(db, now, new Date('2026-10-23T00:00:00Z'));
    expect(f.vsPlan?.asPlanned).toBe(true);
    expect(f.vsHistory?.count).toBe(1);
    expect(f.vsHistory?.paceDeltaSec).toBeLessThan(0);
    expect(f.vsOthers?.runners).toBe(6);
    expect(f.next[0].title).toBe('Ripetute');
    const text = factsToText(f);
    expect(text).toMatch(/in linea con il piano/);
    expect(text).toMatch(/non misura l’impegno/);
    expect(text).toMatch(/Ripetute/);
    expect(factsToContext(f)).not.toMatch(/x0|userId/);
    // gli allenamenti non condivisi non entrano nel confronto
    db.workoutLogs.o5.shared = false;
    expect(analyzeWorkout(db, now, new Date('2026-10-23T00:00:00Z')).vsOthers?.runners).toBe(5);
    // con meno di 5 altri runner il confronto non compare
    delete db.workoutLogs.o0;
    delete db.workoutLogs.o1;
    expect(analyzeWorkout(db, now, new Date('2026-10-23T00:00:00Z')).vsOthers).toBeNull();
  });
});

const wiz = (over: Partial<PlanWizardInput> = {}): PlanWizardInput => ({ name: 'p', goal: 'general_fitness', level: 'intermediate', weekdays: [1, 3, 5, 7], maxMinutes: 60, equipment: [], preference: 'mixed', includeStrength: false, startDate: '2026-10-26', weeks: 8, ...over });

describe('generatore: varietà e moduli', () => {
  it('alterna tipi diversi di sessione e aggiunge mobilità facoltativa su richiesta', () => {
    const { sessions } = generatePlan(wiz({ includeMobility: true }));
    const titles = new Set(sessions.filter((s) => s.kind !== 'mobility').map((s) => s.title.replace(/\d+/g, 'N')));
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(sessions.some((s) => s.kind === 'mobility')).toBe(true);
    expect(generatePlan(wiz()).sessions.some((s) => s.kind === 'mobility')).toBe(false);
  });

  it('obiettivo di gara: ultima settimana di rifinitura con volume ridotto', () => {
    const { sessions } = generatePlan(wiz({ goal: 'race_10k', weeks: 8 }));
    const sum = (from: string, to: string) => sessions.filter((s) => s.date >= from && s.date <= to).reduce((a, s) => a + s.durationMin, 0);
    expect(sum('2026-12-14', '2026-12-20')).toBeLessThan(sum('2026-12-07', '2026-12-13'));
    expect(sessions.filter((s) => s.date >= '2026-12-14').every((s) => /rifinitura/.test(s.notes))).toBe(true);
  });
});

it('un inserimento manuale è dichiarato e non prova lo svolgimento', () => {
  const f = analyzeWorkout(emptyDb(), log({ mode: 'manual' }));
  expect(f.evidence).toBe('declared');
  expect(factsToText(f)).toContain('non posso verificare lo svolgimento');
  expect(factsToContext(f)).toContain('non affermare');
  const gps = analyzeWorkout(emptyDb(), log({ distanceSource: 'gps', track: circuit(1) }));
  expect(gps.evidence).toBe('gps');
  expect(analyzeWorkout(emptyDb(), log({ distanceSource: 'gps', track: circuit(1), edited: true })).evidence).toBe('declared');
});

it('non ricuce il tragitto attraverso pause o interruzioni anche dopo il campionamento', async () => {
  const { trackSegments } = await import('../shared/track.ts');
  const track = circuit(1);
  track[20].breakBefore = true;
  const segments = trackSegments(track);
  expect(segments).toHaveLength(2);
  expect(segments[0][segments[0].length - 1]).toEqual(track[19]);
  expect(segments[1][0]).toEqual(track[20]);
  expect(downsample(track, 10).some((p) => p.breakBefore)).toBe(true);
});
