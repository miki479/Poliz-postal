import { beforeEach, describe, expect, it } from 'vitest';
import { newActivity } from '../shared/activities.ts';
import { call } from '../shared/api.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { SocialCounts } from '../shared/social.ts';
import type { FeedItem, UserPublic } from '../shared/types.ts';

const NOW = new Date('2026-10-24T12:00:00.000Z');
let db: ReturnType<typeof emptyDb>;
const as = (a: string): Ctx => ({ db, now: NOW, actorId: a });
const run = <T>(a: string, m: string, args: unknown[] = []) => call(as(a), m, args) as T;
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
  for (const id of ['a', 'b', 'c']) db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: 'U' + id, bio: '', hue: 1, sports: ['running'], area: 'Torino', privacy: { ...DEFAULT_PRIVACY, showStats: true }, createdAt: NOW.toISOString() };
  const act = newActivity(NOW, { userId: 'b', source: 'manual', sport: 'running', date: '2026-10-24T07:00:00.000Z', distanceKm: 8, durationMin: 44, title: 'Lungo Po' });
  db.activities[act.id] = act;
});

const itemOfB = () => run<Array<FeedItem & { social: SocialCounts }>>('a', 'getSocialFeed')[0];

describe('segui, scintille e commenti', () => {
  it('seguire mostra nel feed le attività condivise, anche senza club in comune', () => {
    expect(run<FeedItem[]>('a', 'getSocialFeed')).toHaveLength(0);
    run('a', 'follow', ['b']);
    expect(itemOfB().kind).toBe('run_completed');
    expect(run<{ followers: number }>('a', 'followInfo', ['b']).followers).toBe(1);
    // chi non condivide le attività non compare anche se seguito
    db.users.b.privacy.shareActivity = false;
    expect(run<FeedItem[]>('a', 'getSocialFeed')).toHaveLength(0);
  });

  it('scintilla: una per persona, mai a sé stessi, solo su contenuti visibili', () => {
    run('a', 'follow', ['b']);
    const id = itemOfB().id;
    expect(code(() => run('c', 'toggleSpark', [id, true]))).toBe('not_found'); // c non vede l'attività
    run('a', 'toggleSpark', [id, true]);
    const twice = run<SocialCounts>('a', 'toggleSpark', [id, true]);
    expect(twice.sparks).toBe(1);
    expect(twice.sparked).toBe(true);
    expect(code(() => run('b', 'toggleSpark', [id, true]))).toBe('validation');
    expect(run<UserPublic[]>('b', 'sparkersOf', [id]).map((u) => u.id)).toEqual(['a']);
    expect(code(() => run('a', 'sparkersOf', [id]))).toBe('forbidden');
  });

  it('commenti: visibili a chi vede il contenuto, eliminabili da autore o proprietario', () => {
    run('a', 'follow', ['b']);
    const id = itemOfB().id;
    const cm = run<{ id: string }>('a', 'addComment', [id, 'Grande lungo!']);
    expect(code(() => run('a', 'addComment', [id, '   ']))).toBe('validation');
    expect(run<Array<{ text: string }>>('b', 'listComments', [id])[0].text).toBe('Grande lungo!');
    expect(db.notifications && Object.values(db.notifications).some((n) => n.userId === 'b' && n.type === 'new_comment')).toBe(true);
    expect(code(() => run('c', 'deleteComment', [cm.id]))).toBe('forbidden');
    run('b', 'deleteComment', [cm.id]);
    expect(run<unknown[]>('a', 'listComments', [id])).toHaveLength(0);
  });

  it('con chi correre: stessa zona o club, chi mostra statistiche e condivide', () => {
    const list = run<Array<{ user: UserPublic }>>('a', 'suggestRunners');
    expect(list.map((x) => x.user.id).sort()).toEqual(['b', 'c']);
    db.users.c.privacy.showStats = false;
    expect(run<Array<{ user: UserPublic }>>('a', 'suggestRunners').map((x) => x.user.id)).toEqual(['b']);
    run('a', 'follow', ['b']);
    expect(run<unknown[]>('a', 'suggestRunners')).toHaveLength(0); // chi segui già non viene riproposto
  });
});
