import { AppError, canInviteEvent, getEvent, isMember, isParticipant, joinEvent, notify, requireActorOf, toPublic, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { InviteCandidate, InviteState } from './invites.ts';
import type { EventView, Id, RunEvent, UserPublic } from './types.ts';

export interface EventInvite {
  id: Id; eventId: Id; fromId: Id; toId: Id;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string; respondedAt: string | null;
}
export interface EventInviteView extends EventInvite { event: EventView; from: UserPublic }
const COOLDOWN = 30 * 86_400_000;

function available(ctx: Ctx, eventId: Id): RunEvent {
  const me = requireActorOf(ctx);
  const event = ctx.db.events[eventId];
  if (!event || !canInviteEvent(ctx.db, event, me.id)) throw new AppError('forbidden', 'Solo chi organizza o partecipa può invitare a questa uscita.');
  if (event.status !== 'active' || Date.parse(event.startsAt) <= ctx.now.getTime()) throw new AppError('conflict', 'Non si può più invitare a questa uscita.');
  return event;
}
function stateFor(ctx: Ctx, event: RunEvent, userId: Id): InviteState {
  if (isParticipant(ctx.db, event.id, userId)) return 'member';
  const invites = Object.values(ctx.db.eventInvites ?? {}).filter((i) => i.eventId === event.id && i.toId === userId);
  if (invites.some((i) => i.status === 'pending')) return 'pending';
  if (invites.some((i) => i.status === 'declined' && ctx.now.getTime() - Date.parse(i.respondedAt ?? i.createdAt) < COOLDOWN)) return 'recent_decline';
  return 'none';
}
function recipientAllowed(ctx: Ctx, event: RunEvent, id: Id): boolean {
  return !!ctx.db.users[id] && (event.visibility !== 'club' || isMember(ctx.db, event.clubId, id));
}
export function eventInviteCandidates(ctx: Ctx, eventId: Id): InviteCandidate[] {
  const event = available(ctx, eventId);
  return Object.values(ctx.db.follows).filter((f) => f.fromId === ctx.actorId && f.toId !== ctx.actorId && recipientAllowed(ctx, event, f.toId))
    .map((f) => ({ user: toPublic(ctx.db, f.toId), state: stateFor(ctx, event, f.toId) }))
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'it'));
}
export function inviteToEvent(ctx: Ctx, eventId: Id, ids: Id[]): { sent: number; skipped: number } {
  const event = available(ctx, eventId);
  const me = requireActorOf(ctx);
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some((id) => typeof id !== 'string')) throw new AppError('validation', 'Scegli da 1 a 30 persone.');
  ctx.db.eventInvites ??= {};
  const candidates = new Set(eventInviteCandidates(ctx, eventId).filter((c) => c.state === 'none').map((c) => c.user.id));
  const pending = Object.values(ctx.db.eventInvites).filter((i) => i.eventId === eventId && i.fromId === me.id && i.status === 'pending').length;
  let sent = 0; let skipped = 0;
  for (const id of new Set(ids)) {
    if (!candidates.has(id) || pending + sent >= 30) { skipped++; continue; }
    const invite: EventInvite = { id: newId('einv'), eventId, fromId: me.id, toId: id, status: 'pending', createdAt: ctx.now.toISOString(), respondedAt: null };
    ctx.db.eventInvites[invite.id] = invite;
    notify(ctx, id, 'event_invite', `${me.displayName} ti invita all’uscita “${event.title}”.`, { eventId });
    sent++;
  }
  return { sent, skipped };
}
export function myEventInvites(ctx: Ctx): EventInviteView[] {
  const me = requireActorOf(ctx);
  return Object.values(ctx.db.eventInvites ?? {}).filter((i) => {
    const e = ctx.db.events[i.eventId];
    return i.toId === me.id && i.status === 'pending' && e && e.status === 'active' && Date.parse(e.startsAt) > ctx.now.getTime() && canInviteEvent(ctx.db, e, i.fromId) && recipientAllowed(ctx, e, me.id);
  }).map((i) => ({ ...i, event: getEvent(ctx, i.eventId), from: toPublic(ctx.db, i.fromId) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function respondEventInvite(ctx: Ctx, id: Id, accept: boolean): { status: 'accepted' | 'declined'; eventId: Id } {
  const me = requireActorOf(ctx);
  const i = ctx.db.eventInvites?.[id];
  if (!i || i.toId !== me.id) throw new AppError('not_found', 'Invito non trovato.');
  if (typeof accept !== 'boolean') throw new AppError('validation', 'Scegli se accettare o rifiutare.');
  if (i.status !== 'pending') throw new AppError('conflict', 'Hai già risposto a questo invito.');
  if (accept) {
    const e = ctx.db.events[i.eventId];
    if (!e || !canInviteEvent(ctx.db, e, i.fromId) || !recipientAllowed(ctx, e, me.id)) throw new AppError('forbidden', 'Questa uscita non è più disponibile per te.');
    // Verifica nuovamente posti, orario, annullamento e appartenenza al club; nessuna prenotazione implicita.
    joinEvent(ctx, i.eventId);
  }
  i.status = accept ? 'accepted' : 'declined'; i.respondedAt = ctx.now.toISOString();
  return { status: i.status, eventId: i.eventId };
}
export const eventInviteMethods = { eventInviteCandidates, inviteToEvent, myEventInvites, respondEventInvite };
export const EVENT_INVITES_READ_ONLY = ['eventInviteCandidates', 'myEventInvites'];
