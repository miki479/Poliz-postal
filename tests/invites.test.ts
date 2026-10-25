import { beforeEach, describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { InviteCandidate, InviteView } from '../shared/invites.ts';
import type { ClubView } from '../shared/types.ts';

let now = new Date('2026-10-24T12:00:00.000Z');
let db: ReturnType<typeof emptyDb>;
const as = (a: string): Ctx => ({ db, now, actorId: a });
const run = <T>(a: string, m: string, args: unknown[] = []) => call(as(a), m, args) as T;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
  return 'none';
};

let clubId: string;

beforeEach(() => {
  now = new Date('2026-10-24T12:00:00.000Z');
  db = emptyDb();
  for (const id of ['a', 'b', 'c', 'd']) db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: 'U' + id, bio: '', hue: 1, sports: ['running'], area: 'Torino', privacy: { ...DEFAULT_PRIVACY }, createdAt: now.toISOString() };
  clubId = run<ClubView>('a', 'createClub', [{ name: 'Club Po', description: 'Corriamo', sport: 'running', area: 'Torino', imageDataUrl: null }]).id;
  run('a', 'follow', ['b']);
  run('a', 'follow', ['c']);
});

describe('inviti al club tra amici', () => {
  it('solo i membri invitano, e solo persone che seguono', () => {
    expect(code(() => run('b', 'inviteToClub', [clubId, ['c']]))).toBe('forbidden');
    expect(code(() => run('b', 'inviteCandidates', [clubId]))).toBe('forbidden');
    // d non è tra le persone seguite da a: invito scartato, nessuna notifica
    const r = run<{ sent: number; skipped: number }>('a', 'inviteToClub', [clubId, ['d', 'a']]);
    expect(r).toEqual({ sent: 0, skipped: 2 });
    expect(Object.values(db.notifications).filter((n) => n.userId === 'd')).toHaveLength(0);
  });

  it('invita, mostra lo stato in sospeso e non duplica', () => {
    expect(run<{ sent: number }>('a', 'inviteToClub', [clubId, ['b']]).sent).toBe(1);
    expect(run<{ sent: number; skipped: number }>('a', 'inviteToClub', [clubId, ['b']])).toEqual({ sent: 0, skipped: 1 });
    const cand = run<InviteCandidate[]>('a', 'inviteCandidates', [clubId]);
    expect(cand.find((c) => c.user.id === 'b')?.state).toBe('pending');
    expect(cand.find((c) => c.user.id === 'c')?.state).toBe('none');
    expect(Object.values(db.notifications).filter((n) => n.userId === 'b' && n.type === 'club_invite')).toHaveLength(1);
  });

  it('solo il destinatario risponde; accettare lo rende membro, una sola volta', () => {
    run('a', 'inviteToClub', [clubId, ['b']]);
    const inv = run<InviteView[]>('b', 'myClubInvites')[0];
    expect(inv.club.name).toBe('Club Po');
    expect(inv.from.displayName).toBe('Ua');
    expect(code(() => run('c', 'respondClubInvite', [inv.id, true]))).toBe('not_found');
    expect(run<{ status: string }>('b', 'respondClubInvite', [inv.id, true]).status).toBe('accepted');
    expect(Object.values(db.memberships).some((m) => m.clubId === clubId && m.userId === 'b')).toBe(true);
    expect(code(() => run('b', 'respondClubInvite', [inv.id, true]))).toBe('conflict');
    expect(run<InviteView[]>('b', 'myClubInvites')).toHaveLength(0);
    expect(run<InviteCandidate[]>('a', 'inviteCandidates', [clubId]).find((c) => c.user.id === 'b')?.state).toBe('member');
  });

  it('dopo un rifiuto non si reinvita per 30 giorni', () => {
    run('a', 'inviteToClub', [clubId, ['c']]);
    run('c', 'respondClubInvite', [run<InviteView[]>('c', 'myClubInvites')[0].id, false]);
    expect(Object.values(db.memberships).some((m) => m.userId === 'c')).toBe(false);
    expect(run<InviteCandidate[]>('a', 'inviteCandidates', [clubId]).find((c) => c.user.id === 'c')?.state).toBe('recent_decline');
    expect(run<{ sent: number }>('a', 'inviteToClub', [clubId, ['c']]).sent).toBe(0);
    now = new Date('2026-12-01T12:00:00.000Z');
    expect(run<{ sent: number }>('a', 'inviteToClub', [clubId, ['c']]).sent).toBe(1);
  });

  it('un invito per un club sciolto non si accetta e chi è già dentro non viene invitato', () => {
    run('a', 'inviteToClub', [clubId, ['b']]);
    const id = run<InviteView[]>('b', 'myClubInvites')[0].id;
    delete db.clubs[clubId];
    expect(code(() => run('b', 'respondClubInvite', [id, true]))).toBe('not_found');
    expect(run<InviteView[]>('b', 'myClubInvites')).toHaveLength(0);
  });
});
