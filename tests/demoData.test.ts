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
  expect(stories.length).toBe(6);
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
