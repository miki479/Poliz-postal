import { describe, expect, it } from 'vitest';
import { storyExportData, type StoryExportData } from '../shared/storyExport.ts';
import { renderStoryVideo, videoFrame } from '../server/storyVideo.ts';
import { emptyDb, DEFAULT_PRIVACY, type Ctx } from '../shared/engine.ts';
import type { WorkoutLog } from '../shared/types.ts';
const sample: StoryExportData = {
  title: 'Corsa %{test} · <titolo>',
  date: '26 ott 2026',
  metrics: ['5,00 km', '30 min 0 s'],
  context: 'Attività individuale',
  source: 'Registrata con Runngo',
  track: [
    { lat: 44, lng: 12, t: 0 },
    { lat: 44.01, lng: 12.01, t: 60 },
  ],
  reduceMotion: false,
};
function setup() {
  const db = emptyDb();
  for (const id of ['a', 'b'])
    db.users[id] = {
      id,
      username: id,
      displayName: id,
      avatar: null,
      profileCompleted: true,
      bio: '',
      hue: 1,
      sports: ['running'],
      area: '',
      privacy: { ...DEFAULT_PRIVACY },
      createdAt: '2026-10-26T10:00:00Z',
    };
  db.workoutLogs.l = {
    id: 'l',
    userId: 'a',
    title: 'Privato',
    startedAt: '2026-10-26T10:00:00Z',
    durationSec: 1800,
    distanceKm: 5,
    paceSecPerKm: 360,
    origin: 'app',
    track: sample.track,
  } as WorkoutLog;
  return { db, ctx: { db, actorId: 'a', now: new Date() } as Ctx };
}
describe('esportazione video privata', () => {
  it('richiede il proprietario e include percorso/persone solo con scelta esplicita', () => {
    const { ctx } = setup();
    expect(storyExportData(ctx, 'l').track).toEqual([]);
    expect(() => storyExportData({ ...ctx, actorId: 'b' }, 'l')).toThrow();
    expect(() => storyExportData({ ...ctx, actorId: null }, 'l')).toThrow();
    expect(storyExportData(ctx, 'l').context).toBe('Attività individuale');
  });
  it('protegge gli estremi e non esporta percorsi Strava', () => {
    const { ctx, db } = setup();
    db.workoutLogs.l.track = Array.from({ length: 21 }, (_, i) => ({ lat: 44 + i * 0.0005, lng: 12, t: i * 10 }));
    const d = storyExportData(ctx, 'l', { includeRoute: true });
    expect(d.track.length).toBeGreaterThan(0);
    expect(d.track[0].lat).toBeGreaterThan(44.002);
    expect(d.track.at(-1)!.lat).toBeLessThan(44.008);
    db.workoutLogs.l.origin = 'strava';
    expect(storyExportData(ctx, 'l', { includeRoute: true }).track).toEqual([]);
  });
  it('non esporta compagni in attesa o senza condivisione consentita', () => {
    const { ctx, db } = setup();
    db.workoutCompanions.r = {
      id: 'r',
      logId: 'l',
      fromId: 'a',
      toId: 'b',
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    expect(storyExportData(ctx, 'l', { includePeople: true }).context).toBe('Attività individuale');
    db.workoutCompanions.r.status = 'accepted';
    expect(storyExportData(ctx, 'l', { includePeople: true }).context).toBe('Con b');
    db.users.b.privacy.shareActivity = false;
    expect(storyExportData(ctx, 'l', { includePeople: true }).context).toBe('Attività individuale');
  });
  it('non unisce interruzioni e rispetta Riduci movimento nel file', () => {
    const none = videoFrame({ ...sample, track: [] }, 90);
    const broken = videoFrame({ ...sample, track: [sample.track[0], { ...sample.track[1], breakBefore: true }] }, 90);
    expect(broken.equals(none)).toBe(true);
    expect(videoFrame({ ...sample, reduceMotion: true }, 80).equals(videoFrame({ ...sample, reduceMotion: true }, 90))).toBe(true);
    expect(videoFrame(sample, 80).equals(videoFrame(sample, 90))).toBe(false);
  });
  it('un encoder mancante fallisce senza restare in attesa', async () => {
    await expect(
      renderStoryVideo(sample, { ffmpeg: 'runngo-encoder-inesistente', font: process.env.STORY_FONT_PATH ?? 'font-inesistente' }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  }, 5000);
  it.runIf(!!process.env.STORY_FFMPEG_PATH)(
    'genera un vero MP4 H264 con testi non interpretati come comandi',
    async () => {
      const bytes = await renderStoryVideo(sample);
      expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
      expect(bytes.includes(Buffer.from('avc1'))).toBe(true);
      expect(bytes.length).toBeGreaterThan(5000);
    },
    65000,
  );
});
