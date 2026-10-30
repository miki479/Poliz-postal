/**
 * Gruppi suggeriti: i gruppi "visibili in Esplora" a cui non appartieni, ordinati per compatibilità.
 * Il punteggio usa solo dati che la persona ha già dichiarato (zona e sport del profilo) e chi segue già: niente tracciamento.
 * Ogni motivo mostrato è vero (es. "3 persone che segui ne fanno parte").
 */
import { AppError, addClubMember, isMember, toPublic, type Ctx } from './engine.ts';
import type { Club, Id, SportId, UserPublic } from './types.ts';

export interface ClubSuggestion {
  id: Id;
  name: string;
  description: string;
  rules: string;
  sport: SportId;
  area: string;
  imageDataUrl: string | null;
  memberCount: number;
  isNew: boolean;
  reasons: string[];
  score: number;
  friends: UserPublic[];
}

const NEW_DAYS = 14;
const norm = (s: string) => s.trim().toLowerCase();

export function suggestClubs(ctx: Ctx, limit = 12): ClubSuggestion[] {
  const uid = ctx.actorId;
  const me = uid ? ctx.db.users[uid] : undefined;
  if (!uid || !me) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const { db, now } = ctx;
  const following = new Set(Object.values(db.follows).filter((f) => f.fromId === uid).map((f) => f.toId));
  const members = new Map<Id, Id[]>();
  for (const m of Object.values(db.memberships)) members.set(m.clubId, [...(members.get(m.clubId) ?? []), m.userId]);
  const out: ClubSuggestion[] = [];
  for (const c of Object.values(db.clubs) as Club[]) {
    if (!c.discoverable || isMember(db, c.id, uid)) continue;
    const ids = members.get(c.id) ?? [];
    const reasons: string[] = [];
    let score = 0;
    if (me.area && c.area && norm(me.area) === norm(c.area)) { score += 3; reasons.push(`Nella tua zona: ${c.area}`); }
    if (me.sports.includes(c.sport)) { score += 2; reasons.push('Corri anche tu così'); }
    const friends = ids.filter((id) => following.has(id));
    if (friends.length) { score += Math.min(3, friends.length); reasons.push(friends.length === 1 ? '1 persona che segui ne fa parte' : `${friends.length} persone che segui ne fanno parte`); }
    const isNew = now.getTime() - Date.parse(c.createdAt) < NEW_DAYS * 86_400_000;
    if (isNew) score += 1;
    out.push({ id: c.id, name: c.name, description: c.description, rules: c.rules ?? '', sport: c.sport, area: c.area, imageDataUrl: c.imageDataUrl, memberCount: ids.length, isNew, reasons, score, friends: friends.slice(0, 3).map((id) => toPublic(db, id)) });
  }
  return out.sort((a, b) => b.score - a.score || b.memberCount - a.memberCount || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Entra in un gruppo visibile in Esplora, senza codice. Un gruppo non visibile resta solo su invito. */
export function joinDiscoverableClub(ctx: Ctx, clubId: Id): { joined: true; clubId: Id } {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const c = ctx.db.clubs[clubId];
  if (!c || !c.discoverable) throw new AppError('not_found', 'Gruppo non disponibile.');
  addClubMember(ctx, c, ctx.actorId);
  return { joined: true, clubId };
}

export const clubDiscoveryMethods = { suggestClubs, joinDiscoverableClub } as const;
export const CLUB_DISCOVERY_READ_ONLY = ['suggestClubs'];
