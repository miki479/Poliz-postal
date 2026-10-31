import { expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { FeedItem } from '../shared/types.ts';

const NOW = new Date('2026-10-30T12:00:00.000Z');

it('i dati di esempio riempiono feed, gruppi e uscite, con almeno una storia col percorso, e si tolgono del tutto', () => {
  const db = emptyDb();
  db.users.me = { id: 'me', username: 'me', avatar: null, profileCompleted: true, displayName: 'Io', bio: '', hue: 1, sports: ['running'], area: 'Forlì', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const ctx: Ctx = { db, now: NOW, actorId: 'me' };
  const before = JSON.stringify(db.users.me);
  expect(call(ctx, 'loadDemoData', [])).toMatchObject({ people: 5, stories: 6 });
  const feed = call(ctx, 'getSocialFeed', [40]) as FeedItem[];
  const stories = feed.filter((f) => f.kind === 'workout_shared');
  expect(stories.length).toBe(9);
  expect(stories.some((f) => f.kind === 'workout_shared' && f.workout.track && f.workout.track.length > 1)).toBe(true);
  expect(Object.values(db.clubs).length).toBe(4);
  const sug = call(ctx, 'suggestClubs', []) as Array<{ id: string; reasons: string[]; isNew: boolean }>;
  expect(sug.map((s) => s.id).sort()).toEqual(['demo_club_alba', 'demo_club_trail']);
  expect(sug.find((s) => s.id === 'demo_club_alba')?.isNew).toBe(true);
  call(ctx, 'joinDiscoverableClub', ['demo_club_alba']);
  expect((call(ctx, 'suggestClubs', []) as unknown[]).length).toBe(1);
  expect(() => call(ctx, 'joinDiscoverableClub', ['demo_club_runners'])).toThrow();
  call(ctx, 'clearDemoData', []);
  expect(Object.keys(db.users)).toEqual(['me']);
  expect(Object.keys(db.clubs).length + Object.keys(db.events).length + Object.keys(db.workoutLogs).length + Object.keys(db.follows).length + Object.keys(db.memberships).length + Object.keys(db.participations).length).toBe(0);
  expect(JSON.stringify(db.users.me)).toBe(before);
});

it('se due account usano la demo, rimuoverla da uno non toglie le relazioni dell’altro', () => {
  const db = emptyDb();
  for (const id of ['a', 'b']) db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id, bio: '', hue: 1, sports: ['running'], area: 'Forlì', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const as = (id: string): Ctx => ({ db, now: NOW, actorId: id });
  call(as('a'), 'loadDemoData', []);
  call(as('b'), 'loadDemoData', []);
  call(as('a'), 'clearDemoData', []);
  expect((call(as('b'), 'getSocialFeed', [40]) as unknown[]).length).toBeGreaterThan(0);
  expect((call(as('a'), 'getSocialFeed', [40]) as unknown[]).length).toBe(0);
  call(as('b'), 'clearDemoData', []);
  expect(Object.keys(db.users).sort()).toEqual(['a', 'b']);
});

it('il confronto con chi ha corso con te usa solo allenamenti condivisi dello stesso gruppo', () => {
  const db = emptyDb();
  db.users.me = { id: 'me', username: 'me', avatar: null, profileCompleted: true, displayName: 'Io', bio: '', hue: 1, sports: ['running'], area: 'Forlì', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const ctx: Ctx = { db, now: NOW, actorId: 'me' };
  expect((call(ctx, 'groupComparison', []) as { groupRuns: number }).groupRuns).toBe(0);
  call(ctx, 'loadDemoData', []);
  const c = call(ctx, 'groupComparison', []) as { groupRuns: number; myPace: number; othersPace: number; avgRank: number; peers: Array<{ paceDiffSec: number }> };
  expect(c.groupRuns).toBe(1);
  expect(c.peers.length).toBe(3);
  expect(c.avgRank).toBe(3); // più lenta di Giulia e Marco, più veloce di Luca
  expect(c.myPace).toBeGreaterThan(c.peers.length ? 0 : 1);
});

it('il report di gruppo: podio per cadenza, chi si stacca solo per il tratto insieme, chi corre altrove escluso, nulla prima della fine', () => {
  const db = emptyDb();
  db.users.me = { id: 'me', username: 'me', avatar: null, profileCompleted: true, displayName: 'Io', bio: '', hue: 1, sports: ['running'], area: 'Forlì', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const ctx: Ctx = { db, now: NOW, actorId: 'me' };
  call(ctx, 'loadDemoData', []);
  type R = { ready: boolean; metric: string; podium: string[]; entries: Array<{ user: { id: string }; leftAtKm: number | null }> };
  const r = call(ctx, 'groupReport', ['demo_e6']) as R;
  expect(r.ready).toBe(true);
  expect(r.metric).toBe('cadence');
  const ids = r.entries.map((e) => e.user.id).sort();
  expect(ids).toEqual(['demo_giulia', 'demo_marco', 'me']); // Luca ha corso altrove
  expect(r.podium[0]).toBe('demo_giulia');
  expect(r.entries.find((e) => e.user.id === 'demo_marco')!.leftAtKm).not.toBeNull();
  expect(r.entries.find((e) => e.user.id === 'me')!.leftAtKm).toBeNull();
  const early = call({ ...ctx, now: new Date(NOW.getTime() - 60 * 3_600_000) }, 'groupReport', ['demo_e6']) as R;
  expect(early.ready).toBe(false);
});
