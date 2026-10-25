import type { RecordingDraft } from './recording';

/** The foreground recorder cannot claim GPS coverage while suspended. */
export function resumeRecording(draft: RecordingDraft, backgroundAt: number | null, now: number): number {
  if (backgroundAt === null || now <= backgroundAt || draft.status !== 'recording' || draft.environment !== 'outdoor') return 0;
  const seconds = (now - backgroundAt) / 1000;
  draft.gaps += 1;
  draft.lostSec += seconds;
  return seconds;
}
