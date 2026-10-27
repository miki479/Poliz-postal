import { DEFAULT_PRIVACY } from './engine.ts';
import type { DbState, RunEvent, User } from './types.ts';

/** Tutti gli elementi di esempio hanno id con prefisso "demo_" e la UI li segnala come DEMO. */
export const isDemoId = (id: string) => id.startsWith('demo_');

export function seedDemo(db: DbState, now: Date) {
  const iso = (d: Date) => d.toISOString();
  const at = (days: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };
  const people: Array<[string, string, number]> = [
    ['demo_giulia', 'Giulia (demo)', 170],
    ['demo_marco', 'Marco (demo)', 25],
    ['demo_sara', 'Sara (demo)', 300],
    ['demo_luca', 'Luca (demo)', 95],
  ];
  for (const [id, displayName, hue] of people) {
    const u: User = { id, username: id.replace('demo_', 'demo.'), avatar: null, profileCompleted: true, displayName, bio: '', hue, sports: ['running'], area: 'Forlì', privacy: { ...DEFAULT_PRIVACY }, createdAt: iso(now) };
    db.users[id] = u;
  }
  db.clubs.demo_club = {
    id: 'demo_club',
    name: 'Palestra Demo Runners',
    description: 'Club di esempio: mostra come appare un gruppo della palestra.',
    sport: 'running',
    area: 'Forlì',
    imageDataUrl: null,
    inviteCode: 'DEMO-2222',
    ownerId: 'demo_giulia',
    createdAt: iso(now),
  };
  for (const [uid, role] of [['demo_giulia', 'owner'], ['demo_marco', 'member'], ['demo_sara', 'member'], ['demo_luca', 'member']] as const) {
    db.memberships[`demo_club__${uid}`] = { id: `demo_mem_${uid}`, clubId: 'demo_club', userId: uid, role, joinedAt: iso(now) };
  }
  const mk = (id: string, over: Partial<RunEvent>): RunEvent => ({
    id,
    clubId: null,
    organizerId: 'demo_giulia',
    title: 'Uscita demo',
    sport: 'running',
    startsAt: iso(at(1, 17, 30)),
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
    routeId: null,
    status: 'active',
    inviteToken: `demotoken${id}`,
    version: 1,
    createdAt: iso(now),
    updatedAt: iso(now),
    cancelledAt: null,
    ...over,
  });
  const events: RunEvent[] = [
    mk('demo_e1', { title: 'Corsa dopo lavoro (demo)', clubId: 'demo_club', startsAt: iso(at(1, 17, 30)), meetingPlace: 'Parcheggio della palestra', notes: 'Percorso nel parco, si torna insieme.' }),
    mk('demo_e2', { title: 'Lungo della domenica (demo)', organizerId: 'demo_marco', clubId: 'demo_club', startsAt: iso(at(3, 7, 30)), distanceKm: 14, paceSecPerKm: 360, level: 'hard', maxParticipants: 6, meetingPlace: 'Piazzale della stazione' }),
    mk('demo_e3', { title: 'Camminata veloce (demo)', organizerId: 'demo_sara', sport: 'walking', startsAt: iso(at(2, 18, 0)), distanceKm: 5, paceSecPerKm: 600, level: 'easy', meetingPlace: 'Fontana in centro' }),
  ];
  for (const e of events) db.events[e.id] = e;
  const join = (e: string, u: string) => (db.participations[`${e}__${u}`] = { id: `demo_prt_${e}_${u}`, eventId: e, userId: u, joinedAt: iso(now) });
  for (const e of events) join(e.id, e.organizerId);
  join('demo_e1', 'demo_marco');
  join('demo_e1', 'demo_sara');
  join('demo_e2', 'demo_luca');
  join('demo_e3', 'demo_luca');
}
