/**
 * Social: segui, scintille e commenti.
 *  - Segui: vedi nel feed le attività CONDIVISE di chi segui (oltre ai compagni di club), solo se quella persona
 *    condivide le attività (privacy.shareActivity). Chi è seguito può rimuovere un follower.
 *  - Scintilla ⚡ (al posto del "mi piace"): una per persona per elemento, mai su sé stessi. Chi l'ha data è
 *    visibile solo a chi riceve; agli altri si mostra il conteggio.
 *  - Commenti: 1–300 caratteri, solo su elementi che puoi vedere; li cancella l'autore o il proprietario.
 * Ogni azione verifica che l'elemento sia davvero visibile a chi la compie.
 */
import { AppError, getFeed, notify, toPublic, registerPurger, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { FeedItem, Id, UserPublic, WorkoutLog, TrackPoint } from './types.ts';
import { haversineKm } from './time.ts';
import { downsample } from './track.ts';
import { clean } from './validation.ts';

export interface Follow { id: string; fromId: Id; toId: Id; createdAt: string }
export interface Spark { id: string; itemId: string; userId: Id; createdAt: string }
export interface Comment { id: Id; itemId: string; userId: Id; text: string; createdAt: string }

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}
const fKey = (a: Id, b: Id) => `${a}__${b}`;

/** Proprietario di un elemento del feed (id stabili: c_ evento creato, j_ iscrizione, a_ attività, w_ allenamento). */
function ownerOf(ctx: Ctx, itemId: string): Id | null {
  const [p, ...rest] = itemId.split('_');
  const id = rest.join('_');
  const db = ctx.db;
  if (p === 'c') return db.events[id]?.organizerId ?? null;
  if (p === 'j') return db.participations[id]?.userId ?? Object.values(db.participations).find((x) => x.id === id)?.userId ?? null;
  if (p === 'a') return db.activities[id]?.visibility === 'shared' ? db.activities[id].userId : null;
  if (p === 'w') return db.workoutLogs[id]?.shared ? db.workoutLogs[id].userId : null;
  return null;
}

/** Visibile se è tuo oppure compare nel tuo feed (compagni di club o persone che segui). */
function assertVisible(ctx: Ctx, itemId: string): Id {
  const uid = actor(ctx);
  const owner = ownerOf(ctx, itemId);
  if (!owner) throw new AppError('not_found', 'Contenuto non disponibile.');
  if (owner === uid) return owner;
  if (!getFeed(ctx, 500).some((f) => f.id === itemId)) throw new AppError('not_found', 'Contenuto non disponibile.');
  return owner;
}

/* ---------- segui ---------- */

export function follow(ctx: Ctx, userId: Id): { following: true } {
  const uid = actor(ctx);
  if (userId === uid || !ctx.db.users[userId]) throw new AppError('validation', 'Persona non valida.');
  const k = fKey(uid, userId);
  if (!ctx.db.follows[k]) {
    if (Object.values(ctx.db.follows).filter((f) => f.fromId === uid).length >= 2000) throw new AppError('conflict', 'Segui già moltissime persone.');
    ctx.db.follows[k] = { id: k, fromId: uid, toId: userId, createdAt: ctx.now.toISOString() };
    notify(ctx, userId, 'new_follower', `${ctx.db.users[uid].displayName} ha iniziato a seguirti.`, {});
  }
  return { following: true };
}

export function unfollow(ctx: Ctx, userId: Id): { following: false } {
  delete ctx.db.follows[fKey(actor(ctx), userId)];
  return { following: false };
}

export function removeFollower(ctx: Ctx, userId: Id): { removed: true } {
  delete ctx.db.follows[fKey(userId, actor(ctx))];
  return { removed: true };
}

export function followInfo(ctx: Ctx, userId?: Id | null): { followers: number; following: number; iFollow: boolean; followsMe: boolean } {
  const uid = actor(ctx);
  const t = userId ?? uid;
  if (!ctx.db.users[t]) throw new AppError('not_found', 'Profilo non trovato.');
  const all = Object.values(ctx.db.follows);
  return { followers: all.filter((f) => f.toId === t).length, following: all.filter((f) => f.fromId === t).length, iFollow: !!ctx.db.follows[fKey(uid, t)], followsMe: !!ctx.db.follows[fKey(t, uid)] };
}

export function listFollowing(ctx: Ctx): UserPublic[] {
 const uid = actor(ctx); return Object.values(ctx.db.follows).filter((f)=>f.fromId===uid && ctx.db.users[f.toId]).map((f)=>toPublic(ctx.db,f.toId));
}

export function listFollowers(ctx: Ctx): UserPublic[] {
  const uid = actor(ctx);
  return Object.values(ctx.db.follows).filter((f) => f.toId === uid && ctx.db.users[f.fromId]).map((f) => toPublic(ctx.db, f.fromId));
}

/* ---------- con chi correre ---------- */

function avgPace(ctx: Ctx, uid: Id): number | null {
  const since = ctx.now.getTime() - 60 * 86_400_000;
  const xs = Object.values(ctx.db.activities).filter((a) => a.userId === uid && (uid === ctx.actorId || (a.visibility === 'shared' && a.source !== 'strava')) && a.sport === 'running' && a.distanceKm && a.durationMin && a.distanceKm >= 2 && Date.parse(a.date) >= since);
  if (xs.length < 2) return null;
  const km = xs.reduce((s, a) => s + a.distanceKm!, 0);
  const sec = xs.reduce((s, a) => s + a.durationMin! * 60, 0);
  return Math.round(sec / km);
}

/**
 * Persone con cui potresti correre: stessa zona o un club in comune, e passo medio degli ultimi 60 giorni entro
 * ±45 s/km dal tuo (se entrambi i passi sono noti). Solo chi mostra le statistiche e condivide le attività.
 */
export function suggestRunners(ctx: Ctx): Array<{ user: UserPublic; paceSecPerKm: number | null; reason: string }> {
  const uid = actor(ctx);
  const me = ctx.db.users[uid];
  const mine = avgPace(ctx, uid);
  const myClubs = new Set(Object.values(ctx.db.memberships).filter((m) => m.userId === uid).map((m) => m.clubId));
  const area = me.area.trim().toLowerCase();
  const out: Array<{ user: UserPublic; paceSecPerKm: number | null; reason: string; score: number }> = [];
  for (const u of Object.values(ctx.db.users)) {
    if (u.id === uid || ctx.db.follows[fKey(uid, u.id)] || !u.privacy.shareActivity || !u.privacy.showStats) continue;
    const sameArea = !!area && u.area.trim().toLowerCase() === area;
    const sharedClub = Object.values(ctx.db.memberships).some((m) => m.userId === u.id && myClubs.has(m.clubId));
    if (!sameArea && !sharedClub) continue;
    const pace = avgPace(ctx, u.id);
    if (mine && pace && Math.abs(pace - mine) > 45) continue;
    const reason = [sharedClub ? 'Un club in comune' : `Corre a ${u.area}`, mine && pace ? 'passo simile al tuo' : null].filter(Boolean).join(' · ');
    out.push({ user: toPublic(ctx.db, u.id), paceSecPerKm: pace, reason, score: (sharedClub ? 2 : 0) + (sameArea ? 1 : 0) + (mine && pace ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12).map(({ score: _s, ...r }) => r);
}

/* ---------- scintille e commenti ---------- */

export interface SocialCounts { sparks: number; sparked: boolean; comments: number }

function countsFor(ctx: Ctx, itemId: string, uid: Id): SocialCounts {
  return {
    sparks: Object.values(ctx.db.sparks).filter((s) => s.itemId === itemId && ctx.db.users[s.userId]).length,
    sparked: !!ctx.db.sparks[`${itemId}__${uid}`],
    comments: Object.values(ctx.db.comments).filter((c) => c.itemId === itemId && ctx.db.users[c.userId]).length,
  };
}

export function toggleSpark(ctx: Ctx, itemId: string, on: boolean): SocialCounts {
  const uid = actor(ctx);
  const owner = assertVisible(ctx, itemId);
  if (owner === uid) throw new AppError('validation', 'Le scintille si danno agli altri.');
  const k = `${itemId}__${uid}`;
  if (on) ctx.db.sparks[k] ??= { id: k, itemId, userId: uid, createdAt: ctx.now.toISOString() };
  else delete ctx.db.sparks[k];
  return countsFor(ctx, itemId, uid);
}

export function socialFor(ctx: Ctx, itemIds: string[]): Record<string, SocialCounts> {
  const uid = actor(ctx);
  const out: Record<string, SocialCounts> = {};
  for (const id of (Array.isArray(itemIds) ? itemIds : []).slice(0, 200)) {
    try {
      assertVisible(ctx, id);
      out[id] = countsFor(ctx, id, uid);
    } catch {
      /* non visibile: nessun dato */
    }
  }
  return out;
}

/** Chi ti ha dato una scintilla: visibile solo al proprietario. */
export function sparkersOf(ctx: Ctx, itemId: string): UserPublic[] {
  const uid = actor(ctx);
  if (ownerOf(ctx, itemId) !== uid) throw new AppError('forbidden', 'Solo chi ha pubblicato vede chi ha dato una scintilla.');
  return Object.values(ctx.db.sparks).filter((s) => s.itemId === itemId && ctx.db.users[s.userId]).map((s) => toPublic(ctx.db, s.userId));
}

export function listComments(ctx: Ctx, itemId: string): Array<Comment & { user: UserPublic; mine: boolean; canDelete: boolean }> {
  const uid = actor(ctx);
  const owner = assertVisible(ctx, itemId);
  return Object.values(ctx.db.comments)
    .filter((c) => c.itemId === itemId && ctx.db.users[c.userId])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({ ...c, user: toPublic(ctx.db, c.userId), mine: c.userId === uid, canDelete: c.userId === uid || owner === uid }));
}

export function addComment(ctx: Ctx, itemId: string, text: string): Comment {
  const uid = actor(ctx);
  const owner = assertVisible(ctx, itemId);
  const body = clean(text, 300);
  if (body.length < 1) throw new AppError('validation', 'Scrivi qualcosa.', { text: 'Scrivi qualcosa.' });
  const lastHour = Object.values(ctx.db.comments).filter((c) => c.userId === uid && Date.parse(c.createdAt) > ctx.now.getTime() - 3_600_000).length;
  if (lastHour >= 30) throw new AppError('rate_limited', 'Hai scritto molti commenti: riprova tra poco.');
  const c: Comment = { id: newId('cmt'), itemId, userId: uid, text: body, createdAt: ctx.now.toISOString() };
  ctx.db.comments[c.id] = c;
  if (owner !== uid) notify(ctx, owner, 'new_comment', `${ctx.db.users[uid].displayName} ha commentato: “${body.slice(0, 60)}”`, {});
  return c;
}

export function deleteComment(ctx: Ctx, id: Id): { deleted: true } {
  const uid = actor(ctx);
  const c = ctx.db.comments[id];
  if (!c) throw new AppError('not_found', 'Commento non trovato.');
  if (c.userId !== uid && ownerOf(ctx, c.itemId) !== uid) throw new AppError('forbidden', 'Non puoi eliminare questo commento.');
  delete ctx.db.comments[id];
  return { deleted: true };
}

/** Feed con i conteggi social già inclusi (una sola richiesta). */
export function feedTrack(log: WorkoutLog): TrackPoint[] | undefined {
  if (log.track?.some((p) => p.breakBefore) || !log.shared || !log.traceShared || (log.origin && log.origin !== 'app')) return undefined;
  const track = (log.track ?? []).filter((p) => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && Number.isFinite(p.t));
  const dist = [0];
  for (let i = 1; i < track.length; i++) dist.push(dist[i - 1] + haversineKm(track[i - 1], track[i]));
  const total = dist.at(-1) ?? 0;
  const inner = track.filter((p, i) => dist[i] >= 0.3 && total - dist[i] >= 0.3 && haversineKm(track[0], p) >= 0.3 && haversineKm(track[track.length - 1], p) >= 0.3);
  if (inner.length < 2) return undefined;
  // Esclude 300 m a ogni estremo e rimuove misure dei sensori e accuratezza.
  return downsample(inner, 180).map(({ lat, lng, t }) => ({ lat, lng, t }));
}

export function setTrackVisibility(ctx: Ctx, id: Id, on: boolean): { traceShared: boolean } {
  const uid = actor(ctx); const log = ctx.db.workoutLogs[id];
  if (!log || log.userId !== uid) throw new AppError('not_found', 'Attività non trovata.');
  if (typeof on !== 'boolean') throw new AppError('validation', 'Scegli se condividere il percorso.');
  if ((log.origin && log.origin !== 'app') || !log.track || log.track.length < 2) throw new AppError('validation', 'Puoi condividere solo un percorso GPS registrato con Runngo.');
  log.traceShared = on; log.updatedAt = ctx.now.toISOString();
  return { traceShared: on };
}

export function getSocialFeed(ctx: Ctx, limit = 40): Array<FeedItem & { social: SocialCounts }> {
  const uid = actor(ctx);
  return getFeed(ctx, limit).map((f) => {
    if (f.kind === 'workout_shared') {
      const log = ctx.db.workoutLogs[f.id.slice(2)]; const track = log ? feedTrack(log) : undefined;
      if (track) return { ...f, workout: { ...f.workout, track }, social: countsFor(ctx, f.id, uid) };
    }
    return { ...f, social: countsFor(ctx, f.id, uid) };
  });
}

registerPurger((ctx, userId) => {
  for (const [k, f] of Object.entries(ctx.db.follows)) if (f.fromId === userId || f.toId === userId) delete ctx.db.follows[k];
  for (const [k, s] of Object.entries(ctx.db.sparks)) if (s.userId === userId) delete ctx.db.sparks[k];
  for (const [k, c] of Object.entries(ctx.db.comments)) if (c.userId === userId) delete ctx.db.comments[k];
});

export const socialMethods = { follow, unfollow, removeFollower, followInfo, listFollowers, listFollowing, suggestRunners, toggleSpark, socialFor, sparkersOf, listComments, addComment, deleteComment, getSocialFeed, setTrackVisibility } as const;
export const SOCIAL_READ_ONLY = ['followInfo', 'listFollowers', 'listFollowing', 'suggestRunners', 'socialFor', 'sparkersOf', 'listComments', 'getSocialFeed'];
