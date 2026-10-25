import { beforeEach, describe, expect, it } from 'vitest';
import * as E from '../shared/engine.ts';
import { DEFAULT_PRIVACY, emptyDb, AppError, type Ctx } from '../shared/engine.ts';
import { zonedToUtcIso, utcToZoned, startOfWeekIso } from '../shared/time.ts';
import type { DbState, EventInput, User } from '../shared/types.ts';
import { validateEventInput } from '../shared/validation.ts';

const NOW = new Date('2026-10-23T10:00:00.000Z');
let db: DbState;

function addUser(id: string, name = id): User {
  const u: User = { id, username: id, avatar: null, profileCompleted: true, displayName: name, bio: '', hue: 10, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  db.users[id] = u;
  return u;
}
const as = (actorId: string | null, now = NOW): Ctx => ({ db, now, actorId });

function input(over: Partial<EventInput> = {}): EventInput {
  return {
    title: 'Corsa del giovedì',
    sport: 'running',
    startsAt: '2026-10-25T17:30:00.000Z',
    timezone: 'Europe/Rome',
    meetingPlace: 'Ingresso palestra',
    area: 'Forlì',
    lat: null,
    lng: null,
    distanceKm: 8,
    paceSecPerKm: 330,
    level: 'medium',
    notes: '',
    maxParticipants: null,
    visibility: 'public',
    clubId: null,
    routeId: null,
    ...over,
  };
}
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};

beforeEach(() => {
  db = emptyDb();
  addUser('a', 'Anna');
  addUser('b', 'Bruno');
  addUser('c', 'Carla');
});

describe('creazione uscita', () => {
  it('vicino a me filtra prima del limite, non persiste la posizione e rispetta la visibilità', () => {
    const e = E.createEvent(as('a'), input({ lat: 45, lng: 9 }));
    const missing = E.createEvent(as('a'), input());
    const privateEvent = E.createEvent(as('a'), input({ visibility: 'private', lat: 45, lng: 9 }));
    // Molti eventi lontani antecedenti non devono consumare i 200 risultati.
    for (let n = 0; n < 210; n++) db.events[`far${n}`] = { ...db.events[e.id], id: `far${n}`, lat: 41, lng: 12, startsAt: '2026-10-24T10:00:00Z' };
    const before = JSON.stringify(db);
    const found = E.listEvents(as('b'), { nearby: { lat: 45.00123, lng: 9.00456, radiusKm: 5 } });
    expect(found.map((x) => x.id)).toEqual([e.id]);
    expect(found[0].lat).toBe(45); expect(found[0].lng).toBe(9);
    expect(found.map((x) => x.id)).not.toContain(missing.id);
    expect(found.map((x) => x.id)).not.toContain(privateEvent.id);
    expect(JSON.stringify(db)).toBe(before);
  });
  it('rifiuta coordinate e raggi invalidi senza restituire eventi', () => {
    for (const nearby of [{ lat: 91, lng: 0, radiusKm: 5 }, { lat: 0, lng: 181, radiusKm: 5 }, { lat: NaN, lng: 0, radiusKm: 5 }, { lat: 0, lng: 0, radiusKm: -1 }, { lat: 0, lng: 0, radiusKm: 501 }]) {
      expect(code(() => E.listEvents(as('a'), { nearby }))).toBe('validation');
    }
  });
  it.each(['beginner', 'easy', 'medium', 'hard', 'advanced'] as const)('conserva il livello %s in creazione, modifica e filtro', (level) => {
    const event = E.createEvent(as('a'), input({ level }));
    expect(E.getEvent(as('b'), event.id).level).toBe(level);
    expect(E.listEvents(as('b'), { level }).map((e) => e.id)).toContain(event.id);
    const changed = E.updateEvent(as('a'), event.id, input({ level }), event.version);
    expect(changed.level).toBe(level);
  });
  it('crea l\'uscita e iscrive l\'organizzatore', () => {
    const v = E.createEvent(as('a'), input());
    expect(v.participantCount).toBe(1);
    expect(v.viewer.isOrganizer).toBe(true);
    expect(v.viewer.isParticipant).toBe(true);
    expect(v.version).toBe(1);
  });
  it('richiede autenticazione', () => {
    expect(code(() => E.createEvent(as(null), input()))).toBe('unauthenticated');
  });
  it('valida i campi lato server', () => {
    let err: AppError | null = null;
    try {
      E.createEvent(as('a'), input({ title: 'ab', meetingPlace: '', startsAt: '2020-01-01T00:00:00Z', distanceKm: -3, maxParticipants: 1 }));
    } catch (e) {
      err = e as AppError;
    }
    expect(err?.code).toBe('validation');
    expect(Object.keys(err!.fields!)).toEqual(expect.arrayContaining(['title', 'meetingPlace', 'startsAt', 'distanceKm', 'maxParticipants']));
  });
  it('un\'uscita di club richiede di essere membro', () => {
    const c = E.createClub(as('b'), { name: 'Palestra Forte', description: '', sport: 'running', area: 'Forlì', imageDataUrl: null });
    expect(code(() => E.createEvent(as('a'), input({ visibility: 'club', clubId: c.id })))).toBe('forbidden');
    expect(E.createEvent(as('b'), input({ visibility: 'club', clubId: c.id })).club?.name).toBe('Palestra Forte');
  });
});

describe('iscrizione e cancellazione', () => {
  it('permette di partecipare e ritirarsi', () => {
    const e = E.createEvent(as('a'), input());
    expect(E.joinEvent(as('b'), e.id).participantCount).toBe(2);
    expect(E.leaveEvent(as('b'), e.id).participantCount).toBe(1);
  });
  it('non crea doppie iscrizioni', () => {
    const e = E.createEvent(as('a'), input());
    E.joinEvent(as('b'), e.id);
    E.joinEvent(as('b'), e.id);
    E.joinEvent(as('b'), e.id);
    expect(E.getEvent(as('b'), e.id).participantCount).toBe(2);
    expect(Object.keys(db.participations)).toHaveLength(2);
  });
  it('l\'organizzatore non può ritirarsi', () => {
    const e = E.createEvent(as('a'), input());
    expect(code(() => E.leaveEvent(as('a'), e.id))).toBe('forbidden');
  });
  it('uscita al completo: l\'ultimo posto va a uno solo', () => {
    const e = E.createEvent(as('a'), input({ maxParticipants: 2 }));
    expect(E.joinEvent(as('b'), e.id).isFull).toBe(true);
    expect(code(() => E.joinEvent(as('c'), e.id))).toBe('full');
    const view = E.getEvent(as('c'), e.id);
    expect(view.viewer.joinBlock).toBe('full');
    expect(view.participantCount).toBe(2);
    // se qualcuno si ritira il posto si libera
    E.leaveEvent(as('b'), e.id);
    expect(E.joinEvent(as('c'), e.id).participantCount).toBe(2);
  });
  it('rifiuta iscrizioni a uscite annullate o passate', () => {
    const e = E.createEvent(as('a'), input());
    E.cancelEvent(as('a'), e.id);
    expect(code(() => E.joinEvent(as('b'), e.id))).toBe('cancelled');
    const e2 = E.createEvent(as('a'), input());
    const later = new Date('2026-10-26T00:00:00Z');
    expect(code(() => E.joinEvent(as('b', later), e2.id))).toBe('past');
    expect(E.getEvent(as('b', later), e2.id).isPast).toBe(true);
  });
  it('richiede login per partecipare', () => {
    const e = E.createEvent(as('a'), input());
    expect(E.getEvent(as(null), e.id).viewer.joinBlock).toBe('login');
    expect(code(() => E.joinEvent(as(null), e.id))).toBe('unauthenticated');
  });
});

describe('autorizzazioni', () => {
  it('solo l\'organizzatore modifica o annulla', () => {
    const e = E.createEvent(as('a'), input());
    expect(code(() => E.updateEvent(as('b'), e.id, input({ title: 'Hack' }), 1))).toBe('forbidden');
    expect(code(() => E.cancelEvent(as('b'), e.id))).toBe('forbidden');
  });
  it('rileva i conflitti di versione', () => {
    const e = E.createEvent(as('a'), input());
    E.updateEvent(as('a'), e.id, input({ title: 'Nuovo titolo' }), 1);
    expect(code(() => E.updateEvent(as('a'), e.id, input({ title: 'Altro' }), 1))).toBe('conflict');
  });
  it('non abbassa il limite sotto gli iscritti', () => {
    const e = E.createEvent(as('a'), input());
    E.joinEvent(as('b'), e.id);
    E.joinEvent(as('c'), e.id);
    expect(code(() => E.updateEvent(as('a'), e.id, input({ maxParticipants: 2 }), 1))).toBe('validation');
  });
  it('le uscite private sono visibili solo con il token', () => {
    const e = E.createEvent(as('a'), input({ visibility: 'private' }));
    expect(code(() => E.getEvent(as('b'), e.id))).toBe('not_found');
    expect(E.listEvents(as('b'))).toHaveLength(0);
    const tok = e.inviteToken;
    expect(tok).toBeTruthy();
    expect(E.getEvent(as('b'), e.id, tok).meetingPlace).toBe('Ingresso palestra');
    expect(E.joinEvent(as('b'), e.id, tok).viewer.isParticipant).toBe(true);
    expect(code(() => E.joinEvent(as('c'), e.id))).toBe('not_found');
    // il token non è esposto a chi non partecipa
    expect(E.getEvent(as('b'), e.id, tok).inviteToken).toBe(tok);
    expect(E.getEvent(as('c'), e.id, tok).inviteToken).toBe('');
  });
  it('le uscite di club mostrano ai non membri una vista ridotta', () => {
    const c = E.createClub(as('a'), { name: 'Palestra Forte', description: '', sport: 'running', area: '', imageDataUrl: null });
    const e = E.createEvent(as('a'), input({ visibility: 'club', clubId: c.id }));
    const v = E.getEvent(as('b'), e.id);
    expect(v.restricted).toBe(true);
    expect(v.meetingPlace).toBe('');
    expect(v.participants).toBeNull();
    expect(code(() => E.joinEvent(as('b'), e.id))).toBe('club_only');
    E.joinClub(as('b'), c.inviteCode);
    expect(E.joinEvent(as('b'), e.id).viewer.isParticipant).toBe(true);
  });
  it('non espone i partecipanti agli anonimi', () => {
    const e = E.createEvent(as('a'), input());
    expect(E.getEvent(as(null), e.id).participants).toBeNull();
    expect(E.getEvent(as('b'), e.id).participants).toHaveLength(1);
  });
  it('non si può eliminare l\'attività di un altro', () => {
    const act = E.logActivity(as('a'), { date: '2026-10-22T10:00:00Z', sport: 'running', distanceKm: 5, durationMin: 30, note: '' });
    expect(code(() => E.deleteActivity(as('b'), act.id))).toBe('forbidden');
  });
});

describe('notifiche', () => {
  it('avvisa i partecipanti per modifiche importanti e annullamenti', () => {
    const e = E.createEvent(as('a'), input());
    E.joinEvent(as('b'), e.id);
    E.updateEvent(as('a'), e.id, input({ startsAt: '2026-10-25T18:30:00.000Z' }), 1);
    E.updateEvent(as('a'), e.id, input({ startsAt: '2026-10-25T18:30:00.000Z', notes: 'nota' }), 2); // non importante
    expect(E.listNotifications(as('b')).filter((n) => n.type === 'event_updated')).toHaveLength(1);
    E.cancelEvent(as('a'), e.id);
    expect(E.listNotifications(as('b')).some((n) => n.type === 'event_cancelled')).toBe(true);
    expect(E.listNotifications(as('a')).some((n) => n.type === 'participant_joined')).toBe(true);
    expect(E.markNotificationsRead(as('b')).read).toBeGreaterThan(0);
    expect(E.getHome(as('b'), NOW.toISOString()).unreadNotifications).toBe(0);
  });
});

describe('club', () => {
  const mk = () => E.createClub(as('a'), { name: 'Palestra Forte', description: 'Corse', sport: 'running', area: 'Forlì', imageDataUrl: null });
  it('si entra con codice e si esce', () => {
    const c = mk();
    expect(c.isOwner).toBe(true);
    expect(code(() => E.joinClub(as('b'), 'XXXX-XXXX'))).toBe('not_found');
    expect(E.joinClub(as('b'), c.inviteCode.toLowerCase().replace('-', '')).memberCount).toBe(2);
    E.joinClub(as('b'), c.inviteCode);
    expect(E.getClub(as('b'), c.id).memberCount).toBe(2);
    E.leaveClub(as('b'), c.id);
    expect(code(() => E.getClub(as('b'), c.id))).toBe('not_found');
  });
  it('non rivela il codice ai non membri', () => {
    const c = mk();
    const prev = E.clubByCode(as('b'), c.inviteCode);
    expect(prev.inviteCode).toBe('');
    expect(prev.members).toBeNull();
  });
  it('trasferisce la proprietà quando il fondatore esce e scioglie il club se vuoto', () => {
    const c = mk();
    E.joinClub(as('b'), c.inviteCode);
    E.leaveClub(as('a'), c.id);
    expect(E.getClub(as('b'), c.id).isOwner).toBe(true);
    E.leaveClub(as('b'), c.id);
    expect(db.clubs[c.id]).toBeUndefined();
  });
  it('classifica trasparente e rispetta la privacy', () => {
    const c = mk();
    E.joinClub(as('b'), c.inviteCode);
    E.logActivity(as('a'), { date: '2026-10-22T10:00:00Z', sport: 'running', distanceKm: 5, durationMin: null, note: '' });
    E.logActivity(as('b'), { date: '2026-10-21T10:00:00Z', sport: 'running', distanceKm: 12, durationMin: null, note: '' });
    const since = startOfWeekIso(NOW, 'Europe/Rome');
    const lb = E.clubLeaderboard(as('a'), c.id, 'distance', since);
    expect(lb.rows.map((r) => [r.user.displayName, r.value, r.rank])).toEqual([['Bruno', 12, 1], ['Anna', 5, 2]]);
    db.users.b.privacy.shareActivity = false;
    expect(E.clubLeaderboard(as('a'), c.id, 'distance', since).rows).toHaveLength(1);
    expect(code(() => E.clubLeaderboard(as('c'), c.id, 'runs', since))).toBe('forbidden');
  });
});

describe('attività e profilo', () => {
  it('conferma la corsa solo dopo l\'inizio e una volta sola', () => {
    const e = E.createEvent(as('a'), input());
    const after = new Date('2026-10-26T00:00:00Z');
    expect(code(() => E.confirmRun(as('a'), e.id, { distanceKm: 8, durationMin: 50 }))).toBe('conflict');
    expect(E.getEvent(as('a', after), e.id).viewer.canConfirmRun).toBe(true);
    E.confirmRun(as('a', after), e.id, { distanceKm: 8, durationMin: 50 });
    expect(code(() => E.confirmRun(as('a', after), e.id, { distanceKm: 8, durationMin: 50 }))).toBe('conflict');
    expect(code(() => E.confirmRun(as('b', after), e.id, { distanceKm: 8, durationMin: 50 }))).toBe('forbidden');
    expect(E.getProfile(as('a', after)).stats?.declaredDistanceKm).toBe(8);
  });
  it('nasconde dati del profilo secondo la privacy', () => {
    E.logActivity(as('a'), { date: '2026-10-22T10:00:00Z', sport: 'running', distanceKm: 5, durationMin: null, note: '' });
    const p = E.getProfile(as('b'), 'a');
    expect(p.stats).toBeNull();
    expect(p.activities).toBeNull();
    expect(p.privacy).toBeNull();
    db.users.a.privacy.showStats = true;
    expect(E.getProfile(as('b'), 'a').stats?.completedRuns).toBe(1);
  });
  it('eliminazione account: cancella i dati e annulla le uscite future', () => {
    const e = E.createEvent(as('a'), input());
    E.joinEvent(as('b'), e.id);
    E.logActivity(as('a'), { date: '2026-10-22T10:00:00Z', sport: 'running', distanceKm: 5, durationMin: null, note: '' });
    E.deleteAccount(as('a'));
    expect(db.users.a).toBeUndefined();
    expect(Object.values(db.activities)).toHaveLength(0);
    const v = E.getEvent(as('b'), e.id);
    expect(v.status).toBe('cancelled');
    expect(v.organizer.displayName).toBe('Utente eliminato');
  });
});

describe('filtri Esplora', () => {
  it('filtra per livello, distanza e testo', () => {
    E.createEvent(as('a'), input({ title: 'Lunga', distanceKm: 15, level: 'hard', area: 'Cesena' }));
    E.createEvent(as('a'), input({ title: 'Breve', distanceKm: 5, level: 'easy' }));
    expect(E.listEvents(as(null), { level: 'hard' }).map((e) => e.title)).toEqual(['Lunga']);
    expect(E.listEvents(as(null), { maxKm: 6 }).map((e) => e.title)).toEqual(['Breve']);
    expect(E.listEvents(as(null), { areaText: 'cesena' })).toHaveLength(1);
  });
});

describe('fusi orari e validazione data', () => {
  it('converte ora locale in UTC con ora legale', () => {
    expect(zonedToUtcIso('2026-07-01', '20:00', 'Europe/Rome')).toBe('2026-07-01T18:00:00.000Z');
    expect(zonedToUtcIso('2026-12-01', '20:00', 'Europe/Rome')).toBe('2026-12-01T19:00:00.000Z');
    expect(zonedToUtcIso('2026-02-31', '20:00', 'Europe/Rome')).toBeNull();
    expect(utcToZoned('2026-07-01T18:00:00.000Z', 'Europe/Rome')).toEqual({ date: '2026-07-01', time: '20:00' });
  });
  it('rifiuta date passate e troppo lontane', () => {
    expect(validateEventInput(input({ startsAt: '2026-10-01T10:00:00Z' }), NOW).ok).toBe(false);
    expect(validateEventInput(input({ startsAt: '2029-10-01T10:00:00Z' }), NOW).ok).toBe(false);
    expect(validateEventInput(input(), NOW).ok).toBe(true);
  });
});
