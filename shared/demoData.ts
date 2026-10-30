/**
 * Dati di esempio per capire come appaiono le schede (storie, gruppi, community, uscite).
 * Tutto ha id con prefisso "demo_" e nome "(demo)": si carica e si toglie con un tocco, senza toccare i dati veri.
 * Le persone finte sono seguite da chi carica la demo e i loro allenamenti sono condivisi, quindi compaiono nelle storie.
 */
import { AppError, DEFAULT_PRIVACY, type Ctx } from './engine.ts';
import type { Id, RunEvent, TrackPoint, User, WorkoutLog } from './types.ts';

const P = 'demo_';
const PEOPLE: Array<{ id: string; name: string; hue: number; area: string }> = [
  { id: 'demo_giulia', name: 'Giulia Bianchi (demo)', hue: 170, area: 'Forlì' },
  { id: 'demo_marco', name: 'Marco Neri (demo)', hue: 25, area: 'Forlì' },
  { id: 'demo_sara', name: 'Sara Conti (demo)', hue: 300, area: 'Cesena' },
  { id: 'demo_luca', name: 'Luca Ferri (demo)', hue: 95, area: 'Forlì' },
  { id: 'demo_elena', name: 'Elena Rossi (demo)', hue: 210, area: 'Faenza' },
];

/** Giro ad anello di circa 3 km intorno a un punto, abbastanza lungo da mostrare la traccia (i primi e gli ultimi 300 m sono nascosti). */
function loop(lat: number, lng: number, radius: number, startMs: number, seconds: number): TrackPoint[] {
  const n = 90;
  const pts: TrackPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 1 + 0.18 * Math.sin(a * 3);
    pts.push({ lat: lat + Math.sin(a) * radius * wobble, lng: lng + (Math.cos(a) - 1) * radius * 1.35 * wobble, t: Math.round(startMs / 1000) + Math.round((i / n) * seconds) });
  }
  return pts;
}

export function loadDemoData(ctx: Ctx): { people: number; events: number; stories: number } {
  const me = ctx.actorId && ctx.db.users[ctx.actorId];
  if (!me) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const { db, now } = ctx;
  const iso = (d: Date) => d.toISOString();
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const at = (days: number, h: number, m = 0) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(h, m, 0, 0); return d; };

  for (const p of PEOPLE) {
    const u: User = { id: p.id, username: p.id.replace(P, 'demo.'), avatar: null, profileCompleted: true, displayName: p.name, bio: 'Persona di esempio per la demo.', hue: p.hue, sports: ['running'], area: p.area, privacy: { ...DEFAULT_PRIVACY }, createdAt: iso(now) };
    db.users[p.id] = u;
    const k = `${me.id}__${p.id}`;
    db.follows[k] = { id: k, fromId: me.id, toId: p.id, createdAt: iso(now) };
  }

  const clubs: Array<{ id: string; name: string; desc: string; sport: 'running' | 'walking' | 'trail'; code: string; owner: string; members: string[]; joinMe?: boolean; rules?: string; days?: number; area?: string }> = [
    { id: 'demo_club_runners', name: 'Forlì Runners (demo)', desc: 'Gruppo di esempio: uscite serali e lunghi della domenica.', sport: 'running', code: 'DEMO-RUN1', owner: 'demo_giulia', members: ['demo_giulia', 'demo_marco', 'demo_luca', 'demo_elena'] },
    { id: 'demo_club_walk', name: 'Camminate Lente (demo)', desc: 'Gruppo di esempio: passeggiate tranquille con caffè.', sport: 'walking', code: 'DEMO-WLK2', owner: 'demo_sara', members: ['demo_sara', 'demo_elena'], rules: 'Passo tranquillo, nessuno resta indietro. Si finisce sempre con un caffè.' },
    { id: 'demo_club_alba', name: 'Alba Runners (demo)', desc: 'Si corre alle 6:30, prima del lavoro, tre volte a settimana.', sport: 'running', code: 'DEMO-ALB3', owner: 'demo_giulia', members: ['demo_giulia', 'demo_sara', 'demo_marco'], joinMe: false, days: 4, area: 'Forlì', rules: 'Puntualità: si parte alle 6:30. Passo 5:30–6:00/km. Luce frontale d’inverno.' },
    { id: 'demo_club_trail', name: 'Trail Romagna (demo)', desc: 'Sentieri e colline tra Forlì e Faenza, uscite lente nel fine settimana.', sport: 'trail', code: 'DEMO-TRL4', owner: 'demo_elena', members: ['demo_elena', 'demo_luca'], joinMe: false, days: 40, area: 'Faenza', rules: 'Scarpe da trail e acqua. Si aspetta l’ultimo ai bivi.' },
  ];
  for (const c of clubs) {
    db.clubs[c.id] = { id: c.id, name: c.name, description: c.desc, sport: c.sport, area: c.area ?? 'Forlì', imageDataUrl: null, inviteCode: c.code, ownerId: c.owner, createdAt: iso(ago(24 * (c.days ?? 20))), ...(c.rules ? { rules: c.rules } : {}), discoverable: c.joinMe === false };
    for (const uid of c.joinMe === false ? c.members : [...c.members, me.id]) db.memberships[`${c.id}__${uid}`] = { id: `demo_mem_${c.id}_${uid}`, clubId: c.id, userId: uid, role: uid === c.owner ? 'owner' : 'member', joinedAt: iso(ago(24 * 10)) };
  }

  const mk = (id: string, over: Partial<RunEvent>): RunEvent => ({
    id, clubId: null, organizerId: 'demo_giulia', title: 'Uscita (demo)', sport: 'running', startsAt: iso(at(1, 17, 30)), timezone: 'Europe/Rome',
    meetingPlace: 'Ingresso del parco', area: 'Forlì', lat: null, lng: null, distanceKm: 8, paceSecPerKm: 330, level: 'medium', notes: '', maxParticipants: null,
    visibility: 'public', routeId: null, status: 'active', inviteToken: `demotoken${id}`, version: 1, createdAt: iso(ago(5)), updatedAt: iso(ago(5)), cancelledAt: null, ...over,
  });
  const events: RunEvent[] = [
    mk('demo_e1', { title: 'Corsa dopo lavoro (demo)', clubId: 'demo_club_runners', startsAt: iso(at(1, 17, 30)), meetingPlace: 'Parcheggio della palestra', notes: 'Giro nel parco, si torna insieme.' }),
    mk('demo_e2', { title: 'Lungo della domenica (demo)', organizerId: 'demo_marco', clubId: 'demo_club_runners', startsAt: iso(at(3, 7, 30)), distanceKm: 14, paceSecPerKm: 360, level: 'hard', maxParticipants: 6, meetingPlace: 'Piazzale della stazione', createdAt: iso(ago(30)) }),
    mk('demo_e3', { title: 'Caffè e camminata lenta (demo)', organizerId: 'demo_sara', clubId: 'demo_club_walk', sport: 'walking', startsAt: iso(at(2, 9, 0)), distanceKm: 4, paceSecPerKm: 660, level: 'easy', meetingPlace: 'Fontana in centro', createdAt: iso(ago(8)) }),
    mk('demo_e4', { title: 'Ripetute in pista (demo)', organizerId: 'demo_luca', startsAt: iso(at(4, 18, 30)), distanceKm: 6, paceSecPerKm: 280, level: 'hard', meetingPlace: 'Pista di atletica', createdAt: iso(ago(12)) }),
    mk('demo_e5', { title: 'Trail al tramonto (demo)', organizerId: 'demo_elena', sport: 'trail', startsAt: iso(at(5, 17, 0)), distanceKm: 10, paceSecPerKm: 420, level: 'medium', meetingPlace: 'Inizio sentiero', area: 'Faenza', createdAt: iso(ago(3)) }),
  ];
  for (const e of events) {
    db.events[e.id] = e;
    db.participations[`${e.id}__${e.organizerId}`] = { id: `demo_prt_${e.id}_${e.organizerId}`, eventId: e.id, userId: e.organizerId, joinedAt: e.createdAt };
  }
  const join = (e: string, u: string) => { db.participations[`${e}__${u}`] = { id: `demo_prt_${e}_${u}`, eventId: e, userId: u, joinedAt: iso(ago(2)) }; };
  join('demo_e1', 'demo_marco'); join('demo_e1', 'demo_luca'); join('demo_e1', 'demo_elena'); join('demo_e2', 'demo_luca'); join('demo_e3', 'demo_elena'); join('demo_e5', 'demo_giulia');

  // Allenamenti condivisi con percorso: sono le "storie" in cima alla Home.
  const stories: Array<{ id: string; user: string; title: string; km: number; min: number; hoursAgo: number; lat: number; lng: number; r: number; trace: boolean }> = [
    { id: 'demo_w1', user: 'demo_giulia', title: 'Giro del parco', km: 6.2, min: 33, hoursAgo: 2, lat: 44.2227, lng: 12.0407, r: 0.0042, trace: true },
    { id: 'demo_w2', user: 'demo_giulia', title: 'Defaticamento', km: 2.4, min: 15, hoursAgo: 20, lat: 44.2227, lng: 12.0407, r: 0.0016, trace: true },
    { id: 'demo_w3', user: 'demo_marco', title: 'Lungo sul fiume', km: 12.5, min: 66, hoursAgo: 6, lat: 44.2101, lng: 12.0502, r: 0.0075, trace: true },
    { id: 'demo_w4', user: 'demo_sara', title: 'Camminata del mattino', km: 4.1, min: 52, hoursAgo: 11, lat: 44.1391, lng: 12.2464, r: 0.0026, trace: false },
    { id: 'demo_w5', user: 'demo_luca', title: 'Ripetute 6 × 400', km: 7.0, min: 38, hoursAgo: 30, lat: 44.2188, lng: 12.0356, r: 0.0046, trace: true },
    { id: 'demo_w6', user: 'demo_elena', title: 'Prima uscita con il gruppo', km: 5.0, min: 31, hoursAgo: 40, lat: 44.2899, lng: 11.8800, r: 0.0034, trace: false },
  ];
  for (const s of stories) {
    const started = ago(s.hoursAgo + s.min / 60);
    const log: WorkoutLog = {
      id: s.id, userId: s.user, plannedSessionId: null, kind: 'run_easy', title: s.title, startedAt: iso(started), durationSec: s.min * 60,
      distanceKm: s.km, paceSecPerKm: Math.round((s.min * 60) / s.km), rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null,
      shared: true, traceShared: s.trace, sport: s.id === 'demo_w4' ? 'walking' : 'running', environment: 'outdoor', distanceSource: 'gps', origin: 'app',
      track: s.trace ? loop(s.lat, s.lng, s.r, started.getTime(), s.min * 60) : null, createdAt: iso(ago(s.hoursAgo)), updatedAt: iso(ago(s.hoursAgo)),
    };
    db.workoutLogs[s.id] = log;
  }

  // Qualche scintilla e un commento, per vedere i conteggi.
  for (const [item, uid] of [['w_demo_w1', 'demo_marco'], ['w_demo_w1', 'demo_luca'], ['w_demo_w3', 'demo_giulia']] as const) db.sparks[`${item}__${uid}`] = { id: `${item}__${uid}`, itemId: item, userId: uid, createdAt: iso(ago(1)) };
  db.comments.demo_c1 = { id: 'demo_c1', itemId: 'w_demo_w1', userId: 'demo_marco', text: 'Bel ritmo! Domenica ci vediamo al lungo?', createdAt: iso(ago(1)) };
  return { people: PEOPLE.length, events: events.length, stories: stories.length };
}

/**
 * Toglie la demo a chi la rimuove. Persone, gruppi e uscite di esempio sono condivisi tra gli account che li hanno caricati:
 * se qualcun altro li sta ancora usando, vengono tolte solo le relazioni di chi rimuove (segui, gruppi, iscrizioni, scintille).
 */
export function clearDemoData(ctx: Ctx): { removed: number; shared: boolean } {
  const uid = ctx.actorId;
  if (!uid || !ctx.db.users[uid]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const { db } = ctx;
  const demo = (id: Id) => id.startsWith(P);
  let removed = 0;
  const mine = (k: string) => k.startsWith(`${uid}__`) || k.endsWith(`__${uid}`);
  for (const key of ['memberships', 'participations', 'follows', 'sparks'] as const) {
    const t = db[key] as Record<string, { id: string }>;
    for (const k of Object.keys(t)) if (k.includes(P) && mine(k)) { delete t[k]; removed++; }
  }
  // Qualcun altro usa ancora la demo? (segue persone di esempio o è in un gruppo di esempio)
  const othersUse = Object.values(db.follows).some((f) => demo(f.toId) && f.fromId !== uid)
    || Object.values(db.memberships).some((m) => demo(m.clubId) && !demo(m.userId) && m.userId !== uid);
  if (othersUse) return { removed, shared: true };
  for (const key of ['users', 'clubs', 'events', 'workoutLogs', 'comments', 'notifications'] as const) {
    const t = db[key] as Record<string, { id: string }>;
    for (const id of Object.keys(t)) if (demo(id)) { delete t[id]; removed++; }
  }
  for (const key of ['memberships', 'participations', 'follows', 'sparks'] as const) {
    const t = db[key] as Record<string, { id: string }>;
    for (const k of Object.keys(t)) if (k.includes(P) || demo(t[k].id)) { delete t[k]; removed++; }
  }
  return { removed, shared: false };
}

export const demoMethods = { loadDemoData, clearDemoData } as const;
