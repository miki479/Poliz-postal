import { beforeEach, describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { newActivity } from '../shared/activities.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { ActivityInput, ChallengeInput, ChallengeView, DbState, PersonalStats } from '../shared/types.ts';

const NOW = new Date('2026-10-23T10:00:00.000Z');
let db: DbState;

function addUser(id: string) {
  db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id.toUpperCase(), bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
}
const as = (actorId: string | null, now = NOW): Ctx => ({ db, now, actorId });
const run = <T>(actor: string | null, method: string, args: unknown[] = [], now = NOW) => call(as(actor, now), method, args) as T;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};
const challenge = (over: Partial<ChallengeInput> = {}): ChallengeInput => ({
  name: 'Sfida di ottobre', description: '', type: 'most_distance', sport: 'running',
  startsAt: '2026-10-19T00:00:00.000Z', endsAt: '2026-10-26T00:00:00.000Z', timezone: 'UTC', goalKm: null, clubId: null, ...over,
});
const act = (user: string, date: string, km: number | null, over: Partial<ReturnType<typeof newActivity>> = {}) => {
  const a = newActivity(new Date(date), { userId: user, source: 'manual', sport: 'running', date, distanceKm: km, durationMin: km ? Math.round(km * 6) : null, ...over });
  db.activities[a.id] = a;
  return a;
};
const log = (u: string, input: Partial<ActivityInput>) => run(u, 'logActivity', [{ date: '2026-10-21T12:00:00.000Z', sport: 'running', distanceKm: 5, durationMin: 30, note: '', ...input }]);

beforeEach(() => {
  db = emptyDb();
  for (const u of ['a', 'b', 'c']) addUser(u);
});

describe('sfide: creazione, invito, iscrizione', () => {
  it('crea una sfida, il creatore partecipa e riceve un link/codice', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    expect(v.participantCount).toBe(1);
    expect(v.viewer.isCreator).toBe(true);
    expect(v.inviteCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(v.phase).toBe('running');
  });

  it('richiede login e valida i campi lato server', () => {
    expect(code(() => run(null, 'createChallenge', [challenge()]))).toBe('unauthenticated');
    let err: AppError | null = null;
    try {
      run('a', 'createChallenge', [challenge({ name: 'x', type: 'collective_distance', goalKm: null, endsAt: '2026-10-18T00:00:00.000Z' })]);
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.code).toBe('validation');
    expect(Object.keys(err!.fields!).sort()).toEqual(['endsAt', 'goalKm', 'name']);
    expect(code(() => run('a', 'createChallenge', [challenge({ startsAt: '2026-01-01T00:00:00Z' })]))).toBe('validation');
    expect(code(() => run('a', 'createChallenge', [challenge({ type: 'personal_goal' })]))).toBe('validation'); // manca l'obiettivo personale
  });

  it('un amico entra tramite codice; chi non ha il codice non la vede', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    expect(code(() => run('b', 'getChallenge', [v.id]))).toBe('not_found');
    expect(run<ChallengeView>('b', 'getChallenge', [v.id, v.inviteCode]).inviteCode).toBe(''); // il codice non si espone a chi non partecipa
    expect(code(() => run('b', 'joinChallenge', [v.id]))).toBe('not_found');
    expect(run<ChallengeView>('b', 'joinChallenge', [v.id, v.inviteCode.toLowerCase().replace('-', '')]).participantCount).toBe(2);
    run('b', 'joinChallenge', [v.id, v.inviteCode]); // idempotente
    expect(run<ChallengeView>('b', 'getChallenge', [v.id]).participantCount).toBe(2);
    expect(run<ChallengeView>('a', 'getChallenge', [v.id]).participantCount).toBe(2);
    expect(run<ChallengeView>('b', 'getChallenge', [v.id]).inviteCode).toBe(v.inviteCode);
    expect(db.notifications && Object.values(db.notifications).some((n) => n.userId === 'a' && n.type === 'challenge_joined')).toBe(true);
  });

  it('abbandono: il creatore non può uscire, gli altri sì', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    run('b', 'joinChallenge', [v.id, v.inviteCode]);
    expect(code(() => run('a', 'leaveChallenge', [v.id]))).toBe('forbidden');
    run('b', 'leaveChallenge', [v.id]);
    expect(run<ChallengeView>('a', 'getChallenge', [v.id]).participantCount).toBe(1);
  });

  it('i club: solo i membri possono lanciare sfide al club e la vedono senza codice', () => {
    const club = run<{ id: string; inviteCode: string }>('a', 'createClub', [{ name: 'Palestra', description: '', sport: 'running', area: '', imageDataUrl: null }]);
    expect(code(() => run('b', 'createChallenge', [challenge({ clubId: club.id })]))).toBe('forbidden');
    const v = run<ChallengeView>('a', 'createChallenge', [challenge({ clubId: club.id })]);
    run('b', 'joinClub', [club.inviteCode]);
    expect(run<ChallengeView[]>('b', 'listChallenges').map((c) => c.id)).toContain(v.id);
    expect(run<ChallengeView>('b', 'joinChallenge', [v.id]).participantCount).toBe(2);
  });

  it('limita le sfide attive per utente (anti-abuso)', () => {
    for (let i = 0; i < 25; i++) run('a', 'createChallenge', [challenge({ name: `Sfida ${i}` })]);
    expect(code(() => run('a', 'createChallenge', [challenge()]))).toBe('conflict');
  });

  it('solo il creatore annulla; i partecipanti vengono avvisati', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    run('b', 'joinChallenge', [v.id, v.inviteCode]);
    expect(code(() => run('b', 'cancelChallenge', [v.id]))).toBe('forbidden');
    expect(run<ChallengeView>('a', 'cancelChallenge', [v.id]).phase).toBe('cancelled');
    expect(code(() => run('c', 'joinChallenge', [v.id, v.inviteCode]))).toBe('cancelled');
    // da una sfida annullata si esce sempre, anche da creatore
    expect(run('a', 'leaveChallenge', [v.id])).toEqual({ left: true });
    expect(Object.values(db.notifications).some((n) => n.userId === 'b')).toBe(true);
  });
});

describe('sfide: classifica calcolata dai dati registrati', () => {
  it('distanza: ordina per km, ignora fuori periodo, altro sport e attività private (Strava)', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    run('b', 'joinChallenge', [v.id, v.inviteCode]);
    run('c', 'joinChallenge', [v.id, v.inviteCode]);
    act('a', '2026-10-20T07:00:00.000Z', 10);
    act('b', '2026-10-21T07:00:00.000Z', 12);
    act('b', '2026-10-22T07:00:00.000Z', 4.5);
    act('c', '2026-10-21T07:00:00.000Z', 30, { source: 'strava', visibility: 'private', externalId: '1' }); // privata: non conta
    act('c', '2026-10-10T07:00:00.000Z', 40); // prima dell'inizio
    act('c', '2026-10-20T07:00:00.000Z', 9, { sport: 'walking' }); // altro sport
    act('c', '2026-10-22T09:00:00.000Z', 3);
    const rows = run<ChallengeView>('a', 'getChallenge', [v.id]).rows;
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([['b', 16.5, 1], ['a', 10, 2], ['c', 3, 3]]);
  });

  it('uscite completate e giorni attivi (due attività nello stesso giorno = 1 giorno)', () => {
    const runs = run<ChallengeView>('a', 'createChallenge', [challenge({ type: 'most_runs' })]);
    const days = run<ChallengeView>('a', 'createChallenge', [challenge({ type: 'most_active_days', name: 'Giorni attivi' })]);
    act('a', '2026-10-20T07:00:00.000Z', 5);
    act('a', '2026-10-20T18:00:00.000Z', 3);
    act('a', '2026-10-21T07:00:00.000Z', 5);
    expect(run<ChallengeView>('a', 'getChallenge', [runs.id]).rows[0].value).toBe(3);
    expect(run<ChallengeView>('a', 'getChallenge', [days.id]).rows[0].value).toBe(2);
  });

  it('obiettivo collettivo: somma del gruppo contro il traguardo', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge({ type: 'collective_distance', goalKm: 100 })]);
    run('b', 'joinChallenge', [v.id, v.inviteCode]);
    act('a', '2026-10-20T07:00:00.000Z', 30);
    act('b', '2026-10-21T07:00:00.000Z', 25.5);
    const g = run<ChallengeView>('a', 'getChallenge', [v.id]);
    expect(g.totalKm).toBe(55.5);
    expect(g.goalKm).toBe(100);
  });

  it('obiettivo personale: ognuno ha il suo traguardo e la classifica è per percentuale', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge({ type: 'personal_goal' }), 20]);
    expect(code(() => run('b', 'joinChallenge', [v.id, v.inviteCode]))).toBe('validation');
    run('b', 'joinChallenge', [v.id, v.inviteCode, 50]);
    act('a', '2026-10-20T07:00:00.000Z', 10); // 50%
    act('b', '2026-10-20T07:00:00.000Z', 40); // 80%
    const rows = run<ChallengeView>('a', 'getChallenge', [v.id]).rows;
    expect(rows.map((r) => [r.userId, r.pct, r.rank])).toEqual([['b', 80, 1], ['a', 50, 2]]);
  });

  it('senza partecipanti con attività la classifica ha valori a zero, senza dati inventati', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    const g = run<ChallengeView>('a', 'getChallenge', [v.id]);
    expect(g.rows).toEqual([expect.objectContaining({ userId: 'a', value: 0, activities: 0 })]);
    expect(g.totalKm).toBe(0);
    expect(g.dataNote).toMatch(/autodichiarati/);
  });
});

describe('sfide: risultato finale e modifiche retroattive', () => {
  it('congela il risultato dopo il periodo di tolleranza e avvisa i partecipanti', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    run('b', 'joinChallenge', [v.id, v.inviteCode]);
    const a1 = act('a', '2026-10-20T07:00:00.000Z', 10);
    act('b', '2026-10-21T07:00:00.000Z', 8);
    expect(run<ChallengeView>('a', 'getChallenge', [v.id, null], new Date('2026-10-26T05:00:00Z')).phase).toBe('closing');
    const after = new Date('2026-10-28T00:00:00Z');
    const fin = run<ChallengeView>('a', 'getChallenge', [v.id], after);
    expect(fin.phase).toBe('ended');
    expect(fin.finalized).toBe(true);
    expect(fin.rows.map((r) => [r.userId, r.value])).toEqual([['a', 10], ['b', 8]]);
    expect(Object.values(db.notifications).filter((n) => n.type === 'challenge_ended')).toHaveLength(2);
    // modifiche e inserimenti retroattivi NON cambiano il risultato
    run('a', 'updateActivity', [a1.id, { date: a1.date, distanceKm: 99, durationMin: 600, note: 'ritocco' }], after);
    run('b', 'logActivity', [{ date: '2026-10-22T12:00:00.000Z', sport: 'running', distanceKm: 200, durationMin: 900, note: '' }], after);
    const again = run<ChallengeView>('a', 'getChallenge', [v.id], after);
    expect(again.rows.map((r) => [r.userId, r.value, r.rank])).toEqual([['a', 10, 1], ['b', 8, 2]]);
    // e non si può più entrare o uscire
    expect(code(() => run('c', 'joinChallenge', [v.id, v.inviteCode], after))).toBe('past');
    expect(code(() => run('b', 'leaveChallenge', [v.id], after))).toBe('past');
  });

  it('il creatore non può cambiare date o obiettivi dopo la creazione', () => {
    const v = run<ChallengeView>('a', 'createChallenge', [challenge()]);
    const up = run<ChallengeView>('a', 'updateChallenge', [v.id, { name: 'Nuovo nome', description: 'ok', endsAt: '2027-01-01T00:00:00Z', type: 'most_runs' }]);
    expect(up.name).toBe('Nuovo nome');
    expect(up.endsAt).toBe(v.endsAt);
    expect(up.type).toBe('most_distance');
    expect(code(() => run('b', 'updateChallenge', [v.id, { name: 'Hack' }]))).toBe('forbidden');
  });
});

describe('attività: fonti, deduplica, permessi', () => {
  it('rifiuta un inserimento manuale uguale a un\'attività importata da Strava', () => {
    act('a', '2026-10-21T06:30:00.000Z', 10.02, { source: 'strava', visibility: 'private', externalId: '99', dayOnly: false });
    expect(code(() => log('a', { date: '2026-10-21T12:00:00.000Z', distanceKm: 10, durationMin: 55 }))).toBe('conflict');
    expect(log('a', { date: '2026-10-21T12:00:00.000Z', distanceKm: 5, durationMin: 30 })).toBeTruthy(); // altra corsa lo stesso giorno
    expect(code(() => log('a', { date: '2026-10-21T12:00:00.000Z', distanceKm: 5, durationMin: 30 }))).toBe('conflict'); // doppia registrazione
  });

  it('le attività manuali sono "autodichiarate", quelle Strava "importate"; nessuna è "verificata"', () => {
    log('a', { date: '2026-10-21T12:00:00.000Z' });
    act('a', '2026-10-22T06:00:00.000Z', 8, { source: 'strava', visibility: 'private', externalId: '5', dayOnly: false });
    const list = run<Array<{ cls: string; source: string }>>('a', 'listActivities', [null]);
    expect(list.map((x) => x.cls).sort()).toEqual(['imported', 'self_declared']);
    expect(run<PersonalStats>('a', 'getStats', ['UTC']).byOrigin).toEqual({ selfDeclared: 1, imported: 1, verified: 0 });
  });

  it('modifica: solo il proprietario; Strava non è modificabile; valori verificati', () => {
    const mine = log('a', { date: '2026-10-21T12:00:00.000Z', distanceKm: 6, durationMin: 36 }) as { id: string };
    const strava = act('a', '2026-10-20T06:00:00.000Z', 8, { source: 'strava', visibility: 'private', externalId: '7', dayOnly: false });
    expect(code(() => run('b', 'updateActivity', [mine.id, { date: '2026-10-21T12:00:00.000Z', distanceKm: 1, durationMin: 5, note: '' }]))).toBe('forbidden');
    expect(code(() => run('a', 'updateActivity', [strava.id, { distanceKm: 1 }]))).toBe('forbidden');
    expect(code(() => run('a', 'updateActivity', [mine.id, { date: '2026-10-21T12:00:00.000Z', distanceKm: -4, durationMin: 36, note: '' }]))).toBe('validation');
    const up = run<{ distanceKm: number }>('a', 'updateActivity', [mine.id, { date: '2026-10-21T12:00:00.000Z', distanceKm: 7, durationMin: 42, note: 'corretta' }]);
    expect(up.distanceKm).toBe(7);
    expect(code(() => run('a', 'updateActivity', [mine.id, { date: '2026-10-20T12:00:00.000Z', distanceKm: 8, durationMin: 48, note: '' }]))).toBe('conflict'); // coinciderebbe con l'import Strava
    expect(code(() => run('b', 'deleteActivity', [mine.id]))).toBe('forbidden');
  });

  it('classifica del club e feed ignorano le attività private', () => {
    const club = run<{ id: string; inviteCode: string }>('a', 'createClub', [{ name: 'Palestra', description: '', sport: 'running', area: '', imageDataUrl: null }]);
    run('b', 'joinClub', [club.inviteCode]);
    act('b', '2026-10-21T06:00:00.000Z', 40, { source: 'strava', visibility: 'private', externalId: '1', dayOnly: false });
    act('b', '2026-10-21T18:00:00.000Z', 5);
    const lb = run<{ rows: Array<{ value: number }> }>('a', 'clubLeaderboard', [club.id, 'distance', '2026-10-19T00:00:00Z']);
    expect(lb.rows.map((r) => r.value)).toEqual([5]);
    expect(run<Array<{ kind: string; activity?: { distanceKm: number } }>>('a', 'getFeed').filter((f) => f.activity).map((f) => f.activity!.distanceKm)).toEqual([5]);
  });
});

describe('statistiche personali', () => {
  it('stato vuoto: nessun dato inventato', () => {
    const s = run<PersonalStats>('a', 'getStats', ['Europe/Rome']);
    expect(s.hasData).toBe(false);
    expect(s.totals).toEqual({ runs: 0, distanceKm: 0, durationMin: 0, activeDays: 0 });
    expect(s.records.longestKm).toBeNull();
    expect(s.records.fastestPace).toBeNull();
    expect(s.streakWeeks).toBe(0);
    expect(s.monthDeltaKm).toBeNull();
    expect(s.monthly).toHaveLength(6);
    expect(s.weekly).toHaveLength(8);
  });

  it('calcola totali, settimana, mese, confronto, serie e record dai dati registrati', () => {
    // NOW = ven 23 ott 2026 (settimana: lun 19)
    act('a', '2026-10-20T07:00:00.000Z', 10); // settimana corrente
    act('a', '2026-10-22T07:00:00.000Z', 5, { durationMin: 25 }); // 5:00/km
    act('a', '2026-10-14T07:00:00.000Z', 8); // settimana scorsa
    act('a', '2026-10-07T07:00:00.000Z', 6); // due settimane fa
    act('a', '2026-09-15T07:00:00.000Z', 20); // mese scorso
    act('a', '2026-09-16T07:00:00.000Z', 2, { durationMin: null });
    act('b', '2026-10-20T07:00:00.000Z', 99); // altro utente: escluso
    const s = run<PersonalStats>('a', 'getStats', ['UTC']);
    expect(s.totals).toEqual({ runs: 6, distanceKm: 51, durationMin: 25 + 60 + 48 + 36 + 120, activeDays: 6 });
    expect(s.week).toMatchObject({ runs: 2, distanceKm: 15 });
    expect(s.month).toMatchObject({ runs: 4, distanceKm: 29 });
    expect(s.prevMonth).toMatchObject({ runs: 2, distanceKm: 22 });
    expect(s.monthDeltaKm).toBe(7);
    expect(s.streakWeeks).toBe(3); // sett. corrente, scorsa e quella prima
    expect(s.bestStreakWeeks).toBe(3);
    expect(s.records.longestKm).toMatchObject({ value: 20 });
    expect(s.records.bestWeekKm).toMatchObject({ value: 22, weekStart: '2026-09-14' }); // 20 + 2 km nella stessa settimana
    expect(s.records.mostRunsInWeek).toMatchObject({ value: 2 });
    expect(s.records.fastestPace).toMatchObject({ secPerKm: 300, distanceKm: 5 });
    expect(s.monthly.at(-1)).toMatchObject({ month: '2026-10', distanceKm: 29 });
    expect(s.weekly.at(-1)).toMatchObject({ weekStart: '2026-10-19', distanceKm: 15 });
    expect(s.hasData).toBe(true);
  });

  it('la serie di settimane non si interrompe finché la settimana corrente è in corso', () => {
    act('a', '2026-10-14T07:00:00.000Z', 8);
    act('a', '2026-10-07T07:00:00.000Z', 6);
    expect(run<PersonalStats>('a', 'getStats', ['UTC']).streakWeeks).toBe(2);
    expect(run<PersonalStats>('a', 'getStats', ['UTC'], new Date('2026-11-05T10:00:00Z')).streakWeeks).toBe(0);
  });

  it('filtra lo storico per periodo e sport', () => {
    act('a', '2026-10-20T07:00:00.000Z', 10);
    act('a', '2026-09-20T07:00:00.000Z', 5, { sport: 'walking' });
    expect(run<unknown[]>('a', 'listActivities', [{ sport: 'walking' }])).toHaveLength(1);
    expect(run<unknown[]>('a', 'listActivities', [{ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' }])).toHaveLength(1);
    expect(run<unknown[]>('a', 'listActivities', [{}])).toHaveLength(2);
    expect(code(() => run(null, 'listActivities', [{}]))).toBe('unauthenticated');
  });
});
