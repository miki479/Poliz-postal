/**
 * Inviti ai club tra amici (persone che l'invitante segue). Regole di sicurezza:
 *  - invita solo chi è già membro del club;
 *  - si invitano solo persone che si seguono (nessun invito a sconosciuti), mai se stessi o chi è già nel club;
 *  - un solo invito in sospeso per persona e club; dopo un rifiuto non si reinvita per 30 giorni;
 *  - massimo 30 inviti in sospeso per club e invitante;
 *  - solo il destinatario può accettare o rifiutare; l'accettazione verifica che il club esista ancora.
 * Al destinatario arriva solo il nome pubblico di chi invita.
 */
import { AppError, addClubMember, isMember, notify, requireActorOf, toPublic, type Ctx } from './engine.ts';
import { newId } from './ids.ts';
import type { Id, UserPublic } from './types.ts';

export interface ClubInvite {
  id: Id;
  clubId: Id;
  fromId: Id;
  toId: Id;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt: string | null;
}

export type InviteState = 'member' | 'pending' | 'recent_decline' | 'none';

export interface InviteCandidate {
  user: UserPublic;
  state: InviteState;
}

export interface InviteView extends ClubInvite {
  club: { id: Id; name: string; memberCount: number; area: string; description: string; imageDataUrl: string | null };
  from: UserPublic;
}

const DECLINE_COOLDOWN_MS = 30 * 86_400_000;
const MAX_PENDING = 30;

function lastInvite(ctx: Ctx, clubId: Id, toId: Id): ClubInvite | undefined {
  return Object.values(ctx.db.clubInvites ?? {})
    .filter((i) => i.clubId === clubId && i.toId === toId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function coolingDown(ctx: Ctx, inv: ClubInvite | undefined): boolean {
  return inv?.status === 'declined' && ctx.now.getTime() - Date.parse(inv.respondedAt ?? inv.createdAt) < DECLINE_COOLDOWN_MS;
}

/** I miei amici (persone che seguo) con lo stato dell'invito a questo club. */
export function inviteCandidates(ctx: Ctx, clubId: Id): InviteCandidate[] {
  const me = requireActorOf(ctx);
  if (!ctx.db.clubs[clubId] || !isMember(ctx.db, clubId, me.id)) throw new AppError('forbidden', 'Solo i membri del club possono invitare.');
  const out: InviteCandidate[] = [];
  for (const f of Object.values(ctx.db.follows)) {
    if (f.fromId !== me.id || !ctx.db.users[f.toId]) continue;
    let state: InviteState = 'none';
    if (isMember(ctx.db, clubId, f.toId)) state = 'member';
    else {
      const last = lastInvite(ctx, clubId, f.toId);
      if (last?.status === 'pending') state = 'pending';
      else if (coolingDown(ctx, last)) state = 'recent_decline';
    }
    out.push({ user: toPublic(ctx.db, f.toId), state });
  }
  return out.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, 'it'));
}

export function inviteToClub(ctx: Ctx, clubId: Id, userIds: Id[]): { sent: number; skipped: number } {
  const me = requireActorOf(ctx);
  const club = ctx.db.clubs[clubId];
  if (!club || !isMember(ctx.db, clubId, me.id)) throw new AppError('forbidden', 'Solo i membri del club possono invitare.');
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 30) throw new AppError('validation', 'Scegli da 1 a 30 persone.');
  ctx.db.clubInvites ??= {};
  const already = Object.values(ctx.db.clubInvites).filter((i) => i.clubId === clubId && i.fromId === me.id && i.status === 'pending').length;
  let sent = 0;
  let skipped = 0;
  for (const uid of new Set(userIds.map(String))) {
    const friend = Object.values(ctx.db.follows).some((f) => f.fromId === me.id && f.toId === uid);
    const last = lastInvite(ctx, clubId, uid);
    if (uid === me.id || !ctx.db.users[uid] || !friend || isMember(ctx.db, clubId, uid) || last?.status === 'pending' || coolingDown(ctx, last) || already + sent >= MAX_PENDING) {
      skipped++;
      continue;
    }
    const inv: ClubInvite = { id: newId('inv'), clubId, fromId: me.id, toId: uid, status: 'pending', createdAt: ctx.now.toISOString(), respondedAt: null };
    ctx.db.clubInvites[inv.id] = inv;
    notify(ctx, uid, 'club_invite', `${me.displayName} ti ha invitato nel club "${club.name}".`, { clubId });
    sent++;
  }
  return { sent, skipped };
}

/** Inviti ricevuti e non ancora risolti. */
export function myClubInvites(ctx: Ctx): InviteView[] {
  const me = requireActorOf(ctx);
  return Object.values(ctx.db.clubInvites ?? {})
    .filter((i) => i.toId === me.id && i.status === 'pending' && ctx.db.clubs[i.clubId])
    .map((i) => {
      const c = ctx.db.clubs[i.clubId];
      const members = Object.values(ctx.db.memberships).filter((m) => m.clubId === c.id).length;
      return { ...i, club: { id: c.id, name: c.name, memberCount: members, area: c.area, description: c.description, imageDataUrl: c.imageDataUrl }, from: toPublic(ctx.db, i.fromId) };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function respondClubInvite(ctx: Ctx, inviteId: Id, accept: boolean): { status: 'accepted' | 'declined'; clubId: Id } {
  const me = requireActorOf(ctx);
  const inv = ctx.db.clubInvites?.[inviteId];
  if (!inv || inv.toId !== me.id) throw new AppError('not_found', 'Invito non trovato.');
  if (inv.status !== 'pending') throw new AppError('conflict', 'Hai già risposto a questo invito.');
  const club = ctx.db.clubs[inv.clubId];
  if (!club) {
    inv.status = 'declined';
    inv.respondedAt = ctx.now.toISOString();
    throw new AppError('not_found', 'Il club non esiste più.');
  }
  inv.status = accept ? 'accepted' : 'declined';
  inv.respondedAt = ctx.now.toISOString();
  if (accept) addClubMember(ctx, club, me.id);
  return { status: inv.status, clubId: club.id };
}

export const inviteMethods = { inviteCandidates, inviteToClub, myClubInvites, respondClubInvite } as const;
export const INVITES_READ_ONLY = ['inviteCandidates', 'myClubInvites'] as const;
