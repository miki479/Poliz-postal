import { beforeEach, describe, expect, it } from 'vitest';
import { newActivity } from '../shared/activities.ts';
import { call } from '../shared/api.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { feedTrack, type SocialCounts } from '../shared/social.ts';
import type { FeedItem, UserPublic, WorkoutLog } from '../shared/types.ts';

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
  it('il percorso nel feed richiede consenso separato e protegge gli estremi', () => {
    const log: WorkoutLog = { id: 'gps', userId: 'b', plannedSessionId: null, kind: 'run_free', title: 'Corsa GPS', startedAt: NOW.toISOString(), durationSec: 600, distanceKm: 1.2, paceSecPerKm: 500, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared: true, origin: 'app', track: Array.from({ length: 13 }, (_, i) => ({ lat: 0, lng: i * 0.001, t: NOW.getTime() + i * 50000, alt: 50 })), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
    db.workoutLogs.gps = log; run('a', 'follow', ['b']);
    expect(feedTrack(log)).toBeUndefined();
    log.mapShared = true; expect(feedTrack(log)).toBeUndefined();
    expect(code(() => run('a', 'setTrackVisibility', ['gps', true]))).toBe('not_found');
    run('b', 'setTrackVisibility', ['gps', true]);
    const trace = feedTrack(log)!;
    expect(trace[0].lng).toBeGreaterThan(0.002); expect(trace.at(-1)!.lng).toBeLessThan(0.01);
    expect(trace[0]).not.toHaveProperty('alt');
    const item = run<FeedItem[]>('a', 'getSocialFeed').find((x) => x.kind === 'workout_shared');
    expect(item?.kind === 'workout_shared' && item.workout.track).toEqual(trace);
    log.origin = 'strava'; expect(feedTrack(log)).toBeUndefined();
    log.origin = 'file'; expect(feedTrack(log)).toBeUndefined();
    log.origin = 'app'; log.shared = false; expect(feedTrack(log)).toBeUndefined();
  });
  it('i suggerimenti non pubblicano passi derivati da attività private o Strava altrui', () => {
    for (let i = 0; i < 2; i++) {
      const activity = newActivity(NOW, { userId: 'b', source: 'strava', sport: 'running', date: NOW.toISOString(), distanceKm: 10, durationMin: 45, visibility: 'private' });
      db.activities[activity.id] = activity;
    }
    const suggestions = run<Array<{ user: UserPublic; paceSecPerKm: number | null }>>('a', 'suggestRunners');
    expect(suggestions.find((s) => s.user.id === 'b')?.paceSecPerKm).toBeNull();
  });
  it('Strava resta privato anche con vecchi flag condivisi; dei file si condivide solo il riepilogo scelto', () => {
    run('a', 'follow', ['b']);
    for (const origin of ['strava', 'file'] as const) {
      const id = `import-${origin}`;
      const activity = newActivity(NOW, { userId: 'b', source: origin, sport: 'running', date: NOW.toISOString(), distanceKm: 5, durationMin: 30 });
      db.activities[activity.id] = activity;
      db.workoutLogs[id] = { id, userId: 'b', plannedSessionId: null, kind: 'run_free', title: `Corsa da ${origin}`, startedAt: NOW.toISOString(), durationSec: 1800, distanceKm: 5, paceSecPerKm: 360, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', activityId: activity.id, shared: false, origin, track: [{ lat: 45, lng: 9, t: 0 }, { lat: 45.01, lng: 9, t: 0 }], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
      const updated = run<WorkoutLog>('b', 'updateWorkoutLog', [id, { shared: true, title: 'Titolo corretto' }]);
      expect(updated.shared).toBe(origin === 'file');
      expect(updated.title).toBe('Titolo corretto');
      expect(db.activities[activity.id].visibility).toBe('private');
      expect(code(() => run('b', 'setTrackVisibility', [id, true]))).toBe('validation');
      // Il filtro di lettura protegge anche record lasciati condivisi dalle versioni precedenti.
      updated.shared = true;
      activity.visibility = 'shared';
      for (const method of ['getFeed', 'getSocialFeed']) {
        const feed = run<FeedItem[]>('a', method);
        expect(feed.some((item) => item.id === `w_${id}` || item.id === `a_${activity.id}`)).toBe(origin === 'file');
        const workout = feed.find((item) => item.id === `w_${id}`);
        if (workout?.kind === 'workout_shared') expect(workout.workout.track).toBeUndefined();
      }
    }
  });
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
