import { describe, expect, it, vi } from 'vitest';
import { resumeRecording } from '../mobile/src/lib/recordingLifecycle.ts';
import type { RecordingDraft } from '../mobile/src/lib/recording.ts';
const storage = vi.hoisted(() => ({ setItem: vi.fn(async (_key: string, _value: string) => {}), getItem: vi.fn(async () => null), removeItem: vi.fn(async (_key: string) => {}) }));
vi.mock('../mobile/node_modules/@react-native-async-storage/async-storage', () => ({ default: storage }));

const draft = (patch: Partial<RecordingDraft> = {}): RecordingDraft => ({ v: 1, startedAt: new Date(0).toISOString(), sport: 'running', environment: 'outdoor', sessionId: null, eventId: null, shared: false, track: [], km: 0, pausedMs: 0, pausedAt: null, gaps: 0, lostSec: 0, savedAt: 0, status: 'recording', endedAt: null, ...patch });
describe('ritorno dallo schermo bloccato', () => {
  it('mantiene tempo e traccia e segnala una sola interruzione GPS', () => {
    const d = draft({ track: [{ lat: 45, lng: 7, t: 1 }], km: 0.5 });
    expect(resumeRecording(d, 10_000, 40_000)).toBe(30);
    expect(d.gaps).toBe(1); expect(d.lostSec).toBe(30);
    expect(d.track).toHaveLength(1); expect(d.km).toBe(0.5);
    expect(d.status).toBe('recording'); expect(d.pausedMs).toBe(0);
    expect(resumeRecording(d, null, 40_001)).toBe(0);
    expect(d.gaps).toBe(1);
  });
  it('non inventa GPS perso per pausa, attività terminata o tapis roulant', () => {
    for (const patch of [{ status: 'paused' as const }, { status: 'finished' as const }, { environment: 'treadmill' as const }]) {
      const d = draft(patch);
      expect(resumeRecording(d, 10_000, 40_000)).toBe(0);
      expect(d.gaps).toBe(0);
    }
  });
});
it('le scritture lente non sovrascrivono la nuova bozza e non la ricreano dopo lo scarto', async () => {
  const { saveDraft, clearDraft } = await import('../mobile/src/lib/recording.ts');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  storage.setItem.mockImplementationOnce(async () => gate);
  const d = draft({ km: 1 });
  const a = saveDraft(d);
  d.km = 2;
  const b = saveDraft(d);
  const cleared = clearDraft();
  await Promise.resolve();
  expect(storage.removeItem).not.toHaveBeenCalled();
  release();
  await Promise.all([a, b, cleared]);
  expect(JSON.parse(storage.setItem.mock.calls[0][1]).km).toBe(1);
  expect(JSON.parse(storage.setItem.mock.calls[1][1]).km).toBe(2);
  expect(storage.removeItem.mock.invocationCallOrder[0]).toBeGreaterThan(storage.setItem.mock.invocationCallOrder[1]);
});
