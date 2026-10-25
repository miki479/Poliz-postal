import { describe, expect, it } from 'vitest';
import { computeBadges } from '../shared/badges.ts';
import { emptyDb } from '../shared/engine.ts';
import { validateProfileInput } from '../shared/validation.ts';
import type { Activity, DbState } from '../shared/types.ts';

function act(db: DbState, id: string, date: string, km: number | null, over: Partial<Activity> = {}) {
  db.activities[id] = { id, userId: 'u', source: 'manual', eventId: null, externalId: null, sport: 'running', title: '', date, dayOnly: false, distanceKm: km, durationMin: 30, note: '', visibility: 'shared', planSessionId: null, importedAt: null, createdAt: date, updatedAt: date, ...over };
}
const byId = (db: DbState) => Object.fromEntries(computeBadges(db, 'u', new Date('2026-10-24T00:00:00Z')).map((b) => [b.id, b]));

describe('distintivi calcolati dal server', () => {
  it('utente senza dati: nessun distintivo, avanzamenti a zero dove calcolabili, mai premi inventati', () => {
    const b = byId(emptyDb());
    expect(Object.values(b).every((x) => !x.earned && x.earnedAt === null)).toBe(true);
    expect(b.km_10.progress).toBe(0);
    expect(b.first_group_run.progress).toBeNull(); // criterio sì/no: nessuna percentuale finta
  });

  it('soglie di distanza con data reale di raggiungimento e costanza su settimane consecutive', () => {
    const db = emptyDb();
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-12'];
    weeks.forEach((d, i) => act(db, 'a' + i, d + 'T07:00:00.000Z', 3));
    const b = byId(db);
    expect(b.km_10.earned).toBe(true);
    expect(b.km_10.earnedAt).toBe('2026-09-28T07:00:00.000Z'); // 3+3+3+3 = 12 km alla quarta
    expect(b.km_50.earned).toBe(false);
    expect(b.km_50.current).toBe(15);
    expect(b.km_50.progress).toBeCloseTo(0.3);
    expect(b.streak_4.earned).toBe(true);
    expect(b.streak_4.earnedAt).toBe('2026-09-28T07:00:00.000Z');
    expect(b.streak_12.current).toBe(4);
  });

  it('partecipazione e organizzazione: uscite svolte e non annullate', () => {
    const db = emptyDb();
    const ev = (id: string, startsAt: string, status: 'active' | 'cancelled', clubId: string | null = null) => {
      db.events[id] = { id, clubId, organizerId: 'u', title: 'x', sport: 'running', startsAt, timezone: 'Europe/Rome', meetingPlace: '', area: '', lat: null, lng: null, distanceKm: 5, paceSecPerKm: null, level: 'easy', notes: '', maxParticipants: null, visibility: 'public', routeId: null, status, inviteToken: 't', version: 1, createdAt: startsAt, updatedAt: startsAt, cancelledAt: null };
    };
    ev('e1', '2026-10-01T07:00:00.000Z', 'cancelled');
    ev('e2', '2026-10-05T07:00:00.000Z', 'active', 'c1');
    ev('e3', '2026-11-05T07:00:00.000Z', 'active'); // futura: non ancora svolta
    act(db, 'r1', '2026-10-05T08:00:00.000Z', 5, { source: 'event', eventId: 'e2' });
    const b = byId(db);
    expect(b.first_organized.earnedAt).toBe('2026-10-05T07:00:00.000Z');
    expect(b.organizer_5.current).toBe(1);
    expect(b.first_group_run.earned).toBe(true);
    expect(b.club_regular.current).toBe(1);
  });
});

describe('personalizzazione del profilo', () => {
  const base = { displayName: 'Miki', username: 'miki', avatar: null, bio: '', sports: ['running' as const], area: '', privacy: { showStats: true, showClubs: true, showUpcoming: true, shareActivity: true } };
  it('accetta solo valori curati e al massimo 3 distintivi', () => {
    const ok = validateProfileInput({ ...base, style: { accent: 'violet', frame: 'ring', featuredBadges: ['km_10', 'km_10', 'streak_4'] } });
    expect(ok.ok && ok.value.style).toEqual({ accent: 'violet', frame: 'ring', featuredBadges: ['km_10', 'streak_4'] });
    expect(validateProfileInput({ ...base, style: { accent: '#ff00ff' as never, frame: 'ring', featuredBadges: [] } }).ok).toBe(false);
    expect(validateProfileInput({ ...base, style: { accent: 'teal', frame: 'none', featuredBadges: ['a1', 'b2', 'c3', 'd4'] } }).ok).toBe(false);
    // senza style lo stile salvato non viene toccato
    const keep = validateProfileInput(base);
    expect(keep.ok && 'style' in keep.value).toBe(false);
  });
});
