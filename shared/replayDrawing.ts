import { replayPosition, type ReplayTimeline } from './replay.ts';
import { trackSegments } from './track.ts';

/** Only the acquired prefix is drawn. A GPS interruption never becomes a connecting line. */
export function replayDrawing(timeline: ReplayTimeline, elapsed: number, reducedMotion = false) {
  if (reducedMotion) return trackSegments(timeline.track).filter((s) => s.length > 1);
  if (elapsed <= 0) return [];
  const sample = replayPosition(timeline, elapsed);
  if (!sample) return [];
  const points = timeline.track.slice(0, sample.index + 1);
  const last = points.at(-1);
  if (!sample.gap && last && (last.lat !== sample.point.lat || last.lng !== sample.point.lng)) points.push(sample.point);
  return trackSegments(points).filter((s) => s.length > 1);
}
