/** Replay in coordinate GPS. The clock is recorded time, never point count or lap number. */
import { haversineKm } from './time.ts';
import { isTimed } from './track.ts';
import type { TrackPoint } from './types.ts';

export interface ReplayTimeline { track: TrackPoint[]; axis: number[]; total: number; timed: boolean }
export function replayTimeline(track: TrackPoint[]): ReplayTimeline {
  const timed = isTimed(track);
  const axis = [0];
  for (let i = 1; i < track.length; i++) axis.push(timed ? track[i].t - track[0].t : axis[i - 1] + (track[i].breakBefore ? 0 : haversineKm(track[i - 1], track[i])));
  return { track, axis: track.length ? axis : [], total: axis[axis.length - 1] || 0, timed };
}

export function replayPosition(timeline: ReplayTimeline, value: number): { point: TrackPoint; index: number; gap: boolean } | null {
  const { track, axis, total } = timeline;
  if (!track.length) return null;
  const at = Math.max(0, Math.min(total, value));
  if (at >= total) return { point: track[track.length - 1], index: track.length - 1, gap: false };
  let lo = 0, hi = track.length - 1;
  while (lo + 1 < hi) { const mid = Math.floor((lo + hi) / 2); if (axis[mid] <= at) lo = mid; else hi = mid; }
  const a = track[lo], b = track[hi];
  if (b.breakBefore) return { point: a, index: lo, gap: true };
  const f = axis[hi] > axis[lo] ? (at - axis[lo]) / (axis[hi] - axis[lo]) : 0;
  return { point: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, t: a.t + (b.t - a.t) * f }, index: lo, gap: false };
}

/** Cut precisely at recorded times, keeping original GPS corners and interruption boundaries. */
export function replaySlice(timeline: ReplayTimeline, from: number, to: number): TrackPoint[] {
  if (!timeline.timed || to < from) return [];
  const offset = timeline.track[0]?.t ?? 0;
  const start = replayPosition(timeline, from - offset), end = replayPosition(timeline, to - offset);
  if (!start || !end) return [];
  const inside = timeline.track.slice(start.index + 1, end.index + 1);
  return [start.point, ...inside, end.point];
}
