/**
 * Motore delle regole di business. È l'UNICA implementazione: la usano sia il server
 * (autoritativo) sia la modalità demo locale. Le funzioni sono sincrone, quindi ogni
 * operazione è atomica: due richieste per l'ultimo posto vengono serializzate.
 */
import { newId, newInviteCode, newToken, normalizeInviteCode } from './ids.ts';
import { haversineKm } from './time.ts';
import { findDuplicate, newActivity } from './activities.ts';
import { computeBadges } from './badges.ts';
import type {
  Activity,
  ActivityInput,
  Club,
  ClubInput,
  ClubView,
  DbState,
  EventInput,
  EventQuery,
  EventView,
  FeedItem,
  HomeView,
  Id,
  JoinBlock,
  Leaderboard,
  LeaderboardMetric,
  Me,
  Notification,
  NotificationType,
  PrivacySettings,
  ProfileInput,
  ProfileView,
  BadgeView,
  RunEvent,
  Stats,
  User,
  UserPublic,
} from './types.ts';
import {
  type FieldErrors,
  validateActivityInput,
  validateClubInput,
  validateEventInput,
  validateProfileInput,
  DEFAULT_STYLE,
} from './validation.ts';

export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'full'
  | 'past'
  | 'cancelled'
  | 'club_only'
  | 'rate_limited'
  | 'unavailable'
  | 'quota'
  | 'bad_request';

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  full: 409,
  past: 409,
  cancelled: 409,
  club_only: 403,
  rate_limited: 429,
  unavailable: 503,
  quota: 429,
  bad_request: 400,
};

export class AppError extends Error {
  code: ErrorCode;
  fields: FieldErrors | undefined;
  status: number;
  constructor(code: ErrorCode, message: string, fields?: FieldErrors) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
    this.status = STATUS[code];
  }
}

export interface Ctx {
  db: DbState;
  now: Date;
  actorId: Id | null;
  /** Impostato quando una chiamata di sola lettura ha comunque modificato i dati (es. chiusura sfide). */
  dirty?: boolean;
  /** Cache per-richiesta degli indici. */
  cache?: { counts?: Map<Id, number> };
}

export function emptyDb(): DbState {
  return {
    schema: 1,
    users: {},
    clubs: {},
    memberships: {},
    events: {},
    participations: {},
    activities: {},
    notifications: {},
    challenges: {},
    challengeParticipants: {},
    routes: {},
    routeFavorites: {},
    plans: {},
    sessions: {},
    workoutLogs: {},
    routines: {},
    checkins: {},
    planStates: {},
    planChanges: {},
    goals: {},
    recognitions: {},
    recognitionRounds: {},
    reports: {},
    clubInvites: {},
    follows: {},
    sparks: {},
    comments: {},
  };
}

export const DEFAULT_PRIVACY: PrivacySettings = { showStats: false, showClubs: true, showUpcoming: true, shareActivity: true };

const MAX_CLUBS_OWNED = 10;
const MAX_ACTIVE_EVENTS_ORGANIZED = 30;

/* ---------- helpers ---------- */

const iso = (d: Date) => d.toISOString();
const mKey = (clubId: Id, userId: Id) => `${clubId}__${userId}`;
const pKey = (eventId: Id, userId: Id) => `${eventId}__${userId}`;

function requireActor(ctx: Ctx): User {
  const u = ctx.actorId ? ctx.db.users[ctx.actorId] : undefined;
  if (!u) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return u;
}

const DELETED_USER: UserPublic = { id: 'deleted', displayName: 'Utente eliminato', hue: 210, avatar: null };

/** Distintivi di un utente: completi per sé stessi; per gli altri solo se mostrano le statistiche. */
export function listBadges(ctx: Ctx, userId?: Id | null): BadgeView[] | null {
  const actor = requireActor(ctx);
  const target = ctx.db.users[userId ?? actor.id];
  if (!target) throw new AppError('not_found', 'Profilo non trovato.');
  if (target.id !== actor.id && !target.privacy.showStats) return null;
  const all = computeBadges(ctx.db, target.id, ctx.now);
  // Per gli altri: solo i distintivi ottenuti, senza avanzamenti parziali.
  return target.id === actor.id ? all : all.filter((b) => b.earned);
}

export function toPublic(db: DbState, id: Id): UserPublic {
  const u = db.users[id];
  return u ? { id: u.id, displayName: u.displayName, hue: u.hue, avatar: u.avatar ?? null } : DELETED_USER;
}

export function isMember(db: DbState, clubId: Id | null, userId: Id | null): boolean {
  return !!clubId && !!userId && !!db.memberships[mKey(clubId, userId)];
}

function isParticipant(db: DbState, eventId: Id, userId: Id | null): boolean {
  return !!userId && !!db.participations[pKey(eventId, userId)];
}

function participantIds(db: DbState, eventId: Id): Id[] {
  return Object.values(db.participations)
    .filter((p) => p.eventId === eventId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((p) => p.userId);
}

function counts(ctx: Ctx): Map<Id, number> {
  ctx.cache ??= {};
  if (!ctx.cache.counts) {
    const m = new Map<Id, number>();
    for (const p of Object.values(ctx.db.participations)) m.set(p.eventId, (m.get(p.eventId) ?? 0) + 1);
    ctx.cache.counts = m;
  }
  return ctx.cache.counts;
}

function userClubIds(db: DbState, userId: Id | null): Set<Id> {
  const out = new Set<Id>();
  if (!userId) return out;
  for (const m of Object.values(db.memberships)) if (m.userId === userId) out.add(m.clubId);
  return out;
}

export function notify(ctx: Ctx, userId: Id, type: NotificationType, text: string, ref: { eventId?: Id; clubId?: Id; challengeId?: Id }) {
  const n: Notification = {
    id: newId('ntf'),
    userId,
    type,
    text,
    eventId: ref.eventId ?? null,
    clubId: ref.clubId ?? null,
    challengeId: ref.challengeId ?? null,
    createdAt: iso(ctx.now),
    readAt: null,
  };
  ctx.db.notifications[n.id] = n;
  // Conserva al massimo 100 notifiche per utente.
  const mine = Object.values(ctx.db.notifications).filter((x) => x.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const old of mine.slice(100)) delete ctx.db.notifications[old.id];
}

/** Chi può vedere i dettagli completi di un'uscita. */
function canViewFull(ctx: Ctx, e: RunEvent, token?: string | null): boolean {
  const { db, actorId } = ctx;
  if (actorId && (e.organizerId === actorId || isParticipant(db, e.id, actorId))) return true;
  if (e.visibility === 'public') return true;
  if (e.visibility === 'club') return isMember(db, e.clubId, actorId);
  return !!token && token === e.inviteToken;
}

function joinBlock(ctx: Ctx, e: RunEvent, restricted: boolean): JoinBlock | null {
  const { actorId, now, db } = ctx;
  if (e.status === 'cancelled') return 'cancelled';
  if (Date.parse(e.startsAt) < now.getTime()) return 'past';
  if (!actorId) return 'login';
  if (e.organizerId === actorId) return 'organizer';
  if (isParticipant(db, e.id, actorId)) return null;
  if (restricted || (e.visibility === 'club' && !isMember(db, e.clubId, actorId))) return 'club_only';
  const max = e.maxParticipants;
  if (max !== null && (counts(ctx).get(e.id) ?? 0) >= max) return 'full';
  return null;
}

function eventView(ctx: Ctx, e: RunEvent, token?: string | null): EventView {
  const { db, actorId, now } = ctx;
  const full = canViewFull(ctx, e, token);
  const count = counts(ctx).get(e.id) ?? 0;
  const club = e.clubId && db.clubs[e.clubId] ? { id: e.clubId, name: db.clubs[e.clubId].name } : null;
  const isOrganizer = !!actorId && e.organizerId === actorId;
  const isPart = isParticipant(db, e.id, actorId);
  const isPast = Date.parse(e.startsAt) < now.getTime();
  const blk = joinBlock(ctx, e, !full);
  const showToken = e.visibility === 'private' && (isOrganizer || isPart);
  const hasConfirmed = !!actorId && Object.values(db.activities).some((a) => a.userId === actorId && a.eventId === e.id);
  const r = full && e.routeId ? db.routes[e.routeId] : undefined;
  const base: EventView = {
    ...e,
    route: r ? { id: r.id, name: r.name, startName: r.startName, endName: r.endName, distanceKm: r.distanceKm } : null,
    inviteToken: showToken ? e.inviteToken : '',
    organizer: toPublic(db, e.organizerId),
    club,
    participantCount: count,
    spotsLeft: e.maxParticipants === null ? null : Math.max(0, e.maxParticipants - count),
    isFull: e.maxParticipants !== null && count >= e.maxParticipants,
    isPast,
    restricted: !full,
    participants: full && actorId ? participantIds(db, e.id).map((id) => toPublic(db, id)) : null,
    viewer: {
      isOrganizer,
      isParticipant: isPart,
      canJoin: blk === null && !isPart,
      joinBlock: isPart ? null : blk,
      canConfirmRun: isPart && isPast && e.status === 'active' && !hasConfirmed,
      hasConfirmedRun: hasConfirmed,
    },
  };
  if (!full) {
    base.meetingPlace = '';
    base.notes = '';
    base.lat = null;
    base.lng = null;
  }
  return base;
}

function getEventOrThrow(ctx: Ctx, id: unknown): RunEvent {
  const e = typeof id === 'string' ? ctx.db.events[id] : undefined;
  if (!e) throw new AppError('not_found', 'Uscita non trovata.');
  return e;
}

/** L'uscita esiste per questo utente? (privata senza accesso = come se non esistesse). */
function visibleExists(ctx: Ctx, e: RunEvent, token?: string | null): boolean {
  if (canViewFull(ctx, e, token)) return true;
  return e.visibility === 'club'; // vista ridotta consentita per i link ai club
}

/* ---------- utenti ---------- */

export function usernameAvailable(db: DbState, username: string, exceptUserId?: Id): boolean {
  return !Object.values(db.users).some((u) => u.username === username && u.id !== exceptUserId);
}

/** Propone uno username libero a partire da un testo qualsiasi (es. la parte locale dell'email). */
export function suggestUsername(db: DbState, base: string): string {
  let b = base.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 14);
  if (b.length < 3) b = `${b}runner`.slice(0, 14);
  if (usernameAvailable(db, b)) return b;
  for (let i = 0; i < 50; i++) {
    const c = `${b}${Math.floor(1000 + Math.random() * 9000)}`;
    if (usernameAvailable(db, c)) return c;
  }
  return `${b}${Date.now().toString(36)}`.slice(0, 20);
}

export function createUser(db: DbState, now: Date, p: { displayName: string; username: string; hue: number; profileCompleted: boolean; sports?: User['sports']; area?: string; avatar?: string | null }): User {
  const u: User = {
    id: newId('usr'),
    username: p.username,
    displayName: p.displayName,
    avatar: p.avatar ?? null,
    profileCompleted: p.profileCompleted,
    setup: { version: 1, step: 0, completedAt: null, weightKg: null, heightCm: null, groupMatching: false, heatmapConsent: false },
    bio: '',
    hue: p.hue,
    sports: p.sports ?? ['running'],
    area: p.area ?? '',
    privacy: { ...DEFAULT_PRIVACY },
    createdAt: iso(now),
  };
  db.users[u.id] = u;
  return u;
}

/* ---------- sessione ---------- */

export function me(ctx: Ctx): Me | null {
  return ctx.actorId ? (ctx.db.users[ctx.actorId] ?? null) : null;
}

/** Un percorso si può associare a un'uscita se è tuo, pubblico o tra i tuoi preferiti. */
function assertRouteUsable(ctx: Ctx, routeId: Id | null, userId: Id) {
  if (!routeId) return;
  const r = ctx.db.routes[routeId];
  const ok = !!r && (r.ownerId === userId || r.visibility === 'public' || !!ctx.db.routeFavorites[`${routeId}__${userId}`]);
  if (!ok) throw new AppError('validation', 'Percorso non disponibile.', { routeId: 'Percorso non disponibile.' });
}

/* ---------- eventi ---------- */

export function listEvents(ctx: Ctx, query?: EventQuery | null): EventView[] {
  const q: EventQuery = query && typeof query === 'object' ? query : {};
  const { db, actorId, now } = ctx;
  const myClubs = userClubIds(db, actorId);
  const scope = q.scope ?? 'all';
  const text = q.areaText?.trim().toLowerCase() ?? '';
  const out: EventView[] = [];
  for (const e of Object.values(db.events)) {
    const mine = !!actorId && (e.organizerId === actorId || isParticipant(db, e.id, actorId));
    const clubVisible = e.clubId !== null && myClubs.has(e.clubId);
    const discoverable = e.visibility === 'public' || (e.visibility === 'club' && clubVisible) || mine;
    if (!discoverable) continue;
    if (scope === 'mine' && !mine) continue;
    if (scope === 'clubs' && !clubVisible) continue;
    const past = Date.parse(e.startsAt) < now.getTime();
    if (past && !q.includePast) continue;
    if (e.status === 'cancelled' && !(mine && scope === 'mine')) continue;
    if (q.sport && e.sport !== q.sport) continue;
    if (q.level && e.level !== q.level) continue;
    if (q.from && e.startsAt < q.from) continue;
    if (q.to && e.startsAt >= q.to) continue;
    if (q.minKm != null && (e.distanceKm === null || e.distanceKm < q.minKm)) continue;
    if (q.maxKm != null && (e.distanceKm === null || e.distanceKm > q.maxKm)) continue;
    if (text && !`${e.area} ${e.meetingPlace} ${e.title}`.toLowerCase().includes(text)) continue;
    out.push(eventView(ctx, e));
  }
  out.sort((a, b) => (q.includePast ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
  return out.slice(0, 200);
}

export function getEvent(ctx: Ctx, id: Id, token?: string | null): EventView {
  const e = getEventOrThrow(ctx, id);
  if (!visibleExists(ctx, e, token)) throw new AppError('not_found', 'Uscita non trovata o non accessibile.');
  return eventView(ctx, e, token);
}

export function createEvent(ctx: Ctx, input: EventInput): EventView {
  const actor = requireActor(ctx);
  const v = validateEventInput(input, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const data = v.value;
  if (data.clubId) {
    if (!ctx.db.clubs[data.clubId]) throw new AppError('validation', 'Club non trovato.', { clubId: 'Club non trovato.' });
    if (!isMember(ctx.db, data.clubId, actor.id)) throw new AppError('forbidden', 'Puoi organizzare uscite solo nei club di cui fai parte.');
  }
  const activeOrganized = Object.values(ctx.db.events).filter(
    (e) => e.organizerId === actor.id && e.status === 'active' && Date.parse(e.startsAt) >= ctx.now.getTime(),
  ).length;
  if (activeOrganized >= MAX_ACTIVE_EVENTS_ORGANIZED) throw new AppError('conflict', 'Hai raggiunto il numero massimo di uscite attive.');

  assertRouteUsable(ctx, data.routeId, actor.id);
  const e: RunEvent = {
    id: newId('evt'),
    ...data,
    organizerId: actor.id,
    status: 'active',
    inviteToken: newToken(),
    version: 1,
    createdAt: iso(ctx.now),
    updatedAt: iso(ctx.now),
    cancelledAt: null,
  };
  ctx.db.events[e.id] = e;
  ctx.db.participations[pKey(e.id, actor.id)] = { id: newId('prt'), eventId: e.id, userId: actor.id, joinedAt: iso(ctx.now) };
  ctx.cache = undefined;
  return eventView(ctx, e);
}

export function updateEvent(ctx: Ctx, id: Id, input: EventInput, expectedVersion: number): EventView {
  const actor = requireActor(ctx);
  const e = getEventOrThrow(ctx, id);
  if (e.organizerId !== actor.id) throw new AppError('forbidden', 'Solo chi ha organizzato l\'uscita può modificarla.');
  if (e.status === 'cancelled') throw new AppError('cancelled', 'L\'uscita è stata annullata.');
  if (Date.parse(e.startsAt) < ctx.now.getTime()) throw new AppError('past', 'Non puoi modificare un\'uscita già iniziata.');
  if (expectedVersion !== e.version)
    throw new AppError('conflict', 'L\'uscita è stata modificata nel frattempo. Ricarica la pagina e riprova.');
  const v = validateEventInput(input, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const data = v.value;
  const count = counts(ctx).get(e.id) ?? 0;
  if (data.maxParticipants !== null && data.maxParticipants < count)
    throw new AppError('validation', 'Il limite è inferiore ai partecipanti già iscritti.', {
      maxParticipants: `Ci sono già ${count} iscritti: scegli almeno ${count}.`,
    });
  if (data.clubId && (!ctx.db.clubs[data.clubId] || !isMember(ctx.db, data.clubId, actor.id)))
    throw new AppError('forbidden', 'Puoi usare solo i club di cui fai parte.');
  assertRouteUsable(ctx, data.routeId, actor.id);

  const important = data.startsAt !== e.startsAt || data.meetingPlace !== e.meetingPlace || data.area !== e.area;
  Object.assign(e, data, { version: e.version + 1, updatedAt: iso(ctx.now) });
  if (important) {
    for (const uid of participantIds(ctx.db, e.id)) {
      if (uid !== actor.id) notify(ctx, uid, 'event_updated', `"${e.title}": data, ora o luogo sono cambiati. Controlla i dettagli.`, { eventId: e.id });
    }
  }
  ctx.cache = undefined;
  return eventView(ctx, e);
}

function cancelInternal(ctx: Ctx, e: RunEvent, reason: string) {
  e.status = 'cancelled';
  e.cancelledAt = iso(ctx.now);
  e.version += 1;
  e.updatedAt = iso(ctx.now);
  for (const uid of participantIds(ctx.db, e.id)) {
    if (uid !== e.organizerId) notify(ctx, uid, 'event_cancelled', `"${e.title}" è stata annullata${reason}.`, { eventId: e.id });
  }
}

export function cancelEvent(ctx: Ctx, id: Id): EventView {
  const actor = requireActor(ctx);
  const e = getEventOrThrow(ctx, id);
  if (e.organizerId !== actor.id) throw new AppError('forbidden', 'Solo chi ha organizzato l\'uscita può annullarla.');
  if (e.status === 'cancelled') return eventView(ctx, e);
  if (Date.parse(e.startsAt) < ctx.now.getTime()) throw new AppError('past', 'L\'uscita è già iniziata.');
  cancelInternal(ctx, e, '');
  return eventView(ctx, e);
}

export function joinEvent(ctx: Ctx, id: Id, token?: string | null): EventView {
  const actor = requireActor(ctx);
  const e = getEventOrThrow(ctx, id);
  if (!visibleExists(ctx, e, token)) throw new AppError('not_found', 'Uscita non trovata o non accessibile.');
  // Idempotente: già iscritto = nessuna doppia iscrizione, nessun errore.
  if (isParticipant(ctx.db, e.id, actor.id)) return eventView(ctx, e, token);
  if (e.status === 'cancelled') throw new AppError('cancelled', 'Questa uscita è stata annullata.');
  if (Date.parse(e.startsAt) < ctx.now.getTime()) throw new AppError('past', 'Questa uscita è già iniziata.');
  if (e.visibility === 'club' && !isMember(ctx.db, e.clubId, actor.id))
    throw new AppError('club_only', 'Questa uscita è riservata ai membri del club.');
  const count = counts(ctx).get(e.id) ?? 0;
  if (e.maxParticipants !== null && count >= e.maxParticipants) throw new AppError('full', 'L\'uscita è al completo.');
  ctx.db.participations[pKey(e.id, actor.id)] = { id: newId('prt'), eventId: e.id, userId: actor.id, joinedAt: iso(ctx.now) };
  ctx.cache = undefined;
  notify(ctx, e.organizerId, 'participant_joined', `${actor.displayName} partecipa a "${e.title}".`, { eventId: e.id });
  return eventView(ctx, e, token);
}

export function leaveEvent(ctx: Ctx, id: Id): EventView {
  const actor = requireActor(ctx);
  const e = getEventOrThrow(ctx, id);
  if (e.organizerId === actor.id) throw new AppError('forbidden', 'Sei l\'organizzatore: per non partecipare devi annullare l\'uscita.');
  if (!isParticipant(ctx.db, e.id, actor.id)) return eventView(ctx, e);
  if (Date.parse(e.startsAt) < ctx.now.getTime()) throw new AppError('past', 'L\'uscita è già iniziata.');
  delete ctx.db.participations[pKey(e.id, actor.id)];
  ctx.cache = undefined;
  return eventView(ctx, e);
}

export function confirmRun(ctx: Ctx, id: Id, input: { distanceKm: number | null; durationMin: number | null }): Activity {
  const actor = requireActor(ctx);
  const e = getEventOrThrow(ctx, id);
  if (!isParticipant(ctx.db, e.id, actor.id)) throw new AppError('forbidden', 'Non eri iscritto a questa uscita.');
  if (e.status === 'cancelled') throw new AppError('cancelled', 'L\'uscita è stata annullata.');
  if (Date.parse(e.startsAt) > ctx.now.getTime()) throw new AppError('conflict', 'L\'uscita non è ancora iniziata.');
  if (Object.values(ctx.db.activities).some((a) => a.userId === actor.id && a.eventId === e.id))
    throw new AppError('conflict', 'Hai già registrato questa uscita.');
  const v = validateActivityInput({ date: e.startsAt, sport: e.sport, distanceKm: input?.distanceKm ?? null, durationMin: input?.durationMin ?? null, note: '' }, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const dup = findDuplicate(ctx.db, { userId: actor.id, sport: e.sport, date: e.startsAt, dayOnly: false, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin });
  if (dup) throw new AppError('conflict', 'Hai già un\'attività simile nello storico (anche importata): non serve registrarla di nuovo.');
  const a = newActivity(ctx.now, { userId: actor.id, source: 'event', eventId: e.id, sport: e.sport, title: e.title, date: v.value.date, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin });
  ctx.db.activities[a.id] = a;
  return a;
}

/* ---------- club ---------- */

function clubView(ctx: Ctx, c: Club, asPreview: boolean): ClubView {
  const { db, actorId } = ctx;
  const member = isMember(db, c.id, actorId);
  const memberships = Object.values(db.memberships)
    .filter((m) => m.clubId === c.id)
    .sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === 'owner' ? -1 : 1));
  return {
    ...c,
    inviteCode: member ? c.inviteCode : '',
    memberCount: memberships.length,
    isMember: member,
    isOwner: !!actorId && c.ownerId === actorId,
    members: member && !asPreview ? memberships.map((m) => ({ ...toPublic(db, m.userId), role: m.role })) : null,
    upcomingEvents: member
      ? listEvents(ctx, { scope: 'clubs' }).filter((e) => e.clubId === c.id)
      : [],
  };
}

export function listMyClubs(ctx: Ctx): ClubView[] {
  requireActor(ctx);
  const ids = userClubIds(ctx.db, ctx.actorId);
  return [...ids].map((id) => clubView(ctx, ctx.db.clubs[id], true)).sort((a, b) => a.name.localeCompare(b.name));
}

export function getClub(ctx: Ctx, id: Id, code?: string | null): ClubView {
  const c = ctx.db.clubs[id];
  if (!c) throw new AppError('not_found', 'Club non trovato.');
  const member = isMember(ctx.db, c.id, ctx.actorId);
  if (!member && (!code || normalizeInviteCode(code) !== c.inviteCode)) throw new AppError('not_found', 'Club non trovato.');
  const view = clubView(ctx, c, false);
  if (!member) view.inviteCode = '';
  return view;
}

export function clubByCode(ctx: Ctx, code: string): ClubView {
  const norm = normalizeInviteCode(String(code ?? ''));
  const c = Object.values(ctx.db.clubs).find((x) => x.inviteCode === norm);
  if (!c) throw new AppError('not_found', 'Codice non valido. Controlla di averlo scritto correttamente.');
  return clubView(ctx, c, true);
}

export function createClub(ctx: Ctx, input: ClubInput): ClubView {
  const actor = requireActor(ctx);
  const v = validateClubInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const owned = Object.values(ctx.db.clubs).filter((c) => c.ownerId === actor.id).length;
  if (owned >= MAX_CLUBS_OWNED) throw new AppError('conflict', 'Hai raggiunto il numero massimo di club creati.');
  const c: Club = { id: newId('clb'), ...v.value, inviteCode: newInviteCode(), ownerId: actor.id, createdAt: iso(ctx.now) };
  ctx.db.clubs[c.id] = c;
  ctx.db.memberships[mKey(c.id, actor.id)] = { id: newId('mem'), clubId: c.id, userId: actor.id, role: 'owner', joinedAt: iso(ctx.now) };
  return clubView(ctx, c, false);
}

/** Aggiunge una persona a un club (se non c'è già) e avvisa il fondatore. Usato da codice invito e inviti tra amici. */
export function addClubMember(ctx: Ctx, c: Club, userId: Id): void {
  if (isMember(ctx.db, c.id, userId)) return;
  ctx.db.memberships[mKey(c.id, userId)] = { id: newId('mem'), clubId: c.id, userId, role: 'member', joinedAt: iso(ctx.now) };
  if (c.ownerId !== userId) notify(ctx, c.ownerId, 'club_member_joined', `${ctx.db.users[userId]?.displayName ?? 'Qualcuno'} è entrato in "${c.name}".`, { clubId: c.id });
}

export const requireActorOf = (ctx: Ctx): User => requireActor(ctx);

export function joinClub(ctx: Ctx, code: string): ClubView {
  const actor = requireActor(ctx);
  const norm = normalizeInviteCode(String(code ?? ''));
  const c = Object.values(ctx.db.clubs).find((x) => x.inviteCode === norm);
  if (!c) throw new AppError('not_found', 'Codice non valido. Controlla di averlo scritto correttamente.');
  addClubMember(ctx, c, actor.id);
  return clubView(ctx, c, false);
}

function removeMember(ctx: Ctx, clubId: Id, userId: Id) {
  const { db } = ctx;
  const c = db.clubs[clubId];
  if (!c) return;
  delete db.memberships[mKey(clubId, userId)];
  const rest = Object.values(db.memberships).filter((m) => m.clubId === clubId).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  if (rest.length === 0) {
    // Ultimo membro: il club si scioglie e le uscite riservate vengono annullate.
    for (const e of Object.values(db.events)) {
      if (e.clubId !== clubId) continue;
      if (e.status === 'active' && Date.parse(e.startsAt) >= ctx.now.getTime() && e.visibility === 'club') cancelInternal(ctx, e, ' perché il club è stato sciolto');
      e.clubId = null;
      if (e.visibility === 'club') e.visibility = 'private';
    }
    delete db.clubs[clubId];
    return;
  }
  if (c.ownerId === userId) {
    c.ownerId = rest[0].userId;
    rest[0].role = 'owner';
  }
  // Le uscite riservate al club organizzate da chi esce non hanno più senso: restano private con il solo link.
  for (const e of Object.values(db.events)) {
    if (e.clubId === clubId && e.organizerId === userId && e.visibility === 'club' && Date.parse(e.startsAt) >= ctx.now.getTime() && e.status === 'active') {
      e.visibility = 'private';
      e.clubId = null;
      e.version += 1;
    }
  }
}

export function leaveClub(ctx: Ctx, clubId: Id): { left: true } {
  const actor = requireActor(ctx);
  if (!ctx.db.clubs[clubId]) throw new AppError('not_found', 'Club non trovato.');
  if (!isMember(ctx.db, clubId, actor.id)) return { left: true };
  removeMember(ctx, clubId, actor.id);
  return { left: true };
}

export function clubLeaderboard(ctx: Ctx, clubId: Id, metric: LeaderboardMetric, sinceIso: string): Leaderboard {
  const actor = requireActor(ctx);
  if (!ctx.db.clubs[clubId]) throw new AppError('not_found', 'Club non trovato.');
  if (!isMember(ctx.db, clubId, actor.id)) throw new AppError('forbidden', 'Solo i membri vedono la classifica.');
  if (metric !== 'runs' && metric !== 'distance') throw new AppError('bad_request', 'Metrica non valida.');
  const since = Number.isNaN(Date.parse(sinceIso)) ? 0 : Date.parse(sinceIso);
  const members = Object.values(ctx.db.memberships).filter((m) => m.clubId === clubId).map((m) => m.userId);
  const rows = members
    .filter((uid) => uid === actor.id || ctx.db.users[uid]?.privacy.shareActivity)
    .map((uid) => {
      const acts = Object.values(ctx.db.activities).filter((a) => a.userId === uid && a.visibility === 'shared' && Date.parse(a.date) >= since && Date.parse(a.date) <= ctx.now.getTime());
      const value = metric === 'runs' ? acts.length : Math.round(acts.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10;
      return { user: toPublic(ctx.db, uid), value };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.user.displayName.localeCompare(b.user.displayName));
  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    if (r.value !== prev) rank = i + 1;
    prev = r.value;
    return { ...r, rank };
  });
  return { metric, since: new Date(since).toISOString(), rows: ranked };
}

/* ---------- profilo & statistiche ---------- */

function statsFor(ctx: Ctx, userId: Id): Stats {
  const { db, now } = ctx;
  const acts = Object.values(db.activities).filter((a) => a.userId === userId);
  const upcoming = Object.values(db.participations).filter((p) => {
    const e = db.events[p.eventId];
    return p.userId === userId && e && e.status === 'active' && Date.parse(e.startsAt) >= now.getTime();
  }).length;
  return {
    completedRuns: acts.length,
    declaredDistanceKm: Math.round(acts.reduce((s, a) => s + (a.distanceKm ?? 0), 0) * 10) / 10,
    declaredDurationMin: acts.reduce((s, a) => s + (a.durationMin ?? 0), 0),
    upcomingCount: upcoming,
    organizedCount: Object.values(db.events).filter((e) => e.organizerId === userId && e.status === 'active').length,
  };
}

export function getProfile(ctx: Ctx, userId?: Id | null): ProfileView {
  const actor = requireActor(ctx);
  const target = ctx.db.users[userId ?? actor.id];
  if (!target) throw new AppError('not_found', 'Profilo non trovato.');
  const self = target.id === actor.id;
  const clubs = [...userClubIds(ctx.db, target.id)].map((id) => ({ id, name: ctx.db.clubs[id].name }));
  const upcoming = Object.values(ctx.db.participations)
    .filter((p) => p.userId === target.id)
    .map((p) => ctx.db.events[p.eventId])
    .filter((e): e is RunEvent => !!e && e.status === 'active' && Date.parse(e.startsAt) >= ctx.now.getTime())
    .filter((e) => self || canViewFull(ctx, e))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => eventView(ctx, e));
  const showStats = self || target.privacy.showStats;
  const all = showStats ? computeBadges(ctx.db, target.id, ctx.now) : null;
  const style = target.style ?? DEFAULT_STYLE;
  return {
    user: { ...toPublic(ctx.db, target.id), username: target.username, bio: target.bio, sports: target.sports, area: target.area, createdAt: target.createdAt, style },
    isSelf: self,
    badges: all ? { featured: style.featuredBadges.map((id) => all.find((b) => b.id === id && b.earned)).filter((b): b is BadgeView => !!b), earned: all.filter((b) => b.earned).length, total: all.length } : null,
    stats: self || target.privacy.showStats ? statsFor(ctx, target.id) : null,
    clubs: self || target.privacy.showClubs ? clubs : null,
    upcoming: self || target.privacy.showUpcoming ? upcoming : null,
    activities: self
      ? Object.values(ctx.db.activities).filter((a) => a.userId === target.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100)
      : null,
    privacy: self ? target.privacy : null,
  };
}

export function updateProfile(ctx: Ctx, input: ProfileInput): Me {
  const actor = requireActor(ctx);
  const v = validateProfileInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  if (!usernameAvailable(ctx.db, v.value.username, actor.id))
    throw new AppError('validation', 'Username già in uso.', { username: 'Username già in uso.' });
  Object.assign(actor, v.value, { profileCompleted: true });
  return actor;
}

export function logActivity(ctx: Ctx, input: ActivityInput): Activity {
  const actor = requireActor(ctx);
  const v = validateActivityInput(input, ctx.now);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  const count = Object.values(ctx.db.activities).filter((a) => a.userId === actor.id).length;
  if (count >= 5000) throw new AppError('conflict', 'Hai raggiunto il limite di attività registrate.');
  const dayOnly = input?.dayOnly !== false;
  const dup = findDuplicate(ctx.db, { userId: actor.id, sport: v.value.sport, date: v.value.date, dayOnly, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin });
  if (dup) throw new AppError('conflict', `Esiste già un'attività simile (${dup.source === 'strava' ? 'importata da Strava' : dup.source === 'file' ? 'importata da file' : 'già registrata'}): non è stata duplicata.`);
  const a = newActivity(ctx.now, { userId: actor.id, source: 'manual', sport: v.value.sport, title: v.value.title, date: v.value.date, dayOnly, distanceKm: v.value.distanceKm, durationMin: v.value.durationMin, note: v.value.note });
  ctx.db.activities[a.id] = a;
  return a;
}

export function deleteActivity(ctx: Ctx, id: Id): { deleted: true } {
  const actor = requireActor(ctx);
  const a = ctx.db.activities[id];
  if (!a) throw new AppError('not_found', 'Attività non trovata.');
  if (a.userId !== actor.id) throw new AppError('forbidden', 'Puoi eliminare solo le tue attività.');
  delete ctx.db.activities[id];
  return { deleted: true };
}

/** Elimina tutti i dati dell'utente. Le credenziali le rimuove il livello di autenticazione. */
export function deleteAccount(ctx: Ctx): { deleted: true } {
  const actor = requireActor(ctx);
  const { db } = ctx;
  for (const e of Object.values(db.events)) {
    if (e.organizerId !== actor.id) continue;
    if (e.status === 'active' && Date.parse(e.startsAt) >= ctx.now.getTime()) cancelInternal(ctx, e, ' perché l\'organizzatore ha eliminato l\'account');
  }
  for (const m of Object.values(db.memberships)) if (m.userId === actor.id) removeMember(ctx, m.clubId, actor.id);
  for (const p of Object.values(db.participations)) if (p.userId === actor.id) delete db.participations[pKey(p.eventId, p.userId)];
  for (const a of Object.values(db.activities)) if (a.userId === actor.id) delete db.activities[a.id];
  for (const n of Object.values(db.notifications)) if (n.userId === actor.id) delete db.notifications[n.id];
  for (const i of Object.values(db.clubInvites ?? {})) if (i.fromId === actor.id || i.toId === actor.id) delete db.clubInvites[i.id];
  purgeUserData(ctx, actor.id);
  delete db.users[actor.id];
  ctx.cache = undefined;
  return { deleted: true };
}

/** Rimuove dati di moduli aggiuntivi (sfide, percorsi, piani). Registrato da shared/api.ts per evitare cicli. */
const purgers: Array<(ctx: Ctx, userId: Id) => void> = [];
export function registerPurger(fn: (ctx: Ctx, userId: Id) => void) {
  purgers.push(fn);
}
function purgeUserData(ctx: Ctx, userId: Id) {
  for (const fn of purgers) fn(ctx, userId);
}

/* ---------- feed, home, notifiche ---------- */

export function getFeed(ctx: Ctx, limit = 40): FeedItem[] {
  const actor = requireActor(ctx);
  const { db, now } = ctx;
  const mates = new Set<Id>();
  const mine = userClubIds(db, actor.id);
  for (const m of Object.values(db.memberships)) {
    if (m.userId !== actor.id && mine.has(m.clubId) && db.users[m.userId]?.privacy.shareActivity) mates.add(m.userId);
  }
  // Anche le persone che segui, se condividono le attività.
  for (const f of Object.values(db.follows ?? {})) if (f.fromId === actor.id && db.users[f.toId]?.privacy.shareActivity) mates.add(f.toId);
  const items: FeedItem[] = [];
  const recent = now.getTime() - 14 * 86_400_000;
  for (const e of Object.values(db.events)) {
    if (!mates.has(e.organizerId) || e.status !== 'active' || !canViewFull(ctx, e)) continue;
    if (Date.parse(e.createdAt) < recent) continue;
    items.push({ kind: 'event_created', id: `c_${e.id}`, at: e.createdAt, user: toPublic(db, e.organizerId), event: eventView(ctx, e) });
  }
  for (const p of Object.values(db.participations)) {
    const e = db.events[p.eventId];
    if (!e || !mates.has(p.userId) || p.userId === e.organizerId || e.status !== 'active' || !canViewFull(ctx, e)) continue;
    if (Date.parse(p.joinedAt) < recent) continue;
    items.push({ kind: 'event_joined', id: `j_${p.id}`, at: p.joinedAt, user: toPublic(db, p.userId), event: eventView(ctx, e) });
  }
  for (const a of Object.values(db.activities)) {
    if (!mates.has(a.userId) || a.visibility !== 'shared' || Date.parse(a.createdAt) < now.getTime() - 30 * 86_400_000) continue;
    items.push({ kind: 'run_completed', id: `a_${a.id}`, at: a.createdAt, user: toPublic(db, a.userId), activity: a });
  }
  for (const l of Object.values(db.workoutLogs)) {
    // Compare solo ciò che l'utente ha scelto di condividere; mai il piano personale.
    if (!l.shared || !mates.has(l.userId) || Date.parse(l.createdAt) < now.getTime() - 30 * 86_400_000) continue;
    items.push({ kind: 'workout_shared', id: `w_${l.id}`, at: l.createdAt, user: toPublic(db, l.userId), workout: { title: l.title, kind: l.kind, durationMin: Math.round(l.durationSec / 60), distanceKm: l.distanceKm } });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function getHome(ctx: Ctx, weekStartIso: string): HomeView {
  const actor = requireActor(ctx);
  const { db } = ctx;
  const mineEvents = listEvents(ctx, { scope: 'mine' }).filter((e) => e.status === 'active');
  const clubEvents = listEvents(ctx, { scope: 'clubs' }).filter((e) => !e.viewer.isParticipant && e.status === 'active').slice(0, 5);
  const shown = new Set([...mineEvents, ...clubEvents].map((e) => e.id));
  const nearbyPublic = listEvents(ctx, { scope: 'all' }).filter((e) => e.visibility === 'public' && !shown.has(e.id) && e.status === 'active').slice(0, 8);
  const weekStart = Date.parse(weekStartIso) || 0;
  const acts = Object.values(db.activities).filter((a) => a.userId === actor.id && Date.parse(a.date) >= weekStart);
  return {
    me: actor,
    stats: statsFor(ctx, actor.id),
    nextEvents: mineEvents.slice(0, 5),
    clubEvents,
    nearbyPublic,
    clubs: [...userClubIds(db, actor.id)].map((id) => ({
      id,
      name: db.clubs[id].name,
      memberCount: Object.values(db.memberships).filter((m) => m.clubId === id).length,
    })),
    friendActivity: getFeed(ctx, 4),
    weekly: {
      completedRuns: acts.length,
      organized: Object.values(db.events).filter((e) => e.organizerId === actor.id && e.status === 'active' && Date.parse(e.createdAt) >= weekStart).length,
      joined: Object.values(db.participations).filter((p) => p.userId === actor.id && Date.parse(p.joinedAt) >= weekStart).length,
    },
    unreadNotifications: Object.values(db.notifications).filter((n) => n.userId === actor.id && !n.readAt).length,
  };
}

export function listNotifications(ctx: Ctx): Notification[] {
  const actor = requireActor(ctx);
  return Object.values(ctx.db.notifications).filter((n) => n.userId === actor.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

export function markNotificationsRead(ctx: Ctx): { read: number } {
  const actor = requireActor(ctx);
  let n = 0;
  for (const x of Object.values(ctx.db.notifications)) {
    if (x.userId === actor.id && !x.readAt) {
      x.readAt = iso(ctx.now);
      n++;
    }
  }
  return { read: n };
}

/** Distanza (km) tra due punti; riesportata per comodità dei client. */
export { haversineKm };

/** Metodi di base; il registro completo è in shared/api.ts. */
export const coreMethods = {
  me,
  listBadges,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  cancelEvent,
  joinEvent,
  leaveEvent,
  confirmRun,
  listMyClubs,
  getClub,
  clubByCode,
  createClub,
  joinClub,
  leaveClub,
  clubLeaderboard,
  getProfile,
  updateProfile,
  logActivity,
  deleteActivity,
  deleteAccount,
  getFeed,
  getHome,
  listNotifications,
  markNotificationsRead,
} as const;
