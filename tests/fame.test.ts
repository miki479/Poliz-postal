import { beforeEach, describe, expect, it } from 'vitest';
import { newActivity } from '../shared/activities.ts';
import { call } from '../shared/api.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { FameView, GiveResult, RecognitionPrompt } from '../shared/fame.ts';
import type { GoalProgress, GoalSuggestion } from '../shared/goals.ts';
import type { PerformanceBook } from '../shared/performances.ts';
import type { TrackPoint, WorkoutLog, WorkoutLogInput } from '../shared/types.ts';

const NOW = new Date('2026-10-23T12:00:00.000Z');
let db: ReturnType<typeof emptyDb>;
const addUser = (id: string) => {
  db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id.toUpperCase(), bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
};
const as = (a: string, now = NOW): Ctx => ({ db, now, actorId: a });
const run = <T>(a: string, m: string, args: unknown[] = [], now = NOW) => call(as(a, now), m, args) as T;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};

function event(id: string, organizer: string, startsAt: string, status: 'active' | 'cancelled' = 'active') {
  db.events[id] = { id, clubId: null, organizerId: organizer, title: 'Uscita ' + id, sport: 'running', startsAt, timezone: 'Europe/Rome', meetingPlace: 'Parco', area: '', lat: null, lng: null, distanceKm: 6, paceSecPerKm: null, level: 'easy', notes: '', maxParticipants: null, visibility: 'public', routeId: null, status, inviteToken: 't', version: 1, createdAt: startsAt, updatedAt: startsAt, cancelledAt: null };
}
const join = (e: string, u: string) => (db.participations[`${e}__${u}`] = { id: `p${e}${u}`, eventId: e, userId: u, joinedAt: NOW.toISOString() });
const present = (e: string, u: string) => {
  join(e, u);
  const a = newActivity(NOW, { userId: u, source: 'event', eventId: e, sport: 'running', date: db.events[e].startsAt, distanceKm: 6, durationMin: 40 });
  db.activities[a.id] = a;
};

beforeEach(() => {
  db = emptyDb();
  for (const u of ['org', 'a', 'b', 'c', 'd', 'x']) addUser(u);
  event('e1', 'org', '2026-10-22T17:00:00.000Z');
  present('e1', 'a');
  present('e1', 'b');
  join('e1', 'x'); // iscritto ma senza presenza confermata
});

describe('riconoscimenti post-corsa', () => {
  it('idoneità: solo presenza confermata; organizzazione solo verso chi organizza; niente autovalutazione', () => {
    const p = run<RecognitionPrompt>('a', 'recognitionPrompt', ['e1']);
    expect(p.eligible).toBe(true);
    expect(p.peers.map((x) => x.user.id).sort()).toEqual(['b', 'org']);
    expect(p.peers.find((x) => x.user.id === 'org')!.categories).toEqual(['organization']); // non ha confermato la corsa
    expect(p.peers.find((x) => x.user.id === 'b')!.categories).not.toContain('organization');
    expect(run<RecognitionPrompt>('x', 'recognitionPrompt', ['e1']).eligible).toBe(false); // iscritto non partecipante
    expect(code(() => run('a', 'giveRecognitions', ['e1', [{ toId: 'a', category: 'teamwork' }]]))).toBe('validation');
    expect(code(() => run('a', 'giveRecognitions', ['e1', [{ toId: 'x', category: 'teamwork' }]]))).toBe('validation');
    expect(code(() => run('a', 'giveRecognitions', ['e1', [{ toId: 'b', category: 'organization' }]]))).toBe('validation');
  });

  it('doppio invio idempotente, una sola volta per uscita, anche "non ho elementi"', () => {
    const r1 = run<GiveResult>('a', 'giveRecognitions', ['e1', [{ toId: 'b', category: 'teamwork' }, { toId: 'org', category: 'organization' }]]);
    expect(r1.saved).toBe(2);
    const r2 = run<GiveResult>('a', 'giveRecognitions', ['e1', [{ toId: 'b', category: 'pace_setter' }]]);
    expect(r2.saved).toBe(2);
    expect(Object.keys(db.recognitions)).toHaveLength(2);
    const skip = run<GiveResult>('b', 'giveRecognitions', ['e1', null]);
    expect(skip.skipped).toBe(true);
    expect(run<RecognitionPrompt>('b', 'recognitionPrompt', ['e1']).done).toBe(true);
  });

  it('finestra di 72 ore, uscite annullate o future escluse', () => {
    expect(run<RecognitionPrompt>('a', 'recognitionPrompt', ['e1'], new Date('2026-10-26T18:00:00.000Z')).eligible).toBe(false);
    event('e2', 'org', '2026-10-22T08:00:00.000Z', 'cancelled');
    present('e2', 'a');
    present('e2', 'b');
    expect(run<RecognitionPrompt>('a', 'recognitionPrompt', ['e2']).eligible).toBe(false);
    event('e3', 'org', '2026-10-25T08:00:00.000Z');
    expect(run<RecognitionPrompt>('a', 'recognitionPrompt', ['e3']).reason).toMatch(/non si è ancora svolta/);
  });

  it('Fama: tre binari privati per sé, all’esterno solo qualità consolidate e nascondibili', () => {
    // b riceve "Tiene unito il gruppo" da 3 persone in 2 uscite → consolidata
    run('a', 'giveRecognitions', ['e1', [{ toId: 'b', category: 'keeps_group' }]]);
    event('e4', 'org', '2026-10-21T17:00:00.000Z');
    for (const u of ['b', 'c', 'd']) present('e4', u);
    run('c', 'giveRecognitions', ['e4', [{ toId: 'b', category: 'keeps_group' }]]);
    expect(run<FameView>('a', 'getFame', ['b']).qualities).toHaveLength(0); // solo 2 persone
    run('d', 'giveRecognitions', ['e4', [{ toId: 'b', category: 'keeps_group' }]]);
    const pub = run<FameView>('a', 'getFame', ['b']);
    expect(pub.qualities.map((q) => q.label)).toEqual(['Tiene unito il gruppo']);
    expect(pub.tracks).toBeNull(); // numeri privati
    const own = run<FameView>('b', 'getFame', []);
    expect(own.tracks?.popularity.received).toBe(3);
    expect(own.tracks?.contribution.groupRuns).toBe(2);
    db.users.b.privacy.showRecognitions = false;
    expect(run<FameView>('a', 'getFame', ['b']).qualities).toHaveLength(0);
  });

  it('segnalazioni separate: non tolgono nulla alla Fama', () => {
    run('a', 'giveRecognitions', ['e1', [{ toId: 'b', category: 'teamwork' }]]);
    run('org', 'reportUser', [{ aboutId: 'b', eventId: 'e1', reason: 'conduct', text: 'Comportamento scortese al ritrovo' }]);
    expect(run<FameView>('b', 'getFame', []).tracks?.popularity.received).toBe(1);
  });
});

/** Traccia rettilinea a passo costante `secPerKm` con un tratto più veloce a metà. */
function track(km: number, secPerKm: number, fastKm = 0, fastSec = secPerKm): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const stepKm = 0.05;
  let t = 0;
  for (let d = 0; d <= km + 1e-9; d += stepKm) {
    pts.push({ lat: 44 + d / 111.2, lng: 12, t: Math.round(t) });
    const inFast = d >= km / 2 && d < km / 2 + fastKm;
    t += stepKm * (inFast ? fastSec : secPerKm);
  }
  return pts;
}

describe('migliori prestazioni', () => {
  const logIn = (over: Partial<WorkoutLogInput>): WorkoutLogInput => ({ kind: 'run_free', title: 'Corsa', startedAt: '2026-10-20T07:00:00.000Z', durationSec: 1800, distanceKm: 5, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', shared: false, timezone: 'Europe/Rome', ...over });

  it('miglior 1 km da una porzione continua, non dal passo medio; tracce corrette o interrotte escluse', () => {
    const t = track(5, 360, 1, 300); // 5 km a 6:00 con 1 km a 5:00
    run('a', 'logWorkout', [logIn({ track: t, durationSec: t[t.length - 1].t, distanceKm: 5, distanceSource: 'gps' })]);
    const book = run<PerformanceBook>('a', 'getPerformances');
    const k1 = book.allTime.find((p) => p.id === 'segment_1')!;
    expect(k1.value).toBeGreaterThanOrEqual(298);
    expect(k1.value).toBeLessThanOrEqual(310); // ~5:00, non 5:48 di media
    expect(k1.methodText).toMatch(/Porzione continua/);
    // traccia con interruzioni → esclusa
    const t2 = track(3, 240);
    run('a', 'logWorkout', [logIn({ title: 'Interrotta', startedAt: '2026-10-21T07:00:00.000Z', track: t2, durationSec: t2[t2.length - 1].t, distanceKm: 3, distanceSource: 'gps', gpsQuality: { gaps: 1, lostSec: 120 } })]);
    const b2 = run<PerformanceBook>('a', 'getPerformances');
    expect(b2.allTime.find((p) => p.id === 'segment_1')!.activityTitle).toBe('Corsa');
    expect(b2.excluded.map((e) => e.reason)).toContain('traccia con interruzioni');
  });

  it('tapis roulant: nessuna traccia GPS accettata; la distanza resta dichiarata', () => {
    expect(code(() => run('a', 'logWorkout', [logIn({ environment: 'treadmill', track: track(1, 360) })]))).toBe('validation');
    const r = run<{ log: WorkoutLog }>('a', 'logWorkout', [logIn({ environment: 'treadmill', distanceKm: 5, distanceSource: 'manual' })]);
    expect(r.log.distanceSource).toBe('manual');
    expect(run<PerformanceBook>('a', 'getPerformances').allTime.some((p) => p.method === 'segment')).toBe(false);
  });

  it('registrazione con l’uscita come contesto: presenza confermata, nessun doppione con la conferma', () => {
    event('e9', 'org', '2026-10-23T07:00:00.000Z');
    join('e9', 'a');
    const r = run<{ log: WorkoutLog; linkedExisting: boolean }>('a', 'logWorkout', [logIn({ startedAt: '2026-10-23T07:05:00.000Z', eventId: 'e9' })]);
    const acts = Object.values(db.activities).filter((x) => x.userId === 'a' && x.eventId === 'e9');
    expect(acts).toHaveLength(1);
    expect(acts[0].source).toBe('event');
    expect(r.log.eventId).toBe('e9');
    // non iscritto o fuori orario → rifiutato
    expect(code(() => run('c', 'logWorkout', [logIn({ startedAt: '2026-10-23T07:05:00.000Z', eventId: 'e9' })]))).toBe('validation');
  });
});

describe('obiettivi consigliati', () => {
  it('senza storico chiede disponibilità; con storico usa la mediana senza aumentare', () => {
    expect(run<{ hasHistory: boolean }>('a', 'suggestGoals').hasHistory).toBe(false);
    const ans = run<GoalSuggestion[]>('a', 'suggestFromAnswers', [{ daysPerWeek: 5, minutesPerSession: 30, experience: 'new' }]);
    expect(ans[0].target).toBe(3); // chi inizia: al massimo 3 giorni
    expect(ans[0].basis).toMatch(/Hai indicato 5 giorni/);
    for (const [i, d] of ['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'].entries()) {
      for (let k = 0; k < (i % 2 ? 2 : 3); k++) {
        const a = newActivity(NOW, { userId: 'b', source: 'manual', sport: 'running', date: `${d}T0${7 + k}:00:00.000Z`, distanceKm: 5, durationMin: 30 });
        db.activities[a.id] = a;
      }
    }
    const s = run<{ hasHistory: boolean; suggestions: GoalSuggestion[] }>('b', 'suggestGoals');
    expect(s.hasHistory).toBe(true);
    const c = s.suggestions.find((x) => x.type === 'consistency')!;
    expect(c.target).toBe(3); // mediana di 3,2,3,2,3,2 → 2,5 → 3 (arrotondata), non oltre
    run('b', 'setGoal', [{ type: 'consistency', target: c.target, basis: c.basis }]);
    const list = run<GoalProgress[]>('b', 'listGoals');
    expect(list).toHaveLength(1);
    expect(list[0].paused).toBe(false);
  });
});
